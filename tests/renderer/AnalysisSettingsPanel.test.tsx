// tests/renderer/AnalysisSettingsPanel.test.tsx
import { describe, expect, it, vi, afterEach } from "vitest";
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

describe("AnalysisSettingsPanel", () => {
  it("hides mode/preset when similar-photo review is off", () => {
    render(<AnalysisSettingsPanel settings={DEFAULTS} onChange={vi.fn()} />);
    expect(screen.queryByTestId("ai-mode")).toBeNull();
    expect(screen.queryByTestId("preset")).toBeNull();
  });

  it("shows mode + preset when toggle is on", () => {
    const s = { ...DEFAULTS, similar_photo_review: true };
    render(<AnalysisSettingsPanel settings={s} onChange={vi.fn()} />);
    expect(screen.getByTestId("ai-mode")).toBeTruthy();
    expect(screen.getByTestId("preset")).toBeTruthy();
  });

  it("switches preset to custom when a threshold is edited", () => {
    const onChange = vi.fn();
    const s = { ...DEFAULTS, similar_photo_review: true, preset: "balanced" as const };
    render(<AnalysisSettingsPanel settings={s} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("preset-custom"));
    fireEvent.change(screen.getByTestId("custom-phash_hamming"), { target: { value: "3" } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last.preset).toBe("custom");
    expect(last.preset_custom.phash_hamming).toBe(3);
  });

  it("emits change when toggle flipped", () => {
    const onChange = vi.fn();
    render(<AnalysisSettingsPanel settings={DEFAULTS} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("similar-photo-toggle"));
    expect(onChange.mock.calls[0][0].similar_photo_review).toBe(true);
  });
});
