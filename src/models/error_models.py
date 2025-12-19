"""
Standardized error response models for Chat Juicer API.

Provides consistent error formatting across REST and WebSocket endpoints
with support for request tracking, error categorization, and debugging context.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ErrorCode(str, Enum):
    """Application-specific error codes for categorization."""

    # Authentication errors (1xxx)
    AUTH_REQUIRED = "AUTH_1001"
    AUTH_INVALID_TOKEN = "AUTH_1002"
    AUTH_EXPIRED_TOKEN = "AUTH_1003"
    AUTH_INSUFFICIENT_PERMISSIONS = "AUTH_1004"
    AUTH_USER_NOT_FOUND = "AUTH_1005"

    # Validation errors (2xxx)
    VALIDATION_ERROR = "VAL_2001"
    VALIDATION_MISSING_FIELD = "VAL_2002"
    VALIDATION_INVALID_FORMAT = "VAL_2003"
    VALIDATION_CONSTRAINT_VIOLATION = "VAL_2004"

    # Resource errors (3xxx)
    RESOURCE_NOT_FOUND = "RES_3001"
    RESOURCE_ALREADY_EXISTS = "RES_3002"
    RESOURCE_CONFLICT = "RES_3003"
    RESOURCE_LOCKED = "RES_3004"

    # Session errors (4xxx)
    SESSION_NOT_FOUND = "SES_4001"
    SESSION_EXPIRED = "SES_4002"
    SESSION_INVALID = "SES_4003"

    # File errors (5xxx)
    FILE_NOT_FOUND = "FILE_5001"
    FILE_TOO_LARGE = "FILE_5002"
    FILE_INVALID_TYPE = "FILE_5003"
    FILE_PERMISSION_DENIED = "FILE_5004"
    FILE_UPLOAD_FAILED = "FILE_5005"

    # WebSocket errors (6xxx)
    WS_CONNECTION_FAILED = "WS_6001"
    WS_MESSAGE_INVALID = "WS_6002"
    WS_SESSION_REQUIRED = "WS_6003"
    WS_TIMEOUT = "WS_6004"
    WS_INTERRUPTED = "WS_6005"

    # External service errors (7xxx)
    EXTERNAL_SERVICE_ERROR = "EXT_7001"
    EXTERNAL_TIMEOUT = "EXT_7002"
    EXTERNAL_RATE_LIMITED = "EXT_7003"
    OPENAI_ERROR = "EXT_7010"
    MCP_SERVER_ERROR = "EXT_7020"

    # Database errors (8xxx)
    DATABASE_ERROR = "DB_8001"
    DATABASE_CONNECTION_FAILED = "DB_8002"
    DATABASE_QUERY_FAILED = "DB_8003"
    DATABASE_TRANSACTION_FAILED = "DB_8004"

    # Internal errors (9xxx)
    INTERNAL_ERROR = "INT_9001"
    INTERNAL_CONFIGURATION_ERROR = "INT_9002"
    INTERNAL_UNEXPECTED = "INT_9999"


class ErrorDetail(BaseModel):
    """Detailed information about a specific validation or sub-error."""

    field: str | None = None
    message: str
    code: str | None = None
    value: Any | None = Field(default=None, exclude=True)  # Excluded from response for security


class ErrorResponse(BaseModel):
    """Standardized error response model for REST endpoints.

    All API errors return this consistent format for easy client handling.

    Example response:
    {
        "error": {
            "code": "RES_3001",
            "message": "Session not found",
            "request_id": "req_abc123",
            "timestamp": "2025-01-15T10:30:00Z",
            "details": null,
            "path": "/api/sessions/invalid-id"
        }
    }
    """

    code: ErrorCode
    message: str
    request_id: str | None = None
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    details: list[ErrorDetail] | None = None
    path: str | None = None
    # Debug info - only included in development mode
    debug: dict[str, Any] | None = Field(default=None, exclude=True)

    def to_dict(self, include_debug: bool = False) -> dict[str, Any]:
        """Convert to dictionary for JSON response.

        Args:
            include_debug: Include debug information (only in development)
        """
        data = self.model_dump(exclude_none=True)
        if include_debug and self.debug:
            data["debug"] = self.debug
        return {"error": data}


class ErrorResponseWrapper(BaseModel):
    """Wrapper for error response to match {"error": {...}} format."""

    error: ErrorResponse


class WebSocketError(BaseModel):
    """Error format for WebSocket messages.

    Sent as a JSON message with type="error" over WebSocket connections.

    Example:
    {
        "type": "error",
        "code": "WS_6004",
        "message": "Connection timeout",
        "request_id": "req_abc123",
        "recoverable": true,
        "session_id": "ses_xyz789"
    }
    """

    type: str = "error"
    code: ErrorCode
    message: str
    request_id: str | None = None
    session_id: str | None = None
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    recoverable: bool = True  # Hint to client if reconnection might help
    details: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for WebSocket JSON message."""
        return self.model_dump(exclude_none=True)


# HTTP status code mappings for error codes
ERROR_CODE_TO_STATUS: dict[ErrorCode, int] = {
    # 401 Unauthorized
    ErrorCode.AUTH_REQUIRED: 401,
    ErrorCode.AUTH_INVALID_TOKEN: 401,
    ErrorCode.AUTH_EXPIRED_TOKEN: 401,
    ErrorCode.AUTH_USER_NOT_FOUND: 401,
    # 403 Forbidden
    ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS: 403,
    # 404 Not Found
    ErrorCode.RESOURCE_NOT_FOUND: 404,
    ErrorCode.SESSION_NOT_FOUND: 404,
    ErrorCode.FILE_NOT_FOUND: 404,
    # 409 Conflict
    ErrorCode.RESOURCE_ALREADY_EXISTS: 409,
    ErrorCode.RESOURCE_CONFLICT: 409,
    # 422 Unprocessable Entity
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.VALIDATION_MISSING_FIELD: 422,
    ErrorCode.VALIDATION_INVALID_FORMAT: 422,
    ErrorCode.VALIDATION_CONSTRAINT_VIOLATION: 422,
    # 423 Locked
    ErrorCode.RESOURCE_LOCKED: 423,
    # 413 Payload Too Large
    ErrorCode.FILE_TOO_LARGE: 413,
    # 415 Unsupported Media Type
    ErrorCode.FILE_INVALID_TYPE: 415,
    # 500 Internal Server Error
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.INTERNAL_CONFIGURATION_ERROR: 500,
    ErrorCode.INTERNAL_UNEXPECTED: 500,
    ErrorCode.DATABASE_ERROR: 500,
    ErrorCode.DATABASE_CONNECTION_FAILED: 500,
    ErrorCode.DATABASE_QUERY_FAILED: 500,
    ErrorCode.DATABASE_TRANSACTION_FAILED: 500,
    # 502 Bad Gateway
    ErrorCode.EXTERNAL_SERVICE_ERROR: 502,
    ErrorCode.OPENAI_ERROR: 502,
    ErrorCode.MCP_SERVER_ERROR: 502,
    # 503 Service Unavailable
    ErrorCode.EXTERNAL_TIMEOUT: 503,
    # 429 Too Many Requests
    ErrorCode.EXTERNAL_RATE_LIMITED: 429,
}


def get_status_code(error_code: ErrorCode) -> int:
    """Get HTTP status code for an error code."""
    return ERROR_CODE_TO_STATUS.get(error_code, 500)


__all__ = [
    "ERROR_CODE_TO_STATUS",
    "ErrorCode",
    "ErrorDetail",
    "ErrorResponse",
    "ErrorResponseWrapper",
    "WebSocketError",
    "get_status_code",
]
