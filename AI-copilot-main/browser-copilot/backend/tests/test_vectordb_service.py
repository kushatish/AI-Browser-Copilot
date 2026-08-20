"""
Unit tests for backend/services/vectordb.py

Covers:
- store_page upserts with url as id and includes visited_at timestamp
- search_pages returns [] when collection is empty
- search_pages returns formatted results with all expected fields
- search_pages caps n_results to actual collection count
- search_pages truncates long document content to 4000 chars
"""
import pytest
from unittest.mock import MagicMock, patch, call


# ── store_page ────────────────────────────────────────────────────────────────

class TestStorePage:
    def test_upsert_called_with_correct_args(self):
        with patch("services.vectordb.collection") as mock_col, \
             patch("services.vectordb.time") as mock_time:
            mock_time.time.return_value = 1_700_000_000
            from services.vectordb import store_page
            store_page("https://example.com", "Example Title", "some page content")

        mock_col.upsert.assert_called_once_with(
            documents=["some page content"],
            metadatas=[{
                "url": "https://example.com",
                "title": "Example Title",
                "visited_at": 1_700_000_000,
            }],
            ids=["https://example.com"],
        )

    def test_url_used_as_id_for_deduplication(self):
        """Same URL visited twice should produce the same id, causing an upsert."""
        with patch("services.vectordb.collection") as mock_col, \
             patch("services.vectordb.time"):
            from services.vectordb import store_page
            store_page("https://same.com", "Title", "content v1")
            store_page("https://same.com", "Title", "content v2")

        assert mock_col.upsert.call_count == 2
        ids_used = [c.kwargs["ids"] for c in mock_col.upsert.call_args_list]
        assert ids_used[0] == ids_used[1] == ["https://same.com"]

    def test_timestamp_recorded(self):
        with patch("services.vectordb.collection"), \
             patch("services.vectordb.time") as mock_time:
            mock_time.time.return_value = 9999
            from services.vectordb import store_page
            store_page("https://x.com", "X", "content")

        # Can't assert on collection directly here (already asserted above),
        # but we verify time.time() was called
        mock_time.time.assert_called()


# ── search_pages ──────────────────────────────────────────────────────────────

class TestSearchPages:
    def test_returns_empty_when_collection_is_empty(self):
        with patch("services.vectordb.collection") as mock_col:
            mock_col.count.return_value = 0
            from services.vectordb import search_pages
            result = search_pages("what is this?")

        assert result == []
        mock_col.query.assert_not_called()

    def test_returns_formatted_results(self):
        with patch("services.vectordb.collection") as mock_col:
            mock_col.count.return_value = 2
            mock_col.query.return_value = {
                "documents": [["content of page A", "content of page B"]],
                "metadatas": [[
                    {"title": "Page A", "url": "https://a.com", "visited_at": 1000},
                    {"title": "Page B", "url": "https://b.com", "visited_at": 2000},
                ]],
            }
            from services.vectordb import search_pages
            results = search_pages("query", n_results=3)

        assert len(results) == 2
        assert results[0] == {
            "content": "content of page A",
            "title": "Page A",
            "url": "https://a.com",
            "visited_at": 1000,
        }
        assert results[1] == {
            "content": "content of page B",
            "title": "Page B",
            "url": "https://b.com",
            "visited_at": 2000,
        }

    def test_n_results_capped_to_collection_count(self):
        """Don't request more results than documents actually stored."""
        with patch("services.vectordb.collection") as mock_col:
            mock_col.count.return_value = 1
            mock_col.query.return_value = {
                "documents": [["only doc"]],
                "metadatas": [[{"title": "T", "url": "u", "visited_at": 0}]],
            }
            from services.vectordb import search_pages
            search_pages("query", n_results=10)

        mock_col.query.assert_called_once_with(query_texts=["query"], n_results=1)

    def test_document_content_truncated_to_4000_chars(self):
        long_doc = "Z" * 8000
        with patch("services.vectordb.collection") as mock_col:
            mock_col.count.return_value = 1
            mock_col.query.return_value = {
                "documents": [[long_doc]],
                "metadatas": [[{"title": "Long", "url": "https://long.com", "visited_at": 0}]],
            }
            from services.vectordb import search_pages
            results = search_pages("query")

        assert len(results[0]["content"]) == 4000

    def test_missing_metadata_fields_default_to_empty(self):
        """Handles pages stored without title/url/visited_at in metadata."""
        with patch("services.vectordb.collection") as mock_col:
            mock_col.count.return_value = 1
            mock_col.query.return_value = {
                "documents": [["content"]],
                "metadatas": [[{}]],   # no title, url, visited_at
            }
            from services.vectordb import search_pages
            results = search_pages("query")

        assert results[0]["title"] == ""
        assert results[0]["url"] == ""
        assert results[0]["visited_at"] == 0

    def test_query_text_forwarded_correctly(self):
        with patch("services.vectordb.collection") as mock_col:
            mock_col.count.return_value = 3
            mock_col.query.return_value = {"documents": [[]], "metadatas": [[]]}
            from services.vectordb import search_pages
            search_pages("find me python docs", n_results=2)

        mock_col.query.assert_called_once_with(
            query_texts=["find me python docs"],
            n_results=2,
        )
