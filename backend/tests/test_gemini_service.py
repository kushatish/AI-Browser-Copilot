"""
Unit tests for backend/services/gemini.py (ask_gemini function)

Covers:
- Returns the LLM's text response
- Page content is included and truncated at 12 000 chars
- page_url and page_title appear in the prompt
- Memory results (RAG) are included in the prompt
- Function works with all optional args omitted (backwards compat)
"""
import pytest
from unittest.mock import MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_mock_client(response_text: str = "test answer") -> MagicMock:
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content=response_text))]
    )
    return mock_client


def _capture_prompt(mock_client: MagicMock) -> str:
    """Extract the user prompt string from a recorded Groq client call."""
    return mock_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]


# ── Return value ──────────────────────────────────────────────────────────────

class TestAskGeminiReturn:
    def test_returns_llm_text(self):
        with patch("services.gemini.client", _make_mock_client("The sky is blue.")):
            from services.gemini import ask_gemini
            result = ask_gemini("What color is the sky?", "Some page content")
        assert result == "The sky is blue."

    def test_returns_empty_string_when_llm_returns_empty(self):
        with patch("services.gemini.client", _make_mock_client("")):
            from services.gemini import ask_gemini
            result = ask_gemini("question", "content")
        assert result == ""


# ── Prompt construction ───────────────────────────────────────────────────────

class TestPromptConstruction:
    def test_page_content_included_in_prompt(self):
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("What does this page say?", "Welcome to the jungle")
        assert "Welcome to the jungle" in _capture_prompt(mc)

    def test_question_included_in_prompt(self):
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("What is the price?", "content")
        assert "What is the price?" in _capture_prompt(mc)

    def test_page_url_included_when_provided(self):
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", "content", page_url="https://shop.example.com/item")
        assert "https://shop.example.com/item" in _capture_prompt(mc)

    def test_page_title_included_when_provided(self):
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", "content", page_title="My Awesome Shop")
        assert "My Awesome Shop" in _capture_prompt(mc)

    def test_page_url_and_title_absent_when_not_provided(self):
        """Backwards compat: omitting url/title must not crash or inject garbage."""
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", "content")
        prompt = _capture_prompt(mc)
        # Prompt should build fine and contain the question
        assert "question" in prompt

    def test_memory_results_included_in_prompt(self):
        memory = [
            {"title": "Old Article", "url": "https://old.com", "content": "Once upon a time..."},
        ]
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", "content", memory_results=memory)
        prompt = _capture_prompt(mc)
        assert "Old Article" in prompt
        assert "https://old.com" in prompt
        assert "Once upon a time..." in prompt

    def test_multiple_memory_results_all_included(self):
        memory = [
            {"title": "Page 1", "url": "https://p1.com", "content": "content one"},
            {"title": "Page 2", "url": "https://p2.com", "content": "content two"},
        ]
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", "content", memory_results=memory)
        prompt = _capture_prompt(mc)
        assert "content one" in prompt
        assert "content two" in prompt

    def test_no_memory_section_when_empty(self):
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", "content", memory_results=[])
        prompt = _capture_prompt(mc)
        assert "BROWSING HISTORY" not in prompt


# ── Content truncation ────────────────────────────────────────────────────────

class TestContentTruncation:
    def test_content_truncated_to_12000_chars(self):
        long_content = "A" * 20_000
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", long_content)
        prompt = _capture_prompt(mc)
        # The first 12000 As should be in the prompt
        assert "A" * 12_000 in prompt
        # The characters beyond 12000 should NOT be in the prompt
        # (prompt contains exactly 12000 As, not 20000)
        assert "A" * 12_001 not in prompt

    def test_short_content_not_modified(self):
        content = "Short content."
        mc = _make_mock_client()
        with patch("services.gemini.client", mc):
            from services.gemini import ask_gemini
            ask_gemini("question", content)
        assert "Short content." in _capture_prompt(mc)
