import type Database from "better-sqlite3";
import { basename, join } from "node:path";

export type Action = "quarantine" | "move_to_year";

export interface Proposal {
  action: Action;
  src_path: string;
  dst_path: string | null;
  reason: string;
}

export function buildProposals(db: Database.Database, archiveRoot: string): Proposal[] {
  const out: Proposal[] = [];

  // Exact duplicates: keep oldest mtime per xxhash, quarantine others
  const dupRows = db.prepare(`
    SELECT id, path, xxhash, mtime_ns
      FROM files
     WHERE xxhash IS NOT NULL
       AND xxhash IN (
         SELECT xxhash FROM files
          WHERE xxhash IS NOT NULL
          GROUP BY xxhash HAVING COUNT(*) >= 2
       )
  ORDER BY xxhash, mtime_ns
  `).all() as Array<{ id: number; path: string; xxhash: string; mtime_ns: number }>;

  const perHash = new Map<string, typeof dupRows>();
  for (const r of dupRows) {
    if (!perHash.has(r.xxhash)) perHash.set(r.xxhash, []);
    perHash.get(r.xxhash)!.push(r);
  }
  for (const group of perHash.values()) {
    const [keeper, ...rest] = group;
    for (const loser of rest) {
      out.push({
        action: "quarantine",
        src_path: loser.path,
        dst_path: null,
        reason: `exact-dup of ${keeper.path}`,
      });
    }
  }

  // Misplaced-by-date: move to /{canonical_year}/{basename}
  const mpRows = db.prepare(`
    SELECT id, path, canonical_date
      FROM files
     WHERE canonical_date IS NOT NULL
  `).all() as Array<{ id: number; path: string; canonical_date: string }>;

  for (const r of mpRows) {
    const m = r.path.match(/[\\/](\d{4})[\\/]/);
    if (!m) continue;
    const folderYear = m[1];
    const canonicalYear = r.canonical_date.slice(0, 4);
    if (folderYear === canonicalYear) continue;
    const baseName = basename(r.path);
    const dst = join(archiveRoot, canonicalYear, baseName).replace(/\\/g, "/");
    if (r.path.replace(/\\/g, "/") === dst) continue;
    out.push({
      action: "move_to_year",
      src_path: r.path,
      dst_path: dst,
      reason: `canonical year ${canonicalYear} ≠ folder ${folderYear}`,
    });
  }

  return out;
}
