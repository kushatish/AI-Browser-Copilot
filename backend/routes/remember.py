from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.vectordb import store_page

router = APIRouter()


class RememberRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4096)
    title: str = Field(max_length=1000)
    content: str = Field(max_length=50000)


@router.post("/remember")
def remember(request: RememberRequest):
    try:
        store_page(request.url, request.title, request.content)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"success": True}


@router.delete('/memory')
def delete_memory():
    from services.vectordb import clear_memory
    clear_memory()
    return {'success': True}
