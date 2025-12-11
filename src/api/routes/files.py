from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File as FastAPIFile, HTTPException, UploadFile
from fastapi.responses import Response

from api.dependencies import Files
from models.api_models import FileInfo, FileListResponse, FilePathResponse

router = APIRouter()


@router.get("/{session_id}/files")
async def list_files(
    session_id: str,
    files: Files,
    folder: str = "sources",
) -> FileListResponse:
    """List files in session folder."""
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

    try:
        content = await files.get_file_content(session_id, folder, filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc

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
    path = files.get_file_path(session_id, folder, filename)

    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FilePathResponse(path=str(path.absolute()))


@router.delete("/{session_id}/files/{filename}")
async def delete_file(
    session_id: str,
    filename: str,
    files: Files,
    folder: str = "sources",
) -> dict[str, bool]:
    """Delete file."""
    success = await files.delete_file(session_id, folder, filename)

    if not success:
        raise HTTPException(status_code=404, detail="File not found")

    return {"success": True}
