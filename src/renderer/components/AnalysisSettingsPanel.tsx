import type { AnalysisSettings, AiMode, PresetName, ProfileName } from "@shared/types";

interface Props {
  settings: AnalysisSettings;
  onChange: (next: AnalysisSettings) => void;
}

const MODES: AiMode[] = ["off", "lite", "full"];
const PRESETS: PresetName[] = ["safe", "balanced", "aggressive", "custom"];
const PROFILES: ProfileName[] = ["eco", "balanced", "max", "custom"];

const MODE_LABEL: Record<AiMode, string> = {
  off: "Off",
  lite: "Lite",
  full: "Full",
};

const PRESET_LABEL: Record<PresetName, string> = {
  safe: "Safe",
  balanced: "Balanced",
  aggressive: "Aggressive",
  custom: "Custom",
};

const PROFILE_LABEL: Record<ProfileName, string> = {
  eco: "Eco",
  balanced: "Balanced",
  max: "Max",
  custom: "Custom",
};

const CUSTOM_FIELDS: Array<{ key: string; label: string; min: number; max: number; step: number }> = [
  { key: "phash_hamming",  label: "Perceptual-hash tolerance",  min: 0,   max: 20,   step: 1    },
  { key: "clip_cosine",    label: "Visual-similarity cutoff",   min: 0.5, max: 1.0,  step: 0.01 },
  { key: "exif_time_s",    label: "Same-moment window (s)",     min: 0,   max: 7200, step: 60   },
  { key: "gps_m",          label: "Same-place radius (m)",      min: 0,   max: 1000, step: 10   },
  { key: "min_confidence", label: "Minimum cluster confidence", min: 0.5, max: 1.0,  step: 0.01 },
];

const wrapStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  borderBottom: "1px solid var(--border)",
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const segGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "stretch",
  border: "1px solid var(--border)",
  borderRadius: 4,
  overflow: "hidden",
  background: "var(--surface-0)",
};

function segButtonStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#0a0a0a" : "var(--text)",
    border: "none",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    minWidth: 56,
    transition: "background var(--t)",
  };
}

const toggleStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "var(--text)",
  cursor: "pointer",
  userSelect: "none",
};

const drawerStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 8,
  padding: "8px 0 4px",
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11,
  color: "var(--text-muted)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--surface-0)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  padding: "4px 8px",
  fontSize: 12,
  fontFamily: "var(--font-mono, monospace)",
};

export function AnalysisSettingsPanel({ settings, onChange }: Props) {
  const update = (patch: Partial<AnalysisSettings>) => onChange({ ...settings, ...patch });
  const showAi = settings.similar_photo_review;
  const showCustom = showAi && settings.preset === "custom";

  return (
    <section style={wrapStyle} aria-label="Analysis settings">
      <div style={rowStyle}>
        <label style={toggleStyle}>
          <input
            type="checkbox"
            data-testid="similar-photo-toggle"
            checked={settings.similar_photo_review}
            onChange={(e) => update({ similar_photo_review: e.target.checked })}
          />
          <span>Similar photo review</span>
        </label>

        {showAi && (
          <div style={rowStyle} data-testid="ai-mode">
            <span style={labelStyle}>AI mode</span>
            <div style={segGroupStyle}>
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
          </div>
        )}
      </div>

      {showAi && (
        <div style={rowStyle} data-testid="preset">
          <span style={labelStyle}>Strictness</span>
          <div style={segGroupStyle}>
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
        </div>
      )}

      {showCustom && (
        <div style={drawerStyle}>
          {CUSTOM_FIELDS.map((f) => (
            <label key={f.key} style={fieldStyle}>
              <span>{f.label}</span>
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
                style={inputStyle}
              />
            </label>
          ))}
        </div>
      )}

      <div style={rowStyle} data-testid="profile">
        <span style={labelStyle}>Performance</span>
        <div style={segGroupStyle}>
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
      </div>
    </section>
  );
}
