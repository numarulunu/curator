import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ApplyResult, Proposal } from "@shared/types";

export interface SidecarLike {
  call<T>(method: string, params: unknown): Promise<T>;
}

export async function applyProposals(
  db: Database.Database,
  sidecar: SidecarLike,
  archiveRoot: string,
  proposals: Proposal[],
  outputRoot: string | null | undefined,
): Promise<ApplyResult> {
  const sessionId = randomUUID();

  db.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')").run(sessionId);
  const insertAction = db.prepare(
    "INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')",
  );
  for (const proposal of proposals) {
    insertAction.run(sessionId, proposal.action, proposal.src_path, proposal.dst_path, proposal.reason);
  }

  const result = await sidecar.call<ApplyResult>("applyActions", {
    actions: proposals,
    archive_root: archiveRoot,
    output_root: outputRoot ?? null,
    session_id: sessionId,
  });

  const failedBySrc = new Map((result.errors ?? []).map((error) => [error.src, error.error]));
  const updateAction = db.prepare(
    "UPDATE actions SET status = ?, error = ?, executed_at = datetime('now') WHERE session_id = ? AND src_path = ?",
  );
  for (const proposal of proposals) {
    const error = failedBySrc.get(proposal.src_path) ?? null;
    updateAction.run(error ? "failed" : "applied", error, sessionId, proposal.src_path);
  }
  db.prepare("UPDATE sessions SET completed_at = datetime('now') WHERE id = ?").run(sessionId);
  return result;
}
