from unittest.mock import Mock, patch

import pytest

from fastapi import Request

from api.dependencies import (
    get_app_settings,
    get_db,
    get_file_service,
    get_mcp_pool,
    get_session_service,
    get_ws_manager,
)
from api.services.file_service import LocalFileService
from api.services.session_service import SessionService


def test_get_app_settings() -> None:
    mock_settings = Mock()
    with patch("api.dependencies.get_settings", return_value=mock_settings):
        assert get_app_settings() == mock_settings


@pytest.mark.asyncio
async def test_get_db() -> None:
    mock_request = Mock(spec=Request)
    mock_db_pool = Mock()
    mock_request.app.state.db_pool = mock_db_pool

    assert await get_db(mock_request) == mock_db_pool


def test_get_ws_manager() -> None:
    mock_request = Mock(spec=Request)
    mock_manager = Mock()
    mock_request.app.state.ws_manager = mock_manager

    assert get_ws_manager(mock_request) == mock_manager


def test_get_mcp_pool() -> None:
    mock_request = Mock(spec=Request)
    mock_pool = Mock()
    mock_request.app.state.mcp_pool = mock_pool

    assert get_mcp_pool(mock_request) == mock_pool


def test_get_file_service() -> None:
    mock_db_pool = Mock()
    mock_settings = Mock()
    mock_settings.file_storage = "local"
    service = get_file_service(mock_db_pool, mock_settings)
    assert isinstance(service, LocalFileService)
    assert service.pool == mock_db_pool


def test_get_session_service() -> None:
    mock_db_pool = Mock()
    service = get_session_service(mock_db_pool)
    assert isinstance(service, SessionService)
    assert service.pool == mock_db_pool
