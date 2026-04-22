import type Database from "better-sqlite3";

export interface MisplacedFile {
  id: number;
  path: string;
  canonical_date: string;
  date_source: string;
  folder_year: number;
  canonical_year: number;
}

export function listMisplacedByDate(db: Database.Database): MisplacedFile[] {
  const rows = db.prepare(`
    SELECT id, path, canonical_date, date_source
      FROM files
     WHERE canonical_date IS NOT NULL
  `).all() as Array<{ id: number; path: string; canonical_date: string; date_source: string }>;

  const out: MisplacedFile[] = [];
  for (const r of rows) {
    const canonicalYear = parseInt(r.canonical_date.slice(0, 4), 10);
    const m = r.path.match(/[\\/](\d{4})[\\/]/);
    if (!m) continue;
    const folderYear = parseInt(m[1], 10);
    if (folderYear !== canonicalYear) {
      out.push({
        id: r.id, path: r.path,
        canonical_date: r.canonical_date, date_source: r.date_source,
        folder_year: folderYear, canonical_year: canonicalYear,
      });
    }
  }
  return out;
}
