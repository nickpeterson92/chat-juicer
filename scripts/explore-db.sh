#!/bin/bash
# Database Exploration Helper for Wishgate
# Usage: ./scripts/explore-db.sh [query-name]

# Get the project root directory (parent of scripts/ if we're in scripts/, otherwise current dir)
if [[ "${BASH_SOURCE[0]}" =~ /scripts/ ]]; then
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
else
    PROJECT_ROOT="$(pwd)"
fi

DB_PATH="${PROJECT_ROOT}/data/chat_history.db"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run query with description
run_query() {
    local name=$1
    local description=$2
    local query=$3

    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Query: ${name}${NC}"
    echo -e "${YELLOW}${description}${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    sqlite3 -header -column "$DB_PATH" "$query"
    echo ""
}

case "$1" in
    "sessions")
        run_query "Active Sessions" \
            "Shows all sessions from Layer 1 (agent_sessions)" \
            "SELECT session_id, created_at FROM agent_sessions ORDER BY created_at DESC;"
        ;;

    "tables")
        run_query "All Tables" \
            "Lists all tables in the database" \
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
        ;;

    "layer1")
        SESSION_ID="${2:-$(sqlite3 "$DB_PATH" "SELECT session_id FROM agent_sessions ORDER BY created_at DESC LIMIT 1;")}"
        run_query "Layer 1 Messages (LLM Context)" \
            "Shows SDK internal items including tool_calls, reasoning, etc. for session: $SESSION_ID" \
            "SELECT
                id,
                json_extract(message_data, '$.role') as role,
                json_extract(message_data, '$.type') as type,
                substr(json_extract(message_data, '$.content'), 1, 50) as content_preview,
                created_at
            FROM agent_messages
            WHERE session_id = '$SESSION_ID'
            ORDER BY created_at;"
        ;;

    "layer2")
        SESSION_ID="${2:-$(sqlite3 "$DB_PATH" "SELECT session_id FROM agent_sessions ORDER BY created_at DESC LIMIT 1;")}"
        TABLE_NAME="full_history_${SESSION_ID}"
        run_query "Layer 2 Messages (UI Display)" \
            "Shows user-facing messages (filtered, no SDK internals) for session: $SESSION_ID" \
            "SELECT
                id,
                role,
                substr(content, 1, 60) as content_preview,
                created_at
            FROM $TABLE_NAME
            ORDER BY created_at;"
        ;;

    "compare")
        SESSION_ID="${2:-$(sqlite3 "$DB_PATH" "SELECT session_id FROM agent_sessions ORDER BY created_at DESC LIMIT 1;")}"
        TABLE_NAME="full_history_${SESSION_ID}"

        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}Comparing Layer 1 vs Layer 2 for session: ${SESSION_ID}${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
        echo ""

        L1_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_messages WHERE session_id = '$SESSION_ID';")
        L2_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $TABLE_NAME;")

        echo -e "${YELLOW}Layer 1 (LLM Context):${NC} $L1_COUNT items"
        echo -e "${YELLOW}Layer 2 (UI Display):${NC} $L2_COUNT messages"
        echo ""

        echo -e "${BLUE}Layer 1 Role/Type Distribution:${NC}"
        sqlite3 -header -column "$DB_PATH" "
            SELECT
                json_extract(message_data, '$.role') as role,
                json_extract(message_data, '$.type') as type,
                COUNT(*) as count
            FROM agent_messages
            WHERE session_id = '$SESSION_ID'
            GROUP BY role, type
            ORDER BY count DESC;"

        echo ""
        echo -e "${BLUE}Layer 2 Role Distribution:${NC}"
        sqlite3 -header -column "$DB_PATH" "
            SELECT
                role,
                COUNT(*) as count
            FROM $TABLE_NAME
            GROUP BY role
            ORDER BY count DESC;"
        ;;

    "types")
        SESSION_ID="${2:-$(sqlite3 "$DB_PATH" "SELECT session_id FROM agent_sessions ORDER BY created_at DESC LIMIT 1;")}"
        run_query "SDK Item Types" \
            "Shows all SDK item types in Layer 1 (includes tool_call_item, reasoning_item, etc.)" \
            "SELECT
                json_extract(message_data, '$.type') as item_type,
                json_extract(message_data, '$.role') as role,
                COUNT(*) as count
            FROM agent_messages
            WHERE session_id = '$SESSION_ID'
            GROUP BY item_type, role
            ORDER BY count DESC;"
        ;;

    "tools")
        SESSION_ID="${2:-$(sqlite3 "$DB_PATH" "SELECT session_id FROM agent_sessions ORDER BY created_at DESC LIMIT 1;")}"
        run_query "Tool Calls" \
            "Shows all tool calls from Layer 1" \
            "SELECT
                id,
                json_extract(message_data, '$.type') as type,
                json_extract(message_data, '$.name') as tool_name,
                substr(json_extract(message_data, '$.arguments'), 1, 40) as args_preview,
                created_at
            FROM agent_messages
            WHERE session_id = '$SESSION_ID'
                AND json_extract(message_data, '$.type') = 'tool_call_item'
            ORDER BY created_at;"
        ;;

    "full")
        SESSION_ID="${2:-$(sqlite3 "$DB_PATH" "SELECT session_id FROM agent_sessions ORDER BY created_at DESC LIMIT 1;")}"
        run_query "Full Layer 1 Message Detail" \
            "Shows complete message_data JSON for session: $SESSION_ID" \
            "SELECT
                id,
                message_data,
                created_at
            FROM agent_messages
            WHERE session_id = '$SESSION_ID'
            ORDER BY created_at;"
        ;;

    "interactive")
        echo -e "${GREEN}Starting interactive SQLite shell...${NC}"
        echo -e "${YELLOW}Useful commands:${NC}"
        echo "  .tables          - List all tables"
        echo "  .schema TABLE    - Show table schema"
        echo "  .quit            - Exit"
        echo ""
        sqlite3 "$DB_PATH"
        ;;

    *)
        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}Wishgate Database Explorer${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
        echo ""
        echo "Usage: ./scripts/explore-db.sh [command] [session_id]"
        echo ""
        echo -e "${YELLOW}Available Commands:${NC}"
        echo ""
        echo "  sessions         - List all sessions"
        echo "  tables           - List all database tables"
        echo "  layer1 [sid]     - Show Layer 1 (LLM context) for session"
        echo "  layer2 [sid]     - Show Layer 2 (UI display) for session"
        echo "  compare [sid]    - Compare Layer 1 vs Layer 2 counts"
        echo "  types [sid]      - Show SDK item type distribution"
        echo "  tools [sid]      - Show all tool calls in session"
        echo "  full [sid]       - Show complete JSON for all messages"
        echo "  interactive      - Start SQLite shell"
        echo ""
        echo -e "${YELLOW}Examples:${NC}"
        echo "  ./scripts/explore-db.sh sessions"
        echo "  ./scripts/explore-db.sh compare chat_39859934"
        echo "  ./scripts/explore-db.sh tools"
        echo ""
        echo -e "${YELLOW}Note:${NC} If session_id is omitted, uses most recent session"
        echo ""
        ;;
esac
