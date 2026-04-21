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

export class Sidecar {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(private readonly opts: SidecarOptions) {}

  async start(): Promise<void> {
    this.proc = spawn(this.opts.python, this.opts.args, {
      cwd: this.opts.cwd,
      env: { ...process.env, ...(this.opts.env ?? {}), PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => this.onLine(line));
    this.proc.stderr.on("data", (d) => process.stderr.write(`[sidecar] ${d}`));
    this.proc.on("exit", (code) => {
      for (const [, p] of this.pending) p.reject(new Error(`sidecar exited with code ${code}`));
      this.pending.clear();
    });
  }

  call<T>(method: string, params: unknown): Promise<T> {
    if (!this.proc || !this.proc.stdin.writable) return Promise.reject(new Error("sidecar not running"));
    const id = this.nextId++;
    const req = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.proc!.stdin.write(JSON.stringify(req) + "\n");
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
    if (!this.proc) return;
    this.proc.stdin.end();
    await new Promise<void>((r) => { this.proc!.on("exit", () => r()); });
    this.proc = null;
  }
}
