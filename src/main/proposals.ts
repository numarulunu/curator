import type Database from "better-sqlite3";
import { basename, join } from "node:path";
import type { Proposal } from "@shared/types";
import { scopeClause } from "./queries";

export type Action = Proposal["action"];
export type { Proposal } from "@shared/types";

export function buildProposals(db: Database.Database, archiveRoot: string): Proposal[] {
  const out: Proposal[] = [];
  const scope = scopeClause(archiveRoot);

  const dupRows = db.prepare(`
    SELECT id, path, xxhash, mtime_ns
      FROM files
     WHERE xxhash IS NOT NULL${scope.sql}
       AND xxhash IN (
         SELECT xxhash FROM files
          WHERE xxhash IS NOT NULL${scope.sql}
          GROUP BY xxhash HAVING COUNT(*) >= 2
       )
  ORDER BY xxhash, mtime_ns
  `).all(...scope.params, ...scope.params) as Array<{ id: number; path: string; xxhash: string; mtime_ns: number }>;

  const perHash = new Map<string, typeof dupRows>();
  for (const row of dupRows) {
    if (!perHash.has(row.xxhash)) perHash.set(row.xxhash, []);
    perHash.get(row.xxhash)!.push(row);
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

  const mpRows = db.prepare(`
    SELECT id, path, canonical_date
      FROM files
     WHERE canonical_date IS NOT NULL${scope.sql}
  `).all(...scope.params) as Array<{ id: number; path: string; canonical_date: string }>;

  for (const row of mpRows) {
    const match = row.path.match(/[\\/](\d{4})[\\/]/);
    if (!match) continue;
    const folderYear = match[1];
    const canonicalYear = row.canonical_date.slice(0, 4);
    if (folderYear === canonicalYear) continue;
    const baseName = basename(row.path);
    const dst = join(archiveRoot, canonicalYear, baseName).replace(/\\/g, "/");
    if (row.path.replace(/\\/g, "/") === dst) continue;
    out.push({
      action: "move_to_year",
      src_path: row.path,
      dst_path: dst,
      reason: `canonical year ${canonicalYear} != folder ${folderYear}`,
    });
  }

  return out;
}
