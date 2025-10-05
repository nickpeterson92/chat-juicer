# Chat Juicer API Documentation

## Overview

Chat Juicer provides a comprehensive set of functions for file operations, document generation, and text manipulation. All functions are synchronous and designed to work with the Agent/Runner pattern.

## Native Functions

### list_directory

Lists the contents of a directory with detailed metadata.

**Parameters:**
- `path` (str): Directory path to list (default: current directory)

**Returns:**
- JSON string containing:
  - `directories`: List of subdirectories with metadata
  - `files`: List of files with size and modification time
  - `total_size`: Total size of all files in bytes
  - `file_count`: Number of files
  - `dir_count`: Number of directories

**Example:**
```json
{
  "directories": [
    {"name": "src", "modified": "2025-01-13T10:30:00"}
  ],
  "files": [
    {"name": "README.md", "size": 15234, "modified": "2025-01-13T09:45:00"}
  ],
  "total_size": 45678,
  "file_count": 5,
  "dir_count": 2
}
```

**Error Handling:**
- Returns error JSON if directory doesn't exist
- Handles permission errors gracefully

---

### read_file

Reads a file and automatically converts various formats to markdown.

**Parameters:**
- `file_path` (str): Path to the file to read
- `offset` (int, optional): Starting line number (0-indexed)
- `limit` (int, optional): Number of lines to read

**Returns:**
- JSON string containing:
  - `content`: File content (converted to markdown if applicable)
  - `lines`: Number of lines read
  - `total_lines`: Total lines in file
  - `format`: Detected file format
  - `tokens`: Token count information

**Supported Formats:**
- **Documents**: PDF, Word (.docx, .doc), RTF, ODT
- **Spreadsheets**: Excel (.xlsx, .xls), CSV
- **Presentations**: PowerPoint (.pptx, .ppt)
- **Web**: HTML, MHTML
- **Data**: JSON, XML
- **Code**: Jupyter notebooks (.ipynb)
- **Images**: JPEG, PNG, GIF, BMP, TIFF, WebP (if LLM client configured)
- **Text**: Plain text, Markdown

**Example:**
```json
{
  "content": "# Document Title\n\nContent here...",
  "lines": 100,
  "total_lines": 500,
  "format": "pdf",
  "tokens": {
    "exact_tokens": 1234,
    "optimized": true,
    "tokens_saved": 456
  }
}
```

**Token Optimization:**
- Automatically optimizes content >1000 tokens
- Removes redundant whitespace and headers
- Reports exact tokens saved

---

### generate_document

Generates a document from a template with placeholder replacement.

**Parameters:**
- `template_path` (str): Path to template file
- `output_path` (str): Where to save generated document
- `context` (dict): Key-value pairs for placeholder replacement

**Returns:**
- JSON string containing:
  - `success`: Boolean indicating success
  - `output_path`: Path to generated file
  - `placeholders_replaced`: Number of replacements made
  - `backup_created`: Whether a backup was made (if file existed)

**Template Format:**
- Uses `{{placeholder_name}}` syntax
- Supports nested placeholders
- Preserves formatting and structure

**Example:**
```json
{
  "success": true,
  "output_path": "output/report.md",
  "placeholders_replaced": 12,
  "backup_created": true
}
```

---

### text_edit

Find and replace exact text in a document.

**Parameters:**
- `file_path` (str): Path to file to edit
- `find_text` (str): Exact text to find
- `replace_with` (str): Replacement text (empty string to delete)

**Returns:**
- JSON string containing:
  - `success`: Boolean indicating success
  - `replacements_made`: Number of replacements
  - `backup_created`: Whether a backup was made
  - `lines_affected`: Number of lines changed

**Example:**
```json
{
  "success": true,
  "replacements_made": 3,
  "backup_created": true,
  "lines_affected": 3
}
```

**Use Cases:**
- Simple text replacements
- Deleting text (set replace_with='')
- Updating specific values

---

### regex_edit

Pattern-based editing using regular expressions.

**Parameters:**
- `file_path` (str): Path to file to edit
- `pattern` (str): Regular expression pattern
- `replacement` (str): Replacement pattern (supports backreferences)

**Returns:**
- JSON string containing:
  - `success`: Boolean indicating success
  - `matches_found`: Number of pattern matches
  - `replacements_made`: Number of replacements
  - `backup_created`: Whether a backup was made

**Example:**
```json
{
  "success": true,
  "matches_found": 5,
  "replacements_made": 5,
  "backup_created": true
}
```

**Common Patterns:**
- Versions: `v\d+\.\d+\.\d+`
- Dates: `\d{4}-\d{2}-\d{2}`
- URLs: `https?://[^\s]+`
- Emails: `[\w\.-]+@[\w\.-]+\.\w+`

---

### insert_text

Insert new content before or after existing text.

**Parameters:**
- `file_path` (str): Path to file to edit
- `marker_text` (str): Text to find as insertion point
- `new_text` (str): Text to insert
- `position` (str): "before" or "after" the marker

**Returns:**
- JSON string containing:
  - `success`: Boolean indicating success
  - `insertion_made`: Boolean indicating if insertion occurred
  - `backup_created`: Whether a backup was made
  - `line_inserted`: Line number where insertion occurred

**Example:**
```json
{
  "success": true,
  "insertion_made": true,
  "backup_created": true,
  "line_inserted": 42
}
```

**Use Cases:**
- Adding new sections to documents
- Inserting code blocks
- Adding headers or footers

---

## MCP Server Tools

