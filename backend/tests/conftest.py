"""Keep every backend test completely separate from the live task database."""
import os
import sys
import tempfile
import uuid
from pathlib import Path

import pytest


TEST_DATABASE_PATH = Path(tempfile.gettempdir()) / f"deadline-rescue-pytest-{uuid.uuid4()}.db"
os.environ["DEADLINE_RESCUE_DATABASE_PATH"] = str(TEST_DATABASE_PATH)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    """Point each test to its own disposable SQLite file."""
    database = tmp_path / "deadline-rescue-test.db"
    monkeypatch.setattr(main, "DATABASE_PATH", database)
    main.initialize_database()
    return database


def pytest_sessionfinish(session, exitstatus):
    TEST_DATABASE_PATH.unlink(missing_ok=True)
