import json
import os
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from mcp_protocol import DeadlineRescueMCPServer, MCP_PROTOCOL_VERSION, ToolInputError
from scheduler import build_schedule, analyze_deadline_risks, recover_schedule


# --------------------------------------------------
# APPLICATION CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(
    os.environ.get("DEADLINE_RESCUE_DATABASE_PATH", BASE_DIR / "deadline_rescue.db")
)

app = FastAPI(
    title="Deadline Rescue API",
    description="A deadline-aware task scheduling and recovery engine.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["MCP-Protocol-Version"],
)


# --------------------------------------------------
# DATABASE
# --------------------------------------------------

def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                project TEXT NOT NULL DEFAULT 'Personal',
                deadline TEXT NOT NULL,
                estimated_minutes INTEGER NOT NULL,
                priority TEXT NOT NULL DEFAULT 'medium',
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT ''
            )
            """
        )
        existing_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(tasks)").fetchall()
        }
        if "project" not in existing_columns:
            connection.execute(
                "ALTER TABLE tasks ADD COLUMN project TEXT NOT NULL DEFAULT 'Personal'"
            )
        if "updated_at" not in existing_columns:
            connection.execute(
                "ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''"
            )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS recovery_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                disruption_minutes INTEGER NOT NULL,
                available_minutes INTEGER NOT NULL,
                recovery_start TEXT NOT NULL,
                created_at TEXT NOT NULL,
                result_json TEXT NOT NULL
            )
            """
        )


initialize_database()


# --------------------------------------------------
# DATA MODELS
# --------------------------------------------------

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    project: str = Field(default="Personal", min_length=1, max_length=100)
    deadline: datetime
    estimated_minutes: int = Field(gt=0, le=10080)
    priority: str = "medium"

    @field_validator("priority")
    @classmethod
    def normalize_priority(cls, value: str) -> str:
        priority = str(value).lower().strip()
        if priority not in VALID_PRIORITIES:
            raise ValueError("Priority must be low, medium, high, or urgent.")
        return priority


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    project: Optional[str] = Field(default=None, min_length=1, max_length=100)
    deadline: Optional[datetime] = None
    estimated_minutes: Optional[int] = Field(default=None, gt=0, le=10080)
    priority: Optional[str] = None
    completed: Optional[bool] = None

    @field_validator("priority")
    @classmethod
    def normalize_priority(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        priority = str(value).lower().strip()
        if priority not in VALID_PRIORITIES:
            raise ValueError("Priority must be low, medium, high, or urgent.")
        return priority


# --------------------------------------------------
# HELPERS
# --------------------------------------------------

VALID_PRIORITIES = {"low", "medium", "high", "urgent"}


def validate_priority(priority: str):
    if priority not in VALID_PRIORITIES:
        raise HTTPException(
            status_code=422,
            detail="Priority must be low, medium, high, or urgent.",
        )


def serialize_task(row):
    task = dict(row)
    task["completed"] = bool(task["completed"])
    task["project"] = task.get("project") or "Personal"
    return task


def fetch_open_tasks() -> List[Dict[str, Any]]:
    """Return unfinished tasks in the scheduler's plain-dictionary format."""
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM tasks WHERE completed = 0 ORDER BY deadline ASC, id ASC"
        ).fetchall()
    return [serialize_task(row) for row in rows]


def fetch_all_tasks() -> List[Dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM tasks ORDER BY completed ASC, deadline ASC, id ASC"
        ).fetchall()
    return [serialize_task(row) for row in rows]


def get_task_or_404(task_id: int) -> Dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return serialize_task(row)


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "success": True,
        "message": "Deadline Rescue API is running.",
        "version": "0.1.0",
    }


@app.get("/api/health")
def health_check():
    return {
        "success": True,
        "status": "healthy",
        "database": "sqlite",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# --------------------------------------------------
# TASK MANAGEMENT
# --------------------------------------------------

@app.get("/api/tasks")
def list_tasks():
    tasks = fetch_all_tasks()

    return {
        "success": True,
        "count": len(tasks),
        "tasks": tasks,
    }


@app.post("/api/tasks", status_code=201)
def create_task(task: TaskCreate):
    title = task.title.strip()

    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty.")

    validate_priority(task.priority)

    timestamp = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO tasks (
                title,
                description,
                project,
                deadline,
                estimated_minutes,
                priority,
                completed,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (
                title,
                task.description,
                task.project.strip(),
                task.deadline.isoformat(),
                task.estimated_minutes,
                task.priority,
                timestamp,
                timestamp,
            ),
        )

        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()

    return {"success": True, "task": serialize_task(row)}


@app.get("/api/tasks/{task_id}")
def get_task(task_id: int):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    return {"success": True, "task": serialize_task(row)}


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, updates: TaskUpdate):
    changes = updates.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided.")

    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(
                status_code=422,
                detail="Title cannot be empty.",
            )

    if "project" in changes:
        changes["project"] = changes["project"].strip()
        if not changes["project"]:
            raise HTTPException(status_code=422, detail="Project cannot be empty.")

    if "priority" in changes:
        validate_priority(changes["priority"])

    if "deadline" in changes:
        changes["deadline"] = changes["deadline"].isoformat()

    if "completed" in changes:
        changes["completed"] = int(changes["completed"])

    changes["updated_at"] = datetime.now(timezone.utc).isoformat()

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(status_code=404, detail="Task not found.")

        assignments = ", ".join(f"{key} = ?" for key in changes)
        values = list(changes.values()) + [task_id]

        connection.execute(
            f"UPDATE tasks SET {assignments} WHERE id = ?",
            values,
        )

        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

    return {"success": True, "task": serialize_task(row)}


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM tasks WHERE id = ?",
            (task_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found.")

    return {
        "success": True,
        "message": f"Task {task_id} deleted.",
    }
# --------------------------------------------------
# SCHEDULING ENGINE API
# --------------------------------------------------

@app.get("/api/schedule")
def generate_schedule(available_minutes: int = 240):
    """Generate a schedule using the user's available work time."""

    if available_minutes < 0 or available_minutes > 10080:
        raise HTTPException(
            status_code=422,
            detail="Available minutes must be between 0 and 10080.",
        )

    tasks = fetch_open_tasks()

    try:
        result = build_schedule(
            tasks=tasks,
            available_minutes=available_minutes,
        )
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail=str(error))

    return {
        "success": True,
        "result": result,
    }


