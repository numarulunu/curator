import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, Interface } from "node:readline";

export interface SidecarOptions {
  python: string;
  cwd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

const DEFAULT_READY_TIMEOUT_MS = 15_000;

export class Sidecar {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private ready = false;

  constructor(private readonly opts: SidecarOptions) {}

  async start(extraEnv: NodeJS.ProcessEnv = {}, readyTimeoutMs: number = DEFAULT_READY_TIMEOUT_MS): Promise<void> {
    if (this.proc) return;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

      const proc = spawn(this.opts.python, this.opts.args, {
        cwd: this.opts.cwd,
        env: {
          ...process.env,
          ...(this.opts.env ?? {}),
          ...extraEnv,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.proc = proc;
      this.rl = createInterface({ input: proc.stdout });
      this.rl.on("line", (line) => this.onLine(line));
      proc.stderr.on("data", (d) => process.stderr.write(`[sidecar] ${d}`));

      proc.on("error", (err) => {
        for (const [, p] of this.pending) p.reject(err);
        this.pending.clear();
        this.proc = null;
        this.ready = false;
        settle(() => reject(new Error(`sidecar spawn failed: ${err.message}`)));
      });

      proc.on("exit", (code, signal) => {
        const wasReady = this.ready;
        this.ready = false;
        for (const [, p] of this.pending) p.reject(new Error(`sidecar exited (code=${code} signal=${signal})`));
        this.pending.clear();
        this.proc = null;
        if (!wasReady) {
          settle(() => reject(new Error(`sidecar exited before ready (code=${code} signal=${signal})`)));
        }
      });

      const timeout = setTimeout(() => {
        settle(() => {
          try { proc.kill(); } catch { /* ignore */ }
          reject(new Error(`sidecar did not become ready within ${readyTimeoutMs}ms`));
        });
      }, readyTimeoutMs);

      // Probe readiness with a ping. If the sidecar is healthy this round-trips quickly.
      this.callRaw<{ pong: boolean }>("ping", {})
        .then((r) => {
          if (!r || r.pong !== true) {
            throw new Error(`unexpected ping response: ${JSON.stringify(r)}`);
          }
          this.ready = true;
          clearTimeout(timeout);
          settle(() => resolve());
        })
        .catch((err) => {
          clearTimeout(timeout);
          settle(() => reject(err));
        });
    });
  }

  call<T>(method: string, params: unknown): Promise<T> {
    if (!this.ready) return Promise.reject(new Error("sidecar not ready"));
    return this.callRaw<T>(method, params);
  }

  private callRaw<T>(method: string, params: unknown): Promise<T> {
    const proc = this.proc;
    if (!proc || !proc.stdin.writable) return Promise.reject(new Error("sidecar not running"));
    const id = this.nextId++;
    const req = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      proc.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  private onLine(line: string): void {
    let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id == null) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message));
    else pending.resolve(msg.result);
  }

  async close(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    try { proc.stdin.end(); } catch { /* ignore */ }
    await new Promise<void>((r) => { proc.on("exit", () => r()); });
    this.proc = null;
    this.ready = false;
  }
}
