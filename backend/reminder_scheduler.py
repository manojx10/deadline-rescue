import asyncio
import os
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(
    os.environ.get("DEADLINE_RESCUE_DATABASE_PATH", BASE_DIR / "deadline_rescue.db")
)


def database_paths():
    """Return the original database and all isolated profile databases."""
    paths = [DATABASE_PATH]
    profile_dir = BASE_DIR / "profile_databases"
    if profile_dir.exists():
        paths.extend(sorted(profile_dir.glob("*.sqlite3")))
    return paths


def check_due_reminders(database_path=None):
    """Deliver due reminders once and return the number delivered."""
    delivered = 0
    if database_path is None:
        database_path = DATABASE_PATH
    now = datetime.now(timezone.utc)

    with sqlite3.connect(database_path, timeout=10) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 10000")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS reminder_deliveries (
                reminder_id INTEGER PRIMARY KEY,
                delivered_at TEXT NOT NULL
            )
        """)

        reminders = conn.execute("""
            SELECT r.id, r.title, r.due_at
            FROM reminders r
            LEFT JOIN reminder_deliveries d ON d.reminder_id = r.id
            WHERE r.completed = 0 AND d.reminder_id IS NULL
        """).fetchall()

        for reminder in reminders:
            try:
                due = datetime.fromisoformat(reminder["due_at"])
                if due.tzinfo is None:
                    due = due.astimezone()
                if due.astimezone(timezone.utc) > now:
                    continue
            except (ValueError, TypeError):
                continue

            # Claim this reminder before notifying to prevent duplicate alerts.
            cursor = conn.execute("""
                INSERT OR IGNORE INTO reminder_deliveries
                    (reminder_id, delivered_at)
                VALUES (?, ?)
            """, (reminder["id"], now.isoformat()))

            if cursor.rowcount != 1:
                continue

            title = str(reminder["title"])
            try:
                result = subprocess.run(
                    [
                        "osascript", "-e",
                        'on run argv\n'
                        'display notification (item 2 of argv) '
                        'with title (item 1 of argv)\n'
                        'end run',
                        "EDITH Reminder", title,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False,
                )
                if result.returncode != 0:
                    # Permit retry if macOS notification delivery failed.
                    conn.execute(
                        "DELETE FROM reminder_deliveries WHERE reminder_id = ?",
                        (reminder["id"],),
                    )
                    print(f"EDITH notification failed: {result.stderr.strip()}")
                    continue
            except (OSError, subprocess.TimeoutExpired) as exc:
                conn.execute(
                    "DELETE FROM reminder_deliveries WHERE reminder_id = ?",
                    (reminder["id"],),
                )
                print(f"EDITH notification failed: {exc}")
                continue

            print(f"EDITH notified: {title}")
            delivered += 1

        conn.commit()

    return delivered


async def reminder_scheduler_loop(interval_seconds=15):
    """Check for due reminders periodically while the backend is running."""
    while True:
        for database_path in database_paths():
            try:
                check_due_reminders(database_path)
            except Exception as exc:
                print(f"EDITH reminder scheduler error for {database_path.name}: {exc}")
        await asyncio.sleep(interval_seconds)