@app.get("/api/deadline-risks")
def get_deadline_risks():
    """Identify tasks with overdue or approaching deadlines."""

    tasks = fetch_open_tasks()

    try:
        risks = analyze_deadline_risks(tasks)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail=str(error))

    return {
        "success": True,
        "count": len(risks),
        "risks": risks,
    }


class RecoveryRequest(BaseModel):
    disruption_minutes: int = Field(ge=0, le=10080)
    available_minutes: int = Field(ge=0, le=10080)


def save_recovery_event(result: Dict[str, Any]) -> int:
    """Persist recovery context so subsequent sessions can explain what changed."""
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO recovery_events (
                disruption_minutes,
                available_minutes,
                recovery_start,
                created_at,
                result_json
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                result["disruption_minutes"],
                result["available_minutes_before_disruption"],
                result["recovery_start"],
                datetime.now(timezone.utc).isoformat(),
                json.dumps(result),
            ),
        )
    return int(cursor.lastrowid)


def fetch_recovery_history(limit: int = 10) -> List[Dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, disruption_minutes, available_minutes, recovery_start, created_at, result_json
            FROM recovery_events
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    history = []
    for row in rows:
        event = dict(row)
        result = json.loads(event.pop("result_json"))
        history.append({
            **event,
            "scheduled_count": result["schedule"]["scheduled_count"],
            "unscheduled_count": result["schedule"]["unscheduled_count"],
            "risk_count": len(result["deadline_risks"]),
        })
    return history


@app.post("/api/recover")
def recover_after_disruption(request: RecoveryRequest):
    """Rebuild the schedule after an unexpected interruption."""

    tasks = fetch_open_tasks()

    try:
        result = recover_schedule(
            tasks=tasks,
            disruption_minutes=request.disruption_minutes,
            available_minutes=request.available_minutes,
        )
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=422, detail=str(error))

    result["recovery_event_id"] = save_recovery_event(result)
    return result


@app.get("/api/recovery-history")
def get_recovery_history(limit: int = 10):
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=422, detail="Limit must be between 1 and 50.")
    history = fetch_recovery_history(limit)
    return {"success": True, "count": len(history), "events": history}


# --------------------------------------------------
# MODEL CONTEXT PROTOCOL (MCP)
# --------------------------------------------------

# This endpoint is deliberately stateless: task and recovery context belongs in
# SQLite, so a client can reconnect without a server-side in-memory session.
MCP_TOOLS = [
    {
        "name": "list_tasks",
        "description": "Read the persistent Deadline Rescue task list, including completion state and deadlines.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "create_task",
        "description": "Create a persistent task for the user. Deadlines must be ISO 8601 datetimes.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "minLength": 1, "maxLength": 200},
                "project": {"type": "string", "maxLength": 100},
                "description": {"type": "string", "maxLength": 2000},
                "deadline": {"type": "string", "format": "date-time"},
                "estimated_minutes": {"type": "integer", "minimum": 1, "maximum": 10080},
                "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
            },
            "required": ["title", "deadline", "estimated_minutes", "priority"],
            "additionalProperties": False,
        },
    },
    {
        "name": "set_task_status",
        "description": "Mark an existing task complete or incomplete.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "minimum": 1},
                "completed": {"type": "boolean"},
            },
            "required": ["task_id", "completed"],
            "additionalProperties": False,
        },
    },
    {
        "name": "build_focus_plan",
        "description": "Build a deadline-aware focus plan from unfinished persistent tasks.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "available_minutes": {"type": "integer", "minimum": 0, "maximum": 10080},
            },
            "required": ["available_minutes"],
            "additionalProperties": False,
        },
    },
    {
        "name": "recover_from_disruption",
        "description": "Replan after an interruption and persist a recovery event for later context.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "available_minutes": {"type": "integer", "minimum": 0, "maximum": 10080},
                "disruption_minutes": {"type": "integer", "minimum": 0, "maximum": 10080},
            },
            "required": ["available_minutes", "disruption_minutes"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_deadline_risks",
        "description": "Identify unfinished tasks whose deadlines are overdue or do not leave enough working time.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_recovery_history",
        "description": "Read recent saved recovery events to preserve planning context across sessions.",
        "inputSchema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}},
            "additionalProperties": False,
        },
    },
]


