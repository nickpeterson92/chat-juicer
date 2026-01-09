"""
File management endpoints (v1).

Provides file operations for session workspaces with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

import mimetypes

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File as FastAPIFile, HTTPException, Path, Query, UploadFile
from fastapi.responses import Response

from api.dependencies import DB, AppSettings, Files
from api.middleware.auth import get_current_user
from api.middleware.exception_handlers import ApiFileNotFoundError, SessionNotFoundError
from api.middleware.request_context import update_request_context
from models.api_models import UserInfo
from models.schemas.files import (
    DeleteFileResponse,
    FileInfo,
    FileListResponse,
    FilePathResponse,
    FileUploadResponse,
)
from models.schemas.presign import (
    PresignedDownloadResponse,
    PresignedUploadRequest,
    PresignedUploadResponse,
)

router = APIRouter()

# Type alias for authenticated user dependency
CurrentUser = Annotated[UserInfo, Depends(get_current_user)]


# =============================================================================
# Path Parameter Types
# =============================================================================

SessionIdPath = Annotated[
    str,
    Path(
        ...,
        description="Session identifier",
        examples=["sess_abc123"],
    ),
]

FilenamePath = Annotated[
    str,
    Path(
        ...,
        description="File name",
        examples=["document.pdf"],
    ),
]

FolderQuery = Annotated[
    str,
    Query(
        description="Folder within session (input, outputs, templates)",
        examples=["input"],
    ),
]


# =============================================================================
# Helpers
# =============================================================================


async def verify_session_ownership(
    session_id: str,
    user: UserInfo,
    db: DB,
) -> None:
    """Verify user owns the session or raise appropriate error.

    Args:
        session_id: Session identifier to verify
        user: Authenticated user info
        db: Database connection pool

    Raises:
        SessionNotFoundError: If session doesn't exist
        HTTPException: 403 if user doesn't own the session
    """
    user_id = UUID(user.id)
    async with db.acquire() as conn:
        owner = await conn.fetchval(
            "SELECT user_id FROM sessions WHERE session_id = $1",
            session_id,
        )

    if owner is None:
        raise SessionNotFoundError(session_id)

    if owner != user_id:
        raise HTTPException(status_code=403, detail="Access denied to this session")


# =============================================================================
# Endpoints
# =============================================================================


@router.get(
    "/{session_id}/files",
    response_model=FileListResponse,
    summary="List session files",
    description="List all files in a session folder.",
    responses={
        200: {
            "description": "Files retrieved successfully",
            "content": {
                "application/json": {
                    "example": {
                        "files": [
                            {
                                "name": "report.pdf",
                                "type": "file",
                                "size": 245760,
                                "extension": ".pdf",
                            }
                        ],
                        "folder": "input",
                        "count": 1,
                    }
                }
            },
        }
    },
)
async def list_files(
    session_id: SessionIdPath,
    user: CurrentUser,
    db: DB,
    files: Files,
    folder: FolderQuery = "input",
) -> FileListResponse:
    """List files in session folder."""
    update_request_context(session_id=session_id)
    await verify_session_ownership(session_id, user, db)

    file_list = await files.list_files(session_id, folder)

    return FileListResponse(
        files=[FileInfo(**f) for f in file_list],
        folder=folder,
        count=len(file_list),
    )


@router.post(
    "/{session_id}/files/upload",
    response_model=FileUploadResponse,
    status_code=201,
    summary="Upload file",
    description="Upload a file to a session folder.",
    responses={
        201: {
            "description": "File uploaded successfully",
            "content": {
                "application/json": {
                    "example": {
                        "name": "document.pdf",
                        "type": "file",
                        "size": 102400,
                        "extension": ".pdf",
                        "path": "input/document.pdf",
                    }
                }
            },
        },
        413: {"description": "File too large"},
        422: {"description": "Invalid file type"},
    },
)
async def upload_file(
    session_id: SessionIdPath,
    user: CurrentUser,
    db: DB,
    files: Files,
    file: Annotated[UploadFile, FastAPIFile(description="File to upload")],
    folder: FolderQuery = "input",
) -> FileUploadResponse:
    """Upload file to session folder."""
    update_request_context(session_id=session_id)
    await verify_session_ownership(session_id, user, db)

    content = await file.read()

    result = await files.save_file(
        session_id=session_id,
        folder=folder,
        filename=file.filename,
        content=content,
        content_type=file.content_type,
    )

    return FileUploadResponse(
        name=result["name"],
        size=result["size"],
        modified=result.get("modified"),
        extension=result.get("extension"),
        path=f"{folder}/{result['name']}",
    )


@router.get(
    "/{session_id}/files/{filename}/download",
    summary="Download file",
    description="Download a file from a session folder.",
    responses={
        200: {
            "description": "File content",
            "content": {"application/octet-stream": {}},
        },
        404: {"description": "File not found"},
    },
)
async def download_file(
    session_id: SessionIdPath,
    filename: FilenamePath,
    user: CurrentUser,
    db: DB,
    files: Files,
    folder: FolderQuery = "input",
) -> Response:
    """Download file content."""
    update_request_context(session_id=session_id)
    await verify_session_ownership(session_id, user, db)

    try:
        content = await files.get_file_content(session_id, folder, filename)
    except FileNotFoundError as exc:
        raise ApiFileNotFoundError(filename) from exc

    content_type, _ = mimetypes.guess_type(filename)

    return Response(
        content=content,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{session_id}/files/{filename}/path",
    response_model=FilePathResponse,
    summary="Get file path",
    description="Get the local filesystem path for a file (for shell.openPath).",
    responses={
        200: {
            "description": "File path retrieved",
            "content": {
                "application/json": {
                    "example": {
                        "path": "/data/files/sess_123/input/doc.pdf",
                        "exists": True,
                    }
                }
            },
        },
        404: {"description": "File not found"},
    },
)
async def get_file_path(
    session_id: SessionIdPath,
    filename: FilenamePath,
    user: CurrentUser,
    db: DB,
    files: Files,
    folder: FolderQuery = "input",
) -> FilePathResponse:
    """Get local file path for shell.openPath."""
    update_request_context(session_id=session_id)
    await verify_session_ownership(session_id, user, db)

    path = files.get_file_path(session_id, folder, filename)

    if not path.exists():
        raise ApiFileNotFoundError(filename)

    return FilePathResponse(
        path=str(path.absolute()),
        exists=True,
    )


@router.delete(
    "/{session_id}/files/{filename}",
    response_model=DeleteFileResponse,
    summary="Delete file",
    description="Delete a file from a session folder.",
    responses={
        200: {
            "description": "File deleted successfully",
            "content": {
                "application/json": {
                    "example": {
                        "success": True,
                        "message": "File deleted successfully",
                        "filename": "document.pdf",
                    }
                }
            },
        },
        404: {"description": "File not found"},
    },
)
async def delete_file(
    session_id: SessionIdPath,
    filename: FilenamePath,
    user: CurrentUser,
    db: DB,
    files: Files,
    folder: FolderQuery = "input",
) -> DeleteFileResponse:
    """Delete a file from session folder."""
    update_request_context(session_id=session_id)
    await verify_session_ownership(session_id, user, db)

    success = await files.delete_file(session_id, folder, filename)

    if not success:
        raise ApiFileNotFoundError(filename)

    return DeleteFileResponse(
        success=True,
        message="File deleted successfully",
        filename=filename,
    )


# =============================================================================
# Presigned URL Endpoints (Phase 2 - S3 Storage)
# =============================================================================


@router.post(
    "/{session_id}/files/presign-upload",
    response_model=PresignedUploadResponse,
    summary="Get presigned upload URL",
    description="Generate a presigned PUT URL for direct S3 upload. Only available when FILE_STORAGE=s3.",
    responses={
        200: {
            "description": "Presigned URL generated",
            "content": {
                "application/json": {
                    "example": {
                        "upload_url": "https://minio:9000/bucket/sess/input/file.pdf?...",
                        "file_key": "sess_123/input/file.pdf",
                        "expires_in": 3600,
                    }
                }
            },
        },
        400: {"description": "S3 storage not enabled"},
    },
)
async def presign_upload(
    session_id: SessionIdPath,
    request: PresignedUploadRequest,
    user: CurrentUser,
    db: DB,
    files: Files,
    settings: AppSettings,
) -> PresignedUploadResponse:
    """Generate presigned PUT URL for direct S3 upload."""
    update_request_context(session_id=session_id)
    await verify_session_ownership(session_id, user, db)

    if settings.file_storage != "s3" or not files.s3_sync:
        raise HTTPException(status_code=400, detail="S3 storage not enabled")

    url, key = files.s3_sync.generate_presigned_upload_url(
        session_id, request.folder, request.filename, request.content_type
    )

    return PresignedUploadResponse(
        upload_url=url,
        file_key=key,
        expires_in=settings.s3_presigned_url_expiry,
    )


@router.get(
    "/{session_id}/files/{filename}/presign-download",
    response_model=PresignedDownloadResponse,
    summary="Get presigned download URL",
    description="Generate a presigned GET URL for direct S3 download. Only available when FILE_STORAGE=s3.",
    responses={
        200: {
            "description": "Presigned URL generated",
            "content": {
                "application/json": {
                    "example": {
                        "download_url": "https://minio:9000/bucket/sess/input/file.pdf?...",
                        "expires_in": 3600,
                    }
                }
            },
        },
        400: {"description": "S3 storage not enabled"},
    },
)
async def presign_download(
    session_id: SessionIdPath,
    filename: FilenamePath,
    user: CurrentUser,
    db: DB,
    files: Files,
    settings: AppSettings,
    folder: FolderQuery = "input",
) -> PresignedDownloadResponse:
    """Generate presigned GET URL for direct S3 download."""
    update_request_context(session_id=session_id)
    await verify_session_ownership(session_id, user, db)

    if settings.file_storage != "s3" or not files.s3_sync:
        raise HTTPException(status_code=400, detail="S3 storage not enabled")

    url = files.s3_sync.generate_presigned_download_url(session_id, folder, filename)

    return PresignedDownloadResponse(
        download_url=url,
        expires_in=settings.s3_presigned_url_expiry,
    )
