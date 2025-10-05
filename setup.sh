#!/bin/bash

# Chat Juicer Setup Script
# Automated installation and configuration for developers

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Main setup function
main() {
    print_header "Chat Juicer Setup"
    echo ""

    # 1. Check prerequisites
    print_header "Checking Prerequisites"

    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version)
        print_success "Node.js $NODE_VERSION found"
    else
        print_error "Node.js not found"
        echo "Please install Node.js 16+ from https://nodejs.org/"
        exit 1
    fi

    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "npm $NPM_VERSION found"
    else
        print_error "npm not found"
        exit 1
    fi

    # Check Python
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version)
        print_success "$PYTHON_VERSION found"
        PYTHON_CMD="python3"
    elif command_exists python; then
        PYTHON_VERSION=$(python --version)
        print_success "$PYTHON_VERSION found"
        PYTHON_CMD="python"
    else
        print_error "Python not found"
        echo "Please install Python 3.9+ from https://www.python.org/"
        exit 1
    fi

    # Check pip
    if command_exists pip3; then
        PIP_VERSION=$(pip3 --version)
        print_success "pip $(echo $PIP_VERSION | cut -d' ' -f2) found"
        PIP_CMD="pip3"
    elif command_exists pip; then
        PIP_VERSION=$(pip --version)
        print_success "pip $(echo $PIP_VERSION | cut -d' ' -f2) found"
        PIP_CMD="pip"
    else
        print_error "pip not found"
        echo "Please install pip: $PYTHON_CMD -m ensurepip --upgrade"
        exit 1
    fi

    echo ""

    # 2. Install Node dependencies
    print_header "Installing Node.js Dependencies"
    if npm install; then
        print_success "Node.js dependencies installed"
    else
        print_error "Failed to install Node.js dependencies"
        exit 1
    fi
    echo ""

    # 3. Create Python virtual environment
    print_header "Creating Python Virtual Environment"
    if [ -d ".juicer" ]; then
        print_warning ".juicer virtual environment already exists"
    else
        if $PYTHON_CMD -m venv .juicer; then
            print_success "Virtual environment created at .juicer/"
        else
            print_error "Failed to create virtual environment"
            exit 1
        fi
    fi
    echo ""

    # 4. Install Python dependencies into venv
    print_header "Installing Python Dependencies"
    if .juicer/bin/pip install -r src/requirements.txt; then
        print_success "Python dependencies installed into .juicer venv"
    else
        print_error "Failed to install Python dependencies"
        exit 1
    fi
    echo ""

    # 5. Install MCP Server
    print_header "Installing MCP Server"
    print_info "Installing Sequential Thinking MCP server globally..."
    if npm install -g @modelcontextprotocol/server-sequential-thinking; then
        print_success "MCP server installed"
    else
        print_warning "Failed to install MCP server globally"
        print_info "You may need to run: sudo npm install -g @modelcontextprotocol/server-sequential-thinking"
    fi
    echo ""

    # 6. Setup environment file
    print_header "Setting Up Environment Variables"

    if [ -f "src/.env" ]; then
        print_warning "src/.env already exists, skipping..."
        print_info "If you need to reconfigure, edit src/.env manually"
    else
        cp src/.env.example src/.env
        print_success "Created src/.env from template"
        echo ""
        print_info "Please edit src/.env with your Azure OpenAI credentials:"
        echo "  - AZURE_OPENAI_API_KEY"
        echo "  - AZURE_OPENAI_ENDPOINT"
        echo "  - AZURE_OPENAI_DEPLOYMENT"
        echo ""

        # Prompt user to open editor
        read -p "Open src/.env in editor now? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if command_exists code; then
                code src/.env
            elif command_exists vim; then
                vim src/.env
            elif command_exists nano; then
                nano src/.env
            else
                print_info "Please edit src/.env manually"
            fi
        fi
    fi
    echo ""

    # 7. Create necessary directories
    print_header "Creating Project Directories"
    mkdir -p logs sources output templates
    print_success "Project directories created"
    echo ""

    # 8. Final validation
    print_header "Validating Setup"

    # Check if .env has been configured
    if grep -q "your-azure-api-key-here" src/.env 2>/dev/null; then
        print_warning "src/.env still contains placeholder values"
        print_info "Remember to configure your Azure OpenAI credentials in src/.env"
    else
        print_success "Environment variables configured"
    fi

    # Test Python syntax
    if $PYTHON_CMD -m py_compile src/main.py 2>/dev/null; then
        print_success "Python backend syntax valid"
    else
        print_error "Python syntax check failed"
    fi

    echo ""
    print_header "Setup Complete!"
    echo ""
    print_success "Chat Juicer is ready to use!"
    echo ""
    echo "Quick start commands:"
    echo "  make run         - Start the application"
    echo "  make dev         - Start in development mode (with DevTools)"
    echo "  npm start        - Start the application (alternative)"
    echo "  npm run dev      - Start in development mode (alternative)"
    echo ""
    echo "For more commands, run: make help"
    echo ""
}

# Run main function
main
