"""
Function handlers for Chat Juicer.
Separate module for all tool/function implementations.
"""

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
    }
]


# Function registry for execution
FUNCTION_REGISTRY = {
    "get_weather": get_weather
}