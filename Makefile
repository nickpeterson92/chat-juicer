.PHONY: help setup install install-node install-python install-mcp install-dev run dev clean test lint format typecheck precommit precommit-install quality validate docs docs-clean docs-serve logs logs-errors logs-all db-explore db-sessions db-compare db-layer1 db-layer2 db-tools db-types db-shell health status backend-only clean-venv clean-all reset

# Default target
.DEFAULT_GOAL := help

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m

##@ Setup Commands

setup: ## Complete first-time setup (run this first!)
	@echo "$(BLUE)Running complete setup...$(NC)"
	@node scripts/setup.js

install: install-node install-python install-mcp ## Install all dependencies
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

install-node: ## Install Node.js dependencies
	@echo "$(BLUE)Installing Node.js dependencies...$(NC)"
	@npm install
	@echo "$(GREEN)✓ Node.js dependencies installed$(NC)"

install-python: ## Install Python dependencies into .juicer venv
	@echo "$(BLUE)Installing Python dependencies...$(NC)"
	@if [ ! -d ".juicer" ]; then \
		echo "$(YELLOW)⚠ Creating .juicer virtual environment first...$(NC)"; \
		python3 -m venv .juicer || python -m venv .juicer; \
	fi
	@.juicer/bin/pip install -r src/requirements.txt
	@echo "$(GREEN)✓ Python dependencies installed into .juicer venv$(NC)"

install-mcp: ## Install MCP server globally
	@echo "$(BLUE)Installing MCP server...$(NC)"
	@npm install -g @modelcontextprotocol/server-sequential-thinking || \
		echo "$(YELLOW)⚠ Failed to install globally. You may need: sudo make install-mcp$(NC)"
	@echo "$(GREEN)✓ MCP server installed$(NC)"

##@ Running the Application

run: ## Start the application (production mode)
	@echo "$(BLUE)Starting Wishgate...$(NC)"
	@npm start

dev: ## Start in development mode (with DevTools)
	@echo "$(BLUE)Starting Wishgate in development mode...$(NC)"
	@npm run dev

backend-only: ## Run Python backend only (for testing)
	@echo "$(BLUE)Starting Python backend...$(NC)"
	@if [ -f ".juicer/bin/python3" ]; then \
		cd src && ../.juicer/bin/python3 main.py; \
	else \
		echo "$(YELLOW)⚠ Virtual environment not found$(NC)"; \
		echo "$(BLUE)Run: make install-python$(NC)"; \
		exit 1; \
	fi

##@ Development & Quality

test: ## Run syntax validation and tests
	@echo "$(BLUE)Running tests...$(NC)"
	@python3 -m py_compile src/main.py || python -m py_compile src/main.py
	@python3 -m compileall src/ || python -m compileall src/
	@echo "$(GREEN)✓ All tests passed$(NC)"

lint: ## Run ruff linter on Python code
	@echo "$(BLUE)Running ruff linter...$(NC)"
	@if [ -f ".juicer/bin/ruff" ]; then \
		.juicer/bin/ruff check src/ --fix --exit-non-zero-on-fix; \
	else \
		echo "$(YELLOW)⚠ Ruff not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

format: ## Format Python code with black
	@echo "$(BLUE)Formatting code with black...$(NC)"
	@if [ -f ".juicer/bin/black" ]; then \
		.juicer/bin/black src/; \
	else \
		echo "$(YELLOW)⚠ Black not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

typecheck: ## Run mypy type checking
	@echo "$(BLUE)Running mypy type checker...$(NC)"
	@if [ -f ".juicer/bin/mypy" ]; then \
		.juicer/bin/mypy src/; \
	else \
		echo "$(YELLOW)⚠ Mypy not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

precommit: ## Run pre-commit hooks on all files
	@echo "$(BLUE)Running pre-commit hooks...$(NC)"
	@if command -v pre-commit >/dev/null 2>&1; then \
		pre-commit run --all-files; \
	elif [ -f ".juicer/bin/pre-commit" ]; then \
		.juicer/bin/pre-commit run --all-files; \
	else \
		echo "$(YELLOW)⚠ Pre-commit not installed. Run: make install-dev$(NC)"; \
	fi

precommit-install: ## Install pre-commit hooks
	@echo "$(BLUE)Installing pre-commit hooks...$(NC)"
	@if command -v pre-commit >/dev/null 2>&1; then \
		pre-commit install && echo "$(GREEN)✓ Pre-commit hooks installed$(NC)"; \
	elif [ -f ".juicer/bin/pre-commit" ]; then \
		.juicer/bin/pre-commit install && echo "$(GREEN)✓ Pre-commit hooks installed$(NC)"; \
	else \
		echo "$(YELLOW)⚠ Pre-commit not installed. Run: make install-dev$(NC)"; \
	fi

install-dev: ## Install development dependencies (linters, formatters, etc.)
	@echo "$(BLUE)Installing development dependencies...$(NC)"
	@if [ ! -d ".juicer" ]; then \
		echo "$(YELLOW)⚠ Creating .juicer virtual environment first...$(NC)"; \
		python3 -m venv .juicer || python -m venv .juicer; \
	fi
	@.juicer/bin/pip install -r requirements-dev.txt
	@echo "$(GREEN)✓ Development dependencies installed$(NC)"
	@echo "$(BLUE)Installing pre-commit hooks...$(NC)"
	@.juicer/bin/pre-commit install
	@echo "$(GREEN)✓ Pre-commit hooks installed$(NC)"

quality: format lint typecheck ## Run all quality checks (format, lint, typecheck)
	@echo "$(GREEN)✓ All quality checks complete$(NC)"

validate: test ## Validate Python code syntax
	@echo "$(GREEN)✓ Validation complete$(NC)"

