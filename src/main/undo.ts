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
  db.prepare("UPDATE actions SET status = 'reversed' WHERE session_id = ?").run(sessionId);
  return result;
}
