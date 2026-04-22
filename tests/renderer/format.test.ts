import { describe, expect, test } from "vitest";
import { formatBytes, formatDuration, formatNumber, shortHash } from "../../src/renderer/lib/format";

describe("formatNumber", () => {
  test("formats integers with separators", () => {
    expect(formatNumber(12345)).toBe("12,345");
  });
});

describe("formatBytes", () => {
  test("formats byte counts into human-readable units", () => {
    expect(formatBytes(1536)).toBe("1.50 KB");
  });
});

describe("shortHash", () => {
  test("shortens long hashes", () => {
    expect(shortHash("1234567890abcdef", 4, 4)).toBe("1234?cdef");
  });
});

describe("formatDuration", () => {
  test("formats elapsed time between timestamps", () => {
    expect(formatDuration("2026-04-22T10:00:00Z", "2026-04-22T10:01:05Z")).toBe("1m 5s");
  });
});
