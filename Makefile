.PHONY: help setup setup-dev install install-node install-python install-mcp install-dev run dev api clean clean-cache test lint format typecheck precommit precommit-install quality validate fix check docs docs-clean docs-serve logs logs-errors logs-all db-explore db-sessions db-compare db-layer1 db-layer2 db-tools db-types db-shell db-reset db-backup db-restore health status backend-only clean-venv clean-all reset kill restart update-deps generate-model-metadata build-sandbox sandbox-status sandbox-test

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

setup-dev: ## Complete setup with dev tools (linters, formatters, pre-commit)
	@echo "$(BLUE)Running complete setup with dev tools...$(NC)"
	@node scripts/setup.js --dev

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
	@.juicer/bin/pip install -r src/backend/requirements.txt
	@echo "$(GREEN)✓ Python dependencies installed into .juicer venv$(NC)"

install-mcp: ## Install MCP servers (Sequential Thinking via npm, Fetch via Python)
	@echo "$(BLUE)Installing MCP servers...$(NC)"
	@echo "$(BLUE)→ Installing Sequential Thinking MCP server (Node.js)...$(NC)"
	@npm install -g @modelcontextprotocol/server-sequential-thinking || \
		echo "$(YELLOW)⚠ Failed to install globally. You may need: sudo make install-mcp$(NC)"
	@echo "$(BLUE)→ Fetch MCP server (Python) installed via requirements.txt$(NC)"
	@echo "$(GREEN)✓ MCP servers configured$(NC)"

##@ Running the Application

run: ## Start the application (production mode)
	@echo "$(BLUE)Starting Chat Juicer...$(NC)"
	@npm start

dev: ## Start in development mode (with DevTools and hot reload)
	@echo "$(BLUE)Starting Chat Juicer in development mode...$(NC)"
	@npm run dev

backend-only: ## Run Python backend only (for testing)
	@echo "$(BLUE)Starting Python backend...$(NC)"
	@if [ -f ".juicer/bin/python3" ]; then \
		cd src/backend && ../../.juicer/bin/python3 main.py; \
	else \
		echo "$(YELLOW)⚠ Virtual environment not found$(NC)"; \
		echo "$(BLUE)Run: make install-python$(NC)"; \
		exit 1; \
	fi

api: ## Run FastAPI backend with hot reload (excludes data/ from watch)
	@echo "$(BLUE)Starting FastAPI backend...$(NC)"
	@if [ -f ".juicer/bin/python3" ]; then \
		cd src/backend && ../../.juicer/bin/python3 -m api.main; \
	else \
		echo "$(YELLOW)⚠ Virtual environment not found$(NC)"; \
		echo "$(BLUE)Run: make install-python$(NC)"; \
		exit 1; \
	fi

##@ Testing

test: test-all ## Run all tests (backend + frontend) - alias for test-all

test-all: ## Run all tests (backend + frontend) with coverage
	@echo "$(BLUE)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║              Running Full Test Suite                         ║$(NC)"
	@echo "$(BLUE)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@$(MAKE) test-backend
	@echo ""
	@$(MAKE) test-frontend
	@echo ""
	@echo "$(GREEN)✓ All tests completed$(NC)"

test-backend: ## Run Python backend tests (unit + integration)
	@echo "$(BLUE)Running Python backend tests...$(NC)"
	@if [ -f ".juicer/bin/pytest" ]; then \
		./scripts/run-tests.sh; \
	else \
		echo "$(YELLOW)⚠ Pytest not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

test-frontend: ## Run JavaScript frontend tests (vitest)
	@echo "$(BLUE)Running JavaScript frontend tests...$(NC)"
	@npm test

test-backend-unit: ## Run Python unit tests only
	@echo "$(BLUE)Running Python unit tests...$(NC)"
	@if [ -f ".juicer/bin/pytest" ]; then \
		.juicer/bin/pytest tests/backend/unit/ -v --no-cov; \
	else \
		echo "$(YELLOW)⚠ Pytest not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

