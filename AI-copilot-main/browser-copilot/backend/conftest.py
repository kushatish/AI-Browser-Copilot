"""
Root conftest.py — loaded by pytest before any test collection.

Responsibilities:
1. Add the backend/ directory to sys.path so `services.*` and `routes.*`
   imports resolve correctly when pytest is run from the backend/ directory.
2. Mock heavy external libraries (chromadb, groq) at the sys.modules level
   BEFORE any service module is imported. This prevents real API calls and
   avoids needing live credentials or a running ChromaDB instance in tests.
"""
import sys
import os
from unittest.mock import MagicMock

# ── 1. Path setup ──────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

# ── 2. Mock chromadb ──────────────────────────────────────────────────────────
_mock_collection = MagicMock()
_mock_chromadb = MagicMock()
_mock_chromadb.PersistentClient.return_value.get_or_create_collection.return_value = _mock_collection
sys.modules["chromadb"] = _mock_chromadb

# ── 3. Mock groq ───────────────────────────────────────────────────────────────
_mock_groq_module = MagicMock()
sys.modules["groq"] = _mock_groq_module

# ── 4. Mock python-dotenv (no .env file needed in CI) ─────────────────────────
_mock_dotenv = MagicMock()
sys.modules["dotenv"] = _mock_dotenv
