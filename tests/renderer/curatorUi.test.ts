import { describe, expect, test } from "vitest";
import { countProposalActions, sessionStatus, stripIpcPrefix } from "../../src/renderer/lib/curatorUi";
import type { Proposal, Session } from "../../src/shared/types";

describe("stripIpcPrefix", () => {
  test("removes the Electron IPC wrapper prefix", () => {
    expect(stripIpcPrefix("Error invoking remote method 'curator:scan': boom")).toBe("boom");
  });

  test("leaves plain errors untouched", () => {
    expect(stripIpcPrefix("plain failure")).toBe("plain failure");
  });
});

describe("countProposalActions", () => {
  test("counts quarantine and move actions separately", () => {
    const proposals: Proposal[] = [
      { action: "quarantine", src_path: "a", dst_path: null, reason: "dup" },
      { action: "move_to_year", src_path: "b", dst_path: "c", reason: "date" },
      { action: "quarantine", src_path: "d", dst_path: null, reason: "zero" },
    ];

    expect(countProposalActions(proposals)).toEqual({ quarantine: 2, move_to_year: 1 });
  });
});

describe("sessionStatus", () => {
  test("marks incomplete sessions as active", () => {
    const session: Session = {
      id: "sess-1",
      started_at: "2026-04-22T10:00:00Z",
      completed_at: null,
      kind: "apply",
      action_count: 3,
    };

    expect(sessionStatus(session)).toBe("active");
  });

  test("marks completed sessions as complete", () => {
    const session: Session = {
      id: "sess-2",
      started_at: "2026-04-22T10:00:00Z",
      completed_at: "2026-04-22T10:01:00Z",
      kind: "apply",
      action_count: 3,
    };

    expect(sessionStatus(session)).toBe("complete");
  });
});
