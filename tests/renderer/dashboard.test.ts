import { describe, expect, test } from "vitest";
import { buildReviewRows, resolvePrimaryAction } from "../../src/renderer/lib/dashboard";
import type { DuplicateCluster, MisplacedFile, ZeroByteFile } from "../../src/shared/types";

describe("resolvePrimaryAction", () => {
  test("asks the user to select an archive before anything else", () => {
    expect(resolvePrimaryAction({ archiveRoot: null, isAnalyzed: false, proposalCount: 0 })).toMatchObject({
      stage: "select",
      label: "Select Archive",
    });
  });

  test("prefers analysis before planning", () => {
    expect(resolvePrimaryAction({ archiveRoot: "D:/archive", isAnalyzed: false, proposalCount: 0 })).toMatchObject({
      stage: "analyze",
      label: "Analyze Archive",
    });
  });

  test("builds a plan after findings exist", () => {
    expect(resolvePrimaryAction({ archiveRoot: "D:/archive", isAnalyzed: true, proposalCount: 0 })).toMatchObject({
      stage: "build",
      label: "Build Plan",
    });
  });

  test("applies a plan after proposals are ready", () => {
    expect(resolvePrimaryAction({ archiveRoot: "D:/archive", isAnalyzed: true, proposalCount: 4 })).toMatchObject({
      stage: "apply",
      label: "Apply Plan",
    });
  });
});

describe("buildReviewRows", () => {
  test("combines duplicate, misplaced, and zero-byte findings into one review list", () => {
    const duplicates: DuplicateCluster[] = [
      {
        xxhash: "hash-1",
        size: 100,
        count: 3,
        files: [
          { id: 1, path: "D:/archive/2015/a.jpg", size: 100, mtime_ns: 1 },
          { id: 2, path: "D:/archive/2016/a.jpg", size: 100, mtime_ns: 2 },
          { id: 3, path: "D:/archive/2017/a.jpg", size: 100, mtime_ns: 3 },
        ],
      },
    ];
    const misplaced: MisplacedFile[] = [
      {
        id: 11,
        path: "D:/archive/2016/b.jpg",
        canonical_date: "2015-08-01",
        date_source: "exif",
        folder_year: 2016,
        canonical_year: 2015,
      },
    ];
    const zeroByte: ZeroByteFile[] = [{ id: 21, path: "D:/archive/2018/c.jpg" }];

    expect(buildReviewRows(duplicates, misplaced, zeroByte)).toEqual([
      {
        key: "duplicate:hash-1",
        kind: "duplicate",
        path: "D:/archive/2015/a.jpg",
        title: "3 identical files",
        detail: "2 extra copies",
      },
      {
        key: "misplaced:11",
        kind: "misplaced",
        path: "D:/archive/2016/b.jpg",
        title: "2016 folder, should be 2015",
        detail: "Source: exif",
      },
      {
        key: "zero-byte:21",
        kind: "zero-byte",
        path: "D:/archive/2018/c.jpg",
        title: "Empty file",
        detail: "0 bytes on disk",
      },
    ]);
  });
});
