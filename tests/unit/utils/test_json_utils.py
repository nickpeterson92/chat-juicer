"""Tests for JSON utility functions.

Tests JSON serialization helpers with special handling for non-serializable objects.
"""

from __future__ import annotations

import json

from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from utils.json_utils import json_compact, json_pretty, json_safe, safe_json_dumps


class TestJsonCompact:
    """Tests for json_compact function."""

    def test_simple_dict(self) -> None:
        """Test compacting a simple dictionary."""
        data = {"key": "value", "number": 42}
        result = json_compact(data)
        # Should be valid JSON
        parsed = json.loads(result)
        assert parsed["key"] == "value"
        assert parsed["number"] == 42
        # Should be compact (no extra whitespace)
        assert "\n" not in result
        assert "  " not in result

    def test_nested_dict(self) -> None:
        """Test compacting nested dictionary."""
        data = {"outer": {"inner": {"deep": "value"}}}
        result = json_compact(data)
        parsed = json.loads(result)
        assert parsed["outer"]["inner"]["deep"] == "value"

    def test_list_data(self) -> None:
        """Test compacting list data."""
        data = [1, 2, 3, {"key": "value"}]
        result = json_compact(data)
        parsed = json.loads(result)
        assert len(parsed) == 4
        assert parsed[3]["key"] == "value"

    def test_empty_dict(self) -> None:
        """Test compacting empty dictionary."""
        result = json_compact({})
        assert result == "{}"

    def test_empty_list(self) -> None:
        """Test compacting empty list."""
        result = json_compact([])
        assert result == "[]"

    def test_none_values(self) -> None:
        """Test handling of None values."""
        data = {"key": None, "other": "value"}
        result = json_compact(data)
        parsed = json.loads(result)
        assert parsed["key"] is None
        assert parsed["other"] == "value"

    def test_boolean_values(self) -> None:
        """Test handling of boolean values."""
        data = {"true_val": True, "false_val": False}
        result = json_compact(data)
        parsed = json.loads(result)
        assert parsed["true_val"] is True
        assert parsed["false_val"] is False

    def test_numeric_types(self) -> None:
        """Test handling of different numeric types."""
        data = {"int": 42, "float": 3.14, "negative": -10}
        result = json_compact(data)
        parsed = json.loads(result)
        assert parsed["int"] == 42
        assert parsed["float"] == 3.14
        assert parsed["negative"] == -10


class TestJsonSafe:
    """Tests for json_safe function."""

    def test_simple_serializable_object(self) -> None:
        """Test with simple serializable object."""
        data = {"key": "value"}
        result = json_safe(data)
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert parsed["key"] == "value"

    def test_datetime_object(self) -> None:
        """Test handling of datetime objects."""
        dt = datetime(2025, 1, 1, 12, 0, 0)
        data = {"timestamp": dt}
        result = json_safe(data)
        # datetime should be converted to string
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert isinstance(parsed["timestamp"], str)

    def test_path_object(self) -> None:
        """Test handling of Path objects."""
        path = Path("/test/path/file.txt")
        data = {"file_path": path}
        result = json_safe(data)
        # Path should be converted to string
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert isinstance(parsed["file_path"], str)
        assert parsed["file_path"] == str(path)

    def test_custom_object_with_str(self) -> None:
        """Test handling of custom objects with __str__."""
        class CustomObject:
            def __str__(self) -> str:
                return "CustomObject"

        obj = CustomObject()
        data = {"custom": obj}
        result = json_safe(data)
        # Should be converted to string
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert isinstance(parsed["custom"], str)

    def test_nested_non_serializable(self) -> None:
        """Test handling of nested non-serializable objects."""
        dt = datetime(2025, 1, 1)
        path = Path("/test")
        data = {
            "level1": {
                "level2": {
                    "timestamp": dt,
                    "path": path,
                }
            }
        }
        result = json_safe(data)
        # All nested non-serializable objects should be converted
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert isinstance(parsed["level1"]["level2"]["timestamp"], str)
        assert isinstance(parsed["level1"]["level2"]["path"], str)

    def test_list_with_mixed_types(self) -> None:
        """Test handling of lists with mixed types."""
        dt = datetime(2025, 1, 1)
        data = {"items": [1, "string", dt, {"nested": "dict"}]}
        result = json_safe(data)
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert isinstance(parsed["items"], list)
        assert parsed["items"][0] == 1
        assert parsed["items"][1] == "string"
        assert isinstance(parsed["items"][2], str)  # datetime converted
        assert isinstance(parsed["items"][3], dict)

    def test_none_value(self) -> None:
        """Test handling of None value."""
        result = json_safe(None)
        assert isinstance(result, str)
        assert result == "null"

    def test_already_serializable(self) -> None:
        """Test that already serializable data passes through."""
        data = {
            "string": "value",
            "int": 42,
            "float": 3.14,
            "bool": True,
            "null": None,
            "list": [1, 2, 3],
            "nested": {"key": "value"},
        }
        result = json_safe(data)
        # Should be a JSON string
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert parsed == data

    def test_empty_dict(self) -> None:
        """Test handling of empty dictionary."""
        result = json_safe({})
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert parsed == {}

    def test_empty_list(self) -> None:
        """Test handling of empty list."""
        result = json_safe([])
        assert isinstance(result, str)
        parsed = json.loads(result)
        assert parsed == []

    def test_round_trip_serialization(self) -> None:
        """Test that json_safe output can be serialized with json.dumps."""
        dt = datetime(2025, 1, 1)
        data = {"timestamp": dt, "value": 42}
        safe_json = json_safe(data)
        # json_safe already returns a JSON string
        assert isinstance(safe_json, str)
        parsed = json.loads(safe_json)
        assert parsed["value"] == 42
        assert isinstance(parsed["timestamp"], str)


