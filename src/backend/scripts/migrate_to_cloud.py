"""
Migration script for Phase 2.5: Hybrid Cloud Architecture.

Orchestrates the movement of data from:
1. Local MinIO -> AWS S3 (Files)
2. Local Docker Postgres -> Remote RDS Postgres (Database)

Usage:
    python src/backend/scripts/migrate_to_cloud.py
"""

import argparse
import os
import subprocess
import sys

import boto3


def log(msg: str, level: str = "INFO") -> None:
    print(f"[{level}] {msg}")


def migrate_files(
    minio_endpoint: str,
    s3_bucket_name: str,
    minio_access_key: str,
    minio_secret_key: str,
    minio_bucket_name: str,
    aws_profile: str | None = None,
) -> None:
    """Copy all files from MinIO to AWS S3."""
    log("Starting File Migration (MinIO -> S3)...")

    # MinIO Client (Source)
    minio_client = boto3.client(
        "s3", endpoint_url=minio_endpoint, aws_access_key_id=minio_access_key, aws_secret_access_key=minio_secret_key
    )

    # AWS S3 Client (Destination)
    # Use specified profile if provided, otherwise default chain
    session = boto3.Session(profile_name=aws_profile) if aws_profile else boto3.Session()
    s3_client = session.client("s3")

    # List objects in MinIO
    try:
        paginator = minio_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=minio_bucket_name)

        count = 0
        for page in pages:
            if "Contents" not in page:
                continue

            for obj in page["Contents"]:
                key = obj["Key"]
                log(f"Migrating: {key}")

                # Download from MinIO to memory
                response = minio_client.get_object(Bucket=minio_bucket_name, Key=key)
                content = response["Body"].read()

                # Upload to AWS S3
                s3_client.put_object(Bucket=s3_bucket_name, Key=key, Body=content)
                count += 1

        log(f"Successfully migrated {count} files.")
    except Exception as e:
        log(f"File migration failed: {e}", "ERROR")
        sys.exit(1)


def migrate_database(local_db_url: str, remote_db_url: str) -> None:
    """Pipe pg_dump from local DB to remote DB."""
    log("Starting Database Migration (Docker -> Remote)...")

    # Parse connection details if needed, or rely on libpq handling URLs
    # pg_dump $LOCAL_DB_URL | psql $REMOTE_DB_URL

    try:
        # Detect PostgreSQL 16 binaries (Homebrew keg-only)
        pg_dump_bin = "pg_dump"
        psql_bin = "psql"

        brew_pg16_path = "/opt/homebrew/opt/postgresql@16/bin"
        if os.path.exists(os.path.join(brew_pg16_path, "pg_dump")):
            log(f"Using PostgreSQL 16 binaries from {brew_pg16_path}")
            pg_dump_bin = os.path.join(brew_pg16_path, "pg_dump")
            psql_bin = os.path.join(brew_pg16_path, "psql")

        # Construct the command
        # subprocess.Popen allows piping stdout of one to stdin of another
        dump_cmd = [pg_dump_bin, "--no-owner", "--no-acl", "--clean", "--if-exists", local_db_url]
        restore_cmd = [psql_bin, remote_db_url]

        log(f"Executing: {' '.join(dump_cmd)} | {' '.join(restore_cmd)}")

        dump_proc = subprocess.Popen(dump_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if dump_proc.stdout is None:
            raise RuntimeError("Failed to capture stdout from pg_dump")

        restore_proc = subprocess.Popen(
            restore_cmd, stdin=dump_proc.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )

        # Allow dump_proc to receive a SIGPIPE if restore_proc exits
        dump_proc.stdout.close()

        output, errors = restore_proc.communicate()

        if restore_proc.returncode != 0:
            log(f"Database restore failed: {errors.decode()}", "ERROR")
            sys.exit(1)

        dump_proc.wait()
        if dump_proc.returncode != 0 and dump_proc.stderr:
            dump_err = dump_proc.stderr.read()
            log(f"Database dump failed: {dump_err.decode()}", "ERROR")
            sys.exit(1)

        log("Database migration completed successfully.")

    except FileNotFoundError:
        log("pg_dump or psql not found. Ensure PostgreSQL tools are installed.", "ERROR")
        sys.exit(1)
    except Exception as e:
        log(f"Database migration exception: {e}", "ERROR")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate local data to cloud")
    parser.add_argument("--minio-bucket", default="chatjuicer-files", help="Source MinIO bucket")
    parser.add_argument("--s3-bucket", required=True, help="Destination S3 bucket")
    parser.add_argument("--local-db", required=True, help="Source Local DB URL")
    parser.add_argument("--remote-db", required=True, help="Destination Remote DB URL")
    parser.add_argument("--aws-profile", help="AWS Profile to use (e.g. for SSO)")

    args = parser.parse_args()

    # Credentials for MinIO (Source) - Typically fixed in docker-compose
    MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
    MINIO_ACCESS = os.getenv("MINIO_ROOT_USER", "minioadmin")
    MINIO_SECRET = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")

    # AWS Credentials for S3 (Dest) are expected in env logic

    log("=== Phase 2.5 Migration Tool ===")
    migrate_files(MINIO_ENDPOINT, args.s3_bucket, MINIO_ACCESS, MINIO_SECRET, args.minio_bucket, args.aws_profile)
    migrate_database(args.local_db, args.remote_db)
    log("=== Migration Complete ===")
