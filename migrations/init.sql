-- Extensions (required for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table (single user for Phase 1, multi-user ready)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb
);

-- Default user for Phase 1 (password: "localdev")
INSERT INTO users (email, password_hash, display_name)
VALUES ('local@chatjuicer.dev', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VttYS/Vj/3l6Ym', 'Local User')
ON CONFLICT (email) DO NOTHING;

-- Projects table (for organizing sessions and context)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    session_id VARCHAR(20) NOT NULL,
    title VARCHAR(500),
    model VARCHAR(50) DEFAULT 'gpt-5.1',
    reasoning_effort VARCHAR(20) DEFAULT 'medium',
    mcp_config JSONB DEFAULT '[\"sequential-thinking\", \"fetch\"]'::jsonb,
    pinned BOOLEAN DEFAULT FALSE,
    is_named BOOLEAN DEFAULT FALSE,
    message_count INTEGER DEFAULT 0,
    turn_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    accumulated_tool_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(user_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);

-- Messages table (Layer 2: Full History)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool_call')),
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    tool_call_id VARCHAR(50),
    tool_name VARCHAR(100),
    tool_arguments JSONB,
    tool_result TEXT,
    tool_success BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(session_id, created_at DESC);

-- LLM Context table (Layer 1: For Agent SDK)
-- NOTE: seq column preserves insertion order - critical for reasoning model item associations
CREATE TABLE IF NOT EXISTS llm_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    seq SERIAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_context_session_id ON llm_context(session_id);
CREATE INDEX IF NOT EXISTS idx_llm_context_seq ON llm_context(session_id, seq);

-- Files table (metadata - actual files on local disk for Phase 1)
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT,
    folder VARCHAR(20) DEFAULT 'sources',
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_session_id ON files(session_id);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
