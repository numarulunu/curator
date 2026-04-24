import React from "react";
import { describe, expect, it, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardSurface } from "../../src/renderer/components/dashboard/DashboardSurface";
import { buildReviewRows } from "../../src/renderer/lib/dashboard";

describe("DashboardSurface", () => {
  test("shows the current app version in the top title bar", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardSurface, {
        app: { node: "22.0.0", electron: "32.0.1", version: "0.1.14" } as never,
        archiveRoot: null,
        outputRoot: null,
        counts: { duplicate: 0, misplaced: 0, "zero-byte": 0, total: 0 },
        duplicateWaste: 0,
        error: null,
        filter: "all",
        filteredRows: [],
        footerBusy: false,
        isAnalyzed: false,
        loadFindings: async () => {},
        onPrimaryAction: async () => {},
        onRetrySession: () => {},
        onSelectArchive: async () => {},
        onSelectOutput: async () => {},
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
        setFilter: () => {},
        setQuery: () => {},
        sidecar: null,
        undoingId: null,
        retryingId: null,
      }),
    );

    expect(markup).toContain("Curator");
    expect(markup).toContain("v0.1.14");
  });

  test("spells out exact-duplicate limits when analysis finds nothing", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardSurface, {
        app: { node: "22.0.0", electron: "32.0.1", version: "0.1.14" } as never,
        archiveRoot: "D:/archive",
        outputRoot: "D:/output",
        counts: { duplicate: 0, misplaced: 0, "zero-byte": 0, total: 0 },
        duplicateWaste: 0,
        error: null,
        filter: "all",
        filteredRows: [],
        footerBusy: false,
        isAnalyzed: true,
        loadFindings: async () => {},
        onPrimaryAction: async () => {},
        onRetrySession: () => {},
        onSelectArchive: async () => {},
        onSelectOutput: async () => {},
        onUndoTarget: () => {},
        ping: true,
        primaryAction: { stage: "build", label: "Build Plan" },
        progressLabel: null,
        proposalCount: 0,
        proposalCounts: { quarantine: 0, move_to_year: 0 },
        query: "",
        recentSessions: [],
        refreshing: false,
        result: { scanned: 12, root: "D:/archive" },
        reviewRowCount: 0,
        sessionsLoading: false,
        setFilter: () => {},
        setQuery: () => {},
        sidecar: null,
        undoingId: null,
        retryingId: null,
      }),
    );

    expect(markup).toContain("No exact duplicate, misplaced, or zero-byte findings were found");
    expect(markup).toContain("exact byte-identical duplicates only");
  });

  test("shows a supported-files warning when analysis indexed zero files", () => {
    const markup = renderToStaticMarkup(
      React.createElement(DashboardSurface, {
        app: { node: "22.0.0", electron: "32.0.1", version: "0.1.14" } as never,
        archiveRoot: "D:/archive",
        outputRoot: null,
        counts: { duplicate: 0, misplaced: 0, "zero-byte": 0, total: 0 },
        duplicateWaste: 0,
        error: null,
        filter: "all",
        filteredRows: [],
        footerBusy: false,
        isAnalyzed: true,
        loadFindings: async () => {},
        onPrimaryAction: async () => {},
        onRetrySession: () => {},
        onSelectArchive: async () => {},
        onSelectOutput: async () => {},
        onUndoTarget: () => {},
        ping: true,
        primaryAction: { stage: "build", label: "Build Plan" },
        progressLabel: null,
        proposalCount: 0,
        proposalCounts: { quarantine: 0, move_to_year: 0 },
        query: "",
        recentSessions: [],
        refreshing: false,
        result: { scanned: 0, root: "D:/archive" },
        reviewRowCount: 0,
        sessionsLoading: false,
        setFilter: () => {},
        setQuery: () => {},
        sidecar: null,
        undoingId: null,
        retryingId: null,
      }),
    );

    expect(markup).toContain("No supported media files were indexed");
    expect(markup).toContain("Check that the selected folder contains supported photo/video formats and that Curator can access it.");
    expect(markup).not.toContain("exact byte-identical duplicates only");
  });

  test("labels duplicate findings as exact-match clusters instead of raw file totals", () => {
    const rows = buildReviewRows(
      [
        {
          xxhash: "abc123",
          count: 3,
          bytes_per_file: 2048,
          total_bytes: 6144,
          wasted_bytes: 4096,
          files: [
            { id: 1, path: "D:/archive/2024/a.jpg", size: 2048, mtime_ns: 1, hash_xxh64: "abc123" },
            { id: 2, path: "D:/archive/2024/b.jpg", size: 2048, mtime_ns: 2, hash_xxh64: "abc123" },
            { id: 3, path: "D:/archive/2024/c.jpg", size: 2048, mtime_ns: 3, hash_xxh64: "abc123" },
          ],
        } as never,
      ],
      [],
      [],
    );

    const markup = renderToStaticMarkup(
      React.createElement(DashboardSurface, {
        app: { node: "22.0.0", electron: "32.0.1", version: "0.1.14" } as never,
        archiveRoot: "D:/archive",
        outputRoot: "D:/output",
        counts: { duplicate: 1, misplaced: 0, "zero-byte": 0, total: 1 },
        duplicateWaste: 4096,
        error: null,
        filter: "duplicate",
        filteredRows: rows,
        footerBusy: false,
        isAnalyzed: true,
        loadFindings: async () => {},
        onPrimaryAction: async () => {},
        onRetrySession: () => {},
        onSelectArchive: async () => {},
        onSelectOutput: async () => {},
        onUndoTarget: () => {},
        ping: true,
        primaryAction: { stage: "build", label: "Build Plan" },
        progressLabel: null,
        proposalCount: 0,
        proposalCounts: { quarantine: 0, move_to_year: 0 },
        query: "",
        recentSessions: [],
        refreshing: false,
        result: { scanned: 12, root: "D:/archive" },
        reviewRowCount: 1,
        sessionsLoading: false,
        setFilter: () => {},
        setQuery: () => {},
        sidecar: null,
        undoingId: null,
        retryingId: null,
      }),
    );

    expect(markup).toContain("Exact duplicate cluster (3 files)");
    expect(markup).toContain("2 extra byte-identical copies");
    expect(markup).toContain("1 exact-match cluster");
    expect(markup).toContain(">Exact-match clusters<");
    expect(markup).not.toContain(">Exact matches<");
    expect(markup).toContain(">1 exact-match cluster<");
    expect(markup).not.toContain(">Clusters<");
    expect(markup).not.toContain("3 identical files");
    expect(markup).not.toContain("1 duplicates");
  });

  it("renders an Interrupted badge and Retry button for apply sessions with completed_at=null", () => {
    const onRetrySession = vi.fn();
    const markup = renderToStaticMarkup(
      React.createElement(DashboardSurface, {
        app: { node: "22.0.0", electron: "32.0.1", version: "0.1.14" } as never,
        archiveRoot: "D:/archive",
        outputRoot: null,
        counts: { duplicate: 0, misplaced: 0, "zero-byte": 0, total: 0 },
        duplicateWaste: 0,
        error: null,
        filter: "all",
        filteredRows: [],
        footerBusy: false,
        isAnalyzed: false,
        loadFindings: async () => {},
        onPrimaryAction: async () => {},
        onRetrySession,
        onSelectArchive: async () => {},
        onSelectOutput: async () => {},
        onUndoTarget: () => {},
        ping: true,
        primaryAction: { stage: "select", label: "Select Archive" },
        progressLabel: null,
        proposalCount: 0,
        proposalCounts: { quarantine: 0, move_to_year: 0 },
        query: "",
        recentSessions: [
          {
            id: "abcdef1234567890",
            started_at: "2026-04-24T10:00:00Z",
            completed_at: null,
            kind: "apply",
            action_count: 5,
            pending_count: 2,
          },
        ],
        refreshing: false,
        result: null,
        reviewRowCount: 0,
        sessionsLoading: false,
        setFilter: () => {},
        setQuery: () => {},
        sidecar: null,
        undoingId: null,
        retryingId: null,
      }),
    );

    expect(markup).toMatch(/Interrupted/);
    expect(markup).toMatch(/Retry/);
    expect(markup).toMatch(/2 pending/);
  });

  it("disables the Retry button and shows Retrying... when retryingId matches the session", () => {
    const onRetrySession = vi.fn();
    const markup = renderToStaticMarkup(
      React.createElement(DashboardSurface, {
        app: { node: "22.0.0", electron: "32.0.1", version: "0.1.14" } as never,
        archiveRoot: "D:/archive",
        outputRoot: null,
        counts: { duplicate: 0, misplaced: 0, "zero-byte": 0, total: 0 },
        duplicateWaste: 0,
        error: null,
        filter: "all",
        filteredRows: [],
        footerBusy: false,
        isAnalyzed: false,
        loadFindings: async () => {},
        onPrimaryAction: async () => {},
        onRetrySession,
        onSelectArchive: async () => {},
        onSelectOutput: async () => {},
        onUndoTarget: () => {},
        ping: true,
        primaryAction: { stage: "select", label: "Select Archive" },
        progressLabel: null,
        proposalCount: 0,
        proposalCounts: { quarantine: 0, move_to_year: 0 },
        query: "",
        recentSessions: [
          {
            id: "abcdef1234567890",
            started_at: "2026-04-24T10:00:00Z",
            completed_at: null,
            kind: "apply",
            action_count: 5,
            pending_count: 2,
          },
        ],
        refreshing: false,
        result: null,
        retryingId: "abcdef1234567890",
        reviewRowCount: 0,
        sessionsLoading: false,
        setFilter: () => {},
        setQuery: () => {},
        sidecar: null,
        undoingId: null,
      }),
    );

    expect(markup).toMatch(/Retrying\.\.\./);
    expect(markup).toMatch(/disabled/);
  });
});
