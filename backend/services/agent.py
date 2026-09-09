import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "click_element",
            "description": "Click a button, link, or any clickable element on the page",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the element to click",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of what is being clicked",
                    },
                },
                "required": ["selector", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fill_input",
            "description": "Fill a text input, textarea, or search field with a value",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the input element",
                    },
                    "value": {
                        "type": "string",
                        "description": "The value to type into the input",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of what is being filled",
                    },
                },
                "required": ["selector", "value", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "navigate_to_url",
            "description": "Navigate the browser to a URL. Use this to open links instead of clicking them - more reliable for search results and tracked links.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The full URL or href to navigate to",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of where we are navigating",
                    },
                },
                "required": ["url", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "press_enter",
            "description": "Press the Enter key on an input field to submit a search or form. Use this instead of clicking a search button when possible.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the input field to press Enter on",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of the action",
                    },
                },
                "required": ["selector", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "scroll_page",
            "description": "Scroll the page up or down by a fixed amount",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {
                        "type": "string",
                        "enum": ["up", "down"],
                        "description": "Direction to scroll",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of the scroll action",
                    },
                },
                "required": ["direction", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "select_option",
            "description": "Select an option from a dropdown (<select> element) by its visible text or value",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the <select> element",
                    },
                    "value": {
                        "type": "string",
                        "description": "The option text or value to select",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of what is being selected",
                    },
                },
                "required": ["selector", "value", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "scroll_to_element",
            "description": "Scroll the page until a specific element is visible in the viewport. Use before clicking elements that may be off-screen.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the element to scroll to",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of what we are scrolling to",
                    },
                },
                "required": ["selector", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "copy_text",
            "description": "Copy the text content of an element to the clipboard",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the element whose text to copy",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human readable description of what is being copied",
                    },
                },
                "required": ["selector", "description"],
            },
        },
    },
]


SIMPLE_COMMANDS = [
    (["go back", "back button", "previous page", "navigate back"], "go_back", "Going back to previous page"),
    (["go forward", "forward button", "next page", "navigate forward"], "go_forward", "Going forward"),
    (["reload", "refresh", "relaod"], "reload_page", "Reloading the page"),
]


def run_agent(command: str, dom_structure: dict) -> list:
    # Handle simple navigation commands without LLM to avoid tool calling issues
    command_lower = command.lower()
    for keywords, action_type, description in SIMPLE_COMMANDS:
        if any(kw in command_lower for kw in keywords):
            return [{"type": action_type, "description": description}]

    dom_summary = f"""
Inputs/Forms: {json.dumps(dom_structure.get('inputs', []), indent=2)}
Buttons: {json.dumps(dom_structure.get('buttons', []), indent=2)}
Links (first 10): {json.dumps(dom_structure.get('links', [])[:10], indent=2)}
"""

    prompt = f"""You are an AI agent that controls a web browser on behalf of the user.

The user wants you to perform this action:
"{command}"

Here are all the interactive elements currently available on the page:
{dom_summary}

Use the provided tools to carry out the requested action step by step.
Choose the most appropriate elements based on their text, type, placeholder, and purpose.

IMPORTANT RULES:
- When performing any search action, ALWAYS use fill_input followed immediately by press_enter on the same input element. Never stop after just filling a search box.
- Only use click_element for non-search buttons (like subscribe, login, submit forms, etc.).
- When the user wants to open or navigate to a link, ALWAYS use navigate_to_url with the link's href instead of click_element. Extract the href from the links list provided.
- If you cannot find a suitable element for the requested action, respond with a plain text message explaining why - do NOT call any tools."""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        tools=TOOLS,
        tool_choice="auto",
        timeout=30,
    )

    message = response.choices[0].message

    # No tool calls = model returned a text explanation
    if not message.tool_calls:
        return [{"type": "message", "text": message.content}]

    # Convert tool calls to action list (cap at 10 to prevent runaway sequences)
    actions = []
    for tool_call in message.tool_calls[:10]:
        try:
            args = json.loads(tool_call.function.arguments)
        except (json.JSONDecodeError, ValueError):
            # Skip malformed tool call rather than crashing
            continue
        actions.append({"type": tool_call.function.name, **args})

    if not actions:
        return [{"type": "message", "text": "Could not parse the required actions. Please try rephrasing your command."}]

    return actions
