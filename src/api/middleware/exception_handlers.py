"""
Global exception handlers for Chat Juicer API.

Provides centralized error handling with consistent response formatting,
proper logging, and request context integration.
"""

from __future__ import annotations

import traceback

from typing import Any

import asyncpg

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from openai import (
    APIError as OpenAIAPIError,
    AuthenticationError as OpenAIAuthError,
    RateLimitError as OpenAIRateLimitError,
)
from pydantic import ValidationError

from api.middleware.request_context import get_request_context, get_request_id
from core.constants import get_settings
from models.error_models import (
    ErrorCode,
    ErrorDetail,
    ErrorResponse,
    get_status_code,
)
from utils.logger import logger


class AppException(Exception):
    """Base application exception with error code support.

    Use this for business logic errors that should return a specific
    error code and message to the client.

    Example:
        raise AppException(
            code=ErrorCode.SESSION_NOT_FOUND,
            message="Session not found",
            details={"session_id": session_id}
        )
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        details: dict[str, Any] | None = None,
        cause: Exception | None = None,
    ):
        self.code = code
        self.message = message
        self.details = details
        self.cause = cause
        super().__init__(message)


class AuthenticationError(AppException):
    """Authentication-related errors."""

    def __init__(
        self,
        message: str = "Authentication required",
        code: ErrorCode = ErrorCode.AUTH_REQUIRED,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code=code, message=message, details=details)


class ResourceNotFoundError(AppException):
    """Resource not found errors."""

    def __init__(
        self,
        resource: str,
        resource_id: str | None = None,
        code: ErrorCode = ErrorCode.RESOURCE_NOT_FOUND,
    ):
        message = f"{resource} not found"
        if resource_id:
            message = f"{resource} '{resource_id}' not found"
        super().__init__(code=code, message=message, details={"resource": resource, "id": resource_id})


class SessionNotFoundError(ResourceNotFoundError):
    """Session not found error."""

    def __init__(self, session_id: str):
        super().__init__(resource="Session", resource_id=session_id, code=ErrorCode.SESSION_NOT_FOUND)


class FileNotFoundError(ResourceNotFoundError):
    """File not found error."""

    def __init__(self, filename: str):
        super().__init__(resource="File", resource_id=filename, code=ErrorCode.FILE_NOT_FOUND)


class ValidationException(AppException):
    """Validation errors with field-level details."""

    def __init__(
        self,
        message: str = "Validation error",
        errors: list[ErrorDetail] | None = None,
    ):
        super().__init__(
            code=ErrorCode.VALIDATION_ERROR,
            message=message,
            details={"errors": [e.model_dump() for e in errors]} if errors else None,
        )
        self.errors = errors or []


class ExternalServiceError(AppException):
    """External service errors (OpenAI, MCP, etc.)."""

    def __init__(
        self,
        service: str,
        message: str,
        code: ErrorCode = ErrorCode.EXTERNAL_SERVICE_ERROR,
        cause: Exception | None = None,
    ):
        super().__init__(
            code=code,
            message=f"{service}: {message}",
            details={"service": service},
            cause=cause,
        )


class DatabaseError(AppException):
    """Database-related errors."""

    def __init__(
        self,
        message: str = "Database error",
        code: ErrorCode = ErrorCode.DATABASE_ERROR,
        cause: Exception | None = None,
    ):
        super().__init__(code=code, message=message, cause=cause)


def _create_error_response(
    code: ErrorCode,
    message: str,
    request: Request | None = None,
    details: list[ErrorDetail] | None = None,
    debug_info: dict[str, Any] | None = None,
) -> ErrorResponse:
    """Create a standardized error response.

    Args:
        code: Application error code
        message: Human-readable error message
        request: FastAPI request object for path extraction
        details: List of detailed error information
        debug_info: Debug information (only included in development)
    """
    request_id = get_request_id()
    path = request.url.path if request else None

    return ErrorResponse(
        code=code,
        message=message,
        request_id=request_id,
        path=path,
        details=details,
        debug=debug_info,
    )


def _log_error(
    error: Exception,
    code: ErrorCode,
    status_code: int,
    request: Request | None = None,
) -> None:
    """Log error with appropriate level and context."""
    ctx = get_request_context()
    log_context = ctx.to_log_context() if ctx else {}
    log_context["error_code"] = code.value
    log_context["status_code"] = status_code

    # Log at appropriate level based on status code
    if status_code >= 500:
        logger.error(
            f"Server error: {code.value} - {error}",
            exc_info=True,
            **log_context,
        )
    elif status_code >= 400:
        logger.warning(
            f"Client error: {code.value} - {error}",
            **log_context,
        )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle application-specific exceptions."""
    status_code = get_status_code(exc.code)

    settings = get_settings()
    debug_info = None
    if settings.debug:
        debug_info = {
            "exception_type": type(exc).__name__,
            "cause": str(exc.cause) if exc.cause else None,
        }

    # Convert details dict to ErrorDetail list if needed
    details = None
    if exc.details:
        if "errors" in exc.details:
            details = [ErrorDetail(**e) for e in exc.details["errors"]]
        else:
            details = [ErrorDetail(message=str(v), field=k) for k, v in exc.details.items()]

    error_response = _create_error_response(
        code=exc.code,
        message=exc.message,
        request=request,
        details=details,
        debug_info=debug_info,
    )

    _log_error(exc, exc.code, status_code, request)

    return JSONResponse(
        status_code=status_code,
        content=error_response.to_dict(include_debug=settings.debug),
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle FastAPI HTTPException with consistent formatting."""
    # Map HTTP status codes to error codes
    status_to_code = {
        400: ErrorCode.VALIDATION_ERROR,
        401: ErrorCode.AUTH_REQUIRED,
        403: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        404: ErrorCode.RESOURCE_NOT_FOUND,
        409: ErrorCode.RESOURCE_CONFLICT,
        422: ErrorCode.VALIDATION_ERROR,
        429: ErrorCode.EXTERNAL_RATE_LIMITED,
        500: ErrorCode.INTERNAL_ERROR,
        502: ErrorCode.EXTERNAL_SERVICE_ERROR,
        503: ErrorCode.EXTERNAL_TIMEOUT,
    }

    code = status_to_code.get(exc.status_code, ErrorCode.INTERNAL_ERROR)
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)

    settings = get_settings()
    debug_info = None
    if settings.debug:
        debug_info = {"original_status": exc.status_code}

    error_response = _create_error_response(
        code=code,
        message=message,
        request=request,
        debug_info=debug_info,
    )

    _log_error(exc, code, exc.status_code, request)

    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.to_dict(include_debug=settings.debug),
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle Pydantic validation errors from request parsing."""
    details = []
    for error in exc.errors():
        field_path = ".".join(str(loc) for loc in error["loc"])
        details.append(
            ErrorDetail(
                field=field_path,
                message=error["msg"],
                code=error["type"],
            )
        )

    error_response = _create_error_response(
        code=ErrorCode.VALIDATION_ERROR,
        message="Request validation failed",
        request=request,
        details=details,
    )

    _log_error(exc, ErrorCode.VALIDATION_ERROR, 422, request)

    return JSONResponse(
        status_code=422,
        content=error_response.to_dict(),
    )


async def pydantic_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Handle Pydantic ValidationError from model validation."""
    details = []
    for error in exc.errors():
        field_path = ".".join(str(loc) for loc in error["loc"])
        details.append(
            ErrorDetail(
                field=field_path,
                message=error["msg"],
                code=error["type"],
            )
        )

    error_response = _create_error_response(
        code=ErrorCode.VALIDATION_ERROR,
        message="Data validation failed",
        request=request,
        details=details,
    )

    _log_error(exc, ErrorCode.VALIDATION_ERROR, 422, request)

    return JSONResponse(
        status_code=422,
        content=error_response.to_dict(),
    )


async def openai_exception_handler(request: Request, exc: OpenAIAPIError) -> JSONResponse:
    """Handle OpenAI API errors."""
    if isinstance(exc, OpenAIAuthError):
        code = ErrorCode.AUTH_INVALID_TOKEN
        status_code = 401
        message = "OpenAI authentication failed"
    elif isinstance(exc, OpenAIRateLimitError):
        code = ErrorCode.EXTERNAL_RATE_LIMITED
        status_code = 429
        message = "OpenAI rate limit exceeded"
    else:
        code = ErrorCode.OPENAI_ERROR
        status_code = 502
        message = f"OpenAI API error: {str(exc)}"

    settings = get_settings()
    debug_info = None
    if settings.debug:
        debug_info = {
            "openai_error_type": type(exc).__name__,
            "openai_error_code": getattr(exc, "code", None),
        }

    error_response = _create_error_response(
        code=code,
        message=message,
        request=request,
        debug_info=debug_info,
    )

    _log_error(exc, code, status_code, request)

    return JSONResponse(
        status_code=status_code,
        content=error_response.to_dict(include_debug=settings.debug),
    )


async def asyncpg_exception_handler(request: Request, exc: asyncpg.PostgresError) -> JSONResponse:
    """Handle PostgreSQL database errors."""
    settings = get_settings()
    debug_info = None
    if settings.debug:
        debug_info = {
            "pg_error_code": getattr(exc, "sqlstate", None),
            "pg_error_class": type(exc).__name__,
        }

    error_response = _create_error_response(
        code=ErrorCode.DATABASE_ERROR,
        message="Database operation failed",
        request=request,
        debug_info=debug_info,
    )

    _log_error(exc, ErrorCode.DATABASE_ERROR, 500, request)

    return JSONResponse(
        status_code=500,
        content=error_response.to_dict(include_debug=settings.debug),
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions with graceful degradation."""
    settings = get_settings()

    # Log full traceback for debugging
    logger.error(
        f"Unhandled exception: {type(exc).__name__}: {exc}",
        exc_info=True,
        request_id=get_request_id(),
        path=request.url.path,
    )

    debug_info = None
    if settings.debug:
        debug_info = {
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "traceback": traceback.format_exc(),
        }

    error_response = _create_error_response(
        code=ErrorCode.INTERNAL_UNEXPECTED,
        message="An unexpected error occurred",
        request=request,
        debug_info=debug_info,
    )

    return JSONResponse(
        status_code=500,
        content=error_response.to_dict(include_debug=settings.debug),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI application.

    Call this in your main.py after creating the FastAPI app:
        register_exception_handlers(app)
    """
    # Application-specific exceptions
    # Note: type: ignore needed because Starlette's type signature expects Exception,
    # but covariant exception types in handlers are safe and work correctly at runtime
    app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]

    # FastAPI/Starlette exceptions
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]

    # Pydantic exceptions
    app.add_exception_handler(ValidationError, pydantic_exception_handler)  # type: ignore[arg-type]

    # OpenAI exceptions
    app.add_exception_handler(OpenAIAPIError, openai_exception_handler)  # type: ignore[arg-type]

    # Database exceptions
    app.add_exception_handler(asyncpg.PostgresError, asyncpg_exception_handler)

    # Catch-all for unexpected exceptions
    app.add_exception_handler(Exception, generic_exception_handler)


__all__ = [
    "AppException",
    "AuthenticationError",
    "DatabaseError",
    "ExternalServiceError",
    "FileNotFoundError",
    "ResourceNotFoundError",
    "SessionNotFoundError",
    "ValidationException",
    "app_exception_handler",
    "asyncpg_exception_handler",
    "generic_exception_handler",
    "http_exception_handler",
    "openai_exception_handler",
    "pydantic_exception_handler",
    "register_exception_handlers",
    "validation_exception_handler",
]
