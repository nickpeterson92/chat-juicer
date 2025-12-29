from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from types import TracebackType
from typing import Any, cast

from api.services.file_service import FileService


class SessionFileContext:
    """Session-scoped file context used by tool wrappers."""

    def __init__(
        self,
        file_service: FileService,
        session_id: str,
        base_folder: str = "input",
    ):
        self.file_service = file_service
        self.session_id = session_id
        self.base_folder = base_folder
        self.base_path = Path(getattr(file_service, "base_path", "data/files")) / session_id

    async def __aenter__(self) -> SessionFileContext:
        self.base_path.mkdir(parents=True, exist_ok=True)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None

    def resolve_path(self, folder: str, filename: str) -> Path:
        """Resolve a path inside the session workspace."""
        return self.base_path / folder / filename

    async def save_file(
        self,
        folder: str,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        """Persist a file via the underlying file service."""
        return cast(
            dict[str, Any],
            await self.file_service.save_file(
                session_id=self.session_id,
                folder=folder,
                filename=filename,
                content=content,
                content_type=content_type,
            ),
        )


@asynccontextmanager
async def session_file_context(
    file_service: FileService,
    session_id: str,
    base_folder: str = "input",
) -> AsyncIterator[SessionFileContext]:
    """Async context manager that yields a SessionFileContext."""
    ctx = SessionFileContext(
        file_service=file_service,
        session_id=session_id,
        base_folder=base_folder,
    )
    async with ctx:
        yield ctx
