"""
File management endpoints (v1).

Provides file operations for session workspaces with consistent
response patterns and comprehensive OpenAPI documentation.
"""

from __future__ import annotations

import mimetypes

from typing import Annotated

from fastapi import APIRouter, File as FastAPIFile, Path, Query, UploadFile
from fastapi.responses import Response

from api.dependencies import Files
from api.middleware.exception_handlers import ApiFileNotFoundError
from api.middleware.request_context import update_request_context
from models.schemas.files import (
    DeleteFileResponse,
    FileInfo,
    FileListResponse,
    FilePathResponse,
    FileUploadResponse,
)

router = APIRouter()


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
        description="Folder within session (sources, outputs, templates)",
        examples=["sources"],
    ),
]


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
                        "folder": "sources",
                        "count": 1,
                    }
                }
            },
        }
    },
)
async def list_files(
    session_id: SessionIdPath,
    files: Files,
    folder: FolderQuery = "sources",
) -> FileListResponse:
    """List files in session folder."""
    update_request_context(session_id=session_id)

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
                        "path": "sources/document.pdf",
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
    files: Files,
    file: Annotated[UploadFile, FastAPIFile(description="File to upload")],
    folder: FolderQuery = "sources",
) -> FileUploadResponse:
    """Upload file to session folder."""
    update_request_context(session_id=session_id)

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
    files: Files,
    folder: FolderQuery = "sources",
) -> Response:
    """Download file content."""
    update_request_context(session_id=session_id)

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
                        "path": "/data/files/sess_123/sources/doc.pdf",
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
    files: Files,
    folder: FolderQuery = "sources",
) -> FilePathResponse:
    """Get local file path for shell.openPath."""
    update_request_context(session_id=session_id)

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
    files: Files,
    folder: FolderQuery = "sources",
) -> DeleteFileResponse:
    """Delete a file from session folder."""
    update_request_context(session_id=session_id)

    success = await files.delete_file(session_id, folder, filename)

    if not success:
        raise ApiFileNotFoundError(filename)

    return DeleteFileResponse(
        success=True,
        message="File deleted successfully",
        filename=filename,
    )
