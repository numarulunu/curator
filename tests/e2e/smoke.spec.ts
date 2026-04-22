import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test("app launches with working sidecar", async () => {
  const stateRoot = makeTempDir("curator-e2e-state-");
  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CURATOR_E2E: "1", LOCALAPPDATA: stateRoot },
  });
  try {
    const win = await app.firstWindow();
    await expect(win.locator("h1")).toHaveText("Curator", { timeout: 10_000 });
    await expect(win.getByText("Sidecar Online")).toBeVisible({ timeout: 10_000 });
    await expect(win.locator("section").getByText("Choose an archive to begin")).toBeVisible({ timeout: 10_000 });
    await expect(win.getByRole("button", { name: "Select Archive" })).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("scan to apply to undo restores file state", async () => {
  const stateRoot = makeTempDir("curator-e2e-state-");
  const archiveRoot = makeTempDir("curator-e2e-archive-");
  const olderDir = path.join(archiveRoot, "2015");
  const newerDir = path.join(archiveRoot, "2016");
  mkdirSync(olderDir, { recursive: true });
  mkdirSync(newerDir, { recursive: true });

  const older = path.join(olderDir, "a.jpg");
  const newer = path.join(newerDir, "a.jpg");
  writeFileSync(older, "AAAA");
  writeFileSync(newer, "AAAA");
  utimesSync(older, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
  utimesSync(newer, new Date("2021-01-01T00:00:00Z"), new Date("2021-01-01T00:00:00Z"));

  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CURATOR_E2E: "1", LOCALAPPDATA: stateRoot },
  });

  try {
    const win = await app.firstWindow();
    await expect(win.locator("h1")).toHaveText("Curator", { timeout: 10_000 });

    await win.evaluate(async (root) => {
      await window.curator.scan(root);
      await window.curator.hashAll();
    }, archiveRoot);

    const proposals = await win.evaluate(async (root) => {
      return await window.curator.buildProposals(root);
    }, archiveRoot);
    expect(proposals.length).toBeGreaterThan(0);

    const applyResult = await win.evaluate(async ({ root, proposals: next }) => {
      return await window.curator.applyProposals(root, next);
    }, { root: archiveRoot, proposals });
    expect(applyResult.ok).toBe(proposals.length);
    expect(existsSync(newer)).toBe(false);
    expect(existsSync(older)).toBe(true);

    const undoResult = await win.evaluate(async (sessionId) => {
      return await window.curator.undoSession(sessionId);
    }, applyResult.session_id);
    expect(undoResult.restored).toBe(applyResult.ok);
    expect(existsSync(newer)).toBe(true);
    expect(existsSync(older)).toBe(true);
  } finally {
    await app.close();
    rmSync(archiveRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
