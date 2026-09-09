import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def ask_gemini(question: str, page_content: str, memory_results: list = [], page_url: str = "", page_title: str = "") -> str:
    trimmed_content = page_content[:12000]

    # Build current page header
    page_header = ""
    if page_title:
        page_header += f"Title: {page_title}\n"
    if page_url:
        page_header += f"URL: {page_url}\n"

    # Build memory context from RAG results
    memory_context = ""
    if memory_results:
        memory_context = "\n\nRELEVANT PAGES FROM YOUR BROWSING HISTORY:\n"
        for item in memory_results:
            memory_context += f"\n[{item['title']} - {item['url']}]\n{item['content']}\n"

    prompt = f"""You are a helpful AI assistant embedded in a browser extension.

CURRENT PAGE:
{page_header}---
{trimmed_content}
---
{memory_context}
Answer the user's question using the current page content and browsing history above.
If the answer is not found in either, say so clearly and answer from general knowledge if relevant.
Keep your answer concise and clear.

User question: {question}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content
