"""
Base API schemas with consistent response envelope pattern.

All API responses follow a consistent structure:
- Success responses: {"data": {...}, "meta": {...}}
- Error responses: {"error": {...}}
- Paginated responses: {"data": [...], "meta": {"pagination": {...}}}

This pattern enables:
- Consistent client-side handling
- Clear separation of payload and metadata
- Extensible metadata without breaking changes
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class APIMetadata(BaseModel):
    """Metadata included in all API responses."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "request_id": "req_abc123",
                "timestamp": "2025-01-15T10:30:00Z",
            }
        }
    )

    request_id: str | None = Field(
        default=None,
        description="Unique request identifier for tracing",
        json_schema_extra={"example": "req_abc123"},
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Response timestamp in UTC",
    )


class PaginationMeta(BaseModel):
    """Pagination metadata for list responses using offset/limit."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total_count": 42,
                "offset": 0,
                "limit": 50,
                "has_more": False,
            }
        }
    )

    total_count: int = Field(
        ...,
        ge=0,
        description="Total number of items",
        json_schema_extra={"example": 42},
    )
    offset: int = Field(
        default=0,
        ge=0,
        description="Number of items skipped",
        json_schema_extra={"example": 0},
    )
    limit: int = Field(
        default=50,
        ge=1,
        le=100,
        description="Maximum items returned",
        json_schema_extra={"example": 50},
    )
    has_more: bool = Field(
        ...,
        description="Whether more items are available",
        json_schema_extra={"example": False},
    )


class APIResponse(BaseModel, Generic[T]):
    """
    Standard API response envelope.

    All successful responses wrap their payload in this structure:
    ```json
    {
        "data": { ... },
        "meta": {
            "request_id": "req_abc123",
            "timestamp": "2025-01-15T10:30:00Z"
        }
    }
    ```
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "data": {"id": "123", "name": "Example"},
                "meta": {"request_id": "req_abc123"},
            }
        }
    )

    data: T = Field(..., description="Response payload")
    meta: APIMetadata = Field(
        default_factory=APIMetadata,
        description="Response metadata",
    )


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Paginated list response envelope.

    ```json
    {
        "data": [...],
        "meta": {
            "request_id": "req_abc123",
            "timestamp": "2025-01-15T10:30:00Z",
            "pagination": {
                "total_count": 42,
                "offset": 0,
                "limit": 50,
                "has_more": false
            }
        }
    }
    ```
    """

    data: list[T] = Field(..., description="List of items")
    meta: APIMetadata = Field(default_factory=APIMetadata)
    pagination: PaginationMeta = Field(..., description="Pagination information")


class SuccessResponse(BaseModel):
    """
    Simple success response for operations without meaningful return data.

    Use for DELETE operations or actions that don't return entity data.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Resource deleted successfully",
            }
        }
    )

    success: bool = Field(
        default=True,
        description="Whether the operation succeeded",
        json_schema_extra={"example": True},
    )
    message: str | None = Field(
        default=None,
        description="Optional success message",
        json_schema_extra={"example": "Resource deleted successfully"},
    )


class ErrorDetail(BaseModel):
    """Detailed error information for validation errors."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "field": "email",
                "message": "Invalid email format",
                "code": "value_error.email",
            }
        }
    )

    field: str | None = Field(
        default=None,
        description="Field that caused the error",
        json_schema_extra={"example": "email"},
    )
    message: str = Field(
        ...,
        description="Human-readable error message",
        json_schema_extra={"example": "Invalid email format"},
    )
    code: str | None = Field(
        default=None,
        description="Machine-readable error code",
        json_schema_extra={"example": "value_error.email"},
    )


class ErrorResponse(BaseModel):
    """
    Standard error response envelope.

    All error responses follow this structure:
    ```json
    {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Request validation failed",
            "details": [...],
            "request_id": "req_abc123"
        }
    }
    ```
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed",
                    "request_id": "req_abc123",
                }
            }
        }
    )

    code: str = Field(
        ...,
        description="Machine-readable error code",
        json_schema_extra={"example": "VALIDATION_ERROR"},
    )
    message: str = Field(
        ...,
        description="Human-readable error message",
        json_schema_extra={"example": "Request validation failed"},
    )
    details: list[ErrorDetail] | None = Field(
        default=None,
        description="Detailed error information",
    )
    request_id: str | None = Field(
        default=None,
        description="Request ID for error tracking",
        json_schema_extra={"example": "req_abc123"},
    )
    path: str | None = Field(
        default=None,
        description="Request path that caused the error",
        json_schema_extra={"example": "/api/v1/sessions/123"},
    )
    debug: dict[str, Any] | None = Field(
        default=None,
        description="Debug information (only in development)",
    )


# Type aliases for common response patterns
DataResponse = APIResponse[T]
ListResponse = PaginatedResponse[T]