### Sequential Thinking

Advanced reasoning tool for complex problem-solving.

**Capabilities:**
- Break down complex problems into steps
- Revise understanding as needed
- Generate and test hypotheses
- Maintain context across reasoning steps
- Branch into alternative approaches

**Usage:**
The Sequential Thinking MCP server is automatically available when configured. It provides enhanced reasoning for:
- Complex document analysis
- Multi-step problem solving
- Architectural decisions
- Debugging scenarios

---

## Session Management

### TokenAwareSQLiteSession

Extends the SDK's SQLiteSession with automatic token-based summarization.

**Key Methods:**

#### __init__
```python
TokenAwareSQLiteSession(
    session_id: str,
    db_path: str | None = None,
    agent: Agent = None,
    model: str = "gpt-5-mini",
    threshold: float = 0.8
)
```

**Parameters:**
- `session_id`: Unique identifier for the session
- `db_path`: SQLite database path (None for in-memory)
- `agent`: Agent instance for summarization
- `model`: Model name for token counting
- `threshold`: Trigger summarization at this fraction of limit

#### should_summarize()
Checks if summarization should be triggered based on token count.

**Returns:**
- `bool`: True if tokens exceed threshold

#### summarize_with_agent()
Performs automatic summarization of conversation history.

**Parameters:**
- `keep_recent` (int): Number of recent messages to keep (default: 2)

**Returns:**
- `str`: The generated summary text

#### run_with_auto_summary()
Convenience method that checks tokens and triggers summarization if needed before running.

**Parameters:**
- `agent`: The agent to run
- `user_input`: User's message
- `**kwargs`: Additional Runner.run_streamed arguments

**Returns:**
- `RunResultStreaming`: Streaming result from agent execution

#### update_with_tool_tokens()
Updates token count with tokens from tool calls.

**Parameters:**
- `tool_tokens` (int): Number of tokens used by tools

---

## Error Handling

All functions implement comprehensive error handling:

### Common Error Responses

**File Not Found:**
```json
{
  "error": "File not found",
  "path": "/path/to/file",
  "success": false
}
```

**Permission Denied:**
```json
{
  "error": "Permission denied",
  "path": "/path/to/file",
  "success": false
}
```

**Invalid Input:**
```json
{
  "error": "Invalid input",
  "details": "Specific error message",
  "success": false
}
```

---

## Tool Patches

### Race Condition Handling

RS_/FC_ streaming errors have been resolved by moving to client-side TokenAwareSQLiteSession.
No tool call delays or monkey patches needed.

---

## Utility Functions

### Token Management (utils.py)

#### estimate_tokens()
Counts tokens for content using tiktoken.

**Parameters:**
- `content` (str): Text to count tokens for
- `model` (str): Model name for encoding

**Returns:**
- Dictionary with token counts and optimization info

#### optimize_content()
Reduces token usage by removing redundant content.

**Parameters:**
- `content` (str): Text to optimize
- `threshold` (int): Only optimize if tokens exceed this

**Returns:**
- Optimized content string

---

## Logging

### Structured JSON Logging

The application uses python-json-logger for structured logging:

**Log Files:**
- `logs/conversations.jsonl`: All conversation interactions
- `logs/errors.jsonl`: Errors and debugging information

**Log Format:**
```json
{
  "timestamp": "2025-01-13T10:30:45.123Z",
  "level": "INFO",
  "message": "User input received",
  "extra": {
    "session_id": "chat_abc123",
    "tokens": 150,
    "function": "read_file"
  }
}
```

**Rotation:**
- Max size: 10MB per file
- Backup count: 5 for conversations, 3 for errors

---

## Constants and Configuration

### Key Constants (constants.py)

**File Limits:**
- `DEFAULT_MAX_FILE_SIZE`: 1.5MB
- `MAX_BACKUP_VERSIONS`: 10

**Token Thresholds:**
- `TOKEN_OPTIMIZATION_THRESHOLD`: 1000 tokens
- `TOKEN_SUMMARIZATION_THRESHOLD`: 0.8 (80% of limit)

**Model Limits:**
- GPT-5 models: 250,000 tokens
- GPT-4 models: 120,000 tokens
- GPT-3.5 models: 15,000 tokens

---

## Integration Examples

### Basic File Reading
```python
result = read_file("document.pdf")
data = json.loads(result)
content = data["content"]
```

### Document Generation
```python
context = {
    "title": "Project Report",
    "date": "2025-01-13",
    "author": "Team Alpha"
}
result = generate_document(
    "templates/report.md",
    "output/final_report.md",
    context
)
```

### Text Editing
```python
# Simple replacement
text_edit("file.md", "old version", "new version")

# Pattern-based editing
regex_edit("file.md", r"v\d+\.\d+", "v2.0")

# Insert new content
insert_text("file.md", "## Introduction", "New paragraph", "after")
```

---

## Best Practices

1. **Always check file existence** before operations
2. **Use appropriate function** for the task (text_edit for simple, regex_edit for patterns)
3. **Leverage token optimization** for large documents
4. **Monitor session tokens** to avoid context limits
5. **Handle errors gracefully** with proper JSON responses
6. **Create backups** before editing operations
7. **Use templates** for consistent document generation
8. **Configure delays** based on your deployment needs

---

## Future Enhancements

Potential areas for expansion:
- Additional MCP server integrations
- Enhanced file format support
- Batch operations for multiple files
- Async function implementations
- WebSocket support for real-time updates
- Database integration for persistent storage
- Advanced template features (conditionals, loops)