"""
Function handlers for Chat Juicer.
Separate module for all tool/function implementations.
"""

import os
import json
from pathlib import Path
from typing import Dict, List, Any, Optional

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
            
        # Check file size
        file_size = target_file.stat().st_size
        if file_size > max_size:
            return json.dumps({
                "error": f"File too large: {file_size} bytes (max: {max_size} bytes)",
                "file_size": file_size
            })
        
        # Detect file type and read accordingly
        try:
            content = target_file.read_text(encoding='utf-8')
            
            result = {
                "file_path": str(target_file.relative_to(cwd) if cwd in target_file.parents else target_file),
                "file_name": target_file.name,
                "size": file_size,
                "extension": target_file.suffix,
                "content": content,
                "lines": len(content.splitlines())
            }
            
            return json.dumps(result, indent=2)
            
        except UnicodeDecodeError:
            return json.dumps({
                "error": "File is not text/UTF-8 encoded",
                "file_path": str(target_file)
            })
            
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