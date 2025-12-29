#!/usr/bin/env python3
"""
Migrate sessions from one user to another.

Usage:
    python scripts/migrate_user_data.py --from local@chatjuicer.dev --to nick@example.com

This script updates the user_id on all sessions owned by the source user,
effectively transferring ownership to the target user. All related data
(messages, llm_context, files) follows automatically via foreign key relationships.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

# Add src/backend to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "backend"))

import asyncpg  # noqa: E402


async def get_user_id(conn: asyncpg.Connection, email: str) -> str | None:
    """Get user ID by email."""
    result = await conn.fetchval("SELECT id FROM users WHERE email = $1", email)
    return str(result) if result else None


async def migrate_sessions(
    conn: asyncpg.Connection,
    source_user_id: str,
    target_user_id: str,
) -> int:
    """Migrate all sessions from source user to target user."""
    result = await conn.execute(
        "UPDATE sessions SET user_id = $1 WHERE user_id = $2",
        target_user_id,
        source_user_id,
    )
    # Result format: "UPDATE N"
    count = int(result.split()[-1])
    return count


async def main(source_email: str, target_email: str, database_url: str) -> None:
    """Main migration logic."""
    print(f"Connecting to database...")
    conn = await asyncpg.connect(database_url)

    try:
        # Look up users
        source_id = await get_user_id(conn, source_email)
        target_id = await get_user_id(conn, target_email)

        if not source_id:
            print(f"Error: Source user not found: {source_email}")
            sys.exit(1)

        if not target_id:
            print(f"Error: Target user not found: {target_email}")
            print(f"Hint: Register the target user first via POST /api/v1/auth/register")
            sys.exit(1)

        if source_id == target_id:
            print(f"Error: Source and target are the same user")
            sys.exit(1)

        # Count sessions to migrate
        session_count = await conn.fetchval(
            "SELECT COUNT(*) FROM sessions WHERE user_id = $1",
            source_id,
        )

        if session_count == 0:
            print(f"No sessions found for source user: {source_email}")
            sys.exit(0)

        # Confirm
        print(f"\nMigration Plan:")
        print(f"  Source: {source_email} (ID: {source_id})")
        print(f"  Target: {target_email} (ID: {target_id})")
        print(f"  Sessions to migrate: {session_count}")
        print()

        confirm = input("Proceed with migration? [y/N]: ").strip().lower()
        if confirm != "y":
            print("Migration cancelled.")
            sys.exit(0)

        # Perform migration
        migrated = await migrate_sessions(conn, source_id, target_id)
        print(f"\nSuccess! Migrated {migrated} sessions to {target_email}")

    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Migrate sessions from one user to another"
    )
    parser.add_argument(
        "--from",
        dest="source_email",
        required=True,
        help="Source user email (current owner)",
    )
    parser.add_argument(
        "--to",
        dest="target_email",
        required=True,
        help="Target user email (new owner)",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get(
            "DATABASE_URL",
            "postgresql://chatjuicer:localdev@localhost:5433/chatjuicer",
        ),
        help="PostgreSQL connection URL",
    )

    args = parser.parse_args()

    asyncio.run(main(args.source_email, args.target_email, args.database_url))