class TestJsonPretty:
    """Tests for json_pretty function."""

    def test_pretty_simple_dict(self) -> None:
        """Test pretty printing a simple dictionary."""
        data = {"key": "value", "number": 42}
        result = json_pretty(data)
        # Should contain newlines and indentation
        assert "\n" in result
        assert "  " in result  # 2-space indentation
        parsed = json.loads(result)
        assert parsed["key"] == "value"

    def test_pretty_nested_dict(self) -> None:
        """Test pretty printing nested dictionary."""
        data = {"outer": {"inner": {"deep": "value"}}}
        result = json_pretty(data)
        assert "\n" in result
        parsed = json.loads(result)
        assert parsed["outer"]["inner"]["deep"] == "value"

    def test_pretty_with_datetime(self) -> None:
        """Test pretty printing with non-serializable datetime."""
        dt = datetime(2025, 1, 1)
        data = {"timestamp": dt}
        result = json_pretty(data)
        # Should handle datetime and format prettily
        assert "\n" in result
        parsed = json.loads(result)
        assert isinstance(parsed["timestamp"], str)


class TestSafeJsonDumps:
    """Tests for safe_json_dumps function."""

    def test_safe_json_dumps_simple(self) -> None:
        """Test safe_json_dumps with simple data."""
        data = {"key": "value"}
        result = safe_json_dumps(data)
        parsed = json.loads(result)
        assert parsed["key"] == "value"

    def test_safe_json_dumps_with_datetime(self) -> None:
        """Test safe_json_dumps with non-serializable datetime."""
        dt = datetime(2025, 1, 1)
        data = {"timestamp": dt}
        result = safe_json_dumps(data)
        parsed = json.loads(result)
        assert isinstance(parsed["timestamp"], str)

    def test_safe_json_dumps_with_custom_indent(self) -> None:
        """Test safe_json_dumps with custom indent."""
        data = {"key": "value"}
        result = safe_json_dumps(data, indent=2)
        # Custom indent should be used (override default compact)
        assert "\n" in result
        parsed = json.loads(result)
        assert parsed["key"] == "value"

    def test_safe_json_dumps_with_default_func(self) -> None:
        """Test safe_json_dumps with custom default function."""
        def custom_default(obj: Any) -> str:
            return f"CUSTOM:{obj}"

        dt = datetime(2025, 1, 1)
        data = {"timestamp": dt}
        result = safe_json_dumps(data, default=custom_default)
        # Custom default function should be used
        assert "CUSTOM:" in result

    def test_safe_json_dumps_error_handling(self) -> None:
        """Test safe_json_dumps error handling with unserializable object."""
        # Create an object that will fail even with str() fallback
        # by raising an exception in __str__
        class BadObject:
            def __str__(self) -> str:
                raise RuntimeError("Cannot convert to string")

        # Even with default=str, if the object's __str__ raises, json.dumps might fail
        # But safe_json_dumps should catch this and return error JSON
        # This is a bit tricky to test since default=str will call str()
        # Let's test with a circular reference instead
        data: dict[str, Any] = {"key": "value"}
        data["self"] = data  # Create circular reference

        result = safe_json_dumps(data)
        # Should return error JSON instead of raising
        parsed = json.loads(result)
        assert "error" in parsed
        assert "Serialization failed" in parsed["error"]
