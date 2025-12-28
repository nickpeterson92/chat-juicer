#!/bin/bash
set -e

# Start MCP containers with docker-compose
echo "Starting MCP servers..."
cd "$(dirname "$0")/../docker/mcp"

# Check if TAVILY_API_KEY is set
if [ -z "$TAVILY_API_KEY" ]; then
  echo "⚠️  TAVILY_API_KEY not set - Tavily server will start but may not function"
fi

docker-compose up -d --build

echo ""
echo "✓ MCP servers started"
echo ""
docker-compose ps
