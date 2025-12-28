"""
Tests for schema_fetch module.

Tests DatabaseRegistry, type normalization, and tool functions.
"""

from __future__ import annotations

import json
import os
import tempfile

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tools.schema_fetch import (
    ColumnInfo,
    DatabaseConfig,
    DatabaseRegistry,
    get_registry,
    get_table_schema,
    list_registered_databases,
    normalize_type,
    reset_registry,
)


class TestTypeNormalization:
    """Tests for normalize_type function."""

    def test_basic_type_passthrough(self) -> None:
        """Basic types should pass through unchanged."""
        assert normalize_type("integer") == "integer"
        assert normalize_type("text") == "text"
        assert normalize_type("boolean") == "boolean"

    def test_postgres_type_mapping(self) -> None:
        """PostgreSQL-specific types should be normalized."""
        assert normalize_type("character varying") == "varchar"
        assert normalize_type("character") == "char"
        assert normalize_type("timestamp without time zone") == "timestamp"
        assert normalize_type("timestamp with time zone") == "timestamptz"
        assert normalize_type("double precision") == "double"
        assert normalize_type("bigserial") == "bigint"

    def test_sqlserver_type_mapping(self) -> None:
        """SQL Server types should be normalized."""
        assert normalize_type("nvarchar") == "varchar"
        assert normalize_type("nchar") == "char"
        assert normalize_type("datetime2") == "datetime"
        assert normalize_type("datetimeoffset") == "timestamptz"
        assert normalize_type("bit") == "boolean"
        assert normalize_type("uniqueidentifier") == "uuid"

    def test_mysql_type_mapping(self) -> None:
        """MySQL-specific types should be normalized."""
        assert normalize_type("tinyint") == "smallint"
        assert normalize_type("mediumint") == "integer"
        assert normalize_type("longtext") == "text"
        assert normalize_type("mediumtext") == "text"

    def test_varchar_with_length(self) -> None:
        """VARCHAR should include length when provided."""
        assert normalize_type("character varying", max_length=255) == "varchar(255)"
        assert normalize_type("varchar", max_length=50) == "varchar(50)"

    def test_decimal_with_precision(self) -> None:
        """DECIMAL should include precision and scale."""
        assert normalize_type("decimal", precision=10) == "decimal(10)"
        assert normalize_type("decimal", precision=10, scale=2) == "decimal(10,2)"
        assert normalize_type("numeric", precision=18, scale=4) == "numeric(18,4)"

    def test_case_insensitive(self) -> None:
        """Type normalization should be case-insensitive."""
        assert normalize_type("VARCHAR") == "varchar"
        assert normalize_type("CHARACTER VARYING") == "varchar"
        assert normalize_type("TEXT") == "text"


class TestDatabaseRegistry:
    """Tests for DatabaseRegistry class."""

    def test_load_yaml_config(self) -> None:
        """Registry should load databases from YAML config."""
        yaml_content = """
databases:
  test_db:
    type: postgresql
    host: localhost
    port: 5432
    database: mydb
    username: user
    password: pass
    schema: public
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                registry = DatabaseRegistry(Path(f.name))
                registry.load()

                dbs = registry.list_databases()
                assert len(dbs) == 1
                assert dbs[0]["name"] == "test_db"
                assert dbs[0]["type"] == "postgresql"

                config = registry.get_database("test_db")
                assert config is not None
                assert config.host == "localhost"
                assert config.port == 5432
                assert config.schema == "public"
            finally:
                os.unlink(f.name)

    def test_env_var_resolution(self) -> None:
        """Environment variables should be resolved in config values."""
        yaml_content = """
databases:
  prod_db:
    type: postgresql
    host: ${DB_HOST:-localhost}
    port: ${DB_PORT:-5432}
    database: mydb
    username: ${DB_USER}
    password: ${DB_PASS}
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                # Set env vars
                os.environ["DB_HOST"] = "prod-server.example.com"
                os.environ["DB_USER"] = "admin"
                os.environ["DB_PASS"] = "secret123"

                registry = DatabaseRegistry(Path(f.name))
                registry.load()

                config = registry.get_database("prod_db")
                assert config is not None
                assert config.host == "prod-server.example.com"
                assert config.port == 5432  # Uses default
                assert config.username == "admin"
                assert config.password == "secret123"
            finally:
                os.unlink(f.name)
                del os.environ["DB_HOST"]
                del os.environ["DB_USER"]
                del os.environ["DB_PASS"]

    def test_default_schema_by_type(self) -> None:
        """Default schema should be set based on database type."""
        yaml_content = """
databases:
  pg_db:
    type: postgresql
    host: localhost
    port: 5432
    database: mydb
    username: user
    password: pass
  mysql_db:
    type: mysql
    host: localhost
    port: 3306
    database: mydb
    username: user
    password: pass
  sql_db:
    type: sqlserver
    host: localhost
    port: 1433
    database: mydb
    username: user
    password: pass
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                registry = DatabaseRegistry(Path(f.name))
                registry.load()

                pg = registry.get_database("pg_db")
                assert pg.schema == "public"

                mysql = registry.get_database("mysql_db")
                assert mysql.schema == "mydb"  # MySQL uses database as schema

                sql = registry.get_database("sql_db")
                assert sql.schema == "dbo"
            finally:
                os.unlink(f.name)

    def test_missing_file_handled(self) -> None:
        """Missing registry file should not raise, just log warning."""
        registry = DatabaseRegistry(Path("/nonexistent/path.yaml"))
        registry.load()  # Should not raise

        assert registry.list_databases() == []

    def test_reload_clears_cache(self) -> None:
        """Reload should clear and reload databases."""
        yaml_content = """
