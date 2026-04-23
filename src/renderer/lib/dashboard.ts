import type { DuplicateCluster, MisplacedFile, ZeroByteFile } from "@shared/types";

export type DashboardStage = "select" | "analyze" | "build" | "apply";

export interface PrimaryActionState {
  stage: DashboardStage;
  label: string;
}

export interface ReviewRow {
  key: string;
  kind: "duplicate" | "misplaced" | "zero-byte";
  path: string;
  title: string;
  detail: string;
}

export function resolvePrimaryAction(input: {
  archiveRoot: string | null;
  isAnalyzed: boolean;
  proposalCount: number;
}): PrimaryActionState {
  if (!input.archiveRoot) return { stage: "select", label: "Select Archive" };
  if (!input.isAnalyzed) return { stage: "analyze", label: "Analyze Archive" };
  if (input.proposalCount > 0) return { stage: "apply", label: "Apply Plan" };
  return { stage: "build", label: "Build Plan" };
}

export function buildReviewRows(
  duplicates: DuplicateCluster[],
  misplaced: MisplacedFile[],
  zeroByte: ZeroByteFile[],
): ReviewRow[] {
  return [
    ...duplicates.map((cluster) => ({
      key: `duplicate:${cluster.xxhash}`,
      kind: "duplicate" as const,
      path: cluster.files[0]?.path ?? cluster.xxhash,
      title: `Exact duplicate cluster (${cluster.count} file${cluster.count === 1 ? "" : "s"})`,
      detail: `${Math.max(0, cluster.count - 1)} extra byte-identical cop${Math.max(0, cluster.count - 1) === 1 ? "y" : "ies"}`,
    })),
    ...misplaced.map((row) => ({
      key: `misplaced:${row.id}`,
      kind: "misplaced" as const,
      path: row.path,
      title: `${row.folder_year} folder, should be ${row.canonical_year}`,
      detail: `Source: ${row.date_source}`,
    })),
    ...zeroByte.map((row) => ({
      key: `zero-byte:${row.id}`,
      kind: "zero-byte" as const,
      path: row.path,
      title: "Empty file",
      detail: "0 bytes on disk",
    })),
  ];
}
