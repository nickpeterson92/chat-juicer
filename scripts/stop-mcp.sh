#!/bin/bash
set -e

# Stop MCP containers
echo "Stopping MCP servers..."
cd "$(dirname "$0")/../docker/mcp"

docker-compose down

echo "✓ MCP servers stopped"