databases:
  db1:
    type: postgresql
    host: localhost
    port: 5432
    database: mydb
    username: user
    password: pass
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                registry = DatabaseRegistry(Path(f.name))
                registry.load()
                assert len(registry.list_databases()) == 1

                registry.reload()
                assert len(registry.list_databases()) == 1
            finally:
                os.unlink(f.name)


class TestGlobalRegistry:
    """Tests for global registry singleton."""

    def test_get_registry_returns_singleton(self) -> None:
        """get_registry should return same instance."""
        reset_registry()  # Ensure fresh state

        r1 = get_registry()
        r2 = get_registry()
        assert r1 is r2

    def test_reset_registry_clears_singleton(self) -> None:
        """reset_registry should clear the singleton."""
        reset_registry()

        r1 = get_registry()
        reset_registry()
        r2 = get_registry()

        assert r1 is not r2


class TestListRegisteredDatabases:
    """Tests for list_registered_databases tool function."""

    @pytest.mark.asyncio
    async def test_returns_json_with_databases(self) -> None:
        """Should return JSON with database list."""
        reset_registry()

        yaml_content = """
databases:
  test_postgres:
    type: postgresql
    host: localhost
    port: 5432
    database: testdb
    username: user
    password: pass
  test_mysql:
    type: mysql
    host: localhost
    port: 3306
    database: testdb
    username: user
    password: pass
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                with patch("tools.schema_fetch.DEFAULT_REGISTRY_PATH", Path(f.name)):
                    reset_registry()
                    result = await list_registered_databases()

                    parsed = json.loads(result)
                    assert parsed["success"] is True
                    assert parsed["count"] == 2
                    assert len(parsed["databases"]) == 2

                    names = {db["name"] for db in parsed["databases"]}
                    assert "test_postgres" in names
                    assert "test_mysql" in names
            finally:
                os.unlink(f.name)
                reset_registry()

    @pytest.mark.asyncio
    async def test_returns_error_on_exception(self) -> None:
        """Should return error JSON on exception."""
        reset_registry()

        with patch("tools.schema_fetch.get_registry") as mock_registry:
            mock_registry.side_effect = Exception("Test error")
            result = await list_registered_databases()

            parsed = json.loads(result)
            assert parsed["success"] is False
            assert "error" in parsed
            assert parsed["databases"] == []


class TestGetTableSchema:
    """Tests for get_table_schema tool function."""

    @pytest.mark.asyncio
    async def test_returns_error_for_unknown_database(self) -> None:
        """Should return error if database not in registry."""
        reset_registry()

        yaml_content = """
databases:
  known_db:
    type: postgresql
    host: localhost
    port: 5432
    database: testdb
    username: user
    password: pass
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                with patch("tools.schema_fetch.DEFAULT_REGISTRY_PATH", Path(f.name)):
                    reset_registry()
                    result = await get_table_schema("unknown_db", "users")

                    parsed = json.loads(result)
                    assert parsed["success"] is False
                    assert "unknown_db" in parsed["error"]
                    assert "known_db" in parsed["available_databases"]
            finally:
                os.unlink(f.name)
                reset_registry()

    @pytest.mark.asyncio
    async def test_returns_error_for_unsupported_db_type(self) -> None:
        """Should return error for unsupported database type."""
        reset_registry()

        yaml_content = """
databases:
  weird_db:
    type: oracle
    host: localhost
    port: 1521
    database: testdb
    username: user
    password: pass
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                with patch("tools.schema_fetch.DEFAULT_REGISTRY_PATH", Path(f.name)):
                    reset_registry()
                    result = await get_table_schema("weird_db", "users")

                    parsed = json.loads(result)
                    assert parsed["success"] is False
                    assert "oracle" in parsed["error"]
                    assert "supported_types" in parsed
            finally:
                os.unlink(f.name)
                reset_registry()

    @pytest.mark.asyncio
    async def test_postgres_schema_fetch(self) -> None:
        """Should fetch PostgreSQL schema successfully."""
        reset_registry()

        yaml_content = """
