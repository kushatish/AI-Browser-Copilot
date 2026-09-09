"""
Unit tests for backend/services/agent.py

Covers:
- Simple keyword command detection (no LLM call)
- Normal command → Groq tool-call path (mocked)
- Malformed JSON in tool arguments is skipped gracefully
- Empty-after-skip actions returns a message action
- No tool calls from LLM returns a message action
- Action list is capped at 10 items
"""
import json
import pytest
from unittest.mock import MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_tool_call(name: str, args: dict) -> MagicMock:
    """Build a mock Groq tool-call object."""
    tc = MagicMock()
    tc.function.name = name
    tc.function.arguments = json.dumps(args)
    return tc


def make_groq_response(tool_calls=None, text_content=None) -> MagicMock:
    """Build a mock Groq chat-completion response."""
    message = MagicMock()
    message.tool_calls = tool_calls
    message.content = text_content
    response = MagicMock()
    response.choices = [MagicMock(message=message)]
    return response


# ── Simple keyword detection (no LLM) ────────────────────────────────────────

class TestSimpleCommands:
    def test_go_back(self):
        from services.agent import run_agent
        result = run_agent("go back", {})
        assert result == [{"type": "go_back", "description": "Going back to previous page"}]

    def test_go_back_variant(self):
        from services.agent import run_agent
        result = run_agent("click the back button please", {})
        assert result == [{"type": "go_back", "description": "Going back to previous page"}]

    def test_go_forward(self):
        from services.agent import run_agent
        result = run_agent("navigate forward", {})
        assert result == [{"type": "go_forward", "description": "Going forward"}]

    def test_reload(self):
        from services.agent import run_agent
        result = run_agent("please reload the page", {})
        assert result == [{"type": "reload_page", "description": "Reloading the page"}]

    def test_refresh(self):
        from services.agent import run_agent
        result = run_agent("refresh", {})
        assert result == [{"type": "reload_page", "description": "Reloading the page"}]

    def test_user_typo_relaod(self):
        """'relaod' is an intentional typo keyword to catch common user mistakes."""
        from services.agent import run_agent
        result = run_agent("relaod", {})
        assert result == [{"type": "reload_page", "description": "Reloading the page"}]

    def test_case_insensitive(self):
        from services.agent import run_agent
        result = run_agent("GO BACK", {})
        assert result == [{"type": "go_back", "description": "Going back to previous page"}]

    def test_non_matching_goes_to_llm(self):
        """Commands that don't match keywords should reach the Groq API."""
        mock_response = make_groq_response(
            tool_calls=[make_tool_call("click_element", {"selector": "#btn", "description": "Click"})]
        )
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = mock_response
            from services.agent import run_agent
            run_agent("click the subscribe button", {"buttons": []})
        mock_client.chat.completions.create.assert_called_once()


# ── LLM tool-call path ────────────────────────────────────────────────────────

class TestLLMToolCalls:
    def test_single_tool_call_returned(self):
        tc = make_tool_call("click_element", {"selector": "#search-btn", "description": "Click search"})
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(tool_calls=[tc])
            from services.agent import run_agent
            result = run_agent("click the search button", {})
        assert len(result) == 1
        assert result[0]["type"] == "click_element"
        assert result[0]["selector"] == "#search-btn"
        assert result[0]["description"] == "Click search"

    def test_fill_input_action(self):
        tc = make_tool_call("fill_input", {"selector": "#q", "value": "cats", "description": "Search for cats"})
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(tool_calls=[tc])
            from services.agent import run_agent
            result = run_agent("search for cats", {"inputs": [{"selector": "#q"}]})
        assert result[0]["type"] == "fill_input"
        assert result[0]["value"] == "cats"

    def test_multiple_tool_calls_returned(self):
        tool_calls = [
            make_tool_call("fill_input", {"selector": "#q", "value": "dogs", "description": "Type dogs"}),
            make_tool_call("press_enter", {"selector": "#q", "description": "Submit search"}),
        ]
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(tool_calls=tool_calls)
            from services.agent import run_agent
            result = run_agent("search for dogs", {})
        assert len(result) == 2
        assert result[0]["type"] == "fill_input"
        assert result[1]["type"] == "press_enter"

    def test_no_tool_calls_returns_message_action(self):
        """When the LLM responds with plain text instead of a tool call."""
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(
                tool_calls=None, text_content="I could not find that element on the page."
            )
            from services.agent import run_agent
            result = run_agent("click the invisible button", {})
        assert len(result) == 1
        assert result[0]["type"] == "message"
        assert result[0]["text"] == "I could not find that element on the page."

    def test_action_list_capped_at_10(self):
        """The agent should never return more than 10 actions."""
        tool_calls = [
            make_tool_call("scroll_page", {"direction": "down", "description": f"scroll {i}"})
            for i in range(15)
        ]
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(tool_calls=tool_calls)
            from services.agent import run_agent
            result = run_agent("scroll down many times", {})
        assert len(result) == 10

    def test_groq_timeout_parameter_passed(self):
        """Ensure the timeout=30 parameter is forwarded to the Groq API call."""
        tc = make_tool_call("scroll_page", {"direction": "down", "description": "scroll"})
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(tool_calls=[tc])
            from services.agent import run_agent
            run_agent("scroll down", {})
        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs.get("timeout") == 30


# ── Malformed JSON handling ───────────────────────────────────────────────────

class TestMalformedJSON:
    def test_malformed_json_skipped_single(self):
        """A single malformed tool call should return the fallback message action."""
        tc = MagicMock()
        tc.function.name = "click_element"
        tc.function.arguments = "not valid json {"
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(tool_calls=[tc])
            from services.agent import run_agent
            result = run_agent("do something", {})
        assert len(result) == 1
        assert result[0]["type"] == "message"

    def test_malformed_json_skipped_partial(self):
        """Valid tool calls are kept even if other tool calls in the same response are malformed."""
        bad_tc = MagicMock()
        bad_tc.function.name = "click_element"
        bad_tc.function.arguments = "{invalid"
        good_tc = make_tool_call("scroll_page", {"direction": "down", "description": "scroll"})
        with patch("services.agent.client") as mock_client:
            mock_client.chat.completions.create.return_value = make_groq_response(
                tool_calls=[bad_tc, good_tc]
            )
            from services.agent import run_agent
            result = run_agent("scroll down", {})
        # Only the valid action survives
        assert len(result) == 1
        assert result[0]["type"] == "scroll_page"
