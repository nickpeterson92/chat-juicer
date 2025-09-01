"""
Function handlers for Chat Juicer.
Separate module for all tool/function implementations.
"""

import json
import re
from pathlib import Path
from typing import Dict, Optional, List


def optimize_content_for_tokens(content: str, format_type: str = "text") -> tuple[str, Dict]:
    """
    Optimize content for minimal token usage while preserving information.
    
    Args:
        content: The text content to optimize
        format_type: Type of content (markdown, csv, json, text, etc.)
        
    Returns:
        Tuple of (optimized_content, optimization_stats)
    """
    original_length = len(content)
    lines = content.splitlines()
    
    # Statistics tracking
    stats = {
        "original_length": original_length,
        "original_lines": len(lines),
        "removed_blank_lines": 0,
        "removed_headers": 0,
        "removed_footers": 0,
        "whitespace_trimmed": 0,
        "redundant_removed": 0
    }
    
    # Step 1: Remove excessive blank lines (keep max 1 between sections)
    optimized_lines = []
    prev_blank = False
    for line in lines:
        if line.strip() == "":
            if not prev_blank:
                optimized_lines.append("")
                prev_blank = True
            else:
                stats["removed_blank_lines"] += 1
        else:
            optimized_lines.append(line)
            prev_blank = False
    
    # Step 2: Detect and remove common headers/footers
    if len(optimized_lines) > 10:
        # Common header patterns (first 5 lines)
        header_patterns = [
            r'^[-=]{3,}$',  # Separator lines
            r'^Page \d+',  # Page numbers
            r'^\s*Confidential',  # Confidentiality notices
            r'^\s*Copyright',  # Copyright notices
            r'^\s*Generated on',  # Generation timestamps
            r'^\s*Printed on',  # Print timestamps
        ]
        
        # Check first 5 lines for headers
        lines_to_remove = []
        for i in range(min(5, len(optimized_lines))):
            for pattern in header_patterns:
                if re.match(pattern, optimized_lines[i], re.IGNORECASE):
                    lines_to_remove.append(i)
                    stats["removed_headers"] += 1
                    break
        
        # Remove headers (in reverse to maintain indices)
        for i in reversed(lines_to_remove):
            if i < len(optimized_lines):
                optimized_lines.pop(i)
        
        # Check last 5 lines for footers
        footer_patterns = header_patterns + [
            r'^\s*End of (document|file|report)',
            r'^\s*\d+\s*$',  # Lone page numbers
        ]
        
        lines_to_remove = []
        start_idx = max(0, len(optimized_lines) - 5)
        for i in range(start_idx, len(optimized_lines)):
            for pattern in footer_patterns:
                if re.match(pattern, optimized_lines[i], re.IGNORECASE):
                    lines_to_remove.append(i)
                    stats["removed_footers"] += 1
                    break
        
        # Remove footers
        for i in reversed(lines_to_remove):
            if i < len(optimized_lines):
                optimized_lines.pop(i)
    
    # Step 3: Format-specific optimizations
    if format_type == "csv" or format_type == "markdown_table":
        # Remove redundant column separators
        optimized_lines = [re.sub(r'\s*\|\s*', '|', line) for line in optimized_lines]
        stats["whitespace_trimmed"] = sum(1 for line in optimized_lines if '|' in line)
    
    elif format_type == "json":
        # Compact JSON formatting (remove extra spaces around : and ,)
        content_joined = '\n'.join(optimized_lines)
        content_joined = re.sub(r'\s*:\s*', ':', content_joined)
        content_joined = re.sub(r'\s*,\s*', ',', content_joined)
        optimized_lines = content_joined.splitlines()
        stats["whitespace_trimmed"] = len(optimized_lines)
    
    # Step 4: Trim trailing whitespace from all lines
    optimized_lines = [line.rstrip() for line in optimized_lines]
    
    # Step 5: Remove redundant separators (multiple dashes, equals, etc.)
    final_lines = []
    prev_separator = False
    for line in optimized_lines:
        # Check if line is just separators
        if re.match(r'^[\s\-=_*#]{3,}$', line):
            if not prev_separator:
                final_lines.append(line[:20])  # Keep shortened separator
                prev_separator = True
            else:
                stats["redundant_removed"] += 1
        else:
            final_lines.append(line)
            prev_separator = False
    
    # Step 6: For markdown, optimize heading spacing
    if format_type == "markdown" or "markdown" in format_type:
        compressed = []
        for i, line in enumerate(final_lines):
            # Remove blank lines before headings (markdown renders spacing)
            if line.startswith('#') and i > 0 and compressed and compressed[-1] == "":
                compressed.pop()
                stats["removed_blank_lines"] += 1
            compressed.append(line)
        final_lines = compressed
    
    # Join back together
    optimized_content = '\n'.join(final_lines)
    
    # Calculate final stats
    stats["final_length"] = len(optimized_content)
    stats["final_lines"] = len(final_lines)
    stats["bytes_saved"] = original_length - stats["final_length"]
    stats["percentage_saved"] = round((stats["bytes_saved"] / original_length * 100), 1) if original_length > 0 else 0
    
    return optimized_content, stats


