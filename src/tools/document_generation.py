"""
Document generation tools for Wishgate.
Handles creating and saving generated documentation.
"""

from __future__ import annotations

import shutil

from pathlib import Path

from core.constants import MAX_BACKUP_VERSIONS
from models.api_models import DocumentGenerateResponse
from utils.file_utils import validate_file_path, write_file_content
from utils.logger import logger
from utils.token_utils import count_tokens


async def generate_document(
    content: str,
    filename: str,
    create_backup: bool = False,
    session_id: str | None = None,
) -> str:
    """
    Generate and save documentation to a file in the output directory.
    Automatically saves to 'output/' within the session workspace.

    Security: When session_id is provided, path is restricted to session workspace.

    Args:
        content: The generated document content to save
        filename: Filename and optional subdirectories within output/
                 Examples: "report.md", "reports/quarterly.md", "drafts/working.md"
        create_backup: Whether to backup existing file if it exists
        session_id: Session ID for workspace isolation (enforces chroot jail)

    Returns:
        JSON string with operation result and metadata
    """
    try:
        # Auto-prefix output/ to enforce output directory
        output_file = f"output/{filename}"

        # Validate path (don't check exists since we're creating, use session sandbox if session_id provided)
        output_path, error = validate_file_path(output_file, check_exists=False, session_id=session_id)
        if error:
            return DocumentGenerateResponse(success=False, output_file=output_file, error=error).to_json()  # type: ignore[no-any-return]

        # Create parent directories if needed
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Backup existing file if requested and exists
        backup_created: str | bool = False
        if output_path.exists() and create_backup:
            backup_path = output_path.with_suffix(output_path.suffix + ".backup")
            counter = 1
            while backup_path.exists() and counter < MAX_BACKUP_VERSIONS:
                backup_path = output_path.with_suffix(f"{output_path.suffix}.backup{counter}")
                counter += 1

            shutil.copy2(output_path, backup_path)
            cwd = Path.cwd()
            backup_created = str(backup_path.relative_to(cwd))
            logger.info(f"Created backup: {backup_created}")

        # Write the content using helper
        error = await write_file_content(output_path, content)
        if error:
            return DocumentGenerateResponse(success=False, output_file=str(output_path), error=error).to_json()  # type: ignore[no-any-return]

        # Calculate stats for logging
        byte_count = len(content.encode("utf-8"))
        line_count = len(content.splitlines())
        char_count = len(content)

        # Log the operation with meaningful stats
        # Calculate tokens for generated content
        token_info = count_tokens(content)
        logger.info(
            f"Generated document: {output_path.name}, {char_count:,} chars, {line_count} lines, {byte_count} bytes",
            tokens=token_info["exact_tokens"],
            functions="generate_document",
            func="generate_document",
        )

        # Build result with Pydantic model
        cwd = Path.cwd()
        message = f"Document saved: {byte_count:,} bytes, {line_count} lines"
        if backup_created:
            message += f" (backup: {backup_created})"

        return DocumentGenerateResponse(  # type: ignore[no-any-return]
            success=True,
            output_file=str(output_path.relative_to(cwd) if cwd in output_path.parents else output_path),
            size=byte_count,
            message=message,
        ).to_json()

    except Exception as e:
        return DocumentGenerateResponse(  # type: ignore[no-any-return]
            success=False, output_file=output_file, error=f"Failed to generate document: {e!s}"
        ).to_json()
