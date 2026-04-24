import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClusterCard } from "../../src/renderer/components/ClusterCard";
import type { Cluster } from "@shared/types";

const sampleCluster: Cluster = {
  id: 42,
  method: "clip",
  confidence: 0.93,
  applied_session_id: null,
  winner: {
    file_id: 1,
    path: "C:\\photos\\a.jpg",
    size: 5_000_000,
    score: 0.78,
    breakdown: { sharpness: 0.9, resolution: 0.8, face_quality: 0.7, nima_score: 0.6, exposure: 0.9, bytes_per_pixel: 0.5 },
    width: 4032,
    height: 3024,
  },
  losers: [
    {
      file_id: 2,
      path: "C:\\photos\\b.jpg",
      size: 1_000_000,
      score: 0.42,
      breakdown: { sharpness: 0.3, resolution: 0.5, face_quality: 0.4, nima_score: 0.4, exposure: 0.6, bytes_per_pixel: 0.3 },
      width: 2016,
      height: 1512,
    },
  ],
};

function materialize(node: React.ReactNode): React.ReactElement[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(materialize);
  if (!React.isValidElement(node)) return [];
  if (typeof node.type === "function" && !("prototype" in node.type && node.type.prototype?.isReactComponent)) {
    const render = node.type as (props: unknown) => React.ReactNode;
    return materialize(render(node.props));
  }
  return [node, ...materialize(node.props.children)];
}

function findByTestId(node: React.ReactNode, testId: string): React.ReactElement {
  const found = materialize(node).find((el) => el.props["data-testid"] === testId);
  if (!found) throw new Error(`missing test id: ${testId}`);
  return found;
}

describe("ClusterCard", () => {
  it("renders winner badge on the pre-selected winner", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ClusterCard, { cluster: sampleCluster, onSetWinner: vi.fn(), onApply: vi.fn(), applying: false }),
    );
    expect(markup).toContain("Winner");
    expect(markup).toContain("Cluster #42");
  });

  it("calls onSetWinner when a loser is promoted", () => {
    const onSetWinner = vi.fn();
    const tree = React.createElement(ClusterCard, { cluster: sampleCluster, onSetWinner, onApply: vi.fn(), applying: false });
    findByTestId(tree, "promote-2").props.onClick();
    expect(onSetWinner).toHaveBeenCalledWith(42, 2);
  });

  it("calls onApply when the quarantine button is clicked", () => {
    const onApply = vi.fn();
    const tree = React.createElement(ClusterCard, { cluster: sampleCluster, onSetWinner: vi.fn(), onApply, applying: false });
    findByTestId(tree, "apply-cluster-42").props.onClick();
    expect(onApply).toHaveBeenCalledWith(42);
  });

  it("disables apply button when already applied", () => {
    const applied = { ...sampleCluster, applied_session_id: "abc" };
    const tree = React.createElement(ClusterCard, { cluster: applied, onSetWinner: vi.fn(), onApply: vi.fn(), applying: false });
    expect(findByTestId(tree, "apply-cluster-42").props.disabled).toBe(true);
  });
});
