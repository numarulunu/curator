import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface UpdaterLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface UpdaterClient {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, handler: (...args: unknown[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface AutoUpdaterOptions {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  isE2E: boolean;
  disabled: boolean;
  logger: UpdaterLogger;
}

export function createUpdaterLogger(logPath: string): UpdaterLogger {
  mkdirSync(dirname(logPath), { recursive: true });

  function write(level: string, message: string): void {
    appendFileSync(logPath, `[${new Date().toISOString()}] ${level} ${message}\n`, "utf8");
  }

  return {
    info(message: string) {
      write("INFO", message);
    },
    warn(message: string) {
      write("WARN", message);
    },
    error(message: string) {
      write("ERROR", message);
    },
  };
}

function formatUpdaterMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function shouldStartAutoUpdater(options: AutoUpdaterOptions): boolean {
  return options.isPackaged && options.platform === "win32" && !options.isE2E && !options.disabled;
}

function registerUpdaterEvents(client: UpdaterClient, logger: UpdaterLogger): void {
  client.on("checking-for-update", () => logger.info("checking for updates"));
  client.on("update-available", (info) => logger.info(`update available ${JSON.stringify(info)}`));
  client.on("update-not-available", (info) => logger.info(`no update available ${JSON.stringify(info)}`));
  client.on("download-progress", (progress) => logger.info(`download progress ${JSON.stringify(progress)}`));
  client.on("update-downloaded", (info) => {
    logger.info(`update downloaded ${JSON.stringify(info)}`);
    logger.info("installing downloaded update");
    client.quitAndInstall(false, true);
  });
  client.on("error", (error) => logger.error(`updater error: ${formatUpdaterMessage(error)}`));
}

export async function startAutoUpdater(client: UpdaterClient, options: AutoUpdaterOptions): Promise<boolean> {
  if (!shouldStartAutoUpdater(options)) {
    options.logger.info("auto update skipped for this run");
    return false;
  }

  client.autoDownload = true;
  client.autoInstallOnAppQuit = true;
  registerUpdaterEvents(client, options.logger);

  try {
    await client.checkForUpdates();
    options.logger.info("auto update check requested");
    return true;
  } catch (error) {
    options.logger.error(`auto update check failed: ${formatUpdaterMessage(error)}`);
    return false;
  }
}
