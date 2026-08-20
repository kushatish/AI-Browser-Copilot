from fastapi import APIRouter
from pydantic import BaseModel
from services.agent import run_agent

router = APIRouter()


class AgentRequest(BaseModel):
    command: str
    dom_structure: dict


@router.post("/agent")
def agent(request: AgentRequest):
    actions = run_agent(request.command, request.dom_structure)
    return {"actions": actions}
