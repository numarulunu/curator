import React from "react";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardSurface } from "../../src/renderer/components/dashboard/DashboardSurface";

describe("DashboardSurface", () => {
  test("shows the current app version in the top title bar", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardSurface, {
        app: { node: "22.0.0", electron: "32.0.1", version: "0.1.11" } as never,
        archiveRoot: null,
        clearArchive: () => {},
        counts: { duplicate: 0, misplaced: 0, "zero-byte": 0, total: 0 },
        duplicateWaste: 0,
        error: null,
        filter: "all",
        filteredRows: [],
        footerBusy: false,
        isAnalyzed: false,
        loadFindings: async () => {},
        onPrimaryAction: async () => {},
        onSelectArchive: async () => {},
        onUndoTarget: () => {},
        ping: true,
        primaryAction: { stage: "select", label: "Select Archive" },
        progressLabel: null,
        proposalCount: 0,
        proposalCounts: { quarantine: 0, move_to_year: 0 },
        query: "",
        recentSessions: [],
        refreshing: false,
        result: null,
        reviewRowCount: 0,
        sessionsLoading: false,
        sessionsTotal: 0,
        setFilter: () => {},
        setQuery: () => {},
        sidecar: null,
        undoingId: null,
      }),
    );

    expect(markup).toContain("Curator");
    expect(markup).toContain("v0.1.11");
  });
});
