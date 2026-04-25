import { describe, expect, it, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AnalysisSettingsPanel } from "../../src/renderer/components/AnalysisSettingsPanel";
import type { AnalysisSettings } from "@shared/types";

const DEFAULTS: AnalysisSettings = {
  similar_photo_review: false,
  ai_mode: "off",
  preset: "balanced",
  preset_custom: {},
  profile: "balanced",
  profile_custom: {},
};

afterEach(() => cleanup());

function Controlled({ initial, onChange }: { initial: AnalysisSettings; onChange?: (s: AnalysisSettings) => void }) {
  const [settings, setSettings] = useState(initial);
  return (
    <AnalysisSettingsPanel
      settings={settings}
      onChange={(next) => { setSettings(next); onChange?.(next); }}
    />
  );
}

describe("AnalysisSettingsPanel", () => {
  it("ai mode is always visible; preset hidden when ai is off", () => {
    render(<AnalysisSettingsPanel settings={DEFAULTS} onChange={vi.fn()} />);
    expect(screen.getByTestId("ai-mode")).toBeTruthy();
    expect(screen.queryByTestId("preset")).toBeNull();
  });

  it("shows preset when ai mode is lite or full", () => {
    const s = { ...DEFAULTS, ai_mode: "lite" as const, similar_photo_review: true };
    render(<AnalysisSettingsPanel settings={s} onChange={vi.fn()} />);
    expect(screen.getByTestId("preset")).toBeTruthy();
  });

  it("clicking ai-mode sets both ai_mode and similar_photo_review", () => {
    const onChange = vi.fn();
    render(<AnalysisSettingsPanel settings={DEFAULTS} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("ai-mode-lite"));
    const next = onChange.mock.calls[0][0];
    expect(next.ai_mode).toBe("lite");
    expect(next.similar_photo_review).toBe(true);
  });

  it("clicking ai-mode off clears similar_photo_review", () => {
    const onChange = vi.fn();
    const s = { ...DEFAULTS, ai_mode: "full" as const, similar_photo_review: true };
    render(<AnalysisSettingsPanel settings={s} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("ai-mode-off"));
    const next = onChange.mock.calls[0][0];
    expect(next.ai_mode).toBe("off");
    expect(next.similar_photo_review).toBe(false);
  });

  it("switches preset to custom when a threshold is edited", () => {
    const onChange = vi.fn();
    const s: AnalysisSettings = { ...DEFAULTS, ai_mode: "lite", similar_photo_review: true, preset: "balanced" };
    render(<Controlled initial={s} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("preset-custom"));
    fireEvent.change(screen.getByTestId("custom-phash_hamming"), { target: { value: "3" } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.preset).toBe("custom");
    expect(last.preset_custom.phash_hamming).toBe(3);
  });
});
