from __future__ import annotations

import sys
import types

from typing import Any

import pytest

from tools import wrappers


def _install_function_tool_stub(monkeypatch: pytest.MonkeyPatch, collected: list[Any]) -> None:
    """Install a stubbed agents.function_tool that records wrapped callables."""

    def function_tool(fn: Any) -> Any:
        collected.append(fn)
        return fn

    dummy_agents = types.SimpleNamespace(function_tool=function_tool)
    monkeypatch.setitem(sys.modules, "agents", dummy_agents)


@pytest.mark.asyncio
async def test_session_wrappers_inject_session_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Wrappers should forward the captured session_id into every underlying tool."""
    calls: dict[str, tuple[Any, ...]] = {}
    collected: list[Any] = []

    def fake_list_directory(path: str = ".", session_id: str | None = None, show_hidden: bool = False) -> str:
        calls["list_directory"] = (path, session_id, show_hidden)
        return "listed"

    async def fake_read_file(
        file_path: str,
        session_id: str | None = None,
        head: int | None = None,
        tail: int | None = None,
        model: str | None = None,
    ) -> str:
        calls["read_file"] = (file_path, session_id, head, tail, model)
        return "read"

    async def fake_search_files(
        pattern: str,
        base_path: str = ".",
        session_id: str | None = None,
        recursive: bool = True,
        max_results: int = 100,
    ) -> str:
        calls["search_files"] = (pattern, base_path, session_id, recursive, max_results)
        return "searched"

    async def fake_edit_file(file_path: str, edits: list[Any], session_id: str | None = None) -> str:
        calls["edit_file"] = (file_path, tuple(edits), session_id)
        return "edited"

    async def fake_generate_document(content: str, filename: str, session_id: str | None = None) -> str:
        calls["generate_document"] = (content, filename, session_id)
        return "generated"

    async def fake_execute_python_code(code: str, session_id: str | None = None) -> str:
        calls["execute_python_code"] = (code, session_id)
        return "executed"

    monkeypatch.setattr(wrappers, "list_directory", fake_list_directory)
    monkeypatch.setattr(wrappers, "read_file", fake_read_file)
    monkeypatch.setattr(wrappers, "search_files", fake_search_files)
    monkeypatch.setattr(wrappers, "edit_file", fake_edit_file)
    monkeypatch.setattr(wrappers, "generate_document", fake_generate_document)
    monkeypatch.setattr(wrappers, "execute_python_code", fake_execute_python_code)
    _install_function_tool_stub(monkeypatch, collected)

    session_id = "session-123"
    tools = wrappers.create_session_aware_tools(session_id)

    # function_tool stub should have received each wrapper callable
    # 6 tools: list_directory, read_file, search_files, edit_file, generate_document, execute_python_code
    assert len(tools) == 6
    assert len(collected) == 6

    # Invoke wrappers and ensure session_id is forwarded
    assert tools[0](path="docs", show_hidden=True) == "listed"
    assert calls["list_directory"] == ("docs", session_id, True)

    assert await tools[1]("notes.txt", head=5) == "read"
    assert calls["read_file"] == ("notes.txt", session_id, 5, None, None)  # model is None by default

    assert await tools[2]("*.md", base_path=".", recursive=False, max_results=10) == "searched"
    assert calls["search_files"] == ("*.md", ".", session_id, False, 10)

    edits = [{"oldText": "a", "newText": "b"}]
    assert await tools[3]("file.txt", edits=edits) == "edited"
    assert calls["edit_file"] == ("file.txt", tuple(edits), session_id)

    assert await tools[4]("content", "out.md") == "generated"
    assert calls["generate_document"] == ("content", "out.md", session_id)

    assert await tools[5]("print('hello')") == "executed"
    assert calls["execute_python_code"] == ("print('hello')", session_id)