test-backend-integration: ## Run Python integration tests only
	@echo "$(BLUE)Running Python integration tests...$(NC)"
	@if [ -f ".juicer/bin/pytest" ]; then \
		.juicer/bin/pytest tests/backend/integration/ -v --no-cov; \
	else \
		echo "$(YELLOW)⚠ Pytest not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

##@ Load Testing

test-load: ## Run Locust load tests (TARGET_HOST=http://your-ec2:8000)
	@echo "$(BLUE)Running Locust load tests...$(NC)"
	@echo "$(YELLOW)Use TARGET_HOST env var to set target (default: localhost:8000)$(NC)"
	@if [ -f ".juicer/bin/locust" ]; then \
		.juicer/bin/locust -f tests/load/locustfile.py --host=$${TARGET_HOST:-http://localhost:8000}; \
	else \
		echo "$(YELLOW)⚠ Locust not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: pip install locust$(NC)"; \
		exit 1; \
	fi

test-load-headless: ## Run load tests headless (50 users, 60s) - CI friendly
	@echo "$(BLUE)Running headless load tests...$(NC)"
	@if [ -f ".juicer/bin/locust" ]; then \
		.juicer/bin/locust -f tests/load/locustfile.py \
			--host=$${TARGET_HOST:-http://localhost:8000} \
			--users 50 --spawn-rate 5 --run-time 60s --headless; \
	else \
		echo "$(YELLOW)⚠ Locust not installed$(NC)"; \
		exit 1; \
	fi

test-load-websocket: ## Run WebSocket load tests via pytest
	@echo "$(BLUE)Running WebSocket load tests...$(NC)"
	@if [ -f ".juicer/bin/pytest" ]; then \
		TARGET_HOST=$${TARGET_HOST:-http://localhost:8000} \
		.juicer/bin/pytest tests/load/test_websocket_load.py -v --no-cov -s; \
	else \
		echo "$(YELLOW)⚠ Pytest not installed$(NC)"; \
		exit 1; \
	fi

test-frontend-unit: ## Run JavaScript unit tests only
	@echo "$(BLUE)Running JavaScript unit tests...$(NC)"
	@npm run test:unit

test-frontend-integration: ## Run JavaScript integration tests only
	@echo "$(BLUE)Running JavaScript integration tests...$(NC)"
	@npm run test:integration

test-frontend-watch: ## Run JavaScript tests in watch mode
	@echo "$(BLUE)Running JavaScript tests in watch mode...$(NC)"
	@npm run test:watch

test-frontend-ui: ## Run JavaScript tests with UI
	@echo "$(BLUE)Opening Vitest UI...$(NC)"
	@npm run test:ui

test-coverage-backend: ## Generate Python backend coverage report
	@echo "$(BLUE)Generating Python coverage report...$(NC)"
	@if [ -f ".juicer/bin/pytest" ]; then \
		COVERAGE_FILE=.coverage .juicer/bin/coverage run --source=src/backend --omit='tests/*,**/__pycache__/*' -m pytest tests/backend/ -q; \
		.juicer/bin/coverage html; \
		.juicer/bin/coverage report --skip-empty; \
		echo "$(GREEN)✓ Coverage report generated at htmlcov/index.html$(NC)"; \
	else \
		echo "$(YELLOW)⚠ Pytest not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

test-coverage-frontend: ## Generate JavaScript frontend coverage report
	@echo "$(BLUE)Generating JavaScript coverage report...$(NC)"
	@npm run test:coverage
	@echo "$(GREEN)✓ Coverage report generated at coverage/index.html$(NC)"

test-coverage-all: ## Generate coverage reports for both backend and frontend
	@echo "$(BLUE)Generating all coverage reports...$(NC)"
	@$(MAKE) test-coverage-backend
	@$(MAKE) test-coverage-frontend
	@echo "$(GREEN)✓ All coverage reports generated$(NC)"
	@echo "$(BLUE)  Backend: htmlcov/index.html$(NC)"
	@echo "$(BLUE)  Frontend: coverage/index.html$(NC)"

test-validate: ## Validate Python syntax (compilation check)
	@echo "$(BLUE)Validating Python syntax...$(NC)"
	@python3 -m compileall src/backend/ tests/ docker/mcp/ || python -m compileall src/backend/ tests/ docker/mcp/
	@echo "$(GREEN)✓ Syntax validation passed$(NC)"

##@ Code Generation

generate-model-metadata: ## Generate model-metadata.js from Python MODEL_CONFIGS
	@echo "$(BLUE)Generating model-metadata.js from MODEL_CONFIGS...$(NC)"
	@if [ -f ".juicer/bin/python" ]; then \
		.juicer/bin/python scripts/generate-model-metadata.py; \
		echo "$(GREEN)✓ model-metadata.js generated$(NC)"; \
	else \
		echo "$(YELLOW)⚠ Python venv not found$(NC)"; \
		echo "$(BLUE)Run: make install-python$(NC)"; \
		exit 1; \
	fi

##@ Development & Quality

lint: ## Run linters (Ruff for Python, Biome for JS)
	@echo "$(BLUE)Running ruff linter (Python)...$(NC)"
	@if [ -f ".juicer/bin/ruff" ]; then \
		.juicer/bin/ruff check src/backend/ tests/ docker/mcp/ --fix; \
	else \
		echo "$(YELLOW)⚠ Ruff not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)Running biome linter (JavaScript)...$(NC)"
	@npm run lint || exit 1

format: ## Format Python code with black
	@echo "$(BLUE)Formatting code with black...$(NC)"
	@if [ -f ".juicer/bin/black" ]; then \
		.juicer/bin/black src/backend/ tests/ docker/mcp/; \
	else \
		echo "$(YELLOW)⚠ Black not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi

typecheck: ## Run mypy type checking
	@echo "$(BLUE)Running mypy type checker...$(NC)"
	@if [ -f ".juicer/bin/mypy" ]; then \
		.juicer/bin/mypy src/backend/ tests/ docker/mcp/; \
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

validate: test-validate ## Validate Python code syntax
	@echo "$(GREEN)✓ Validation complete$(NC)"

fix: ## Auto-fix all fixable issues (format + lint with auto-fix)
	@echo "$(BLUE)Auto-fixing code issues...$(NC)"
	@if [ -f ".juicer/bin/black" ]; then \
		.juicer/bin/black src/backend/ tests/ docker/mcp/; \
	else \
		echo "$(YELLOW)⚠ Black not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi
	@if [ -f ".juicer/bin/ruff" ]; then \
		.juicer/bin/ruff check src/backend/ tests/ docker/mcp/ --fix; \
	else \
		echo "$(YELLOW)⚠ Ruff not installed in .juicer venv$(NC)"; \
		echo "$(BLUE)Run: make install-dev$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ All fixable issues resolved$(NC)"

check: ## Pre-commit validation gate (format check + lint + typecheck + tests)
	@echo "$(BLUE)Running pre-commit validation checks...$(NC)"
	@echo "$(BLUE)→ Checking code format...$(NC)"
	@if [ -f ".juicer/bin/black" ]; then \
		.juicer/bin/black --check src/backend/ tests/ docker/mcp/ || (echo "$(RED)✗ Format check failed. Run: make format$(NC)" && exit 1); \
	else \
		echo "$(YELLOW)⚠ Black not installed, skipping format check$(NC)"; \
	fi
	@echo "$(BLUE)→ Running linter...$(NC)"
	@if [ -f ".juicer/bin/ruff" ]; then \
		.juicer/bin/ruff check src/backend/ tests/ docker/mcp/ || (echo "$(RED)✗ Lint check failed. Run: make lint$(NC)" && exit 1); \
	else \
		echo "$(YELLOW)⚠ Ruff not installed, skipping lint check$(NC)"; \
	fi
	@echo "$(BLUE)→ Running type checker...$(NC)"
	@if [ -f ".juicer/bin/mypy" ]; then \
		.juicer/bin/mypy src/backend/ tests/ docker/mcp/ || (echo "$(RED)✗ Type check failed. Run: make typecheck$(NC)" && exit 1); \
	else \
		echo "$(YELLOW)⚠ Mypy not installed, skipping type check$(NC)"; \
	fi
	@echo "$(BLUE)→ Running tests...$(NC)"
	@$(MAKE) test-all || (echo "$(RED)✗ Tests failed. Run: make test$(NC)" && exit 1)
	@echo "$(GREEN)✓ All validation checks passed$(NC)"

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

db-reset: ## Clear all session data (WARNING: destructive operation)
	@echo "$(YELLOW)⚠ This will delete ALL sessions and conversation data!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or Enter to continue...$(NC)"
	@read confirm
	@echo "$(BLUE)Resetting database...$(NC)"
	@rm -f data/chat_history.db data/chat_history.db-wal data/chat_history.db-shm
	@rm -f data/sessions.json
	@rm -rf data/files/*
	@echo "$(GREEN)✓ Database reset complete$(NC)"
	@echo "$(BLUE)Recreating directory structure...$(NC)"
	@mkdir -p data/files
	@echo "$(GREEN)✓ Ready for fresh sessions$(NC)"

db-backup: ## Backup database and session data to timestamped archive
	@echo "$(BLUE)Creating database backup...$(NC)"
	@mkdir -p data/backups
	@BACKUP_NAME="backup_$$(date +%Y%m%d_%H%M%S)" && \
		mkdir -p "data/backups/$$BACKUP_NAME" && \
		cp data/chat_history.db "data/backups/$$BACKUP_NAME/" 2>/dev/null || true && \
		cp data/chat_history.db-wal "data/backups/$$BACKUP_NAME/" 2>/dev/null || true && \
		cp data/chat_history.db-shm "data/backups/$$BACKUP_NAME/" 2>/dev/null || true && \
		cp data/sessions.json "data/backups/$$BACKUP_NAME/" 2>/dev/null || true && \
		cp -r data/files "data/backups/$$BACKUP_NAME/" 2>/dev/null || true && \
		echo "$(GREEN)✓ Backup created: data/backups/$$BACKUP_NAME$(NC)"

db-restore: ## Restore database from backup (usage: make db-restore BACKUP=backup_20250101_120000)
	@if [ -z "$(BACKUP)" ]; then \
		echo "$(BLUE)Available backups:$(NC)"; \
		ls -1t data/backups/ 2>/dev/null || echo "$(YELLOW)No backups found$(NC)"; \
		echo ""; \
		echo "$(BLUE)Usage: make db-restore BACKUP=backup_name$(NC)"; \
		exit 1; \
	fi
	@if [ ! -d "data/backups/$(BACKUP)" ]; then \
		echo "$(RED)✗ Backup not found: $(BACKUP)$(NC)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)⚠ This will replace current database with backup: $(BACKUP)$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or Enter to continue...$(NC)"
	@read confirm
	@echo "$(BLUE)Restoring from backup...$(NC)"
	@rm -f data/chat_history.db data/chat_history.db-wal data/chat_history.db-shm
	@rm -f data/sessions.json
	@rm -rf data/files/*
	@cp "data/backups/$(BACKUP)/chat_history.db" data/ 2>/dev/null || true
	@cp "data/backups/$(BACKUP)/chat_history.db-wal" data/ 2>/dev/null || true
	@cp "data/backups/$(BACKUP)/chat_history.db-shm" data/ 2>/dev/null || true
	@cp "data/backups/$(BACKUP)/sessions.json" data/ 2>/dev/null || true
	@cp -r "data/backups/$(BACKUP)/files/"* data/files/ 2>/dev/null || true
	@echo "$(GREEN)✓ Database restored from: $(BACKUP)$(NC)"

##@ Code Interpreter Sandbox

build-sandbox: ## Build the sandbox container image for code execution
	@echo "$(BLUE)Building sandbox container image...$(NC)"
	@./scripts/build-sandbox.sh
	@echo "$(GREEN)✓ Sandbox image built$(NC)"

sandbox-status: ## Check if sandbox is ready (container runtime + image)
	@echo "$(BLUE)Checking sandbox status...$(NC)"
	@if command -v podman >/dev/null 2>&1; then \
		echo "  Container runtime: $(GREEN)podman$(NC)"; \
		RUNTIME=podman; \
	elif command -v docker >/dev/null 2>&1; then \
		echo "  Container runtime: $(GREEN)docker$(NC)"; \
		RUNTIME=docker; \
	else \
		echo "  Container runtime: $(YELLOW)NOT FOUND$(NC)"; \
		echo "  $(YELLOW)⚠ Install Docker or Podman to use code interpreter$(NC)"; \
		exit 1; \
	fi; \
	if $$RUNTIME image inspect chat-juicer-sandbox:latest >/dev/null 2>&1; then \
		echo "  Sandbox image: $(GREEN)ready$(NC)"; \
		$$RUNTIME images chat-juicer-sandbox:latest --format "  Size: {{.Size}}"; \
	else \
		echo "  Sandbox image: $(YELLOW)not built$(NC)"; \
		echo "  $(YELLOW)⚠ Run 'make build-sandbox' to build$(NC)"; \
	fi

sandbox-test: ## Run quick smoke test of sandbox execution
	@echo "$(BLUE)Testing sandbox execution...$(NC)"
	@RUNTIME=$$(command -v podman || command -v docker); \
	if [ -z "$$RUNTIME" ]; then \
		echo "$(YELLOW)⚠ No container runtime found$(NC)"; \
		exit 1; \
	fi; \
	$$RUNTIME run --rm --network=none --read-only \
		--memory=512m --cpus=1 --user=1000:1000 \
		chat-juicer-sandbox:latest \
		python -c "import numpy as np; print(f'NumPy {np.__version__}: {np.array([1,2,3]).sum()}')" && \
	echo "$(GREEN)✓ Sandbox execution test passed$(NC)"

##@ Maintenance

update-deps: ## Update dependencies (Node.js and Python)
	@echo "$(BLUE)Updating dependencies...$(NC)"
	@echo "$(BLUE)→ Updating Node.js dependencies...$(NC)"
	@npm update
	@echo "$(GREEN)✓ Node.js dependencies updated$(NC)"
	@echo "$(BLUE)→ Updating Python dependencies...$(NC)"
	@if [ -f ".juicer/bin/pip" ]; then \
		.juicer/bin/pip install --upgrade pip && \
		.juicer/bin/pip install --upgrade -r src/backend/requirements.txt; \
		echo "$(GREEN)✓ Python dependencies updated$(NC)"; \
	else \
		echo "$(YELLOW)⚠ Virtual environment not found$(NC)"; \
		echo "$(BLUE)Run: make install-python$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)→ Running health check...$(NC)"
	@$(MAKE) health

kill: ## Kill all Chat Juicer processes (nuclear option for when things go wrong)
	@echo "$(BLUE)Killing all Chat Juicer processes...$(NC)"
	@echo "$(YELLOW)→ Killing Vite dev server (port 5173)...$(NC)"
	@lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "  $(GREEN)✓ Vite killed$(NC)" || echo "  $(YELLOW)○ No Vite process$(NC)"
	@echo "$(YELLOW)→ Killing Python backend processes...$(NC)"
	@lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "  $(GREEN)✓ Port 8000 freed$(NC)" || echo "  $(YELLOW)○ Port 8000 clear$(NC)"
	@pkill -9 -f "python.*main.py" 2>/dev/null && echo "  $(GREEN)✓ Python killed$(NC)" || echo "  $(YELLOW)○ No Python process$(NC)"
	@echo "$(YELLOW)→ Killing Electron processes...$(NC)"
	@pkill -9 -f "electron.*main.js" 2>/dev/null && echo "  $(GREEN)✓ Electron killed$(NC)" || echo "  $(YELLOW)○ No Electron process$(NC)"
	@pkill -9 -f "launch.js" 2>/dev/null && echo "  $(GREEN)✓ Launch script killed$(NC)" || echo "  $(YELLOW)○ No launch script$(NC)"
	@echo "$(GREEN)✓ All Chat Juicer processes terminated$(NC)"

restart: kill ## Quick restart (kill processes + restart in dev mode)
	@echo "$(BLUE)Restarting Chat Juicer...$(NC)"
	@sleep 1
	@$(MAKE) dev

clean: ## Clean temporary files and logs
	@echo "$(BLUE)Cleaning temporary files...$(NC)"
	@rm -rf logs/*.jsonl
	@rm -rf src/backend/__pycache__
	@rm -rf src/backend/*/__pycache__
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type f -name ".DS_Store" -delete 2>/dev/null || true
	@rm -rf dist/
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-cache: ## Clean development cache directories (mypy, ruff, pytest)
	@echo "$(BLUE)Cleaning development caches...$(NC)"
	@rm -rf .mypy_cache src/backend/.mypy_cache
	@rm -rf .ruff_cache src/backend/.ruff_cache
	@rm -rf .pytest_cache
	@rm -rf .serena
	@echo "$(GREEN)✓ Cache cleanup complete$(NC)"

clean-venv: ## Remove virtual environment
	@echo "$(BLUE)Removing .juicer virtual environment...$(NC)"
	@rm -rf .juicer
	@echo "$(GREEN)✓ Virtual environment removed$(NC)"
	@echo "$(YELLOW)Run 'make install-python' to recreate$(NC)"

clean-all: clean clean-cache clean-venv ## Deep clean including dependencies and venv
	@echo "$(BLUE)Deep cleaning...$(NC)"
	@rm -rf node_modules
	@echo "$(GREEN)✓ Deep clean complete$(NC)"
	@echo "$(YELLOW)Run 'make install' to reinstall dependencies$(NC)"

reset: clean-all ## Complete reset (clean + remove .env + remove venv)
	@echo "$(BLUE)Resetting project...$(NC)"
	@rm -f src/backend/.env
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
	@echo "Environment: $$(\[ -f src/backend/.env \] && echo '$(GREEN)✓ Configured$(NC)' || echo '$(YELLOW)⚠ Not configured$(NC)')"
	@echo "Node modules: $$(\[ -d node_modules \] && echo '$(GREEN)✓ Installed$(NC)' || echo '$(YELLOW)⚠ Not installed$(NC)')"
	@echo "Python venv: $$(\[ -d .juicer \] && echo '$(GREEN)✓ Installed$(NC)' || echo '$(YELLOW)⚠ Not installed$(NC)')"
	@echo "MCP server: $$(which server-sequential-thinking >/dev/null 2>&1 && echo '$(GREEN)✓ Installed$(NC)' || echo '$(YELLOW)⚠ Not installed$(NC)')"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"

status: health ## Alias for health check

help: ## Show this help message
	@echo "$(BLUE)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║                     Chat Juicer Makefile                     ║$(NC)"
	@echo "$(BLUE)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(YELLOW)<target>$(NC)\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-18s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(BLUE)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(BLUE)Quick Start:$(NC)"
	@echo "  1. Run 'make setup' (or 'make setup-dev' for dev tools)"
	@echo "  2. Configure src/backend/.env with your Azure OpenAI credentials"
	@echo "  3. Run 'make run' to start the application"
	@echo ""
	@echo "$(BLUE)Setup Options:$(NC)"
	@echo "  make setup      - Essential dependencies only"
	@echo "  make setup-dev  - Includes linters, formatters, pre-commit hooks"
	@echo ""
	@echo "$(BLUE)Testing:$(NC)"
	@echo "  make test              - Run all tests (backend + frontend)"
	@echo "  make test-backend      - Run only Python tests"
	@echo "  make test-frontend     - Run only JavaScript tests"
	@echo "  make test-frontend-ui  - Open interactive Vitest UI"
	@echo ""
