// src/renderer/components/AnalysisSettingsPanel.tsx
import { useState } from "react";
import type { AnalysisSettings, AiMode, PresetName, ProfileName } from "@shared/types";

interface Props {
  settings: AnalysisSettings;
  onChange: (next: AnalysisSettings) => void;
}

const MODES: AiMode[] = ["off", "lite", "full"];
const PRESETS: PresetName[] = ["safe", "balanced", "aggressive", "custom"];
const PROFILES: ProfileName[] = ["eco", "balanced", "max", "custom"];

const CUSTOM_FIELDS: Array<{ key: string; label: string; min: number; max: number; step: number }> = [
  { key: "phash_hamming",  label: "Perceptual-hash tolerance",    min: 0,   max: 20,   step: 1    },
  { key: "clip_cosine",    label: "Visual-similarity cutoff",     min: 0.5, max: 1.0,  step: 0.01 },
  { key: "exif_time_s",    label: "Same-moment window (s)",       min: 0,   max: 7200, step: 60   },
  { key: "gps_m",          label: "Same-place radius (m)",        min: 0,   max: 1000, step: 10   },
  { key: "min_confidence", label: "Minimum cluster confidence",   min: 0.5, max: 1.0,  step: 0.01 },
];

export function AnalysisSettingsPanel({ settings, onChange }: Props) {
  const [localPreset, setLocalPreset] = useState<PresetName>(settings.preset);

  const update = (patch: Partial<AnalysisSettings>) => onChange({ ...settings, ...patch });

  const selectPreset = (p: PresetName) => {
    setLocalPreset(p);
    update({ preset: p });
  };

  return (
    <section className="analysis-settings">
      <label>
        <input
          type="checkbox"
          data-testid="similar-photo-toggle"
          checked={settings.similar_photo_review}
          onChange={(e) => update({ similar_photo_review: e.target.checked })}
        />
        Similar photo review
      </label>

      {settings.similar_photo_review && (
        <>
          <div data-testid="ai-mode" className="segmented">
            <span>AI mode</span>
            {MODES.map((m) => (
              <button
                key={m}
                data-testid={`ai-mode-${m}`}
                aria-pressed={settings.ai_mode === m}
                onClick={() => update({ ai_mode: m })}
              >
                {m}
              </button>
            ))}
          </div>

          <div data-testid="preset" className="segmented">
            <span>Strictness</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                data-testid={`preset-${p}`}
                aria-pressed={localPreset === p}
                onClick={() => selectPreset(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {localPreset === "custom" && (
            <div className="custom-drawer">
              {CUSTOM_FIELDS.map((f) => (
                <label key={f.key}>
                  {f.label}
                  <input
                    type="number"
                    data-testid={`custom-${f.key}`}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={settings.preset_custom[f.key] ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setLocalPreset("custom");
                      update({
                        preset: "custom",
                        preset_custom: { ...settings.preset_custom, [f.key]: n },
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </>
      )}

      <div data-testid="profile" className="segmented">
        <span>Performance</span>
        {PROFILES.map((p) => (
          <button
            key={p}
            data-testid={`profile-${p}`}
            aria-pressed={settings.profile === p}
            onClick={() => update({ profile: p })}
          >
            {p}
          </button>
        ))}
      </div>
    </section>
  );
}
