# Alembic Migrations

Chat Juicer uses Alembic for schema management. Bootstrap steps:

1) Create Alembic scaffold (already initialized here):
   - `migrations/env.py`
   - `migrations/script.py.mako`
   - `migrations/versions/`

2) Configure `alembic.ini` (SQLAlchemy URL is read via env var).

3) Generate initial migration to match `init.sql` (tables: users, sessions, messages, llm_context, files, extension pgcrypto).

Commands (run from `src/`):
```bash
alembic revision -m "init schema"
alembic upgrade head
```

Ensure `DATABASE_URL` is set (e.g. `postgresql://chatjuicer:localdev@localhost:5432/chatjuicer`).
