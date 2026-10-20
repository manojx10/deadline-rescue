"""Task and health endpoint contracts exercised against disposable SQLite."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

import main


def test_health_and_task_crud_contract():
    client = TestClient(main.app)
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["success"] is True
    assert health.json()["status"] == "healthy"
    assert health.json()["database"] == "sqlite"
    assert "timestamp" in health.json()

    payload = {
        "title": "Verify API contract",
        "description": "Create, read, update, and delete it",
        "project": "Deadline Rescue",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "estimated_minutes": 25,
        "priority": "high",
    }
    created = client.post("/api/tasks", json=payload)
    assert created.status_code == 201
    task = created.json()["task"]
    assert created.json()["success"] is True
    assert task["completed"] is False

    listed = client.get("/api/tasks")
    assert listed.status_code == 200
    assert listed.json()["count"] == 1
    assert listed.json()["tasks"] == [task]

    fetched = client.get(f"/api/tasks/{task['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["task"] == task

    schedule = client.get("/api/schedule", params={"available_minutes": 60})
    assert schedule.status_code == 200
    assert schedule.json()["success"] is True
    assert schedule.json()["result"]["scheduled_count"] == 1

    risks = client.get("/api/deadline-risks")
    assert risks.status_code == 200
    assert risks.json()["success"] is True
    assert isinstance(risks.json()["risks"], list)

    recovery = client.post(
        "/api/recover",
        json={"disruption_minutes": 10, "available_minutes": 60},
    )
    assert recovery.status_code == 200
    assert recovery.json()["success"] is True
    assert recovery.json()["recovery_event_id"] > 0

    recovery_history = client.get("/api/recovery-history")
    assert recovery_history.status_code == 200
    assert recovery_history.json()["count"] == 1

    updated = client.patch(
        f"/api/tasks/{task['id']}",
        json={"priority": "urgent", "completed": True},
    )
    assert updated.status_code == 200
    assert updated.json()["task"]["priority"] == "urgent"
    assert updated.json()["task"]["completed"] is True

    deleted = client.delete(f"/api/tasks/{task['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["success"] is True
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_create_task_rejects_a_blank_project():
    client = TestClient(main.app)
    response = client.post(
        "/api/tasks",
        json={
            "title": "Missing project",
            "project": "   ",
            "deadline": datetime(2026, 10, 20, 17, 0, tzinfo=timezone.utc).isoformat(),
            "estimated_minutes": 10,
            "priority": "medium",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Project cannot be empty."


def test_task_api_rejects_undeclared_fields():
    client = TestClient(main.app)
    response = client.post(
        "/api/tasks",
        json={
            "title": "Schema validation",
            "deadline": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "estimated_minutes": 15,
            "priority": "medium",
            "unexpected": "must not be silently ignored",
        },
    )

    assert response.status_code == 422
    assert any(
        error["loc"][-1] == "unexpected"
        for error in response.json()["detail"]
    )
