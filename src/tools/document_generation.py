"""
Document generation tools for Chat Juicer.
Handles creating and saving generated documentation.
"""

from __future__ import annotations

from models.api_models import DocumentGenerateResponse
from utils.file_utils import get_jail_relative_path, validate_file_path, write_file_content
from utils.logger import logger
from utils.token_utils import count_tokens


async def generate_document(
    content: str,
    filename: str,
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

        # Write the content
        _, error = await write_file_content(output_path, content)
        if error:
            return DocumentGenerateResponse(success=False, output_file=output_file, error=error).to_json()  # type: ignore[no-any-return]

        # Calculate stats for logging
        byte_count = len(content.encode("utf-8"))
        line_count = len(content.splitlines())
        char_count = len(content)

        # Log the operation
        token_info = count_tokens(content)
        logger.info(
            f"Generated document: {output_path.name}, {char_count:,} chars, {line_count} lines, {byte_count} bytes",
            tokens=token_info["exact_tokens"],
            functions="generate_document",
            func="generate_document",
        )

        # Use jail-relative path for model-facing response
        output_file_str = get_jail_relative_path(output_path, session_id)

        return DocumentGenerateResponse(  # type: ignore[no-any-return]
            success=True,
            output_file=output_file_str,
            size=byte_count,
            message=f"Document saved: {byte_count:,} bytes, {line_count} lines",
        ).to_json()

    except Exception as e:
        return DocumentGenerateResponse(  # type: ignore[no-any-return]
            success=False, output_file=output_file, error=f"Failed to generate document: {e!s}"
        ).to_json()
