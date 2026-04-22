import { test, expect, _electron as electron } from "@playwright/test";

test("zero-byte route renders with count line", async () => {
  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CURATOR_E2E: "1" },
  });
  const win = await app.firstWindow();
  await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 10_000 });
  await win.getByRole("link", { name: "Zero-byte" }).click();
  await expect(win.getByRole("heading", { name: "Zero-byte files" })).toBeVisible({ timeout: 10_000 });
  await app.close();
});
