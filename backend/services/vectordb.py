"""Persistent passage memory; replacing a URL removes its stale chunks."""
import time
import hashlib
import threading
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import chromadb

client = chromadb.PersistentClient(path=str(Path(__file__).resolve().parents[1] / 'chroma_data'))
collection = client.get_or_create_collection(name='pages')
_lock = threading.RLock()


def canonical_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise ValueError('Only HTTP(S) page URLs are supported')
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ''))


def store_page(url: str, title: str, content: str):
    url = canonical_url(url)
    text = ' '.join(content.split())[:50000]
    chunks = [text[i:i + 1500] for i in range(0, len(text), 1250)]
    with _lock:
        collection.delete(where={'url': url})
        if not chunks:
            return
        digest = hashlib.sha256(url.encode()).hexdigest()
        collection.upsert(
            documents=chunks,
            metadatas=[{'url': url, 'title': title, 'visited_at': int(time.time()), 'chunk': i} for i in range(len(chunks))],
            ids=[f'{digest}:{i}' for i in range(len(chunks))],
        )


def search_pages(query: str, n_results: int = 3):
    with _lock:
        count = collection.count()
        if count == 0:
            return []
        results = collection.query(query_texts=[query], n_results=min(n_results, count))
    docs = results.get('documents', [[]])[0]
    metas = results.get('metadatas', [[]])[0]
    return [{'content': doc[:4000], 'title': meta.get('title', ''), 'url': meta.get('url', ''),
             'visited_at': meta.get('visited_at', 0)} for doc, meta in zip(docs, metas)]


def clear_memory():
    with _lock:
        collection.delete(where={'visited_at': {'$gte': 0}})
