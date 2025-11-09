# Chat Juicer Test Suite

This directory contains comprehensive unit tests for the Chat Juicer Python backend, targeting 85% code coverage.

## Test Structure

```
tests/
├── conftest.py           # Shared fixtures and test configuration
├── app/                  # Tests for app module (bootstrap, runtime, state)
├── core/                 # Tests for core module (session, agent, commands)
├── integrations/         # Tests for integrations module (MCP, SDK tracker)
├── models/              # Tests for Pydantic models
├── tools/               # Tests for agent tools
└── utils/               # Tests for utility functions
```

## Running Tests

### Quick Start

```bash
# Run all unit tests with coverage
make test-unit

# Run tests without coverage (faster)
make test-unit-fast

# Generate detailed coverage report
make test-coverage
```

### Direct pytest Commands

```bash
# Run all tests
.juicer/bin/pytest tests/

# Run specific test file
.juicer/bin/pytest tests/models/test_session_models.py

# Run specific test function
.juicer/bin/pytest tests/models/test_session_models.py::test_session_metadata_validation

# Run tests with coverage
.juicer/bin/pytest tests/ --cov=src --cov-report=html

# Run tests in parallel (faster)
.juicer/bin/pytest tests/ -n auto

# Run only failed tests from last run
.juicer/bin/pytest tests/ --lf
```

## Test Patterns

### Fixtures

Shared fixtures are defined in `conftest.py` files at various levels:
- `tests/conftest.py` - Global fixtures (mock clients, databases, file systems)
- `tests/<module>/conftest.py` - Module-specific fixtures

Common fixtures:
- `mock_openai_client` - Mock OpenAI API client
- `mock_agent` - Mock Agent from agents SDK
- `temp_dir` - Temporary directory for file operations
- `in_memory_db` - In-memory SQLite database
- `mock_env` - Mock environment variables

### Mocking External Dependencies

All external dependencies are mocked in tests:
- OpenAI API → `mock_openai_client`
- Agent/Runner SDK → `mock_agent`, `mock_runner`
- MCP servers → `mock_mcp_server`
- File system → `temp_dir`, `temp_file`
- Database → `in_memory_db`, `temp_db_path`

### Async Tests

Use `pytest-asyncio` for async function tests:

```python
import pytest

@pytest.mark.asyncio
async def test_async_function():
    result = await some_async_function()
    assert result == expected_value
```

### Parametrized Tests

Test multiple scenarios with parametrization:

```python
import pytest

@pytest.mark.parametrize("input,expected", [
    ("valid_input", "expected_output"),
    ("another_input", "another_output"),
])
def test_multiple_scenarios(input, expected):
    assert process(input) == expected
```

## Coverage Requirements

- **Target**: 85% code coverage
- **Command**: `make test-coverage`
- **Report**: `htmlcov/index.html`

Coverage excludes:
- Test files themselves
- `if TYPE_CHECKING:` blocks
- Abstract methods
- `if __name__ == "__main__":` blocks

## Troubleshooting

### Tests Not Found

Ensure pytest can discover tests:
```bash
.juicer/bin/pytest --collect-only
```

### Import Errors

Add project root to PYTHONPATH:
```bash
export PYTHONPATH="${PYTHONPATH}:$(pwd)/src"
```

### Async Test Warnings

Set asyncio mode in pytest.ini (already configured):
```ini
[pytest]
asyncio_mode = auto
```

### Mock Not Working

Ensure you're mocking the right location:
- Mock where the object is used, not where it's defined
- Use `monkeypatch` for module-level mocks
- Use `@patch` decorator for function-level mocks

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Clear Names**: Use descriptive test function names
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Mock External Deps**: Never hit real APIs or file systems
5. **Test Edge Cases**: Include None, empty, invalid inputs
6. **Test Errors**: Verify exception handling
7. **Use Fixtures**: Reuse test setup with fixtures
8. **Fast Tests**: Keep unit tests fast (<1s each)

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure tests pass: `make test-unit`
3. Check coverage: `make test-coverage`
4. Maintain 85%+ coverage
5. Update this README if adding new test patterns
