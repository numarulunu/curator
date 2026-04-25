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
  off: "Only finds byte-identical copies — the same file saved twice.",
  lite: "Also catches resized, recompressed, and slightly edited copies of the same photo.",
  full: "Also picks the best shot from bursts and similar scenes using face detection and aesthetic scoring.",
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

const PERF_NUMERIC_FIELDS: Array<{ key: string; label: string; min: number; max: number; step: number }> = [
  { key: "workers",      label: "CPU worker threads",   min: 1,   max: 64,    step: 1   },
  { key: "memory_mb",    label: "Memory cap (MB)",      min: 256, max: 32768, step: 256 },
  { key: "decode_queue", label: "Decode queue depth",   min: 4,   max: 1024,  step: 4   },
];

const GPU_OPTIONS: Array<{ value: "off" | "auto" | "on"; label: string }> = [
  { value: "off",  label: "Off"  },
  { value: "auto", label: "Auto" },
  { value: "on",   label: "On"   },
];

const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const fieldHeadStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };
const fieldLabelStyle: CSSProperties = { fontSize: 11, color: "var(--text)", fontWeight: 600 };
const fieldHelperStyle: CSSProperties = { fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 };

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
  const aiOn = settings.ai_mode !== "off";
  const showCustom = aiOn && settings.preset === "custom";

  function setMode(m: AiMode) {
    update({ ai_mode: m, similar_photo_review: m !== "off" });
  }

  return (
    <>
      <Field label="Duplicate detection" helper={MODE_HELPER[settings.ai_mode]}>
        <div data-testid="ai-mode" style={segGridStyle(MODES.length)}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`ai-mode-${m}`}
              aria-pressed={settings.ai_mode === m}
              onClick={() => setMode(m)}
              style={segButtonStyle(settings.ai_mode === m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </Field>

      {aiOn && (
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

        {settings.profile === "custom" && (
          <div style={drawerStyle}>
            <div style={customRowStyle}>
              <span style={customLabelStyle}>GPU acceleration</span>
              <div data-testid="custom-gpu" style={{ display: "inline-flex", gap: 4 }}>
                {GPU_OPTIONS.map((opt) => {
                  const active = (settings.profile_custom.gpu ?? "auto") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-testid={`custom-gpu-${opt.value}`}
                      aria-pressed={active}
                      onClick={() => update({
                        profile: "custom",
                        profile_custom: { ...settings.profile_custom, gpu: opt.value },
                      })}
                      style={segButtonStyle(active)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {PERF_NUMERIC_FIELDS.map((f) => (
              <div key={f.key} style={customRowStyle}>
                <span style={customLabelStyle} title={f.label}>{f.label}</span>
                <input
                  type="number"
                  data-testid={`custom-${f.key}`}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={settings.profile_custom[f.key] ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    update({
                      profile: "custom",
                      profile_custom: { ...settings.profile_custom, [f.key]: n },
                    });
                  }}
                  style={customInputStyle}
                />
              </div>
            ))}
          </div>
        )}
      </Field>
    </>
  );
}
