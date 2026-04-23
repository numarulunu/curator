// src/main/apply.ts
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { ApplyResult, Proposal } from "@shared/types";
import { resolveCuratorStateDir } from "./paths";

export interface SidecarLike {
  call<T>(method: string, params: unknown): Promise<T>;
}

function commitApplyResult(
  db: Database.Database,
  sessionId: string,
  proposals: Proposal[],
  result: ApplyResult,
): void {
  const updateAction = db.prepare(
    "UPDATE actions SET status = ?, error = ?, executed_at = datetime('now') WHERE session_id = ? AND src_path = ?",
  );
  const completeSession = db.prepare("UPDATE sessions SET completed_at = datetime('now') WHERE id = ?");
  const txn = db.transaction(() => {
    const failedBySrc = new Map((result.errors ?? []).map((error) => [error.src, error.error]));
    for (const proposal of proposals) {
      const error = failedBySrc.get(proposal.src_path) ?? null;
      updateAction.run(error ? "failed" : "applied", error, sessionId, proposal.src_path);
    }
    completeSession.run(sessionId);
  });
  txn();
}

export async function applyProposals(
  db: Database.Database,
  sidecar: SidecarLike,
  archiveRoot: string,
  proposals: Proposal[],
  outputRoot: string | null | undefined,
): Promise<ApplyResult> {
  const sessionId = randomUUID();

  const insertSession = db.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')");
  const insertAction = db.prepare(
    "INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')",
  );
  const recordStart = db.transaction(() => {
    insertSession.run(sessionId);
    for (const proposal of proposals) {
      insertAction.run(sessionId, proposal.action, proposal.src_path, proposal.dst_path, proposal.reason);
    }
  });
  recordStart();

  const result = await sidecar.call<ApplyResult>("applyActions", {
    actions: proposals,
    archive_root: archiveRoot,
    output_root: outputRoot ?? null,
    session_id: sessionId,
  });

  commitApplyResult(db, sessionId, proposals, result);
  return result;
}

interface SessionJsonlHeader {
  __header__: true;
  archive_root: string;
  output_root: string | null;
}

function readSessionHeader(stateDir: string, sessionId: string): SessionJsonlHeader | null {
  const path = join(stateDir, "sessions", `${sessionId}.jsonl`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as SessionJsonlHeader;
      if (obj.__header__ === true && typeof obj.archive_root === "string") return obj;
    } catch {
      continue;
    }
  }
  return null;
}

export async function retrySession(
  db: Database.Database,
  sidecar: SidecarLike,
  sessionId: string,
  stateDir: string = resolveCuratorStateDir(),
): Promise<ApplyResult> {
  const pendingRows = db
    .prepare("SELECT action, src_path, dst_path, reason FROM actions WHERE session_id = ? AND status = 'pending' ORDER BY id")
    .all(sessionId) as Proposal[];

  if (pendingRows.length === 0) {
    db.prepare("UPDATE sessions SET completed_at = datetime('now') WHERE id = ? AND completed_at IS NULL").run(sessionId);
    return { ok: 0, failed: 0, errors: [], session_id: sessionId, skipped: true };
  }

  const header = readSessionHeader(stateDir, sessionId);
  if (!header) {
    throw new Error(`cannot retry session ${sessionId}: no .jsonl header found`);
  }

  const result = await sidecar.call<ApplyResult>("applyActions", {
    actions: pendingRows,
    archive_root: header.archive_root,
    output_root: header.output_root,
    session_id: sessionId,
  });

  commitApplyResult(db, sessionId, pendingRows, result);
  return result;
}
