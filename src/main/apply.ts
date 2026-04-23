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

  const updateAction = db.prepare(
    "UPDATE actions SET status = ?, error = ?, executed_at = datetime('now') WHERE session_id = ? AND src_path = ?",
  );
  const completeSession = db.prepare("UPDATE sessions SET completed_at = datetime('now') WHERE id = ?");
  const recordFinish = db.transaction((result: ApplyResult) => {
    const failedBySrc = new Map((result.errors ?? []).map((error) => [error.src, error.error]));
    for (const proposal of proposals) {
      const error = failedBySrc.get(proposal.src_path) ?? null;
      updateAction.run(error ? "failed" : "applied", error, sessionId, proposal.src_path);
    }
    completeSession.run(sessionId);
  });
  recordFinish(result);

  return result;
}