def tool_integer(arguments: Dict[str, Any], key: str, minimum: int = 0) -> int:
    value = arguments.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ToolInputError(f"{key} must be an integer greater than or equal to {minimum}.")
    if value > 10080:
        raise ToolInputError(f"{key} must be no more than 10080.")
    return value


def mcp_list_tasks(_: Dict[str, Any]) -> Dict[str, Any]:
    tasks = fetch_all_tasks()
    return {"count": len(tasks), "tasks": tasks}


def mcp_create_task(arguments: Dict[str, Any]) -> Dict[str, Any]:
    try:
        task = TaskCreate.model_validate(arguments)
    except Exception as error:
        raise ToolInputError(f"Invalid task: {error}")
    return create_task(task)


def mcp_set_task_status(arguments: Dict[str, Any]) -> Dict[str, Any]:
    task_id = tool_integer(arguments, "task_id", 1)
    completed = arguments.get("completed")
    if not isinstance(completed, bool):
        raise ToolInputError("completed must be a boolean.")
    try:
        return update_task(task_id, TaskUpdate(completed=completed))
    except HTTPException as error:
        raise ToolInputError(str(error.detail))


def mcp_build_focus_plan(arguments: Dict[str, Any]) -> Dict[str, Any]:
    available_minutes = tool_integer(arguments, "available_minutes")
    tasks = fetch_open_tasks()
    schedule = build_schedule(tasks, available_minutes)
    return {
        "available_minutes": available_minutes,
        "schedule": schedule,
        "deadline_risks": analyze_deadline_risks(tasks),
    }


def mcp_recover_from_disruption(arguments: Dict[str, Any]) -> Dict[str, Any]:
    available_minutes = tool_integer(arguments, "available_minutes")
    disruption_minutes = tool_integer(arguments, "disruption_minutes")
    return recover_after_disruption(
        RecoveryRequest(
            available_minutes=available_minutes,
            disruption_minutes=disruption_minutes,
        )
    )


def mcp_get_deadline_risks(_: Dict[str, Any]) -> Dict[str, Any]:
    risks = analyze_deadline_risks(fetch_open_tasks())
    return {"count": len(risks), "risks": risks}


def mcp_get_recovery_history(arguments: Dict[str, Any]) -> Dict[str, Any]:
    limit = arguments.get("limit", 10)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 50:
        raise ToolInputError("limit must be an integer between 1 and 50.")
    history = fetch_recovery_history(limit)
    return {"count": len(history), "events": history}


mcp_server = DeadlineRescueMCPServer(
    tools=MCP_TOOLS,
    handlers={
        "list_tasks": mcp_list_tasks,
        "create_task": mcp_create_task,
        "set_task_status": mcp_set_task_status,
        "build_focus_plan": mcp_build_focus_plan,
        "recover_from_disruption": mcp_recover_from_disruption,
        "get_deadline_risks": mcp_get_deadline_risks,
        "get_recovery_history": mcp_get_recovery_history,
    },
)


MCP_HEADERS = {"MCP-Protocol-Version": MCP_PROTOCOL_VERSION}


def get_allowed_mcp_origins():
    configured = os.environ.get("MCP_ALLOWED_ORIGINS", "")
    if configured.strip():
        return {
            origin.strip().rstrip("/")
            for origin in configured.split(",")
            if origin.strip()
        }

    return {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }




@app.post("/mcp")
async def mcp_streamable_http(request: Request):
    """Serve JSON-RPC over MCP Streamable HTTP in stateless JSON response mode."""
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in get_allowed_mcp_origins():
        return JSONResponse(
            status_code=403,
            content={
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32600,
                    "message": "Forbidden: untrusted Origin.",
                },
            },
            headers=MCP_HEADERS,
        )
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type:
        return JSONResponse(
            status_code=415,
            content={"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Content-Type must be application/json."}},
            headers=MCP_HEADERS,
        )

    accept = request.headers.get("accept", "")
    if "application/json" not in accept and "*/*" not in accept:
        return Response(status_code=406, headers=MCP_HEADERS)

    try:
        message = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            headers=MCP_HEADERS,
        )

    response = mcp_server.handle(message)
    if response is None:
        return Response(status_code=202, headers=MCP_HEADERS)
    return JSONResponse(content=response, headers=MCP_HEADERS)


@app.get("/mcp")
async def mcp_get_stream(_: Request):
    """This stateless server has no server-initiated event stream."""
    return Response(status_code=405, headers={**MCP_HEADERS, "Allow": "POST"})
