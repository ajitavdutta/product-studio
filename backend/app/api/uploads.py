"""Read an uploaded file with a size cap, so an oversized upload never reaches a service."""

from fastapi import UploadFile

from app.services.errors import PayloadTooLargeError


def read_capped(file: UploadFile, max_bytes: int, too_large_message: str) -> bytes:
    """The upload's bytes; raises `PayloadTooLargeError` past `max_bytes`."""
    if file.size is not None and file.size > max_bytes:
        raise PayloadTooLargeError(too_large_message)
    # Read one byte more than allowed: the size header can be missing or wrong.
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise PayloadTooLargeError(too_large_message)
    return data
