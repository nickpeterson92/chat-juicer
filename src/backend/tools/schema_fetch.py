"""
Schema Fetch Tools for Chat Juicer.

Provides database schema discovery and fetching capabilities:
- list_registered_databases(): Discover configured databases
- get_table_schema(): Fetch column metadata for a table

Uses a unified information_schema query that works across PostgreSQL, MySQL, and SQL Server.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import threading

from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

from utils.logger import logger

# Type mappings for normalization across databases
TYPE_MAPPINGS: dict[str, str] = {
    # PostgreSQL specific
    "character varying": "varchar",
    "character": "char",
    "timestamp without time zone": "timestamp",
    "timestamp with time zone": "timestamptz",
    "time without time zone": "time",
    "time with time zone": "timetz",
    "double precision": "double",
    "bigserial": "bigint",
    "serial": "integer",
    "smallserial": "smallint",
    # SQL Server specific
    "nvarchar": "varchar",
    "nchar": "char",
    "datetime2": "datetime",
    "datetimeoffset": "timestamptz",
    "bit": "boolean",
    "uniqueidentifier": "uuid",
    "money": "decimal",
    "smallmoney": "decimal",
    # MySQL specific (mostly already normalized)
    "tinyint": "smallint",
    "mediumint": "integer",
    "longtext": "text",
    "mediumtext": "text",
    "tinytext": "text",
}

# Default registry path
DEFAULT_REGISTRY_PATH = Path(__file__).parent.parent / "config" / "db_registry.yaml"


@dataclass
class ColumnInfo:
    """Column metadata from database schema."""

    name: str
    type: str
    nullable: bool


@dataclass
class DatabaseConfig:
    """Database connection configuration."""

    name: str
    type: str
    host: str
    port: int
    database: str
    username: str
    password: str
    schema: str = "public"
    driver: str | None = None  # For SQL Server ODBC driver
    # Salesforce specific
    security_token: str | None = None
    domain: str = "login"


class DatabaseRegistry:
    """Manages database connection configurations from YAML file."""

    def __init__(self, registry_path: Path | None = None):
        self.registry_path = registry_path or DEFAULT_REGISTRY_PATH
        self._databases: dict[str, DatabaseConfig] = {}
        self._loaded = False

    def _resolve_env_vars(self, value: Any) -> Any:
        """Resolve ${VAR} and ${VAR:-default} patterns in config values."""
        if not isinstance(value, str):
            return value

        def replace_env(match: re.Match[str]) -> str:
            var_expr = match.group(1)
            if ":-" in var_expr:
                var_name, default = var_expr.split(":-", 1)
            else:
                var_name, default = var_expr, ""
            return os.environ.get(var_name, default)

        return re.sub(r"\$\{([^}]+)\}", replace_env, value)

    def load(self) -> None:
        """Load and parse the registry YAML file."""
        if self._loaded:
            return

        if not self.registry_path.exists():
            logger.warning(f"Database registry not found: {self.registry_path}")
            self._loaded = True
            return

        try:
            with open(self.registry_path) as f:
                config = yaml.safe_load(f) or {}

            databases = config.get("databases", {})
            for name, db_config in databases.items():
                if not db_config:
                    continue

                # Resolve environment variables in all string values
                resolved = {k: self._resolve_env_vars(str(v)) if v else "" for k, v in db_config.items()}

                # Determine default schema based on db type
                db_type = resolved.get("type", "").lower()
                # MySQL uses database name as schema, PostgreSQL uses 'public', SQL Server uses 'dbo'
                if db_type == "mysql":
                    default_schema = resolved.get("database", "")
                elif db_type == "sqlserver":
                    default_schema = "dbo"
                else:
                    default_schema = "public"

                self._databases[name] = DatabaseConfig(
                    name=name,
                    type=db_type,
                    host=resolved.get("host", "localhost"),
                    port=int(resolved.get("port", 5432)),
                    database=resolved.get("database", ""),
                    username=resolved.get("username", ""),
                    password=resolved.get("password", ""),
                    schema=resolved.get("schema", default_schema),
                    driver=resolved.get("driver"),
                    security_token=resolved.get("security_token"),
                    domain=resolved.get("domain", "login"),
                )

            self._loaded = True
            self._load_time = self.registry_path.stat().st_mtime

        except Exception as e:
            logger.error(f"Failed to load database registry: {type(e).__name__}")
            raise

    def list_databases(self) -> list[dict[str, str]]:
        """List all configured databases."""
        self.load()
        return [{"name": db.name, "type": db.type} for db in self._databases.values()]

    def get_database(self, name: str) -> DatabaseConfig | None:
        """Get configuration for a specific database."""
        self.load()
        return self._databases.get(name)

    def get_available_names(self) -> list[str]:
        """Get list of available database names."""
        self.load()
        return list(self._databases.keys())

    def reload(self) -> None:
        """Force reload the registry from disk."""
        self._loaded = False
        self._databases.clear()
        self.load()


def normalize_type(
    raw_type: str, max_length: int | None = None, precision: int | None = None, scale: int | None = None
) -> str:
    """Normalize database type to a common format."""
    base_type = raw_type.lower().strip()
    normalized = TYPE_MAPPINGS.get(base_type, base_type)

    # Add length for string types
    if max_length and normalized in ("varchar", "char", "nvarchar", "nchar"):
        return f"{normalized}({max_length})"

    # Add precision/scale for numeric types
    if precision is not None and normalized in ("decimal", "numeric"):
        if scale is not None and scale > 0:
            return f"{normalized}({precision},{scale})"
        return f"{normalized}({precision})"

    return normalized


async def _fetch_postgres_schema(config: DatabaseConfig, table_name: str) -> list[ColumnInfo]:
    """Fetch schema from PostgreSQL database."""
    import asyncpg

    conn = await asyncpg.connect(
        host=config.host,
        port=config.port,
        database=config.database,
        user=config.username,
        password=config.password,
    )

    try:
        rows = await conn.fetch(
            """
            SELECT
                column_name,
                data_type,
                character_maximum_length,
                numeric_precision,
                numeric_scale,
                is_nullable
            FROM information_schema.columns
            WHERE table_name = $1 AND table_schema = $2
            ORDER BY ordinal_position
            """,
            table_name,
            config.schema,
        )

        return [
            ColumnInfo(
                name=row["column_name"],
                type=normalize_type(
                    row["data_type"],
                    row["character_maximum_length"],
                    row["numeric_precision"],
                    row["numeric_scale"],
                ),
                nullable=row["is_nullable"].upper() == "YES",
            )
            for row in rows
        ]
    finally:
        await conn.close()


async def _fetch_mysql_schema(config: DatabaseConfig, table_name: str) -> list[ColumnInfo]:
    """Fetch schema from MySQL database."""
    import aiomysql

    conn = await aiomysql.connect(
        host=config.host,
        port=config.port,
        db=config.database,
        user=config.username,
        password=config.password,
    )

    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """
                SELECT
                    COLUMN_NAME,
                    DATA_TYPE,
                    CHARACTER_MAXIMUM_LENGTH,
                    NUMERIC_PRECISION,
                    NUMERIC_SCALE,
                    IS_NULLABLE
                FROM information_schema.columns
                WHERE table_name = %s AND table_schema = %s
                ORDER BY ordinal_position
                """,
                (table_name, config.database),
            )
            rows = await cursor.fetchall()

            result = []
            for row in rows:
                # MySQL DictCursor may return keys as uppercase or lowercase depending on version
                col_name = row.get("COLUMN_NAME") or row.get("column_name", "")
                data_type = row.get("DATA_TYPE") or row.get("data_type", "")
                max_len = row.get("CHARACTER_MAXIMUM_LENGTH") or row.get("character_maximum_length")
                precision = row.get("NUMERIC_PRECISION") or row.get("numeric_precision")
                scale = row.get("NUMERIC_SCALE") or row.get("numeric_scale")
                nullable = row.get("IS_NULLABLE") or row.get("is_nullable", "")

                result.append(
                    ColumnInfo(
                        name=col_name,
                        type=normalize_type(data_type, max_len, precision, scale),
                        nullable=nullable.upper() == "YES",
                    )
                )
            return result
    finally:
        conn.close()


async def _fetch_sqlserver_schema(config: DatabaseConfig, table_name: str) -> list[ColumnInfo]:
    """Fetch schema from SQL Server database."""
    import aioodbc

    driver = config.driver or "ODBC Driver 17 for SQL Server"
    connection_string = (
        f"DRIVER={{{driver}}};"
        f"SERVER={config.host},{config.port};"
        f"DATABASE={config.database};"
        f"UID={config.username};"
        f"PWD={config.password};"
        "TrustServerCertificate=yes;"
    )

    conn = await aioodbc.connect(dsn=connection_string)

    try:
        cursor = await conn.cursor()
        await cursor.execute(
            """
            SELECT
                column_name,
                data_type,
                character_maximum_length,
                numeric_precision,
                numeric_scale,
                is_nullable
            FROM information_schema.columns
            WHERE table_name = ? AND table_schema = ?
            ORDER BY ordinal_position
            """,
            (table_name, config.schema),
        )
        rows = await cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]

        result = []
        for row in rows:
            row_dict = dict(zip(columns, row, strict=True))
            result.append(
                ColumnInfo(
                    name=row_dict["column_name"],
                    type=normalize_type(
                        row_dict["data_type"],
                        row_dict.get("character_maximum_length"),
                        row_dict.get("numeric_precision"),
                        row_dict.get("numeric_scale"),
                    ),
                    nullable=row_dict["is_nullable"].upper() == "YES",
                )
            )
        return result
    finally:
        await conn.close()


async def _fetch_salesforce_schema(config: DatabaseConfig, table_name: str) -> list[ColumnInfo]:
    """Fetch schema for a Salesforce object (SObject)."""
    try:
        from simple_salesforce import Salesforce
    except ImportError as err:
        raise ImportError("simple-salesforce package is required for Salesforce connections") from err

    # Connect to Salesforce (blocking call, run in thread)
    def connect_and_describe() -> dict[str, Any]:
        sf = Salesforce(
            username=config.username,
            password=config.password,
            security_token=config.security_token or "",
            domain=config.domain,
        )
        # SObject names are case-insensitive but API returns proper casing
        return sf.restful(f"sobjects/{table_name}/describe")  # type: ignore

    # Run blocking I/O in thread
    loop = asyncio.get_running_loop()
    desc = await loop.run_in_executor(None, connect_and_describe)

    return [
        ColumnInfo(
            name=field["name"],
            type=field["type"],  # valid: string, picklist, currency, reference, etc.
            nullable=field["nillable"],
        )
        for field in desc["fields"]
    ]


# ============================================
# SCHEMA FETCHER REGISTRY
# ============================================
# Maps database type names to their async fetcher functions.
# To add a new database type, implement a fetcher and register it here.
SchemaFetcher = Callable[[DatabaseConfig, str], Awaitable[list[ColumnInfo]]]

SCHEMA_FETCHERS: dict[str, SchemaFetcher] = {
    "postgresql": _fetch_postgres_schema,
    "mysql": _fetch_mysql_schema,
    "sqlserver": _fetch_sqlserver_schema,
    "salesforce": _fetch_salesforce_schema,
}


# Thread-safe global registry singleton (using dict to avoid 'global' statement)
_registry_lock = threading.Lock()
_registry_holder: dict[str, DatabaseRegistry] = {}


def get_registry() -> DatabaseRegistry:
    """Get or create the global registry instance (thread-safe)."""
    if "instance" not in _registry_holder:
        with _registry_lock:
            if "instance" not in _registry_holder:
                _registry_holder["instance"] = DatabaseRegistry()
    return _registry_holder["instance"]


def reset_registry() -> None:
    """Reset the registry singleton (for testing or config reload)."""
    with _registry_lock:
        _registry_holder.pop("instance", None)


async def list_registered_databases() -> str:
    """
    List all databases configured in the registry.

    Returns:
        JSON string with list of configured databases and their types.
        Example: {"success": true, "databases": [{"name": "sales_db", "type": "postgresql"}]}
    """
    try:
        registry = get_registry()
        databases = registry.list_databases()

        return json.dumps(
            {
                "success": True,
                "databases": databases,
                "count": len(databases),
            }
        )
    except FileNotFoundError:
        return json.dumps(
            {
                "success": False,
                "error": "Database registry file not found. Create config/db_registry.yaml to configure databases.",
                "databases": [],
            }
        )
    except Exception as e:
        logger.error(f"Failed to list databases: {type(e).__name__}")
        return json.dumps(
            {
                "success": False,
                "error": f"Registry error: {type(e).__name__}",
                "databases": [],
            }
        )


async def get_table_schema(db_name: str, table_name: str) -> str:
    """
    Fetch column schema for a database table.

    Args:
        db_name: Database name from registry (e.g., "sales_db")
        table_name: Table name to fetch schema for

    Returns:
        JSON string with column metadata.
        Example: {"success": true, "database": "sales_db", "table": "users",
                  "columns": [{"name": "id", "type": "integer", "nullable": false}]}
    """
    try:
        registry = get_registry()
        config = registry.get_database(db_name)

        if config is None:
            available = registry.get_available_names()
            return json.dumps(
                {
                    "success": False,
                    "error": f"Database '{db_name}' not found in registry",
                    "available_databases": available,
                }
            )

        # Fetch schema using handler registry
        fetcher = SCHEMA_FETCHERS.get(config.type)
        if not fetcher:
            return json.dumps(
                {
                    "success": False,
                    "error": f"Unsupported database type: {config.type}",
                    "supported_types": list(SCHEMA_FETCHERS.keys()),
                }
            )

        columns = await fetcher(config, table_name)

        return json.dumps(
            {
                "success": True,
                "database": db_name,
                "table": table_name,
                "schema": config.schema,
                "columns": [asdict(col) for col in columns],
                "column_count": len(columns),
            }
        )

    except ImportError as e:
        # Missing database driver
        missing = str(e).split("'")[-2] if "'" in str(e) else str(e)
        return json.dumps(
            {
                "success": False,
                "error": f"Missing database driver: {missing}. Install with pip.",
            }
        )
    except Exception as e:
        logger.error(f"Failed to fetch schema for {db_name}.{table_name}: {type(e).__name__}")
        return json.dumps(
            {
                "success": False,
                "error": f"Failed to fetch schema: {type(e).__name__}: {e!s}",
                "database": db_name,
                "table": table_name,
            }
        )