def estimate_tokens(text: str) -> Dict:
    """
    Estimate token count for text content.
    
    Uses multiple heuristics for better accuracy:
    - Average English: ~4 characters per token
    - Code/technical: ~3.5 characters per token  
    - Structured data: ~3 characters per token
    
    Returns dict with multiple estimates.
    """
    char_count = len(text)
    word_count = len(text.split())
    
    # Detect content type for better estimation
    code_indicators = sum([
        text.count('{'),
        text.count('}'),
        text.count('('),
        text.count(')'),
        text.count(';'),
        text.count('=')
    ])
    
    # Calculate code density (0-1)
    code_density = min(code_indicators / (word_count + 1), 1.0)
    
    # Weighted average based on content type
    if code_density > 0.3:
        # Code/technical content
        chars_per_token = 3.0 + (1.0 * (1 - code_density))
    else:
        # Natural language
        chars_per_token = 4.0
    
    return {
        "estimated_tokens": int(char_count / chars_per_token),
        "conservative_estimate": int(char_count / 3.0),  # Worst case
        "optimistic_estimate": int(char_count / 4.5),  # Best case
        "char_count": char_count,
        "word_count": word_count,
        "chars_per_token": round(chars_per_token, 2),
        "content_type": "technical" if code_density > 0.3 else "natural"
    }


def get_weather(location: str) -> str:
    """
    Get weather for a given location.
    Currently returns mock data for demonstration.
    
    Args:
        location: The location to get weather for
        
    Returns:
        String with weather information
    """
    # Simple mock response matching original format
    result = f"The temperature in {location} is 20 degrees Celsius."
    return result


def list_directory(path: str = ".", show_hidden: bool = False) -> str:
    """
    List contents of a directory for project discovery.
    
    Args:
        path: Directory path to list (relative or absolute)
        show_hidden: Whether to include hidden files/folders
        
    Returns:
        JSON string with directory contents and metadata
    """
    try:
        target_path = Path(path).resolve()
        
        # Security check - ensure we're not going outside project bounds
        cwd = Path.cwd()
        if not (target_path == cwd or cwd in target_path.parents or target_path in cwd.parents):
            return json.dumps({"error": "Access denied: Path outside project scope"})
        
        items = []
        for item in target_path.iterdir():
            # Skip hidden files unless requested
            if item.name.startswith('.') and not show_hidden:
                continue
                
            item_info = {
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "path": str(item.relative_to(cwd) if cwd in item.parents or item == cwd else item)
            }
            
            # Add file size for files
            if item.is_file():
                item_info["size"] = item.stat().st_size
                item_info["extension"] = item.suffix
                
            items.append(item_info)
        
        # Sort directories first, then files
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        
        result = {
            "current_directory": str(target_path.relative_to(cwd) if cwd in target_path.parents or target_path == cwd else target_path),
            "total_items": len(items),
            "items": items
        }
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        return json.dumps({"error": f"Failed to list directory: {str(e)}"})


