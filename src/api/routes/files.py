from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File as FastAPIFile, UploadFile
from fastapi.responses import Response

from api.dependencies import Files
from api.middleware.exception_handlers import FileNotFoundError as AppFileNotFoundError
from api.middleware.request_context import update_request_context
from models.api_models import FileInfo, FileListResponse, FilePathResponse

router = APIRouter()


@router.get("/{session_id}/files")
async def list_files(
    session_id: str,
    files: Files,
    folder: str = "sources",
) -> FileListResponse:
    """List files in session folder."""
    update_request_context(session_id=session_id)
    file_list = await files.list_files(session_id, folder)
    return FileListResponse(files=[FileInfo(**f) for f in file_list])


@router.post("/{session_id}/files/upload")
async def upload_file(
    session_id: str,
    files: Files,
    file: Annotated[UploadFile, FastAPIFile(...)],
    folder: str = "sources",
) -> FileInfo:
    """Upload file directly (Phase 1 - local storage)."""
    update_request_context(session_id=session_id)

    content = await file.read()

    result = await files.save_file(
        session_id=session_id,
        folder=folder,
        filename=file.filename,
        content=content,
        content_type=file.content_type,
    )

    return FileInfo(**result)


@router.get("/{session_id}/files/{filename}/download")
async def download_file(
    session_id: str,
    filename: str,
    files: Files,
    folder: str = "sources",
) -> Response:
    """Get file content for download."""
    import mimetypes

    update_request_context(session_id=session_id)

    try:
        content = await files.get_file_content(session_id, folder, filename)
    except FileNotFoundError as exc:
        raise AppFileNotFoundError(filename) from exc

    content_type, _ = mimetypes.guess_type(filename)

    return Response(
        content=content,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{session_id}/files/{filename}/path")
async def get_file_path(
    session_id: str,
    filename: str,
    files: Files,
    folder: str = "sources",
) -> FilePathResponse:
    """Get local file path (Phase 1 - for shell.openPath)."""
    update_request_context(session_id=session_id)

    path = files.get_file_path(session_id, folder, filename)

    if not path.exists():
        raise AppFileNotFoundError(filename)

    return FilePathResponse(path=str(path.absolute()))


@router.delete("/{session_id}/files/{filename}")
async def delete_file(
    session_id: str,
    filename: str,
    files: Files,
    folder: str = "sources",
) -> dict[str, bool]:
    """Delete file."""
    update_request_context(session_id=session_id)

    success = await files.delete_file(session_id, folder, filename)

    if not success:
        raise AppFileNotFoundError(filename)

    return {"success": True}