##@ Documentation

docs: ## Generate API documentation with Sphinx
	@echo "$(BLUE)Generating API documentation...$(NC)"
	@if [ -f ".juicer/bin/sphinx-build" ]; then \
		.juicer/bin/sphinx-build -b html docs docs/_build/html; \
		echo "$(GREEN)✓ Documentation generated at docs/_build/html/index.html$(NC)"; \
	else \
		echo "$(YELLOW)⚠ Sphinx not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

docs-clean: ## Clean generated documentation
	@echo "$(BLUE)Cleaning documentation...$(NC)"
	@rm -rf docs/_build
	@echo "$(GREEN)✓ Documentation cleaned$(NC)"

docs-serve: docs ## Generate and serve documentation locally
	@echo "$(BLUE)Serving documentation at http://localhost:8000$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to stop$(NC)"
	@cd docs/_build/html && python3 -m http.server 8000

##@ Logs & Monitoring

logs: ## Show conversation logs (requires jq)
	@echo "$(BLUE)Showing conversation logs (Ctrl+C to exit)...$(NC)"
	@tail -f logs/conversations.jsonl | jq '.' 2>/dev/null || tail -f logs/conversations.jsonl

logs-errors: ## Show error logs (requires jq)
	@echo "$(BLUE)Showing error logs (Ctrl+C to exit)...$(NC)"
	@tail -f logs/errors.jsonl | jq '.' 2>/dev/null || tail -f logs/errors.jsonl

logs-all: ## Show all recent logs
	@echo "$(BLUE)Recent conversation logs:$(NC)"
	@tail -20 logs/conversations.jsonl 2>/dev/null || echo "No conversation logs yet"
	@echo "\n$(BLUE)Recent error logs:$(NC)"
	@tail -20 logs/errors.jsonl 2>/dev/null || echo "No error logs yet"

##@ Database Exploration

db-explore: ## Explore SQLite database (shows help)
	@./scripts/explore-db.sh

db-sessions: ## List all sessions in database
	@./scripts/explore-db.sh sessions

db-compare: ## Compare Layer 1 vs Layer 2 for current session
	@./scripts/explore-db.sh compare

db-layer1: ## Show Layer 1 (LLM context) for current session
	@./scripts/explore-db.sh layer1

db-layer2: ## Show Layer 2 (UI display) for current session
	@./scripts/explore-db.sh layer2

db-tools: ## Show all tool calls for current session
	@./scripts/explore-db.sh tools

db-types: ## Show SDK item type distribution
	@./scripts/explore-db.sh types

db-shell: ## Start interactive SQLite shell
	@./scripts/explore-db.sh interactive

##@ Maintenance

clean: ## Clean temporary files and logs
	@echo "$(BLUE)Cleaning temporary files...$(NC)"
	@rm -rf logs/*.jsonl
	@rm -rf src/__pycache__
	@rm -rf src/*/__pycache__
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-venv: ## Remove virtual environment
	@echo "$(BLUE)Removing .juicer virtual environment...$(NC)"
	@rm -rf .juicer
	@echo "$(GREEN)✓ Virtual environment removed$(NC)"
	@echo "$(YELLOW)Run 'make install-python' to recreate$(NC)"

clean-all: clean clean-venv ## Deep clean including dependencies and venv
	@echo "$(BLUE)Deep cleaning...$(NC)"
	@rm -rf node_modules
	@echo "$(GREEN)✓ Deep clean complete$(NC)"
	@echo "$(YELLOW)Run 'make install' to reinstall dependencies$(NC)"

reset: clean-all ## Complete reset (clean + remove .env + remove venv)
	@echo "$(BLUE)Resetting project...$(NC)"
	@rm -f src/.env
	@echo "$(GREEN)✓ Reset complete$(NC)"
	@echo "$(YELLOW)Run 'make setup' to reconfigure$(NC)"

##@ Information

health: ## Check system health and configuration
	@echo "$(BLUE)System Health Check$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "Node.js: $$(node --version 2>/dev/null || echo 'Not installed')"
	@echo "npm: $$(npm --version 2>/dev/null || echo 'Not installed')"
	@echo "Python: $$(python3 --version 2>/dev/null || python --version 2>/dev/null || echo 'Not installed')"
	@echo "pip: $$(pip3 --version 2>/dev/null | cut -d' ' -f2 || pip --version 2>/dev/null | cut -d' ' -f2 || echo 'Not installed')"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "Environment: $$(\[ -f src/.env \] && echo '$(GREEN)✓ Configured$(NC)' || echo '$(YELLOW)⚠ Not configured$(NC)')"
	@echo "Node modules: $$(\[ -d node_modules \] && echo '$(GREEN)✓ Installed$(NC)' || echo '$(YELLOW)⚠ Not installed$(NC)')"
	@echo "Python venv: $$(\[ -d .juicer \] && echo '$(GREEN)✓ Installed$(NC)' || echo '$(YELLOW)⚠ Not installed$(NC)')"
	@echo "MCP server: $$(which server-sequential-thinking >/dev/null 2>&1 && echo '$(GREEN)✓ Installed$(NC)' || echo '$(YELLOW)⚠ Not installed$(NC)')"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"

status: health ## Alias for health check

help: ## Show this help message
	@echo "$(BLUE)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║                     Wishgate Makefile                     ║$(NC)"
	@echo "$(BLUE)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(YELLOW)<target>$(NC)\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-18s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BLUE)Quick Start:$(NC)"
	@echo "  1. Run 'make setup' for first-time installation"
	@echo "  2. Configure src/.env with your Azure OpenAI credentials"
	@echo "  3. Run 'make run' to start the application"
	@echo ""
