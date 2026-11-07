"""Turn service errors into `ProblemRead` JSON responses."""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.documents.errors import problem_from_errors
from app.schemas.errors import ProblemRead
from app.services.errors import (
    ConflictError,
    InvalidInputError,
    NotFoundError,
    PayloadTooLargeError,
    ServiceError,
    UnsupportedMediaTypeError,
)

STATUS_BY_ERROR: dict[type[ServiceError], int] = {
    NotFoundError: status.HTTP_404_NOT_FOUND,
    ConflictError: status.HTTP_409_CONFLICT,
    InvalidInputError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    PayloadTooLargeError: status.HTTP_413_CONTENT_TOO_LARGE,
    UnsupportedMediaTypeError: status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
}


def problem_responses(*status_codes: int) -> dict[int | str, dict[str, object]]:
    """`responses=` value that documents the `ProblemRead` body for each status in OpenAPI."""
    return {code: {"model": ProblemRead} for code in status_codes}


def _status_for(error: ServiceError) -> int:
    for error_type in type(error).__mro__:
        if error_type in STATUS_BY_ERROR:
            return STATUS_BY_ERROR[error_type]
    # A bare ServiceError has no specific meaning; treat it as bad input, never as success.
    return status.HTTP_422_UNPROCESSABLE_CONTENT


async def _handle_service_error(_request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, ServiceError)
    errors = error.errors if isinstance(error, InvalidInputError) else None
    problem = ProblemRead(detail=error.detail, errors=errors)
    return JSONResponse(
        status_code=_status_for(error), content=problem.model_dump(mode="json", exclude_none=True)
    )


async def _handle_request_validation_error(_request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    # Paths are relative to the request body, so they match the document's own pointers.
    errors = [
        {**item, "loc": item["loc"][1:] if item["loc"][:1] == ("body",) else item["loc"]}
        for item in error.errors()
    ]
    return await _handle_service_error(_request, problem_from_errors(errors))


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ServiceError, _handle_service_error)
    app.add_exception_handler(RequestValidationError, _handle_request_validation_error)
