import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import { applyProposals, type SidecarLike } from "@main/apply";
import type { ApplyResult, Proposal } from "@shared/types";

describe("applyProposals", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "apply-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows EBUSY */ }
  });

  function makeSidecar(result: ApplyResult): SidecarLike {
    return { call: vi.fn(async () => result) };
  }

  const proposals: Proposal[] = [
    { action: "quarantine", src_path: "/arc/a.jpg", dst_path: null, reason: "dup" },
    { action: "quarantine", src_path: "/arc/b.jpg", dst_path: null, reason: "dup" },
  ];

  it("persists session + actions and marks applied on full sidecar success", async () => {
    const sidecar = makeSidecar({ ok: 2, failed: 0, errors: [], session_id: "ignored-main-rewrites-this" });
    const result = await applyProposals(db, sidecar, "/arc", proposals, null);

    expect(result.ok).toBe(2);
    const session = db.prepare("SELECT * FROM sessions").get() as { id: string; completed_at: string | null };
    expect(session.completed_at).not.toBeNull();

    const rows = db.prepare("SELECT src_path, status, error FROM actions ORDER BY src_path").all() as Array<{ src_path: string; status: string; error: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "applied")).toBe(true);
    expect(rows.every((r) => r.error === null)).toBe(true);
  });

  it("marks individual actions failed when sidecar reports per-src errors", async () => {
    const sidecar = makeSidecar({
      ok: 1,
      failed: 1,
      errors: [{ src: "/arc/b.jpg", error: "EACCES" }],
      session_id: "ignored",
    });

    await applyProposals(db, sidecar, "/arc", proposals, null);

    const rows = db.prepare("SELECT src_path, status, error FROM actions ORDER BY src_path").all() as Array<{ src_path: string; status: string; error: string | null }>;
    expect(rows).toEqual([
      { src_path: "/arc/a.jpg", status: "applied", error: null },
      { src_path: "/arc/b.jpg", status: "failed", error: "EACCES" },
    ]);
  });

  it("keeps pre-sidecar session and pending actions when the sidecar rejects", async () => {
    const sidecar: SidecarLike = { call: vi.fn(async () => { throw new Error("sidecar down"); }) };

    await expect(applyProposals(db, sidecar, "/arc", proposals, null)).rejects.toThrow(/sidecar down/);

    const session = db.prepare("SELECT completed_at FROM sessions").get() as { completed_at: string | null };
    expect(session.completed_at).toBeNull();

    const rows = db.prepare("SELECT status FROM actions").all() as Array<{ status: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });
});
