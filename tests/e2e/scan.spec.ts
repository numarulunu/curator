import { test, expect, _electron as electron } from "@playwright/test";

test("scan button disabled until folder picked", async () => {
  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CURATOR_E2E: "1" },
  });
  const win = await app.firstWindow();
  await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 10_000 });
  const startScan = win.getByRole("button", { name: "Start scan" });
  await expect(startScan).toBeVisible({ timeout: 10_000 });
  await expect(startScan).toBeDisabled();
  await app.close();
});
