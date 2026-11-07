"""Turn Pydantic validation errors into plain-language `InvalidInputError`s."""

from collections.abc import Mapping, Sequence
from typing import Any

from pydantic import ValidationError

from app.schemas.errors import ErrorItem
from app.services.errors import InvalidInputError

_VALUE_ERROR_PREFIX = "Value error, "


def _pointer(location: Sequence[int | str]) -> str:
    """JSON pointer (RFC 6901) for a Pydantic `loc`, which already uses the camelCase aliases."""
    escaped = (str(part).replace("~", "~0").replace("/", "~1") for part in location)
    return "".join(f"/{part}" for part in escaped)


def problem_from_errors(errors: Sequence[Mapping[str, Any]]) -> InvalidInputError:
    """Build the error from Pydantic-style `{loc, msg}` dicts, never dumping Pydantic internals."""
    items = [
        ErrorItem(
            path=_pointer(error["loc"]),
            message=str(error["msg"]).removeprefix(_VALUE_ERROR_PREFIX),
        )
        for error in errors
    ]
    first = items[0].message
    detail = first if len(items) == 1 else f"{len(items)} problems found. The first: {first}"
    return InvalidInputError(detail, items)


def to_problem(exc: ValidationError) -> InvalidInputError:
    return problem_from_errors(exc.errors())
