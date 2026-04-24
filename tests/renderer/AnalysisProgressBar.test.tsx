// tests/renderer/AnalysisProgressBar.test.tsx
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { AnalysisProgressBar } from "../../src/renderer/components/AnalysisProgressBar";

describe("AnalysisProgressBar", () => {
  it("renders nothing when no progress", () => {
    const { container } = render(<AnalysisProgressBar progress={null} running={false} onCancel={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows phase and count when running", () => {
    render(
      <AnalysisProgressBar
        progress={{ phase: "features", processed: 120, total: 500 }}
        running
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/features/i)).toBeTruthy();
    expect(screen.getByText(/120/)).toBeTruthy();
  });

  it("calls onCancel when cancel clicked", () => {
    const onCancel = vi.fn();
    render(
      <AnalysisProgressBar
        progress={{ phase: "cluster" }}
        running
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("analysis-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("hides cancel when not running", () => {
    render(
      <AnalysisProgressBar
        progress={{ phase: "done" }}
        running={false}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("analysis-cancel")).toBeNull();
  });
});
