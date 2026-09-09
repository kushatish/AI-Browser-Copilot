import chromadb
import time

# PersistentClient stores embeddings to disk - survives backend restarts
client = chromadb.PersistentClient(path="./chroma_data")

collection = client.get_or_create_collection(name="pages")


def store_page(url: str, title: str, content: str):
    # Upsert so revisiting the same URL updates instead of duplicating
    collection.upsert(
        documents=[content],
        metadatas=[{"url": url, "title": title, "visited_at": int(time.time())}],
        ids=[url],
    )


def search_pages(query: str, n_results: int = 3):
    count = collection.count()
    if count == 0:
        return []

    # Don't request more results than documents stored
    actual_n = min(n_results, count)

    results = collection.query(
        query_texts=[query],
        n_results=actual_n,
    )

    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]

    return [
        {
            "content": doc[:4000],
            "title": meta.get("title", ""),
            "url": meta.get("url", ""),
            "visited_at": meta.get("visited_at", 0),
        }
        for doc, meta in zip(docs, metas)
    ]