databases:
  pg_db:
    type: postgresql
    host: localhost
    port: 5432
    database: testdb
    username: user
    password: pass
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                with patch("tools.schema_fetch.DEFAULT_REGISTRY_PATH", Path(f.name)):
                    reset_registry()

                    # Patch the fetcher registry to use a mock for the tool-level test
                    # This confirms get_table_schema correctly routes to the fetcher and returns JSON
                    mock_columns_info = [
                        ColumnInfo(name="id", type="integer", nullable=False),
                        ColumnInfo(name="name", type="varchar(255)", nullable=True),
                    ]
                    mock_fetcher = AsyncMock(return_value=mock_columns_info)

                    with patch.dict("tools.schema_fetch.SCHEMA_FETCHERS", {"postgresql": mock_fetcher}):
                        result = await get_table_schema("pg_db", "users")

                        parsed = json.loads(result)
                        assert parsed["success"] is True
                        assert parsed["database"] == "pg_db"
                        assert parsed["table"] == "users"
                        assert parsed["column_count"] == 2

                        cols = parsed["columns"]
                        assert cols[0]["name"] == "id"
                        assert cols[0]["type"] == "integer"
                        assert cols[0]["nullable"] is False

                        assert cols[1]["name"] == "name"
                        assert cols[1]["type"] == "varchar(255)"
                        assert cols[1]["nullable"] is True
            finally:
                os.unlink(f.name)
                reset_registry()

    @pytest.mark.asyncio
    async def test_fetch_postgres_schema_internals(self) -> None:
        """Should fetch PostgreSQL schema using internal fetcher directly."""
        from tools.schema_fetch import DatabaseConfig, _fetch_postgres_schema

        config = DatabaseConfig(
            name="test",
            type="postgresql",
            host="localhost",
            port=5432,
            database="db",
            username="user",
            password="pass",
        )

        mock_rows = [
            {
                "column_name": "id",
                "data_type": "integer",
                "character_maximum_length": None,
                "numeric_precision": 32,
                "numeric_scale": 0,
                "is_nullable": "NO",
            },
        ]

        # Connection mock
        mock_conn = MagicMock()
        mock_conn.fetch = AsyncMock(return_value=mock_rows)
        mock_conn.close = AsyncMock()

        # Mock asyncpg module
        mock_asyncpg = MagicMock()
        mock_asyncpg.connect = AsyncMock(return_value=mock_conn)
        # Handle async with asyncpg.connect() -> returns mock_conn
        mock_asyncpg.connect.return_value.__aenter__.return_value = mock_conn
        mock_asyncpg.connect.return_value.close = mock_conn.close

        with patch.dict("sys.modules", {"asyncpg": mock_asyncpg}):
            result = await _fetch_postgres_schema(config, "users")

            assert len(result) == 1
            assert result[0].name == "id"
            assert result[0].type == "integer"
            assert result[0].nullable is False

    @pytest.mark.asyncio
    async def test_handles_missing_driver(self) -> None:
        """Should return helpful error for missing database driver."""
        reset_registry()

        yaml_content = """
databases:
  mysql_db:
    type: mysql
    host: localhost
    port: 3306
    database: testdb
    username: user
    password: pass
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            f.flush()

            try:
                with patch("tools.schema_fetch.DEFAULT_REGISTRY_PATH", Path(f.name)):
                    reset_registry()

                    # Simulate ImportError for aiomysql
                    # We need to patch the fetcher in the registry since get_table_schema looks it up there
                    mock_fetcher = AsyncMock(side_effect=ImportError("No module named 'aiomysql'"))
                    with patch.dict("tools.schema_fetch.SCHEMA_FETCHERS", {"mysql": mock_fetcher}):
                        result = await get_table_schema("mysql_db", "users")

                        parsed = json.loads(result)
                        assert parsed["success"] is False
                        assert "driver" in parsed["error"].lower() or "install" in parsed["error"].lower()
            finally:
                os.unlink(f.name)
                reset_registry()


class TestColumnInfo:
    """Tests for ColumnInfo dataclass."""

    def test_dataclass_fields(self) -> None:
        """ColumnInfo should have correct fields."""
        col = ColumnInfo(name="id", type="integer", nullable=False)
        assert col.name == "id"
        assert col.type == "integer"
        assert col.nullable is False


class TestDatabaseConfig:
    """Tests for DatabaseConfig dataclass."""

    def test_default_values(self) -> None:
        """DatabaseConfig should have sensible defaults."""
        config = DatabaseConfig(
            name="test",
            type="postgresql",
            host="localhost",
            port=5432,
            database="testdb",
            username="user",
            password="pass",
        )
        assert config.schema == "public"
        assert config.driver is None
