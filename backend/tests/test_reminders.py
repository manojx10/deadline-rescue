from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient
import main
import reminder_scheduler


def test_reminder_create_list_update_delete():
    client = TestClient(main.app)

    created = client.post(
        "/api/reminders",
        json={
            "title": "Test reminder",
            "due_at": "2026-10-22T17:00:00+05:30",
        },
    )
    assert created.status_code == 201
    reminder = created.json()["reminder"]
    reminder_id = reminder["id"]

    listed = client.get("/api/reminders?include_completed=false")
    assert listed.status_code == 200
    assert any(item["id"] == reminder_id for item in listed.json()["reminders"])

    updated = client.patch(
        f"/api/reminders/{reminder_id}",
        json={"completed": True},
    )
    assert updated.status_code == 200
    assert updated.json()["reminder"]["completed"] == 1

    deleted = client.delete(f"/api/reminders/{reminder_id}")
    assert deleted.status_code == 200

    missing = client.get("/api/reminders?include_completed=true")
    assert all(item["id"] != reminder_id for item in missing.json()["reminders"])


def test_rescheduling_reminder_clears_delivery_record():
    client = TestClient(main.app)

    created = client.post(
        "/api/reminders",
        json={
            "title": "Reschedule regression test",
            "due_at": "2026-10-22T17:00:00+05:30",
        },
    )
    assert created.status_code == 201
    reminder_id = created.json()["reminder"]["id"]

    # Simulate a reminder that has already been delivered.
    with main.get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reminder_deliveries (
                reminder_id INTEGER PRIMARY KEY,
                delivered_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT OR REPLACE INTO reminder_deliveries "
            "(reminder_id, delivered_at) VALUES (?, ?)",
            (reminder_id, "2026-10-20T00:00:00+00:00"),
        )

    updated = client.patch(
        f"/api/reminders/{reminder_id}",
        json={"due_at": "2026-10-23T17:00:00+05:30"},
    )
    assert updated.status_code == 200

    with main.get_connection() as connection:
        delivery = connection.execute(
            "SELECT reminder_id FROM reminder_deliveries WHERE reminder_id = ?",
            (reminder_id,),
        ).fetchone()

    assert delivery is None

    client.delete(f"/api/reminders/{reminder_id}")


def test_due_reminders_deliver_once_and_can_be_rescheduled(monkeypatch):
    client = TestClient(main.app)
    created = client.post(
        "/api/reminders",
        json={
            "title": "Delivery regression test",
            "due_at": (
                datetime.now(timezone.utc) - timedelta(minutes=1)
            ).isoformat(),
        },
    )
    assert created.status_code == 201
    reminder_id = created.json()["reminder"]["id"]

    monkeypatch.setattr(reminder_scheduler, "DATABASE_PATH", main.DATABASE_PATH)
    delivered_titles = []

    def deliver(command, **_):
        delivered_titles.append(command[-1])
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr(reminder_scheduler.subprocess, "run", deliver)

    assert reminder_scheduler.check_due_reminders() == 1
    assert reminder_scheduler.check_due_reminders() == 0
    assert delivered_titles == ["Delivery regression test"]

    rescheduled = client.patch(
        f"/api/reminders/{reminder_id}",
        json={
            "due_at": (
                datetime.now(timezone.utc) - timedelta(minutes=1)
            ).isoformat(),
        },
    )
    assert rescheduled.status_code == 200
    assert reminder_scheduler.check_due_reminders() == 1
    assert delivered_titles == [
        "Delivery regression test",
        "Delivery regression test",
    ]
