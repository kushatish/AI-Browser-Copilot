from fastapi import APIRouter
from pydantic import BaseModel
from services.vectordb import store_page

router = APIRouter()


class RememberRequest(BaseModel):
    url: str
    title: str
    content: str


@router.post("/remember")
def remember(request: RememberRequest):
    store_page(request.url, request.title, request.content)
    return {"success": True}