def read_file(file_path: str, max_size: int = 1048576) -> str:
    """
    Read a file's contents for documentation processing.
    Automatically converts non-markdown formats to markdown for token efficiency.
    
    Args:
        file_path: Path to the file to read
        max_size: Maximum file size in bytes (default 1MB)
        
    Returns:
        JSON string with file contents and metadata
    """
    try:
        target_file = Path(file_path).resolve()
        
        # Security check
        cwd = Path.cwd()
        if not (cwd in target_file.parents or target_file in cwd.parents):
            return json.dumps({"error": "Access denied: File outside project scope"})
        
        if not target_file.exists():
            return json.dumps({"error": f"File not found: {file_path}"})
            
        if not target_file.is_file():
            return json.dumps({"error": f"Not a file: {file_path}"})
            
        # Check file size before conversion
        file_size = target_file.stat().st_size
        if file_size > max_size:
            return json.dumps({
                "error": f"File too large: {file_size} bytes (max: {max_size} bytes)",
                "file_size": file_size
            })
        
        # Get file extension for format detection
        extension = target_file.suffix.lower()
        
        # Determine if we need markdown conversion
        needs_conversion = extension in [
            '.xlsx', '.xls',  # Excel
            '.docx', '.doc',  # Word
            '.pptx', '.ppt',  # PowerPoint
            '.pdf',           # PDF
            '.csv',           # CSV (will be converted to markdown table)
            '.html', '.htm',  # HTML
            '.xml',           # XML
            '.json',          # JSON (will be formatted as code block)
            '.ipynb'          # Jupyter notebooks
        ]
        
        content = None
        conversion_method = "none"
        
        if needs_conversion:
            try:
                # Use MarkItDown for conversion
                from markitdown import MarkItDown
                
                converter = MarkItDown()
                conversion_result = converter.convert(str(target_file))
                content = conversion_result.text_content
                conversion_method = "markitdown"
                
                # Apply advanced token optimization
                content, optimization_stats = optimize_content_for_tokens(
                    content, 
                    format_type="markdown"
                )
                
            except ImportError:
                return json.dumps({
                    "error": f"MarkItDown is required for reading {extension} files. Install with: pip install markitdown",
                    "file_path": str(target_file)
                })
            except Exception as conv_error:
                return json.dumps({
                    "error": f"Conversion failed: {str(conv_error)}",
                    "file_path": str(target_file),
                    "extension": extension
                })
        
        # For text/markdown files, read normally
        if not content:
            try:
                content = target_file.read_text(encoding='utf-8')
                conversion_method = "direct_read"
                
                # Determine format type for optimization
                if extension in ['.md', '.markdown']:
                    format_type = "markdown"
                elif extension in ['.json']:
                    format_type = "json"
                elif extension in ['.csv']:
                    format_type = "csv"
                else:
                    format_type = "text"
                
                # Apply optimization to all text content
                content, optimization_stats = optimize_content_for_tokens(
                    content,
                    format_type=format_type
                )
            except UnicodeDecodeError:
                return json.dumps({
                    "error": "File is not text/UTF-8 encoded",
                    "file_path": str(target_file)
                })
        
        # Use advanced token estimation
        token_estimates = estimate_tokens(content)
        
        result = {
            "file_path": str(target_file.relative_to(cwd) if cwd in target_file.parents else target_file),
            "file_name": target_file.name,
            "original_size": file_size,
            "content_size": len(content),
            "extension": target_file.suffix,
            "content": content,
            "lines": len(content.splitlines()),
            "conversion_method": conversion_method,
            "token_estimates": token_estimates,
            "format": "markdown" if needs_conversion or extension in ['.md', '.markdown'] else "text"
        }
        
        # Add optimization statistics if we have them
        if 'optimization_stats' in locals():
            result["optimization"] = optimization_stats
            result["optimization"]["token_savings_estimate"] = int(
                optimization_stats["bytes_saved"] / 4  # Rough token savings
            )
        
        # Add conversion info if converted
        if needs_conversion and conversion_method == "markitdown":
            result["conversion_info"] = {
                "original_format": extension,
                "converted_to": "markdown",
                "optimized": True if 'optimization_stats' in locals() else False
            }
        
        return json.dumps(result, indent=2)
            
    except Exception as e:
        return json.dumps({"error": f"Failed to read file: {str(e)}"})


