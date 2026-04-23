import type Database from "better-sqlite3";

function scopeClause(archiveRoot: string): { sql: string; params: [string, string, string] } {
  const normalized = archiveRoot.replace(/[\\/]+$/, "");
  return {
    sql: " AND (path = ? OR path LIKE ? OR path LIKE ?)",
    params: [normalized, `${normalized}/%`, `${normalized}\\%`],
  };
}

export interface MisplacedFile {
  id: number;
  path: string;
  canonical_date: string;
  date_source: string;
  folder_year: number;
  canonical_year: number;
}

export function listMisplacedByDate(db: Database.Database, archiveRoot: string): MisplacedFile[] {
  const scope = scopeClause(archiveRoot);
  const rows = db.prepare(`
    SELECT id, path, canonical_date, date_source
      FROM files
     WHERE canonical_date IS NOT NULL${scope.sql}
  `).all(...scope.params) as Array<{ id: number; path: string; canonical_date: string; date_source: string }>;

  const out: MisplacedFile[] = [];
  for (const r of rows) {
    const canonicalYear = parseInt(r.canonical_date.slice(0, 4), 10);
    const match = r.path.match(/[\\/](\d{4})[\\/]/);
    if (!match) continue;
    const folderYear = parseInt(match[1], 10);
    if (folderYear !== canonicalYear) {
      out.push({
        id: r.id,
        path: r.path,
        canonical_date: r.canonical_date,
        date_source: r.date_source,
        folder_year: folderYear,
        canonical_year: canonicalYear,
      });
    }
  }
  return out;
}

export interface ZeroByteFile {
  id: number;
  path: string;
}

export function listZeroByte(db: Database.Database, archiveRoot: string): ZeroByteFile[] {
  const scope = scopeClause(archiveRoot);
  return db.prepare(`
    SELECT id, path
      FROM files
     WHERE size = 0${scope.sql}
  ORDER BY path
  `).all(...scope.params) as ZeroByteFile[];
}

export interface SessionRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  kind: string;
  action_count: number;
  pending_count: number;
}

export function listSessions(db: Database.Database): SessionRow[] {
  return db.prepare(`
    SELECT s.id, s.started_at, s.completed_at, s.kind,
           (SELECT COUNT(*) FROM actions a WHERE a.session_id = s.id) AS action_count,
           (SELECT COUNT(*) FROM actions a WHERE a.session_id = s.id AND a.status = 'pending') AS pending_count
      FROM sessions s
     ORDER BY s.started_at DESC
  `).all() as SessionRow[];
}
