import type { AiMode, ProfileName } from "@shared/types";

const SCAN_PER_FILE_S = 0.0005;
const HASH_PER_FILE_S = 0.005;
const DATES_PER_FILE_S = 0.001;
const FEATURE_PER_FILE_S: Record<AiMode, number> = {
  off: 0,
  lite: 0.2,
  full: 0.35,
};
const PROFILE_MULTIPLIER: Record<ProfileName, number> = {
  eco: 1.5,
  balanced: 1.0,
  max: 0.7,
  custom: 1.0,
};

export function estimateAnalysisSeconds(
  fileCount: number,
  aiMode: AiMode,
  profile: ProfileName,
): number {
  if (fileCount <= 0) return 0;
  const perFile = SCAN_PER_FILE_S + HASH_PER_FILE_S + DATES_PER_FILE_S + FEATURE_PER_FILE_S[aiMode];
  return fileCount * perFile * PROFILE_MULTIPLIER[profile];
}

export function formatEta(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}min`;
  const hours = seconds / 3600;
  if (hours < 10) return `~${hours.toFixed(1)}h`;
  return `~${Math.round(hours)}h`;
}