def load_template(template_name: str, templates_dir: str = "templates") -> str:
    """
    Load a documentation template by name.
    
    Args:
        template_name: Name of the template (without extension)
        templates_dir: Directory containing templates
        
    Returns:
        JSON string with template content and metadata
    """
    try:
        templates_path = Path(templates_dir).resolve()
        
        # Look for template with common extensions
        extensions = ['.md', '.txt', '.template', '']
        template_file = None
        
        for ext in extensions:
            potential_file = templates_path / f"{template_name}{ext}"
            if potential_file.exists() and potential_file.is_file():
                template_file = potential_file
                break
        
        if not template_file:
            # List available templates
            available = []
            if templates_path.exists():
                for file in templates_path.iterdir():
                    if file.is_file() and not file.name.startswith('.'):
                        available.append(file.stem)
            
            return json.dumps({
                "error": f"Template not found: {template_name}",
                "available_templates": available
            })
        
        content = template_file.read_text(encoding='utf-8')
        
        # Parse template for placeholders
        import re
        placeholders = re.findall(r'\{\{([^}]+)\}\}', content)
        unique_placeholders = list(set(placeholders))
        
        result = {
            "template_name": template_name,
            "file_path": str(template_file.relative_to(Path.cwd())),
            "content": content,
            "placeholders": unique_placeholders,
            "lines": len(content.splitlines())
        }
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        return json.dumps({"error": f"Failed to load template: {str(e)}"})


def generate_document(
    template_content: str,
    deliverables: Dict[str, str],
    output_file: Optional[str] = None
) -> str:
    """
    Generate documentation by combining template with deliverables.
    
    Args:
        template_content: The template content with placeholders
        deliverables: Dictionary mapping placeholder names to content
        output_file: Optional path to save the generated document
        
    Returns:
        JSON string with generated document and metadata
    """
    try:
        import re
        
        # Process the template
        generated_content = template_content
        replacements_made = []
        
        # Find all placeholders in template
        placeholders = re.findall(r'\{\{([^}]+)\}\}', template_content)
        
        for placeholder in set(placeholders):
            placeholder_clean = placeholder.strip()
            
            # Look for matching deliverable
            if placeholder_clean in deliverables:
                replacement = deliverables[placeholder_clean]
                generated_content = generated_content.replace(
                    f"{{{{{placeholder}}}}}",
                    replacement
                )
                replacements_made.append(placeholder_clean)
            else:
                # Leave placeholder if no matching deliverable
                pass
        
        # Check for unfilled placeholders
        remaining_placeholders = re.findall(r'\{\{([^}]+)\}\}', generated_content)
        
        result = {
            "success": True,
            "content": generated_content,
            "replacements_made": replacements_made,
            "unfilled_placeholders": list(set(remaining_placeholders)),
            "total_lines": len(generated_content.splitlines()),
            "total_characters": len(generated_content)
        }
        
        # Save if output file specified
        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(generated_content, encoding='utf-8')
            result["saved_to"] = str(output_path)
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        return json.dumps({"error": f"Failed to generate document: {str(e)}"})


