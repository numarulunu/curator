import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test("scan pipeline walks temp archive end-to-end", async () => {
  const stateRoot = makeTempDir("curator-e2e-state-");
  const archiveRoot = makeTempDir("curator-e2e-archive-");

  try {
    for (let i = 1; i <= 5; i += 1) {
      writeFileSync(path.join(archiveRoot, `test-${i}.jpg`), "x");
    }

    const app = await electron.launch({
      args: ["out/main/index.js"],
      env: { ...process.env, CURATOR_E2E: "1", LOCALAPPDATA: stateRoot },
    });

    try {
      const win = await app.firstWindow();
      await expect(win.getByText("Input")).toBeVisible({ timeout: 15_000 });

      const result = await win.evaluate(async (root) => {
        const scan = await window.curator.scan(root);
        await window.curator.hashAll(root);
        await window.curator.resolveDates(root);
        return scan;
      }, archiveRoot);

      expect(result).toEqual({ root: archiveRoot, scanned: 5 });
    } finally {
      await app.close();
    }
  } finally {
    rmSync(archiveRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("unsupported-only archive clears prior populated findings from the renderer", async () => {
  const stateRoot = makeTempDir("curator-e2e-state-");
  const supportedRoot = makeTempDir("curator-e2e-supported-");
  const unsupportedRoot = makeTempDir("curator-e2e-unsupported-");

  try {
    writeFileSync(path.join(supportedRoot, "keep-a.jpg"), "AAAA");
    writeFileSync(path.join(supportedRoot, "keep-b.jpg"), "AAAA");
    writeFileSync(path.join(unsupportedRoot, "notes.txt"), "plain text");
    writeFileSync(path.join(unsupportedRoot, "manifest.json"), "{}");

    const app = await electron.launch({
      args: ["out/main/index.js"],
      env: { ...process.env, CURATOR_E2E: "1", LOCALAPPDATA: stateRoot },
    });

    try {
      const win = await app.firstWindow();
      await expect(win.getByText("Input")).toBeVisible({ timeout: 15_000 });

      await win.evaluate((root) => {
        localStorage.setItem("curator.archiveRoot", root);
      }, supportedRoot);
      await win.reload();
      await expect(win.getByRole("button", { name: "Analyze Archive" })).toBeVisible({ timeout: 15_000 });
      await win.getByRole("button", { name: "Analyze Archive" }).click();
      await expect(win.getByText(/keep-[ab]\.jpg/)).toBeVisible({ timeout: 15_000 });
      await expect(win.getByRole("button", { name: "Build Plan" })).toBeVisible({ timeout: 15_000 });

      await win.evaluate((root) => {
        localStorage.setItem("curator.archiveRoot", root);
      }, unsupportedRoot);
      await win.reload();
      await expect(win.getByRole("button", { name: "Analyze Archive" })).toBeVisible({ timeout: 15_000 });
      await win.getByRole("button", { name: "Analyze Archive" }).click();

      await expect(win.getByText("No supported media files were indexed", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(win.getByText("Check that the selected folder contains supported photo/video formats and that Curator can access it.")).toBeVisible({ timeout: 15_000 });
      await expect(win.getByText("No supported media files found")).toBeVisible({ timeout: 15_000 });
      await expect(win.getByText("Curator only indexes supported photo/video formats in the selected archive.")).toBeVisible({ timeout: 15_000 });
      await expect(win.getByText(/keep-[ab]\.jpg/)).toHaveCount(0);
    } finally {
      await app.close();
    }
  } finally {
    rmSync(supportedRoot, { recursive: true, force: true });
    rmSync(unsupportedRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
