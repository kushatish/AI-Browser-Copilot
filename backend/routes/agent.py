from fastapi import APIRouter
from pydantic import BaseModel, Field
from services.agent import run_agent

router = APIRouter()


class AgentRequest(BaseModel):
    command: str = Field(min_length=1, max_length=2000)
    dom_structure: dict
    history: list[dict] = Field(default_factory=list, max_length=15)


@router.post("/agent")
def agent(request: AgentRequest):
    actions = run_agent(request.command, request.dom_structure, request.history)
    return {"actions": actions}
