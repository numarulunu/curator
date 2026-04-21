import { test, expect, _electron as electron } from "@playwright/test";

test("app launches and shows Dashboard", async () => {
  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CURATOR_E2E: "1" },
  });
  const win = await app.firstWindow();
  await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 10_000 });
  await expect(win.locator("nav")).toContainText("Exact duplicates");
  await app.close();
});
