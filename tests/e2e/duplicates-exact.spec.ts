import { test, expect, _electron as electron } from "@playwright/test";

test("duplicates-exact route renders with Compute hashes button", async () => {
  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CURATOR_E2E: "1" },
  });
  const win = await app.firstWindow();
  await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 10_000 });
  await win.getByRole("link", { name: "Exact duplicates" }).click();
  await expect(win.locator("h1")).toHaveText("Exact duplicates", { timeout: 10_000 });
  await expect(win.getByRole("button", { name: "Compute hashes" })).toBeVisible({ timeout: 10_000 });
  await app.close();
});
