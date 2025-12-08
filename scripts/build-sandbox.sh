#!/bin/bash
# Build the Chat Juicer sandbox container image
#
# Usage: ./scripts/build-sandbox.sh [--no-cache]
#
# Automatically detects container runtime (prefers Podman for rootless security)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="chat-juicer-sandbox"
IMAGE_TAG="latest"
DOCKERFILE_DIR="docker/sandbox"

# Detect container runtime (prefer Podman for rootless security)
detect_runtime() {
    if command -v podman &> /dev/null; then
        echo "podman"
    elif command -v docker &> /dev/null; then
        echo "docker"
    else
        echo ""
    fi
}

RUNTIME=$(detect_runtime)

if [ -z "$RUNTIME" ]; then
    echo -e "${RED}Error: No container runtime found.${NC}"
    echo "Please install Docker or Podman:"
    echo "  - Docker: https://docs.docker.com/get-docker/"
    echo "  - Podman: https://podman.io/getting-started/installation"
    exit 1
fi

echo -e "${GREEN}Using container runtime: ${RUNTIME}${NC}"

# Check if Dockerfile exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKERFILE_PATH="$PROJECT_ROOT/$DOCKERFILE_DIR/Dockerfile"

if [ ! -f "$DOCKERFILE_PATH" ]; then
    echo -e "${RED}Error: Dockerfile not found at $DOCKERFILE_PATH${NC}"
    exit 1
fi

# Parse arguments
NO_CACHE=""
if [ "$1" == "--no-cache" ]; then
    NO_CACHE="--no-cache"
    echo -e "${YELLOW}Building without cache...${NC}"
fi

# Build the image
echo -e "${GREEN}Building $IMAGE_NAME:$IMAGE_TAG...${NC}"
echo "This may take several minutes on first build (~700MB image)"
echo ""

cd "$PROJECT_ROOT"

"$RUNTIME" build \
    ${NO_CACHE:+"$NO_CACHE"} \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -f "$DOCKERFILE_PATH" \
    "$DOCKERFILE_DIR"

# Verify build success
# Capture build exit code immediately
$RUNTIME build \
    $NO_CACHE \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -f "$DOCKERFILE_PATH" \
    "$DOCKERFILE_DIR"
BUILD_EXIT_CODE=$?

# Verify build success
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}Build successful!${NC}"
    echo ""

    # Show image info
    echo "Image details:"
    $RUNTIME images "$IMAGE_NAME:$IMAGE_TAG" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

    echo ""
    echo "To test the sandbox:"
    echo "  $RUNTIME run --rm -it $IMAGE_NAME:$IMAGE_TAG python -c 'import numpy; print(f\"NumPy {numpy.__version__} ready\")'"

    echo ""
    echo "Security verification:"
    echo "  $RUNTIME run --rm --network=none --read-only $IMAGE_NAME:$IMAGE_TAG python -c 'print(\"Sandbox secure\")'"
else
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi
