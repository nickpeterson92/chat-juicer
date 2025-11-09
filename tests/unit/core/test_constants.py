"""Tests for constants module.

Tests settings loading and constant values.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from core.constants import (
    CHAT_HISTORY_DB_PATH,
    DEFAULT_MODEL,
    DEFAULT_SESSION_METADATA_PATH,
    KEEP_LAST_N_MESSAGES,
    MAX_CONVERSATION_TURNS,
    MIN_MESSAGES_FOR_SUMMARIZATION,
    MODEL_TOKEN_LIMITS,
    get_settings,
)


class TestConstants:
    """Tests for module constants."""

    def test_chat_history_db_path_defined(self) -> None:
        """Test that database path is defined."""
        assert CHAT_HISTORY_DB_PATH is not None
        assert "chat_history.db" in str(CHAT_HISTORY_DB_PATH)

    def test_default_session_metadata_path_defined(self) -> None:
        """Test that session metadata path is defined."""
        assert DEFAULT_SESSION_METADATA_PATH is not None
        assert "sessions.json" in str(DEFAULT_SESSION_METADATA_PATH)

    def test_default_model_defined(self) -> None:
        """Test that default model is defined."""
        assert DEFAULT_MODEL is not None
        assert isinstance(DEFAULT_MODEL, str)
        assert len(DEFAULT_MODEL) > 0

    def test_keep_last_n_messages_is_positive(self) -> None:
        """Test that KEEP_LAST_N_MESSAGES is positive."""
        assert KEEP_LAST_N_MESSAGES > 0
        assert isinstance(KEEP_LAST_N_MESSAGES, int)

    def test_max_conversation_turns_is_positive(self) -> None:
        """Test that MAX_CONVERSATION_TURNS is positive."""
        assert MAX_CONVERSATION_TURNS > 0
        assert isinstance(MAX_CONVERSATION_TURNS, int)

    def test_min_messages_for_summarization_is_positive(self) -> None:
        """Test that MIN_MESSAGES_FOR_SUMMARIZATION is positive."""
        assert MIN_MESSAGES_FOR_SUMMARIZATION > 0
        assert isinstance(MIN_MESSAGES_FOR_SUMMARIZATION, int)

    def test_model_token_limits_defined(self) -> None:
        """Test that model token limits are defined."""
        assert MODEL_TOKEN_LIMITS is not None
        assert isinstance(MODEL_TOKEN_LIMITS, dict)
        assert len(MODEL_TOKEN_LIMITS) > 0

    def test_model_token_limits_values(self) -> None:
        """Test that token limits are reasonable."""
        for model, limit in MODEL_TOKEN_LIMITS.items():
            assert isinstance(model, str)
            assert isinstance(limit, int)
            assert limit > 0
            assert limit < 1000000  # Reasonable upper bound


class TestGetSettings:
    """Tests for get_settings function."""

    def test_get_settings_with_openai_provider(self, mock_env: dict[str, str]) -> None:
        """Test loading settings with OpenAI provider."""
        with patch.dict("os.environ", mock_env):
            settings = get_settings()

            assert settings is not None
            assert settings.api_provider in ["openai", "azure"]

    def test_get_settings_caching(self, mock_env: dict[str, str]) -> None:
        """Test that settings are cached."""
        with patch.dict("os.environ", mock_env):
            settings1 = get_settings()
            settings2 = get_settings()

            # Should return same instance (cached)
            assert settings1 is settings2

    def test_get_settings_has_required_fields(self, mock_env: dict[str, str]) -> None:
        """Test that settings have required fields."""
        with patch.dict("os.environ", mock_env):
            settings = get_settings()

            assert hasattr(settings, "api_provider")
            assert hasattr(settings, "reasoning_effort")

    def test_get_settings_with_azure_provider(self, monkeypatch: Any) -> None:
        """Test loading settings with Azure provider."""
        # Clear pydantic-settings cache to avoid test order dependencies
        from core.constants import Settings

        Settings.model_config["validate_assignment"] = True  # Force revalidation

        # Azure API keys are 32-character hex strings
        valid_azure_key = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
        # Set environment variables using monkeypatch to ensure they're applied
        monkeypatch.setenv("API_PROVIDER", "azure")
        monkeypatch.setenv("AZURE_OPENAI_API_KEY", valid_azure_key)
        monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com")
        monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
        # Remove OpenAI vars to ensure Azure is used
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_MODEL", raising=False)

        # Force reload by calling directly instead of using cached instance
        settings = Settings()

        assert settings.api_provider == "azure"
        assert settings.azure_openai_api_key == valid_azure_key
