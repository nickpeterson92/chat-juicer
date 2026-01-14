#!/usr/bin/env python3
"""
Migration script to strip base64 image data from llm_context table.

This fixes context overflow issues caused by large base64-encoded images
stored in tool results. Images are already saved to disk, so we just need
to remove the base64 field from the JSON and keep the file metadata.

Usage:
    # Dry run (show what would be changed)
    python strip_base64_from_context.py

    # Actually run the migration
    python strip_base64_from_context.py --execute

Requirements:
    - DATABASE_URL environment variable must be set
    - Or run from project root with .env file
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

from pathlib import Path

# Add src/backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg  # noqa: E402


async def get_database_url() -> str:
    """Get database URL from environment or .env file."""
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return db_url

    # Try loading from .env file
    env_file = Path(__file__).parent.parent.parent / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    return line.strip().split("=", 1)[1].strip('"').strip("'")

    raise ValueError("DATABASE_URL not set. Set environment variable or create .env file.")


def strip_base64_from_content(content_str: str) -> tuple[str, bool]:
    """
    Strip base64 fields from JSON content.

    Returns:
        Tuple of (new_content_str, was_modified)
    """
    try:
        content = json.loads(content_str)
    except json.JSONDecodeError:
        return content_str, False

    modified = False

    # Check if this is a tool output with files array
    if isinstance(content, dict):
        # Direct tool output format: {"success": true, "files": [...]}
        if "output" in content and isinstance(content["output"], str):
            try:
                output = json.loads(content["output"])
                if isinstance(output, dict) and "files" in output:
                    for file_info in output.get("files", []):
                        if isinstance(file_info, dict) and "base64" in file_info:
                            del file_info["base64"]
                            file_info["preview_available"] = True
                            modified = True
                    if modified:
                        content["output"] = json.dumps(output)
            except json.JSONDecodeError:
                pass

        # Also check nested content formats
        if "files" in content and isinstance(content["files"], list):
            for file_info in content["files"]:
                if isinstance(file_info, dict) and "base64" in file_info:
                    del file_info["base64"]
                    file_info["preview_available"] = True
                    modified = True

    # Handle function_call_output format from SDK
    if isinstance(content, dict) and content.get("type") == "function_call_output":
        raw_output = content.get("output", "")
        if isinstance(raw_output, str):
            try:
                output_data = json.loads(raw_output)
                if isinstance(output_data, dict) and "files" in output_data:
                    for file_info in output_data.get("files", []):
                        if isinstance(file_info, dict) and "base64" in file_info:
                            del file_info["base64"]
                            file_info["preview_available"] = True
                            modified = True
                    if modified:
                        content["output"] = json.dumps(output_data)
            except json.JSONDecodeError:
                pass

    if modified:
        return json.dumps(content), True
    return content_str, False


async def run_migration(execute: bool = False) -> None:
    """Run the migration to strip base64 from llm_context."""
    db_url = await get_database_url()
    print("Connecting to database...")

    pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5)

    try:
        async with pool.acquire() as conn:
            # Find all rows that likely contain base64 data
            # Use LIKE with 'base64' as a quick filter
            print("Scanning for rows with base64 data...")
            rows = await conn.fetch(
                """
                SELECT id, content, LENGTH(content) as content_len
                FROM llm_context
                WHERE content LIKE '%"base64":%'
                ORDER BY id
                """
            )

            print(f"Found {len(rows)} rows potentially containing base64 data")

            if not rows:
                print("No rows to migrate!")
                return

            # Calculate total size
            total_before = sum(row["content_len"] for row in rows)
            total_after = 0
            modified_count = 0
            total_savings = 0

            for row in rows:
                new_content, was_modified = strip_base64_from_content(row["content"])
                if was_modified:
                    modified_count += 1
                    savings = len(row["content"]) - len(new_content)
                    total_savings += savings
                    total_after += len(new_content)

                    print(
                        f"  Row {row['id']}: {row['content_len']:,} -> {len(new_content):,} bytes (saved {savings:,})"
                    )

                    if execute:
                        await conn.execute(
                            "UPDATE llm_context SET content = $1 WHERE id = $2",
                            new_content,
                            row["id"],
                        )
                else:
                    total_after += row["content_len"]

            print(f"\n{'=' * 50}")
            print("Summary:")
            print(f"  Rows scanned: {len(rows)}")
            print(f"  Rows modified: {modified_count}")
            print(f"  Total size before: {total_before:,} bytes ({total_before / 1024 / 1024:.2f} MB)")
            print(f"  Total size after: {total_after:,} bytes ({total_after / 1024 / 1024:.2f} MB)")
            print(f"  Total savings: {total_savings:,} bytes ({total_savings / 1024 / 1024:.2f} MB)")

            if execute:
                print(f"\n✓ Migration complete! {modified_count} rows updated.")
            else:
                print("\n⚠ DRY RUN - No changes made. Run with --execute to apply changes.")

    finally:
        await pool.close()


def main() -> None:
    """Entry point."""
    execute = "--execute" in sys.argv

    if execute:
        print("=" * 50)
        print("EXECUTING MIGRATION (changes will be applied)")
        print("=" * 50)
    else:
        print("=" * 50)
        print("DRY RUN (no changes will be made)")
        print("Run with --execute to apply changes")
        print("=" * 50)

    asyncio.run(run_migration(execute=execute))


if __name__ == "__main__":
    main()
