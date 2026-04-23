import sqlite3

from curator import clusters


def _insert(dbp, rows):
    """rows: list of (path, size, mtime_ns, xxhash) tuples"""
    con = sqlite3.connect(str(dbp))
    con.executemany(
        "INSERT INTO files (path, size, mtime_ns, xxhash, scanned_at) VALUES (?, ?, ?, ?, '2026-04-22T00:00:00')",
        rows,
    )
    con.commit()
    con.close()


def test_returns_empty_when_no_duplicates(db):
    _insert(db, [
        ("a.jpg", 100, 1, "h1"),
        ("b.jpg", 200, 2, "h2"),
        ("c.jpg", 300, 3, "h3"),
    ])
    assert clusters.duplicates_exact() == []


def test_returns_clusters_with_count_ge_2(db):
    _insert(db, [
        ("a1", 1000, 1, "aaa"),
        ("a2", 1000, 2, "aaa"),
        ("b1", 2000, 3, "bbb"),
        ("b2", 2000, 4, "bbb"),
        ("b3", 2000, 5, "bbb"),
        ("c1", 500, 6, "ccc"),
    ])
    result = clusters.duplicates_exact()
    assert len(result) == 2

    first = result[0]
    assert first["xxhash"] == "bbb"
    assert first["count"] == 3
    assert first["size"] == 2000
    assert len(first["files"]) == 3

    second = result[1]
    assert second["xxhash"] == "aaa"
    assert second["count"] == 2
    assert second["size"] == 1000
    assert len(second["files"]) == 2


def test_ignores_rows_with_null_xxhash(db):
    _insert(db, [
        ("n1", 100, 1, None),
        ("n2", 100, 2, None),
        ("x1", 500, 3, "xxx"),
        ("x2", 500, 4, "xxx"),
    ])
    result = clusters.duplicates_exact()
    assert len(result) == 1
    assert result[0]["xxhash"] == "xxx"
    for cluster in result:
        assert cluster["xxhash"] is not None


def test_cluster_files_sorted_by_path(db):
    _insert(db, [
        ("z.jpg", 777, 1, "sss"),
        ("a.jpg", 777, 2, "sss"),
        ("m.jpg", 777, 3, "sss"),
    ])
    result = clusters.duplicates_exact()
    assert len(result) == 1
    paths = [f["path"] for f in result[0]["files"]]
    assert paths == ["a.jpg", "m.jpg", "z.jpg"]


def test_duplicates_exact_can_scope_to_root(db):
    _insert(db, [
        ("/archive-a/1.jpg", 100, 1, "same"),
        ("/archive-a/2.jpg", 100, 2, "same"),
        ("/archive-b/1.jpg", 100, 3, "same"),
        ("/archive-b/2.jpg", 100, 4, "same"),
    ])

    result = clusters.duplicates_exact("/archive-a")
    assert len(result) == 1
    assert [row["path"] for row in result[0]["files"]] == ["/archive-a/1.jpg", "/archive-a/2.jpg"]
