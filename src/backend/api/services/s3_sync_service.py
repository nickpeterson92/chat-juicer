"""
S3 Sync Service for session file synchronization.

Provides session-load sync pattern:
- Download files from S3 → local on session load
- Upload files to S3 in background after local writes
"""

from __future__ import annotations

import asyncio

from pathlib import Path
from typing import TYPE_CHECKING, Any

from utils.logger import logger

if TYPE_CHECKING:
    from core.constants import Settings


class S3SyncService:
    """Syncs session files between S3 and local cache."""

    # Store background task references to prevent garbage collection
    _background_tasks: set[asyncio.Task[None]]

    def __init__(self, settings: Settings, local_base_path: Path):
        self.settings = settings
        self.local_base_path = local_base_path
        self._client: Any = None
        self._background_tasks: set[asyncio.Task[None]] = set()

    def _get_client(self) -> Any:
        """Lazy-initialize boto3 client."""
        if self._client is None:
            import boto3

            client_kwargs: dict[str, Any] = {
                "service_name": "s3",
                "region_name": self.settings.s3_region,
            }

            # Only pass explicit credentials if configured (allows fallback to AWS profile/SSO)
            if self.settings.aws_access_key_id:
                client_kwargs["aws_access_key_id"] = self.settings.aws_access_key_id
            if self.settings.aws_secret_access_key:
                client_kwargs["aws_secret_access_key"] = self.settings.aws_secret_access_key

            if self.settings.s3_endpoint:
                client_kwargs["endpoint_url"] = self.settings.s3_endpoint

            self._client = boto3.client(**client_kwargs)
        return self._client

    @property
    def bucket(self) -> str:
        """Get bucket name from settings."""
        return str(self.settings.s3_bucket)

    def cleanup_session_files(self, session_id: str) -> int:
        """Remove local cached files for a session.

        Called when WebSocket disconnects and no connections remain.

        Args:
            session_id: Session identifier

        Returns:
            Number of files deleted
        """
        import shutil

        session_path = self.local_base_path / session_id
        if not session_path.exists():
            return 0

        # Count files before deletion
        file_count = sum(1 for _ in session_path.rglob("*") if _.is_file())

        # Remove the entire session directory with error logging
        def on_error(func: Any, path: str, exc_info: Any) -> None:
            logger.warning(f"Failed to delete {path}: {exc_info[1]}")

        logger.info(f"Removing local session files at: {session_path.absolute()}")
        shutil.rmtree(session_path, onerror=on_error)

        if file_count > 0:
            logger.info(f"Cleaned up {file_count} local files for session {session_id}")
        else:
            logger.info(f"No local files found to clean up for session {session_id}")

        return file_count

    async def sync_from_s3(self, session_id: str) -> int:
        """Download all session files from S3 → local.

        Called on session load to ensure local cache has all files.

        Args:
            session_id: Session identifier

        Returns:
            Number of files synced
        """
        client = self._get_client()
        prefix = f"{session_id}/"

        # Run blocking S3 calls in thread pool
        loop = asyncio.get_event_loop()

        try:
            # List all objects with session prefix using paginator
            paginator = client.get_paginator("list_objects_v2")

            # Run pagination in executor to avoid blocking
            pages = await loop.run_in_executor(
                None, lambda: list(paginator.paginate(Bucket=self.bucket, Prefix=prefix))
            )

            synced = 0
            for page in pages:
                contents = page.get("Contents", [])
                if not contents:
                    continue

                for obj in contents:
                    s3_key = obj["Key"]
                    # Convert S3 key to local path: session_id/folder/filename
                    relative_path = s3_key  # Already has session_id prefix
                    local_path = self.local_base_path / relative_path

                    # Skip if local file exists and is same size
                    if local_path.exists() and local_path.stat().st_size == obj["Size"]:
                        continue

                    # Download file
                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    key, path = s3_key, local_path
                    await loop.run_in_executor(
                        None,
                        lambda k=key, p=path: client.download_file(self.bucket, k, str(p)),  # type: ignore[misc]
                    )
                    synced += 1

            if synced > 0:
                logger.info(f"Synced {synced} files from S3 for session {session_id}")
            return synced

        except Exception as e:
            # Log but don't fail - local files may still work
            logger.warning(f"S3 sync failed for session {session_id}: {e}")
            return 0

    def upload_to_s3_background(self, session_id: str, folder: str, filename: str) -> None:
        """Schedule background upload of local file → S3.

        Non-blocking, fire-and-forget. Creates an async task.

        Args:
            session_id: Session identifier
            folder: Folder within session (input, output)
            filename: File name
        """
        task = asyncio.create_task(
            self._upload_file(session_id, folder, filename),
            name=f"s3_upload_{session_id}_{filename}",
        )
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    async def _upload_file(self, session_id: str, folder: str, filename: str) -> None:
        """Upload single file to S3."""
        client = self._get_client()
        local_path = self.local_base_path / session_id / folder / filename
        s3_key = f"{session_id}/{folder}/{filename}"

        if not local_path.exists():
            logger.warning(f"Cannot upload missing file: {local_path}")
            return

        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                None,
                lambda: client.upload_file(str(local_path), self.bucket, s3_key),
            )
            logger.debug(f"Uploaded to S3: {s3_key}")
        except Exception as e:
            logger.error(f"S3 upload failed for {s3_key}: {e}")

    async def upload_all_to_s3(self, session_id: str) -> int:
        """Upload all local session files → S3.

        Used for migration and ensuring S3 has all files.

        Args:
            session_id: Session identifier

        Returns:
            Number of files uploaded
        """
        session_path = self.local_base_path / session_id
        if not session_path.exists():
            return 0

        uploaded = 0
        for folder in ["input", "output"]:
            folder_path = session_path / folder
            if not folder_path.exists():
                continue

            # Recursively find all files
            for file_path in folder_path.rglob("*"):
                if file_path.is_file() and not file_path.name.startswith("."):
                    # Calculate relative path from folder root (e.g. code/script.py)
                    # upload_to_s3_background expects filename relative to folder
                    relative_filename = str(file_path.relative_to(folder_path))
                    await self._upload_file(session_id, folder, relative_filename)
                    uploaded += 1

        if uploaded > 0:
            logger.info(f"Uploaded {uploaded} files to S3 for session {session_id}")
        return uploaded

    async def ensure_bucket_exists(self) -> None:
        """Create bucket if it doesn't exist (for MinIO)."""
        client = self._get_client()
        loop = asyncio.get_event_loop()

        try:
            await loop.run_in_executor(
                None,
                lambda: client.head_bucket(Bucket=self.bucket),
            )
        except Exception:
            # Bucket doesn't exist, create it
            try:
                await loop.run_in_executor(
                    None,
                    lambda: client.create_bucket(Bucket=self.bucket),
                )
                logger.info(f"Created S3 bucket: {self.bucket}")
            except Exception as e:
                logger.error(f"Failed to create S3 bucket {self.bucket}: {e}")
                raise

    def generate_presigned_upload_url(
        self, session_id: str, folder: str, filename: str, content_type: str | None = None
    ) -> tuple[str, str]:
        """Generate presigned PUT URL for direct upload.

        Args:
            session_id: Session identifier
            folder: Folder within session (input, output)
            filename: File name
            content_type: Optional MIME type

        Returns:
            Tuple of (presigned_url, s3_key)
        """
        client = self._get_client()
        s3_key = f"{session_id}/{folder}/{filename}"

        params = {
            "Bucket": self.bucket,
            "Key": s3_key,
        }
        if content_type:
            params["ContentType"] = content_type

        url = client.generate_presigned_url(
            "put_object",
            Params=params,
            ExpiresIn=self.settings.s3_presigned_url_expiry,
        )
        return url, s3_key

    def generate_presigned_download_url(self, session_id: str, folder: str, filename: str) -> str:
        """Generate presigned GET URL for direct download.

        Args:
            session_id: Session identifier
            folder: Folder within session (input, output)
            filename: File name

        Returns:
            Presigned download URL
        """
        client = self._get_client()
        s3_key = f"{session_id}/{folder}/{filename}"

        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": s3_key},
            ExpiresIn=self.settings.s3_presigned_url_expiry,
        )
        return str(url)
