"""Tests for constants module.

Tests settings loading and constant values.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from core.constants import (
    MODEL_TOKEN_LIMITS,
    get_settings,
)


class TestConstants:
    """Tests for module constants."""

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
        """Test that settings are cached when hot-reload is disabled."""
        from core.constants import clear_settings_cache

        # Ensure hot-reload is disabled for this test
        mock_env_no_reload = {**mock_env, "CONFIG_HOT_RELOAD": "false"}
        # Mock _get_env_files to return empty list - prevents actual dotenv files
        # from being loaded, allowing us to control settings via os.environ patches
        with (
            patch.dict("os.environ", mock_env_no_reload, clear=True),
            patch("core.constants._get_env_files", return_value=[]),
        ):
            clear_settings_cache()  # Start with fresh cache
            settings1 = get_settings()
            settings2 = get_settings()

            # Should return same instance (cached) when hot-reload is disabled
            assert settings1 is settings2

    def test_get_settings_has_required_fields(self, mock_env: dict[str, str]) -> None:
        """Test that settings have required fields."""
        with patch.dict("os.environ", mock_env):
            settings = get_settings()

            assert hasattr(settings, "api_provider")
            assert hasattr(settings, "debug")
            assert hasattr(settings, "http_request_logging")

    def test_get_settings_with_azure_provider(self, monkeypatch: Any) -> None:
        """Test loading settings with Azure provider."""
        from core.constants import Settings

        # Azure API keys are 32-character hex strings
        valid_azure_key = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
        # Set environment variables using monkeypatch to ensure they're applied
        monkeypatch.setenv("API_PROVIDER", "azure")
        monkeypatch.setenv("AZURE_OPENAI_API_KEY", valid_azure_key)
        monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://test.openai.azure.com")
        # Note: AZURE_OPENAI_DEPLOYMENT is not used - model is selected per-session
        # Remove OpenAI vars to ensure Azure is used
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_MODEL", raising=False)

        # Mock _get_env_files to return empty list - prevents actual dotenv files
        # from being loaded, allowing us to control settings via os.environ patches
        with patch("core.constants._get_env_files", return_value=[]):
            # Force reload by calling directly instead of using cached instance
            settings = Settings()

            assert settings.api_provider == "azure"
            assert settings.azure_openai_api_key == valid_azure_key
