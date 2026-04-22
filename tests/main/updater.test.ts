import { describe, expect, it, vi } from "vitest";
import { startAutoUpdater } from "@main/updater";

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeClient() {
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  };
}

describe("startAutoUpdater", () => {
  it("enables auto download and checks for updates on packaged Windows builds", async () => {
    const client = makeClient();
    const logger = makeLogger();

    const started = await startAutoUpdater(client, {
      isPackaged: true,
      platform: "win32",
      isE2E: false,
      disabled: false,
      logger,
    });

    expect(started).toBe(true);
    expect(client.autoDownload).toBe(true);
    expect(client.autoInstallOnAppQuit).toBe(true);
    expect(client.on).toHaveBeenCalled();
    expect(client.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("installs automatically after an update has been downloaded", async () => {
    const client = makeClient();
    const logger = makeLogger();

    await startAutoUpdater(client, {
      isPackaged: true,
      platform: "win32",
      isE2E: false,
      disabled: false,
      logger,
    });

    const downloadedHandler = client.on.mock.calls.find(([event]) => event === "update-downloaded")?.[1];
    expect(downloadedHandler).toBeTypeOf("function");

    downloadedHandler?.({ version: "0.1.4" });

    expect(client.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("skips update checks for unpackaged runs", async () => {
    const client = makeClient();
    const logger = makeLogger();

    const started = await startAutoUpdater(client, {
      isPackaged: false,
      platform: "win32",
      isE2E: false,
      disabled: false,
      logger,
    });

    expect(started).toBe(false);
    expect(client.checkForUpdates).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/skipped/i));
  });
});
