"""Tests for application bootstrap module.

Tests application initialization and configuration.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.bootstrap import initialize_application


class TestInitializeApplication:
    """Tests for initialize_application function."""

    @pytest.mark.asyncio
    @patch("app.bootstrap.load_dotenv")
    @patch("app.bootstrap.get_settings")
    @patch("app.bootstrap.create_http_client")
    @patch("app.bootstrap.create_openai_client")
    @patch("app.bootstrap.set_default_openai_client")
    @patch("app.bootstrap.set_tracing_disabled")
    @patch("app.bootstrap.patch_sdk_for_auto_tracking")
    @patch("app.bootstrap.initialize_all_mcp_servers", new_callable=AsyncMock)
    @patch("app.bootstrap.FullHistoryStore")
    @patch("app.bootstrap.SessionManager")
    async def test_initialize_application_openai(
        self,
        mock_session_manager: Mock,
        mock_full_history: Mock,
        mock_init_mcp: AsyncMock,
        mock_patch_sdk: Mock,
        mock_disable_tracing: Mock,
        mock_set_client: Mock,
        mock_create_client: Mock,
        mock_create_http: Mock,
        mock_get_settings: Mock,
        mock_load_dotenv: Mock,
    ) -> None:
        """Test initializing application with OpenAI provider."""
        # Setup mocks
        mock_settings = Mock()
        mock_settings.api_provider = "openai"
        mock_settings.openai_api_key = "test-key"
        mock_settings.openai_model = "gpt-4o"
        mock_settings.http_request_logging = False
        mock_get_settings.return_value = mock_settings

        mock_create_http.return_value = None
        mock_create_client.return_value = Mock()
        mock_patch_sdk.return_value = True
        mock_init_mcp.return_value = {"test_server": Mock()}
        mock_full_history_instance = Mock()
        mock_full_history.return_value = mock_full_history_instance
        mock_session_manager_instance = Mock()
        mock_session_manager_instance.sync_metadata_with_database.return_value = 0
        mock_session_manager_instance.cleanup_empty_sessions.return_value = 0
        mock_session_manager.return_value = mock_session_manager_instance

        # Run initialization
        app_state = await initialize_application()

        # Verify state
        assert app_state is not None
        # Phase 3: Agent is now created lazily when first session is created
        # At bootstrap time, active_sessions is empty so app_state.agent returns None
        assert app_state.agent is None  # No sessions yet
        assert app_state.active_sessions == {}  # No active sessions yet
        assert app_state.deployment == "gpt-4o"
        assert app_state.session_manager is not None
        assert app_state.full_history_store is not None

    @pytest.mark.asyncio
    @patch("app.bootstrap.load_dotenv")
    @patch("app.bootstrap.get_settings")
    @patch("app.bootstrap.create_http_client")
    @patch("app.bootstrap.create_openai_client")
    @patch("app.bootstrap.set_default_openai_client")
    @patch("app.bootstrap.set_tracing_disabled")
    @patch("app.bootstrap.patch_sdk_for_auto_tracking")
    @patch("app.bootstrap.initialize_all_mcp_servers", new_callable=AsyncMock)
    @patch("app.bootstrap.FullHistoryStore")
    @patch("app.bootstrap.SessionManager")
    async def test_initialize_application_azure(
        self,
        mock_session_manager: Mock,
        mock_full_history: Mock,
        mock_init_mcp: AsyncMock,
        mock_patch_sdk: Mock,
        mock_disable_tracing: Mock,
        mock_set_client: Mock,
        mock_create_client: Mock,
        mock_create_http: Mock,
        mock_get_settings: Mock,
        mock_load_dotenv: Mock,
    ) -> None:
        """Test initializing application with Azure provider."""
        # Setup mocks
        mock_settings = Mock()
        mock_settings.api_provider = "azure"
        mock_settings.azure_openai_api_key = "test-key"
        mock_settings.azure_endpoint_str = "https://test.openai.azure.com"
        mock_settings.azure_openai_deployment = "gpt-4o-deployment"
        mock_settings.http_request_logging = False
        mock_get_settings.return_value = mock_settings

        mock_create_http.return_value = None
        mock_create_client.return_value = Mock()
        mock_patch_sdk.return_value = True
        mock_init_mcp.return_value = {}
        mock_full_history.return_value = Mock()
        mock_session_manager_instance = Mock()
        mock_session_manager_instance.sync_metadata_with_database.return_value = 0
        mock_session_manager_instance.cleanup_empty_sessions.return_value = 0
        mock_session_manager.return_value = mock_session_manager_instance

        # Run initialization
        app_state = await initialize_application()

        # Verify Azure-specific settings
        assert app_state is not None
        assert app_state.deployment == "gpt-5.1"  # Uses DEFAULT_MODEL constant

    @pytest.mark.asyncio
    @patch("app.bootstrap.load_dotenv")
    @patch("app.bootstrap.get_settings")
    async def test_initialize_application_invalid_config(
        self,
        mock_get_settings: Mock,
        mock_load_dotenv: Mock,
    ) -> None:
        """Test initialization with invalid configuration."""
        # Setup mock to raise exception
        mock_get_settings.side_effect = Exception("Invalid configuration")

        # Should exit with error
        with pytest.raises(SystemExit):
            await initialize_application()

    @pytest.mark.asyncio
    @patch("app.bootstrap.load_dotenv")
    @patch("app.bootstrap.get_settings")
    @patch("app.bootstrap.create_http_client")
    @patch("app.bootstrap.create_openai_client")
    @patch("app.bootstrap.set_default_openai_client")
    @patch("app.bootstrap.set_tracing_disabled")
    @patch("app.bootstrap.patch_sdk_for_auto_tracking")
    @patch("app.bootstrap.initialize_all_mcp_servers", new_callable=AsyncMock)
    @patch("app.bootstrap.FullHistoryStore")
    @patch("app.bootstrap.SessionManager")
    async def test_initialize_with_session_repair(
        self,
        mock_session_manager: Mock,
        mock_full_history: Mock,
        mock_init_mcp: AsyncMock,
        mock_patch_sdk: Mock,
        mock_disable_tracing: Mock,
        mock_set_client: Mock,
        mock_create_client: Mock,
        mock_create_http: Mock,
        mock_get_settings: Mock,
        mock_load_dotenv: Mock,
    ) -> None:
        """Test initialization with session repair needed."""
        mock_settings = Mock()
        mock_settings.api_provider = "openai"
        mock_settings.openai_api_key = "test-key"
        mock_settings.openai_model = "gpt-4o"
        mock_settings.http_request_logging = False
        mock_get_settings.return_value = mock_settings

        mock_create_http.return_value = None
        mock_create_client.return_value = Mock()
        mock_patch_sdk.return_value = False  # SDK tracking not available
        mock_init_mcp.return_value = {}
        mock_full_history.return_value = Mock()
        mock_session_manager_instance = Mock()
        mock_session_manager_instance.sync_metadata_with_database.return_value = 0
        mock_session_manager_instance.cleanup_empty_sessions.return_value = 2
        mock_session_manager.return_value = mock_session_manager_instance

        app_state = await initialize_application()

        # Should complete successfully even with repairs
        assert app_state is not None
