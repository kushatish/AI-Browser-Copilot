from fastapi import APIRouter
from pydantic import BaseModel, Field
from services.gemini import ask_gemini
from services.vectordb import search_pages

router = APIRouter()


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    page_content: str = Field(max_length=50000)
    page_url: str = ""
    page_title: str = ""


@router.post("/ask")
def ask(request: AskRequest):
    # Search memory for relevant pages from browsing history
    memory_results = search_pages(request.question, n_results=3)

    answer = ask_gemini(
        request.question,
        request.page_content,
        memory_results,
        page_url=request.page_url,
        page_title=request.page_title,
    )
    return {"answer": answer}
