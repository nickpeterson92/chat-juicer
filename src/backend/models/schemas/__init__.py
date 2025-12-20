"""
Centralized API schemas for Chat Juicer.

This module provides:
- Base response envelope for consistent API responses
- Request/response models organized by domain
- OpenAPI documentation with examples
- Reusable field definitions and validators
"""

from models.error_models import ErrorDetail, ErrorResponse
from models.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserInfo,
)
from models.schemas.base import (
    APIResponse,
    PaginatedResponse,
    SuccessResponse,
)
from models.schemas.config import (
    ConfigResponse,
    ModelConfigItem,
)
from models.schemas.files import (
    DeleteFileResponse,
    FileInfo,
    FileListResponse,
    FilePathResponse,
    FileUploadResponse,
)
from models.schemas.health import (
    HealthResponse,
    LivenessResponse,
    ReadinessResponse,
)
from models.schemas.sessions import (
    CreateSessionRequest,
    DeleteSessionResponse,
    FileInfoResponse,
    MessageResponse,
    SessionListResponse,
    SessionResponse,
    SessionWithHistoryResponse,
    SummarizeResponse,
    UpdateSessionRequest,
)

__all__ = [
    "APIResponse",
    "ConfigResponse",
    "CreateSessionRequest",
    "DeleteFileResponse",
    "DeleteSessionResponse",
    "ErrorDetail",
    "ErrorResponse",
    "FileInfo",
    "FileInfoResponse",
    "FileListResponse",
    "FilePathResponse",
    "FileUploadResponse",
    "HealthResponse",
    "LivenessResponse",
    "LoginRequest",
    "MessageResponse",
    "ModelConfigItem",
    "PaginatedResponse",
    "ReadinessResponse",
    "RefreshRequest",
    "SessionListResponse",
    "SessionResponse",
    "SessionWithHistoryResponse",
    "SuccessResponse",
    "SummarizeResponse",
    "TokenResponse",
    "UpdateSessionRequest",
    "UserInfo",
]
