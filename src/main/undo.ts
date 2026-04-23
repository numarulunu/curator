import type Database from "better-sqlite3";
import type { ApplyError } from "@shared/types";
import type { SidecarLike } from "./apply";

export interface UndoResult {
  restored: number;
  failed: number;
  errors?: ApplyError[];
  session_id: string;
}

export async function undoSession(
  db: Database.Database,
  sidecar: SidecarLike,
  sessionId: string,
): Promise<UndoResult> {
  const result = await sidecar.call<UndoResult>("undoSession", { session_id: sessionId });

  const failedBySrc = new Map((result.errors ?? []).map((error) => [error.src, error.error]));
  const listActions = db.prepare("SELECT src_path FROM actions WHERE session_id = ?");
  const markReversed = db.prepare("UPDATE actions SET status = 'reversed', error = NULL WHERE session_id = ? AND src_path = ?");
  const markUndoFailed = db.prepare("UPDATE actions SET error = ? WHERE session_id = ? AND src_path = ?");

  const recordUndo = db.transaction(() => {
    const rows = listActions.all(sessionId) as Array<{ src_path: string }>;
    for (const { src_path } of rows) {
      const error = failedBySrc.get(src_path);
      if (error) {
        markUndoFailed.run(error, sessionId, src_path);
      } else {
        markReversed.run(sessionId, src_path);
      }
    }
  });
  recordUndo();

  return result;
}