def write_document(file_path: str, content: str, create_backup: bool = True) -> str:
    """
    Write documentation to a file with safety checks.
    
    Args:
        file_path: Path where to write the document
        content: Content to write
        create_backup: Whether to backup existing file
        
    Returns:
        JSON string with write operation result
    """
    try:
        target_file = Path(file_path).resolve()
        
        # Security check
        cwd = Path.cwd()
        if not (cwd in target_file.parents or target_file == cwd):
            return json.dumps({"error": "Access denied: Path outside project scope"})
        
        # Create parent directories if needed
        target_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Backup existing file if requested
        backup_created = False
        if target_file.exists() and create_backup:
            backup_path = target_file.with_suffix(target_file.suffix + '.backup')
            counter = 1
            while backup_path.exists():
                backup_path = target_file.with_suffix(f"{target_file.suffix}.backup{counter}")
                counter += 1
            
            import shutil
            shutil.copy2(target_file, backup_path)
            backup_created = str(backup_path.relative_to(cwd))
        
        # Write the content
        target_file.write_text(content, encoding='utf-8')
        
        result = {
            "success": True,
            "file_path": str(target_file.relative_to(cwd)),
            "bytes_written": len(content.encode('utf-8')),
            "lines_written": len(content.splitlines())
        }
        
        if backup_created:
            result["backup_created"] = backup_created
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        return json.dumps({"error": f"Failed to write document: {str(e)}"})


# Tool definitions for Azure OpenAI Responses API
# Note: The Responses API uses a simpler format than Chat Completions API
TOOLS = [
    {
        "type": "function",
        "name": "get_weather",
        "description": "Get current temperature for a given location.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City and country e.g. Bogotá, Colombia"
                }
            },
            "required": ["location"],
            "additionalProperties": False
        }
    },
    {
        "type": "function",
        "name": "list_directory",
        "description": "List contents of a directory for project discovery. Returns files and subdirectories with metadata.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list (default: current directory)"
                },
                "show_hidden": {
                    "type": "boolean",
                    "description": "Whether to include hidden files/folders (default: false)"
                }
            },
            "additionalProperties": False
        }
    },
    {
        "type": "function",
        "name": "read_file",
        "description": "Read a file's contents for documentation processing. Returns file content and metadata.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file to read"
                },
                "max_size": {
                    "type": "integer",
                    "description": "Maximum file size in bytes (default: 1MB)"
                }
            },
            "required": ["file_path"],
            "additionalProperties": False
        }
    },
    {
        "type": "function",
        "name": "load_template",
        "description": "Load a documentation template by name. Templates should be in the templates directory.",
        "parameters": {
            "type": "object",
            "properties": {
                "template_name": {
                    "type": "string",
                    "description": "Name of the template (e.g., 'design-doc', 'technical-spec')"
                },
                "templates_dir": {
                    "type": "string",
                    "description": "Directory containing templates (default: 'templates')"
                }
            },
            "required": ["template_name"],
            "additionalProperties": False
        }
    },
    {
        "type": "function",
        "name": "generate_document",
        "description": "Generate documentation by combining a template with deliverables content. Replaces {{placeholders}} in template with actual content.",
        "parameters": {
            "type": "object",
            "properties": {
                "template_content": {
                    "type": "string",
                    "description": "The template content with {{placeholders}}"
                },
                "deliverables": {
                    "type": "object",
                    "description": "Dictionary mapping placeholder names to their content"
                },
                "output_file": {
                    "type": "string",
                    "description": "Optional path to save the generated document"
                }
            },
            "required": ["template_content", "deliverables"],
            "additionalProperties": False
        }
    },
    {
        "type": "function",
        "name": "write_document",
        "description": "Write documentation to a file with safety checks and optional backup.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path where to write the document"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file"
                },
                "create_backup": {
                    "type": "boolean",
                    "description": "Whether to backup existing file (default: true)"
                }
            },
            "required": ["file_path", "content"],
            "additionalProperties": False
        }
    }
]


# Function registry for execution
FUNCTION_REGISTRY = {
    "get_weather": get_weather,
    "list_directory": list_directory,
    "read_file": read_file,
    "load_template": load_template,
    "generate_document": generate_document,
    "write_document": write_document
}