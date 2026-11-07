"""The error body every non-2xx API response uses."""

from pydantic import BaseModel, Field


class ErrorItem(BaseModel):
    path: str = Field(..., description="JSON pointer to the problem, e.g. /items/0/end")
    message: str = Field(..., description="Plain sentence the UI can show")


class ProblemRead(BaseModel):
    detail: str = Field(..., description="Plain sentence the UI can show")
    errors: list[ErrorItem] | None = Field(None, description="One entry per problem, if known")
