from __future__ import annotations

import base64
import mimetypes
import platform
import shutil

from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol, cast
from uuid import UUID

import asyncpg

from utils.logger import logger

if TYPE_CHECKING:
    from api.services.s3_sync_service import S3SyncService


class FileService(Protocol):
    """Abstract file service protocol."""

    async def list_files(self, session_id: str, folder: str) -> list[dict[str, Any]]: ...

    async def save_file(
        self,
        session_id: str,
        folder: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]: ...

    async def get_file_content(self, session_id: str, folder: str, filename: str) -> bytes: ...

    async def read_image_as_base64(self, session_id: str, folder: str, filename: str) -> tuple[str, str] | None: ...

    async def delete_file(self, session_id: str, folder: str, filename: str) -> bool: ...

    @property
    def s3_sync(self) -> S3SyncService | None: ...

    def get_file_path(self, session_id: str, folder: str, filename: str) -> Path: ...

    def init_session_workspace(self, session_id: str, templates_path: Path | None = None) -> None: ...


class LocalFileService:
    """Phase 1: local filesystem-backed file service with DB metadata."""

    def __init__(
        self,
        base_path: Path | None = None,
        pool: asyncpg.Pool | None = None,
        s3_sync: S3SyncService | None = None,
    ):
        self.base_path = base_path or Path("data/files")
        self.pool = pool
        self._s3_sync = s3_sync

    @property
    def s3_sync(self) -> S3SyncService | None:
        """Access the underlying S3 sync service (for triggering manual uploads)."""
        return self._s3_sync

    def _get_dir(self, session_id: str, folder: str) -> Path:
        """Get directory path for session folder."""
        return self.base_path / session_id / folder

    def get_file_path(self, session_id: str, folder: str, filename: str) -> Path:
        """Get full file path."""
        return self._get_dir(session_id, folder) / filename

    async def list_files(self, session_id: str, folder: str) -> list[dict[str, Any]]:
        """List files in session folder."""
        dir_path = self._get_dir(session_id, folder)

        if not dir_path.exists():
            return []

        files = []
        for entry in dir_path.iterdir():
            if entry.is_file() and not entry.name.startswith("."):
                stat = entry.stat()
                files.append(
                    {
                        "name": entry.name,
                        "type": "file",
                        "size": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    }
                )
            elif entry.is_dir():
                try:
                    count = len(list(entry.iterdir()))
                except OSError:
                    count = 0
                files.append(
                    {
                        "name": entry.name,
                        "type": "folder",
                        "size": 0,
                        "file_count": count,
                    }
                )

        files.sort(key=lambda f: (f["type"] != "folder", str(f["name"]).lower()))
        return files

    async def save_file(
        self,
        session_id: str,
        folder: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        """Save file to local filesystem and persist metadata."""
        dir_path = self._get_dir(session_id, folder)
        dir_path.mkdir(parents=True, exist_ok=True)

        file_path = dir_path / filename
        file_path.write_bytes(content)

        if self.pool:
            session_uuid = await self._get_session_uuid(session_id)
            if session_uuid:
                await self._upsert_file_record(session_uuid, filename, file_path, folder, content_type, len(content))

        result = {
            "name": filename,
            "type": "file",
            "size": len(content),
            "modified": datetime.now().isoformat(),
        }

        # Trigger background S3 upload if sync service is configured
        if self._s3_sync:
            self._s3_sync.upload_to_s3_background(session_id, folder, filename)

        return result

    async def get_file_content(self, session_id: str, folder: str, filename: str) -> bytes:
        """Get file content."""
        file_path = self.get_file_path(session_id, folder, filename)

        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {filename}")

        return file_path.read_bytes()

    async def read_image_as_base64(self, session_id: str, folder: str, filename: str) -> tuple[str, str] | None:
        """Read image from session workspace and return (mime_type, base64_data).

        Args:
            session_id: Session identifier
            folder: Folder within session (e.g., "sources")
            filename: Image filename

        Returns:
            Tuple of (mime_type, base64_encoded_data) or None if file doesn't exist
            or is not a supported image format.
        """

        file_path = self.get_file_path(session_id, folder, filename)

        if not file_path.exists():
            logger.warning(f"Image file not found: {file_path}")
            return None

        # Determine MIME type from extension
        extension = file_path.suffix.lower()
        mime_type = mimetypes.guess_type(filename)[0]

        # Fallback for common image types
        if not mime_type:
            mime_map = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
                ".webp": "image/webp",
            }
            mime_type = mime_map.get(extension)

        if not mime_type or not mime_type.startswith("image/"):
            logger.warning(f"Unsupported image format: {extension}")
            return None

        try:
            image_bytes = file_path.read_bytes()
            base64_data = base64.b64encode(image_bytes).decode("utf-8")
            logger.debug(f"Encoded image {filename} to base64 ({len(base64_data)} chars)")
            return (mime_type, base64_data)
        except Exception as e:
            logger.error(f"Failed to read/encode image {filename}: {e}")
            return None

    async def delete_file(self, session_id: str, folder: str, filename: str) -> bool:
        """Delete file and metadata record."""
        file_path = self.get_file_path(session_id, folder, filename)

        if not file_path.exists():
            return False

        file_path.unlink()

        if self.pool:
            session_uuid = await self._get_session_uuid(session_id)
            if session_uuid:
                async with self.pool.acquire() as conn:
                    await conn.execute(
                        "DELETE FROM files WHERE session_id = $1 AND filename = $2 AND folder = $3",
                        session_uuid,
                        filename,
                        folder,
                    )
        return True

    async def _get_session_uuid(self, session_id: str) -> UUID | None:
        if not self.pool:
            return None
        async with self.pool.acquire() as conn:
            result = await conn.fetchval(
                "SELECT id FROM sessions WHERE session_id = $1",
                session_id,
            )
            return cast(UUID | None, result)

    async def _upsert_file_record(
        self,
        session_uuid: UUID,
        filename: str,
        file_path: Path,
        folder: str,
        content_type: str | None,
        size_bytes: int,
    ) -> None:
        if not self.pool:
            return None
        async with self.pool.acquire() as conn, conn.transaction():
            await conn.execute(
                "DELETE FROM files WHERE session_id = $1 AND filename = $2 AND folder = $3",
                session_uuid,
                filename,
                folder,
            )
            await conn.execute(
                """
                INSERT INTO files (session_id, filename, file_path, content_type, size_bytes, folder)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                session_uuid,
                filename,
                str(file_path),
                content_type,
                size_bytes,
                folder,
            )

    def init_session_workspace(self, session_id: str, templates_path: Path | None = None) -> None:
        """Initialize session workspace with sources/, output/, and templates/ symlink.

        Creates the directory structure for a new session:
        - sources/: uploaded files
        - output/: generated files
        - templates/: symlink to global templates (read-only)
        """
        session_dir = self.base_path / session_id

        # Create sources and output directories
        (session_dir / "sources").mkdir(parents=True, exist_ok=True)
        (session_dir / "output").mkdir(parents=True, exist_ok=True)

        # Create templates/ symlink to global templates
        templates_link = session_dir / "templates"

        if templates_path and templates_path.exists():
            try:
                if not templates_link.exists():
                    if platform.system() == "Windows":
                        # Windows fallback: copy templates instead of symlink
                        shutil.copytree(templates_path, templates_link, dirs_exist_ok=True)
                        logger.info(f"Created templates copy (Windows): {templates_link}")
                    else:
                        # Unix-like systems: use symlink
                        templates_link.symlink_to(templates_path, target_is_directory=True)
                        logger.info(f"Created templates symlink: {templates_link} -> {templates_path}")
            except Exception as e:
                logger.warning(f"Failed to create templates link/copy: {e}")
        elif not templates_link.exists():
            # Create empty templates dir if no global templates
            templates_link.mkdir(exist_ok=True)
            logger.info(f"Created empty templates directory: {templates_link}")
