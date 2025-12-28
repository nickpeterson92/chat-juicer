#!/usr/bin/env python3
"""
Migrate local session files to S3/MinIO.

Usage:
    python scripts/migrate_files_to_s3.py [--dry-run]

This script uploads all files from data/files/{session_id}/ to the configured
S3 bucket, preserving the directory structure.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Add src/backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src" / "backend"))

from core.constants import DATA_FILES_PATH, PROJECT_ROOT, get_settings  # noqa: E402


async def migrate_files_to_s3(dry_run: bool = False) -> None:
    """Migrate all local session files to S3."""
    settings = get_settings()

    if settings.file_storage != "s3":
        print("ERROR: FILE_STORAGE is not set to 's3'. Update your .env file:")
        print("  FILE_STORAGE=s3")
        print("  S3_ENDPOINT=http://localhost:9000")
        print("  AWS_ACCESS_KEY_ID=minioadmin")
        print("  AWS_SECRET_ACCESS_KEY=minioadmin")
        print("  S3_BUCKET=chatjuicer-files")
        sys.exit(1)

    if not settings.aws_access_key_id or not settings.aws_secret_access_key:
        print("ERROR: AWS credentials not configured.")
        sys.exit(1)

    # Lazy import to avoid boto3 requirement when not using S3
    from api.services.s3_sync_service import S3SyncService

    sync_service = S3SyncService(settings=settings, local_base_path=DATA_FILES_PATH)
    loop = asyncio.get_event_loop()

    if not dry_run:
        # Ensure bucket exists
        print(f"Ensuring bucket '{settings.s3_bucket}' exists...")
        await sync_service.ensure_bucket_exists()

    # Use data/back/files as source (backup location)
    BACKUP_FILES_PATH = PROJECT_ROOT / "data" / "back" / "files"

    if not BACKUP_FILES_PATH.exists():
        print(f"No backup files directory found at {BACKUP_FILES_PATH}")
        return

    session_dirs = [d for d in BACKUP_FILES_PATH.iterdir() if d.is_dir() and d.name.startswith("chat_")]

    if not session_dirs:
        print("No session directories found to migrate.")
        return

    print(f"Found {len(session_dirs)} session(s) to migrate from {BACKUP_FILES_PATH}")
    print()

    total_files = 0
    for session_dir in session_dirs:
        session_id = session_dir.name
        files_in_session = 0

        # We want to migrate sources, output, and potentially top-level 'code' or nested 'code'
        # The user mentioned 'sources', 'cod' (code), and 'output'
        # We will look for these specifically but search recursively within them
        target_folders = ["sources", "output", "code"]

        for folder in target_folders:
            folder_path = session_dir / folder
            if not folder_path.exists():
                continue

            # Recursively find all files
            for file_path in folder_path.rglob("*"):
                if file_path.is_file() and not file_path.name.startswith("."):
                    # Calculate relative path from session dir to preserve structure
                    # e.g. path/to/session/output/code/script.py -> output/code/script.py
                    relative_path = file_path.relative_to(session_dir)
                    s3_key = f"{session_id}/{relative_path}"

                    # We can use the sync service's upload if we pass folder/filename appropriately,
                    # but _upload_file expects folder and filename.
                    # s3_sync_service._upload_file logic: local_path = base / session_id / folder / filename
                    # s3_key = session_id / folder / filename
                    # If we pass folder="output/code" and filename="script.py", it might work if base is correct.
                    # BUT here we are reading from 'data/back/files', and sync service uses 'data/files'.
                    # So we cannot use sync_service._upload_file directly because it constructs path from configured local_base_path.
                    # We must use the client directly here for the migration from backup.

                    if dry_run:
                        print(f"  [DRY-RUN] Would upload: {relative_path} -> {s3_key}")
                    else:
                        print(f"  Uploading: {relative_path} -> {s3_key}")
                        try:
                            # Use internal client directly to bypass path construction in service
                            client = sync_service._get_client()
                            await loop.run_in_executor(
                                None,
                                lambda: client.upload_file(str(file_path), settings.s3_bucket, s3_key),
                            )
                        except Exception as e:
                            print(f"  ERROR uploading {relative_path}: {e}")

                    files_in_session += 1
                    total_files += 1

        if files_in_session > 0:
            print(f"  {session_id}: {files_in_session} file(s)")

    print()
    if dry_run:
        print(f"[DRY-RUN] Would upload {total_files} file(s) to S3.")
    else:
        print(f"Successfully migrated {total_files} file(s) to S3.")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Migrate local session files to S3/MinIO."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview migration without uploading",
    )
    args = parser.parse_args()

    asyncio.run(migrate_files_to_s3(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
