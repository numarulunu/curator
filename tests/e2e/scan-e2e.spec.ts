import { test, expect, _electron as electron } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

test("scan pipeline walks temp archive end-to-end", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "curator-e2e-"));
  try {
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(path.join(tempRoot, `test-${i}.jpg`), "x");
    }

    const app = await electron.launch({
      args: ["out/main/index.js"],
      env: { ...process.env, CURATOR_E2E: "1", CURATOR_E2E_ROOT: tempRoot },
    });
    try {
      const win = await app.firstWindow();
      await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 15_000 });
      await expect(win.getByText(`Folder: ${tempRoot}`)).toBeVisible({ timeout: 15_000 });

      const startScan = win.getByRole("button", { name: "Start scan" });
      await expect(startScan).toBeEnabled({ timeout: 15_000 });
      await startScan.click();

      await expect(win.getByText(/Scanned 5 files/)).toBeVisible({ timeout: 15_000 });
    } finally {
      await app.close();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
