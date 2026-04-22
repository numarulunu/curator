import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from curator.db import connect, ensure_schema


@pytest.fixture
def db(tmp_path: Path, monkeypatch) -> Path:
    """Set DB_PATH, initialize schema, and return the db file path."""
    dbp = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    con = connect()
    try:
        ensure_schema(con)
    finally:
        con.close()
    return dbp
