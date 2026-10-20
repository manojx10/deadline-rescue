"""Regression tests for the short-window task duplicate guard."""
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi.testclient import TestClient

import main


def test_create_task_returns_the_recent_matching_task_without_writing_twice(tmp_path, monkeypatch):
    """Exercise the HTTP contract against a disposable SQLite database."""
    database = tmp_path / "deduplication.db"
    monkeypatch.setattr(main, "DATABASE_PATH", database)
    main.initialize_database()
    client = TestClient(main.app)
    payload = {
        "title": "Prepare demo",
        "description": "Run the full demo once",
        "project": "Deadline Rescue",
        "deadline": datetime(2026, 10, 20, 17, 0, tzinfo=timezone.utc).isoformat(),
        "estimated_minutes": 30,
        "priority": "high",
    }

    first = client.post("/api/tasks", json=payload)
    second = client.post("/api/tasks", json=payload)
    saved = client.get("/api/tasks")

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["task"]["id"] == second.json()["task"]["id"]
    assert saved.json()["count"] == 1


def test_concurrent_matching_creates_return_one_task_id(tmp_path, monkeypatch):
    """The immediate transaction must cover the check-and-insert race."""
    database = tmp_path / "concurrent-deduplication.db"
    monkeypatch.setattr(main, "DATABASE_PATH", database)
    main.initialize_database()
    payload = {
        "title": "Submit hackathon build",
        "description": "Upload the final archive",
        "project": "Deadline Rescue",
        "deadline": datetime(2026, 10, 20, 17, 0, tzinfo=timezone.utc).isoformat(),
        "estimated_minutes": 15,
        "priority": "urgent",
    }
    barrier = Barrier(2)

    def create_once():
        barrier.wait()
        with TestClient(main.app) as client:
            return client.post("/api/tasks", json=payload)

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: create_once(), range(2)))

    with TestClient(main.app) as client:
        saved = client.get("/api/tasks")

    assert [response.status_code for response in responses] == [201, 201]
    assert len({response.json()["task"]["id"] for response in responses}) == 1
    assert saved.json()["count"] == 1
