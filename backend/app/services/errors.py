"""Errors services raise; `app/api/errors.py` maps each to an HTTP status."""

from app.schemas.errors import ErrorItem


class ServiceError(Exception):
    """Base class. `detail` is a plain sentence the UI shows as is."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(ServiceError):
    pass


class ConflictError(ServiceError):
    pass


class InvalidInputError(ServiceError):
    def __init__(self, detail: str, errors: list[ErrorItem] | None = None) -> None:
        super().__init__(detail)
        self.errors = errors


class PayloadTooLargeError(ServiceError):
    pass


class UnsupportedMediaTypeError(ServiceError):
    pass
