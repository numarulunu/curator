import type { CSSProperties, ReactNode } from "react";
import type { AnalysisSettings, AiMode, PresetName, ProfileName } from "@shared/types";

interface Props {
  settings: AnalysisSettings;
  onChange: (next: AnalysisSettings) => void;
}

const MODES: AiMode[] = ["off", "lite", "full"];
const PRESETS: PresetName[] = ["safe", "balanced", "aggressive", "custom"];
const PROFILES: ProfileName[] = ["eco", "balanced", "max", "custom"];

const MODE_LABEL: Record<AiMode, string> = { off: "Off", lite: "Lite", full: "Full" };
const PRESET_LABEL: Record<PresetName, string> = { safe: "Safe", balanced: "Balanced", aggressive: "Aggressive", custom: "Custom" };
const PROFILE_LABEL: Record<ProfileName, string> = { eco: "Eco", balanced: "Balanced", max: "Max", custom: "Custom" };

const MODE_HELPER: Record<AiMode, string> = {
  off: "Skip AI; only exact-byte duplicate detection runs.",
  lite: "Run perceptual hash + visual similarity. Skips face and aesthetic models.",
  full: "All models: similarity, faces, aesthetic grading. Heaviest, best results.",
};

const PRESET_HELPER: Record<PresetName, string> = {
  safe: "Few clusters, only very close matches. Conservative.",
  balanced: "Practical recall without much noise.",
  aggressive: "Catches more near-duplicates; expect more manual review.",
  custom: "Tune thresholds yourself.",
};

const PROFILE_HELPER: Record<ProfileName, string> = {
  eco: "Few CPU workers, no GPU. Safe to run while doing other work.",
  balanced: "Several CPU workers, GPU when stable.",
  max: "Most CPU + GPU. Fastest, heaviest.",
  custom: "Tune workers and limits yourself.",
};

const CUSTOM_FIELDS: Array<{ key: string; label: string; min: number; max: number; step: number }> = [
  { key: "phash_hamming",  label: "Perceptual-hash tolerance",  min: 0,   max: 20,   step: 1    },
  { key: "clip_cosine",    label: "Visual-similarity cutoff",   min: 0.5, max: 1.0,  step: 0.01 },
  { key: "exif_time_s",    label: "Same-moment window (s)",     min: 0,   max: 7200, step: 60   },
  { key: "gps_m",          label: "Same-place radius (m)",      min: 0,   max: 1000, step: 10   },
  { key: "min_confidence", label: "Minimum cluster confidence", min: 0.5, max: 1.0,  step: 0.01 },
];

const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const fieldHeadStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };
const fieldLabelStyle: CSSProperties = { fontSize: 11, color: "var(--text)", fontWeight: 600 };
const fieldHelperStyle: CSSProperties = { fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 };

const toggleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: 50,
  padding: "0 14px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-1)",
};

const toggleLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text)",
  cursor: "pointer",
  userSelect: "none",
  flex: 1,
};

const switchTrackStyle = (on: boolean): CSSProperties => ({
  width: 36,
  height: 20,
  borderRadius: 10,
  background: on ? "var(--accent)" : "var(--surface-3)",
  border: "1px solid var(--border-strong)",
  position: "relative",
  cursor: "pointer",
  transition: "background var(--t)",
  flexShrink: 0,
});

const switchKnobStyle = (on: boolean): CSSProperties => ({
  position: "absolute",
  top: 1,
  left: on ? 17 : 1,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: on ? "#0a0a0a" : "var(--text-muted)",
  transition: "left var(--t), background var(--t)",
});

const segGridStyle = (count: number): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  gap: 6,
});

function segButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 30,
    padding: "0 4px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: active ? "var(--surface-3)" : "var(--surface-1)",
    color: active ? "var(--text)" : "var(--text-muted)",
    fontSize: 11,
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    transition: "all var(--t)",
  };
}

const drawerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-1)",
};

const customRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const customLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const customInputStyle: CSSProperties = {
  width: 80,
  background: "var(--surface-0)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  padding: "3px 6px",
  fontSize: 11,
  fontFamily: "var(--font-mono, monospace)",
  textAlign: "right",
};

function Field({ label, helper, children }: { label: string; helper: string; children: ReactNode }) {
  return (
    <div style={fieldStyle}>
      <div style={fieldHeadStyle}>
        <span style={fieldLabelStyle}>{label}</span>
        <span style={fieldHelperStyle}>{helper}</span>
      </div>
      {children}
    </div>
  );
}

export function AnalysisSettingsPanel({ settings, onChange }: Props) {
  const update = (patch: Partial<AnalysisSettings>) => onChange({ ...settings, ...patch });
  const showAi = settings.similar_photo_review;
  const showCustom = showAi && settings.preset === "custom";
  const toggleId = "similar-photo-toggle-input";

  return (
    <>
      <Field
        label="Similar photo review"
        helper={
          showAi
            ? `${MODE_LABEL[settings.ai_mode]} mode — ${MODE_HELPER[settings.ai_mode]}`
            : "Off — only exact-byte duplicates are found. Turn on to also catch near-duplicates."
        }
      >
        <div
          style={toggleRowStyle}
          onClick={() => update({ similar_photo_review: !settings.similar_photo_review })}
        >
          <label htmlFor={toggleId} style={toggleLabelStyle}>
            {showAi ? "Enabled" : "Disabled"}
          </label>
          <input
            id={toggleId}
            type="checkbox"
            data-testid="similar-photo-toggle"
            checked={settings.similar_photo_review}
            onChange={(e) => update({ similar_photo_review: e.target.checked })}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
          />
          <div style={switchTrackStyle(showAi)} aria-hidden>
            <div style={switchKnobStyle(showAi)} />
          </div>
        </div>
      </Field>

      {showAi && (
        <Field label="AI mode" helper={MODE_HELPER[settings.ai_mode]}>
          <div data-testid="ai-mode" style={segGridStyle(MODES.length)}>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`ai-mode-${m}`}
                aria-pressed={settings.ai_mode === m}
                onClick={() => update({ ai_mode: m })}
                style={segButtonStyle(settings.ai_mode === m)}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </Field>
      )}

      {showAi && (
        <Field label="Strictness" helper={PRESET_HELPER[settings.preset]}>
          <div data-testid="preset" style={segGridStyle(PRESETS.length)}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`preset-${p}`}
                aria-pressed={settings.preset === p}
                onClick={() => update({ preset: p })}
                style={segButtonStyle(settings.preset === p)}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>

          {showCustom && (
            <div style={drawerStyle}>
              {CUSTOM_FIELDS.map((f) => (
                <div key={f.key} style={customRowStyle}>
                  <span style={customLabelStyle} title={f.label}>{f.label}</span>
                  <input
                    type="number"
                    data-testid={`custom-${f.key}`}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={settings.preset_custom[f.key] ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      update({
                        preset: "custom",
                        preset_custom: { ...settings.preset_custom, [f.key]: n },
                      });
                    }}
                    style={customInputStyle}
                  />
                </div>
              ))}
            </div>
          )}
        </Field>
      )}

      <Field label="Performance" helper={PROFILE_HELPER[settings.profile]}>
        <div data-testid="profile" style={segGridStyle(PROFILES.length)}>
          {PROFILES.map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`profile-${p}`}
              aria-pressed={settings.profile === p}
              onClick={() => update({ profile: p })}
              style={segButtonStyle(settings.profile === p)}
            >
              {PROFILE_LABEL[p]}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}
