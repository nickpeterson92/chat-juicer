# Setup System Analysis & Resolution

**Date**: 2025-10-19
**Issue**: `make clean-all` → `make setup` failed due to Python version mismatch
**Status**: ✅ RESOLVED

## Root Cause Analysis

### Primary Issue: Python Version Mismatch
- **Problem**: `markitdown[all]>=0.1.0` requires Python >=3.10 (Wishgate requires 3.13+)
- **System State**: `python3` resolved to Python 3.9.6
- **Available**: Python 3.13.9 installed but not prioritized

### Error Trace
```
ERROR: Could not find a version that satisfies the requirement markitdown[all]>=0.1.0
(from versions: 0.0.1a1)
ERROR: No matching distribution found for markitdown[all]>=0.1.0
```

**Diagnosis**: pip filtered out all markitdown versions due to Python 3.9.6 < 3.10 requirement

## Resolution Implementation

### 1. Python Detection Priority (scripts/platform-config.js)
**Change**: Updated `getPythonCommands()` to require Python 3.13+

```javascript
// Before
case "darwin":
case "linux":
  return ["python3", "python"];

// After
case "darwin":
case "linux":
  return ["python3.13", "python3"];
```

**Impact**: System now requires and automatically finds Python 3.13+

### 2. MCP Server Installation (scripts/setup.js)
**Enhancement**: Clarified that both MCP servers are properly installed

- **Sequential Thinking**: Node.js package, global npm install
- **Fetch**: Python package in venv via requirements.txt

```javascript
async function installMCPServers() {
  // Sequential Thinking (npm global)
  await installSequentialThinking();

  // Fetch (Python venv, via requirements.txt)
  printInfo("Fetch MCP server will be installed with Python dependencies");
}
```

### 3. Dev Tools Integration (scripts/setup.js)
**Added**: Optional development tools installation

```bash
# Essential only
make setup

# With dev tools (linters, formatters, pre-commit)
make setup-dev
```

**Installed Dev Tools**:
- ruff (linter)
- black (formatter)
- mypy (type checker)
- pytest + coverage
- pre-commit hooks
- sphinx (docs)

### 4. Makefile Updates
**Enhanced**:
- Added `setup-dev` target for comprehensive development setup
- Updated `install-mcp` documentation for both servers
- Improved help text with setup options

### 5. Data Directory Creation (scripts/setup.js)
**Added**: `data/` and `data/files/` directory creation during setup

**Rationale**: Prevents "Loading sessions..." hang on first boot by ensuring:
- Session metadata storage path (`data/sessions.json`) can be created
- SQLite database path (`data/chat_history.db`) is accessible
- Per-session workspaces (`data/files/{session_id}/`) have valid parent directory

**Impact**: Clean first-boot experience with no session loading errors

## Complete Setup Flow

### Essential Setup (`make setup`)
```
1. Check prerequisites (Node.js, npm)
2. Install Node.js dependencies
3. Create .juicer venv with Python 3.13
4. Install Python dependencies (including markitdown, mcp-server-fetch)
5. Install Sequential Thinking MCP server (npm global)
6. Create .env from template
7. Create project directories (logs, sources, output, templates, data, data/files)
8. Validate setup
```

### Development Setup (`make setup-dev`)
```
All of Essential Setup, PLUS:
9. Install Python dev dependencies (ruff, black, mypy, pytest, sphinx)
10. Install pre-commit git hooks
```

## Verification

### System Requirements
- ✅ Node.js 16+ (any version)
- ✅ Python 3.13+ (strictly required)
- ✅ npm (included with Node.js)
- ✅ Git (for pre-commit hooks, optional)

### Installed Components

**Essential** (`make setup`):
- Node packages: electron, vite, marked, mermaid, dompurify, katex, highlight.js
- Python packages: openai-agents, openai, markitdown, tiktoken, httpx, aiofiles, pydantic
- MCP servers: Sequential Thinking (npm), Fetch (Python)
- Environment: .env configuration template
- Directories: logs/, sources/, output/, templates/

**Development** (`make setup-dev`):
- Linters: ruff
- Formatters: black
- Type checker: mypy
- Testing: pytest, pytest-cov, pytest-asyncio
- Documentation: sphinx, sphinx-rtd-theme
- Git hooks: pre-commit
- REPL: ipython

## Testing Recommendations

### Clean State Test
```bash
make clean-all  # Remove everything
make setup      # Essential setup
make health     # Verify configuration
make test       # Validate Python syntax
make run        # Start application
```

### Development Workflow Test
```bash
make reset          # Complete reset
make setup-dev      # Full dev environment
make health         # Verify configuration
make quality        # Run format + lint + typecheck
make run            # Start application
```

## Future Considerations

### Python Version Management
- Current: Requires system Python 3.13+ installation
- Potential: Add pyenv/conda integration for isolated Python management
- Trade-off: Complexity vs portability
- Decision: System Python 3.13+ requirement keeps setup simple

### MCP Server Ecosystem
- Current: Two servers (Sequential Thinking, Fetch)
- Extensible: Framework supports additional MCP servers
- Pattern: Node.js servers via npm, Python servers via pip

### Development Tools
- Current: Optional via `--dev` flag
- Alternative: Always install, faster iteration
- Decision: Keep optional to minimize essential setup time

## Documentation Updates

Files updated:
1. `scripts/platform-config.js` - Python detection priority
2. `scripts/setup.js` - MCP servers + dev tools
3. `Makefile` - setup-dev target + documentation
4. `claudedocs/SETUP_ANALYSIS.md` - This file

Files that should reference this:
- `CLAUDE.md` - Update setup instructions
- `README.md` - Reference setup options (if exists)
