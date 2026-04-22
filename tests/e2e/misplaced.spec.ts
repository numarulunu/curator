import { test, expect, _electron as electron } from "@playwright/test";

test("misplaced route renders with Resolve button", async () => {
  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CURATOR_E2E: "1" },
  });
  const win = await app.firstWindow();
  await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 10_000 });
  await win.getByRole("link", { name: "Misplaced by date" }).click();
  await expect(win.getByRole("heading", { name: "Misplaced by date" })).toBeVisible({ timeout: 10_000 });
  await expect(win.getByRole("button", { name: /Resolve dates/ })).toBeVisible();
  await app.close();
});
