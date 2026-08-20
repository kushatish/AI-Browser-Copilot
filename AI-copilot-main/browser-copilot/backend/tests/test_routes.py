"""
Integration-style tests for the FastAPI routes.

Uses FastAPI's TestClient (synchronous) with all external service calls mocked,
so no real Groq API or ChromaDB instance is needed.

Covers:
- GET /health
- POST /ask  (with and without optional fields)
- POST /remember
- POST /agent
- 422 Unprocessable Entity on missing required fields
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Create a TestClient once for all tests in this module."""
    from main import app
    return TestClient(app)


# ── /health ───────────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_returns_ok_status(self, client):
        resp = client.get("/health")
        assert resp.json() == {"status": "ok"}


# ── /ask ──────────────────────────────────────────────────────────────────────

class TestAskEndpoint:
    def test_basic_ask_returns_answer(self, client):
        with patch("routes.ask.search_pages", return_value=[]), \
             patch("routes.ask.ask_gemini", return_value="Paris."):
            resp = client.post("/ask", json={
                "question": "What is the capital of France?",
                "page_content": "France is a country in Europe.",
            })
        assert resp.status_code == 200
        assert resp.json() == {"answer": "Paris."}

    def test_ask_with_url_and_title(self, client):
        with patch("routes.ask.search_pages", return_value=[]) as _search, \
             patch("routes.ask.ask_gemini", return_value="ok") as mock_gemini:
            resp = client.post("/ask", json={
                "question": "What does this page sell?",
                "page_content": "We sell widgets.",
                "page_url": "https://widgets.example.com",
                "page_title": "Widget Store",
            })
        assert resp.status_code == 200
        # Verify url and title are forwarded to the LLM function
        _, kwargs = mock_gemini.call_args
        assert kwargs.get("page_url") == "https://widgets.example.com"
        assert kwargs.get("page_title") == "Widget Store"

    def test_ask_memory_results_forwarded(self, client):
        memory = [{"title": "T", "url": "u", "content": "c", "visited_at": 0}]
        with patch("routes.ask.search_pages", return_value=memory) as mock_search, \
             patch("routes.ask.ask_gemini", return_value="answer") as mock_gemini:
            client.post("/ask", json={"question": "q", "page_content": "p"})
        mock_search.assert_called_once_with("q", n_results=3)
        # memory should be the third positional arg
        args = mock_gemini.call_args.args
        assert args[2] == memory

    def test_ask_missing_question_returns_422(self, client):
        resp = client.post("/ask", json={"page_content": "content"})
        assert resp.status_code == 422

    def test_ask_missing_page_content_returns_422(self, client):
        resp = client.post("/ask", json={"question": "what?"})
        assert resp.status_code == 422

    def test_ask_page_url_optional(self, client):
        """page_url and page_title are optional — request without them must succeed."""
        with patch("routes.ask.search_pages", return_value=[]), \
             patch("routes.ask.ask_gemini", return_value="ok"):
            resp = client.post("/ask", json={
                "question": "What?",
                "page_content": "Something.",
            })
        assert resp.status_code == 200


# ── /remember ─────────────────────────────────────────────────────────────────

class TestRememberEndpoint:
    def test_remember_stores_page(self, client):
        with patch("routes.remember.store_page") as mock_store:
            resp = client.post("/remember", json={
                "url": "https://example.com",
                "title": "Example",
                "content": "Hello world",
            })
        assert resp.status_code == 200
        assert resp.json() == {"success": True}
        mock_store.assert_called_once_with("https://example.com", "Example", "Hello world")

    def test_remember_missing_url_returns_422(self, client):
        resp = client.post("/remember", json={"title": "T", "content": "c"})
        assert resp.status_code == 422

    def test_remember_missing_title_returns_422(self, client):
        resp = client.post("/remember", json={"url": "https://x.com", "content": "c"})
        assert resp.status_code == 422

    def test_remember_missing_content_returns_422(self, client):
        resp = client.post("/remember", json={"url": "https://x.com", "title": "T"})
        assert resp.status_code == 422


# ── /agent ────────────────────────────────────────────────────────────────────

class TestAgentEndpoint:
    def test_agent_returns_actions(self, client):
        actions = [{"type": "go_back", "description": "Going back to previous page"}]
        with patch("routes.agent.run_agent", return_value=actions):
            resp = client.post("/agent", json={"command": "go back", "dom_structure": {}})
        assert resp.status_code == 200
        assert resp.json() == {"actions": actions}

    def test_agent_forwards_command_and_dom(self, client):
        with patch("routes.agent.run_agent", return_value=[]) as mock_run:
            client.post("/agent", json={
                "command": "click the login button",
                "dom_structure": {"buttons": [{"text": "Login", "selector": "#login"}]},
            })
        mock_run.assert_called_once_with(
            "click the login button",
            {"buttons": [{"text": "Login", "selector": "#login"}]},
        )

    def test_agent_message_action_passed_through(self, client):
        """When the LLM returns a message (no tool calls), it is passed through as-is."""
        with patch("routes.agent.run_agent", return_value=[{"type": "message", "text": "I cannot find it."}]):
            resp = client.post("/agent", json={"command": "something", "dom_structure": {}})
        assert resp.status_code == 200
        assert resp.json()["actions"][0]["type"] == "message"

    def test_agent_missing_command_returns_422(self, client):
        resp = client.post("/agent", json={"dom_structure": {}})
        assert resp.status_code == 422

    def test_agent_missing_dom_structure_returns_422(self, client):
        resp = client.post("/agent", json={"command": "click"})
        assert resp.status_code == 422
