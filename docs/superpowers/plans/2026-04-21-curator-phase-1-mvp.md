# Archive Curator — Phase 1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a portable Windows Electron app that scans a ~325 GB personal media archive, detects exact duplicates, fixes file dates via EXIF priority chain, and executes approved moves/renames through a quarantine-based apply engine with undo.

**Architecture:** Electron main process (Node/TypeScript) spawns a Python 3.11 sidecar for heavy lifting (xxhash, EXIF, ffprobe); renderer (React + Tailwind + shadcn/ui) drives the UI; JSON-RPC 2.0 over stdio is the Node↔Python contract; SQLite single-file index lives at `%LOCALAPPDATA%\Curator\index.db`; ffmpeg/ffprobe/exiftool binaries ship bundled in `resources/bin/`. Final deliverable is a single portable `.exe` built by electron-builder with Python sidecar packed via PyInstaller.

**Tech Stack:** Electron 30+, TypeScript 5.5+, React 18, Vite (via electron-vite), Tailwind 3, shadcn/ui, better-sqlite3 11, zod, Python 3.11, xxhash, pyexiftool, Pillow, Vitest, Playwright, pytest, PyInstaller, electron-builder (portable target).

**Scope:** Phase 1 only. Perceptual dedup (pHash/PDQ/vPDQ/Chromaprint), classifiers (Motion Photo, burst, screenshot, corrupt, junk), keeper scoring, and apply robustness are **deferred to Phases 2–4**.

---

## File Structure Map

```
D:\curator\
├── package.json                       # npm scripts, deps, electron-builder config
├── electron.vite.config.ts            # electron-vite build config
├── tsconfig.json                      # TS config (references per-workspace)
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
├── .editorconfig
├── README.md
├── docs/
│   └── superpowers/plans/2026-04-21-curator-phase-1-mvp.md   (this file)
├── src/
│   ├── main/                          # Electron main process (Node)
│   │   ├── index.ts                   # App entrypoint, BrowserWindow, lifecycle
│   │   ├── sidecar.ts                 # Python sidecar spawn + JSON-RPC client
│   │   ├── ipc.ts                     # ipcMain handlers that proxy to sidecar
│   │   ├── paths.ts                   # Resolve %LOCALAPPDATA% + bundled binary paths
│   │   └── db.ts                      # better-sqlite3 connection + schema bootstrap
│   ├── preload/
│   │   └── index.ts                   # contextBridge exposing IPC API to renderer
│   ├── renderer/                      # React UI
│   │   ├── index.html
│   │   ├── main.tsx                   # React root
│   │   ├── App.tsx                    # Router shell + layout
│   │   ├── routes/
│   │   │   ├── Dashboard.tsx          # Archive status, counts, start scan
│   │   │   ├── DuplicatesExact.tsx    # Cluster review for exact dupes
│   │   │   ├── MisplacedByDate.tsx    # Files in wrong year folder
│   │   │   ├── ZeroByte.tsx           # Zero-byte files
│   │   │   ├── Apply.tsx              # Pending actions + apply button + progress
│   │   │   └── Sessions.tsx           # Past sessions + undo
│   │   ├── components/
│   │   │   ├── ClusterCard.tsx        # Single duplicate cluster (files + actions)
│   │   │   ├── FileThumb.tsx          # Thumbnail + metadata hover
│   │   │   ├── ProgressBar.tsx
│   │   │   └── ActionButton.tsx
│   │   ├── lib/
│   │   │   ├── ipc.ts                 # Typed wrapper around window.curator
│   │   │   └── utils.ts               # cn() etc.
│   │   └── styles/
│   │       └── globals.css            # Tailwind directives
│   └── shared/
│       └── types.ts                   # IPC contract types (shared Node↔Renderer)
├── python/
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── curator/
│   │   ├── __init__.py
│   │   ├── __main__.py                # Entry: read stdin JSON-RPC, dispatch
│   │   ├── rpc.py                     # JSON-RPC 2.0 server over stdio
│   │   ├── db.py                      # sqlite3 connection + schema helpers
│   │   ├── paths.py                   # Binary resolution from env var
│   │   ├── walker.py                  # Recursive archive scan
│   │   ├── hasher.py                  # xxhash exact dedup
│   │   ├── exif.py                    # pyexiftool batch mode
│   │   ├── dater.py                   # Canonical date priority chain
│   │   ├── apply.py                   # Atomic move to quarantine + session manifest
│   │   └── undo.py                    # Reverse session moves
│   └── tests/
│       ├── conftest.py
│       ├── test_hasher.py
│       ├── test_dater.py
│       ├── test_walker.py
│       └── test_apply.py
├── resources/
│   └── bin/                           # Bundled binaries (gitignored; download script)
│       ├── exiftool.exe
│       ├── ffmpeg.exe
│       └── ffprobe.exe
├── scripts/
│   ├── fetch-binaries.ps1             # Downloads exiftool + ffmpeg to resources/bin/
│   └── build-sidecar.ps1              # PyInstaller one-file build
├── tests/
│   ├── main/                          # Vitest for Node
│   │   └── sidecar.test.ts
│   └── e2e/                           # Playwright Electron tests
│       └── smoke.spec.ts
└── out/                               # electron-vite build output (gitignored)
```

Each file has one clear responsibility. `src/shared/types.ts` is the single source of truth for IPC contracts — both Node and the renderer import from it.

---

## Milestone 1 — Project Scaffolding (Tasks 1–8)

### Task 1: Initialize repo + baseline files

**Files:**
- Create: `D:/curator/.gitignore`
- Create: `D:/curator/.editorconfig`
- Create: `D:/curator/README.md`

- [ ] **Step 1: Verify Node and pnpm available**

Run: `node --version && pnpm --version`
Expected: Node ≥ 20, pnpm ≥ 9. If pnpm missing: `npm install -g pnpm`.

- [ ] **Step 2: Initialize git**

Run: `cd /d/curator && git init && git branch -M main`
Expected: "Initialized empty Git repository".

- [ ] **Step 3: Write `.gitignore`**

```gitignore
# deps
node_modules/
python/.venv/
python/**/__pycache__/
*.egg-info/

# build
out/
dist/
release/
*.spec

# bundled binaries (fetched separately)
resources/bin/*.exe

# local state
.env.local
*.log

# IDE
.vscode/
.idea/
*.swp
.DS_Store
Thumbs.db
```

- [ ] **Step 4: Write `.editorconfig`**

```editorconfig
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Write minimal README.md**

```markdown
# Archive Curator

Portable Electron app for deduplicating and reorganizing a personal media archive before compression.

## Dev setup

    pnpm install
    pwsh scripts/fetch-binaries.ps1
    pnpm run dev

## Build portable .exe

    pnpm run build:sidecar
    pnpm run build

Output: `release/Curator-portable.exe`
```

- [ ] **Step 6: Commit**

```bash
cd /d/curator && git add .gitignore .editorconfig README.md && git commit -m "chore: init repo with baseline config"
```

---

### Task 2: Scaffold Electron + React + Vite via electron-vite template

**Files:**
- Create: `D:/curator/package.json`
- Create: `D:/curator/tsconfig.json`
- Create: `D:/curator/tsconfig.node.json`
- Create: `D:/curator/electron.vite.config.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "curator",
  "version": "0.1.0",
  "description": "Archive Curator — dedup + reorg tool",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder --win portable",
    "build:sidecar": "pwsh scripts/build-sidecar.ps1",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "test:py": "cd python && pytest",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.node.json --noEmit",
    "fetch-bins": "pwsh scripts/fetch-binaries.ps1"
  },
  "dependencies": {
    "better-sqlite3": "11.3.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "7.6.11",
    "@types/node": "22.5.4",
    "@types/react": "18.3.5",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "autoprefixer": "10.4.20",
    "electron": "32.0.1",
    "electron-builder": "25.0.5",
    "electron-vite": "2.3.0",
    "playwright": "1.47.0",
    "postcss": "8.4.45",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "tailwindcss": "3.4.10",
    "typescript": "5.5.4",
    "vite": "5.4.3",
    "vitest": "2.0.5"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3",
      "electron",
      "esbuild"
    ]
  },
  "build": {
    "appId": "com.ionut.curator",
    "productName": "Curator",
    "directories": { "output": "release" },
    "files": ["out/**/*", "resources/**/*"],
    "extraResources": [
      { "from": "resources/bin", "to": "bin", "filter": ["**/*"] },
      { "from": "dist-sidecar", "to": "sidecar", "filter": ["**/*"] }
    ],
    "win": { "target": "portable" },
    "portable": { "artifactName": "Curator-portable.exe" }
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"],
      "@preload/*": ["src/preload/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "out", "release"]
}
```

- [ ] **Step 3: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write `electron.vite.config.ts`**

```typescript
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/main" },
    resolve: { alias: { "@main": resolve("src/main"), "@shared": resolve("src/shared") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/preload" },
    resolve: { alias: { "@shared": resolve("src/shared") } },
  },
  renderer: {
    plugins: [react()],
    build: { outDir: "out/renderer" },
    resolve: { alias: { "@renderer": resolve("src/renderer"), "@shared": resolve("src/shared") } },
    root: "src/renderer",
  },
});
```

- [ ] **Step 5: Install deps**

Run: `cd /d/curator && pnpm install`
Expected: no errors; `node_modules/` populated; `better-sqlite3` native build succeeds (needs VS Build Tools on Windows).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.node.json electron.vite.config.ts && git commit -m "chore: scaffold Electron + React + Vite"
```

---

### Task 3: Tailwind + shadcn/ui + global styles

**Files:**
- Create: `D:/curator/tailwind.config.js`
- Create: `D:/curator/postcss.config.js`
- Create: `D:/curator/src/renderer/styles/globals.css`
- Create: `D:/curator/src/renderer/lib/utils.ts`

- [ ] **Step 1: Write `tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 4%)",
        foreground: "hsl(0 0% 98%)",
        muted: "hsl(0 0% 14%)",
        "muted-foreground": "hsl(0 0% 60%)",
        border: "hsl(0 0% 18%)",
        accent: "hsl(0 0% 98%)",
        "accent-foreground": "hsl(0 0% 4%)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
};
```

- [ ] **Step 2: Write `postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Write `src/renderer/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body {
  background: hsl(0 0% 4%);
  color: hsl(0 0% 98%);
  font-family: Inter, system-ui, sans-serif;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
}
```

- [ ] **Step 4: Write `src/renderer/lib/utils.ts`**

```typescript
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
```

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js postcss.config.js src/renderer/styles src/renderer/lib && git commit -m "chore: add Tailwind + global styles"
```

---

### Task 4: Minimal Electron main + preload + renderer shell that boots

**Files:**
- Create: `D:/curator/src/shared/types.ts`
- Create: `D:/curator/src/main/index.ts`
- Create: `D:/curator/src/preload/index.ts`
- Create: `D:/curator/src/renderer/index.html`
- Create: `D:/curator/src/renderer/main.tsx`
- Create: `D:/curator/src/renderer/App.tsx`

- [ ] **Step 1: Write `src/shared/types.ts` (stub IPC contract)**

```typescript
export type AppVersion = { node: string; electron: string };

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
}

declare global {
  interface Window { curator: CuratorApi }
}
```

- [ ] **Step 2: Write `src/main/index.ts`**

```typescript
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { AppVersion } from "@shared/types";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (!app.isPackaged) win.webContents.openDevTools({ mode: "detach" });
}

ipcMain.handle("curator:getVersion", (): AppVersion => ({
  node: process.versions.node,
  electron: process.versions.electron,
}));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 3: Write `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from "electron";
import type { CuratorApi } from "@shared/types";

const api: CuratorApi = {
  getVersion: () => ipcRenderer.invoke("curator:getVersion"),
};

contextBridge.exposeInMainWorld("curator", api);
```

- [ ] **Step 4: Write `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Curator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `src/renderer/main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Write `src/renderer/App.tsx`**

```typescript
import { useEffect, useState } from "react";
import type { AppVersion } from "@shared/types";

export default function App(): JSX.Element {
  const [ver, setVer] = useState<AppVersion | null>(null);

  useEffect(() => {
    window.curator.getVersion().then(setVer);
  }, []);

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Curator</h1>
      <p className="text-muted-foreground mt-2">
        {ver ? `Electron ${ver.electron} • Node ${ver.node}` : "Loading..."}
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Run dev server**

Run: `pnpm run dev`
Expected: Electron window opens, "Curator" headline visible, subtitle shows Electron/Node versions after ~1s.

- [ ] **Step 8: Commit**

```bash
git add src/ && git commit -m "feat: minimal Electron shell with IPC version handshake"
```

---

### Task 5: Paths module + LOCALAPPDATA resolution

**Files:**
- Create: `D:/curator/src/main/paths.ts`
- Create: `D:/curator/tests/main/paths.test.ts`
- Create: `D:/curator/vitest.config.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: {
    alias: {
      "@main": resolve("src/main"),
      "@shared": resolve("src/shared"),
    },
  },
});
```

- [ ] **Step 2: Write failing test `tests/main/paths.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveCuratorStateDir, resolveBinaryPath } from "@main/paths";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("paths", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "curator-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("resolves state dir under LOCALAPPDATA/Curator and creates it", () => {
    const out = resolveCuratorStateDir(tmp);
    expect(out).toBe(join(tmp, "Curator"));
  });

  it("returns bundled binary path when packaged", () => {
    const p = resolveBinaryPath("/fake/resources", "exiftool.exe");
    expect(p).toBe(join("/fake/resources", "bin", "exiftool.exe"));
  });
});
```

- [ ] **Step 3: Run test, expect fail**

Run: `pnpm vitest run tests/main/paths.test.ts`
Expected: FAIL with "Cannot find module '@main/paths'".

- [ ] **Step 4: Write `src/main/paths.ts`**

```typescript
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function resolveCuratorStateDir(base?: string): string {
  const root = base ?? process.env.LOCALAPPDATA ?? process.env.HOME ?? "";
  const dir = join(root, "Curator");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveBinaryPath(resourcesRoot: string, binName: string): string {
  return join(resourcesRoot, "bin", binName);
}
```

- [ ] **Step 5: Run test, expect pass**

Run: `pnpm vitest run tests/main/paths.test.ts`
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/main/paths.ts tests/main/paths.test.ts && git commit -m "feat: paths module with LOCALAPPDATA state dir"
```

---

### Task 6: App router shell with sidebar navigation

**Files:**
- Create: `D:/curator/src/renderer/App.tsx` (modify)
- Create: `D:/curator/src/renderer/routes/Dashboard.tsx`
- Create: `D:/curator/src/renderer/components/Sidebar.tsx`

- [ ] **Step 1: Install react-router**

Run: `pnpm add react-router-dom@6.26.2`

- [ ] **Step 2: Write `src/renderer/components/Sidebar.tsx`**

```typescript
import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/duplicates-exact", label: "Exact duplicates" },
  { to: "/misplaced", label: "Misplaced by date" },
  { to: "/zero-byte", label: "Zero-byte" },
  { to: "/apply", label: "Apply" },
  { to: "/sessions", label: "Sessions" },
];

export function Sidebar(): JSX.Element {
  return (
    <nav className="w-56 border-r border-border p-4 flex flex-col gap-1">
      <div className="text-sm font-semibold tracking-tight mb-4">Curator</div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/"}
          className={({ isActive }) =>
            cn(
              "px-3 py-2 rounded-md text-sm transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Write `src/renderer/routes/Dashboard.tsx`**

```typescript
import { useEffect, useState } from "react";
import type { AppVersion } from "@shared/types";

export function Dashboard(): JSX.Element {
  const [ver, setVer] = useState<AppVersion | null>(null);
  useEffect(() => { window.curator.getVersion().then(setVer); }, []);
  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground mt-2">
        {ver ? `Electron ${ver.electron} • Node ${ver.node}` : "Loading..."}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `src/renderer/App.tsx`**

```typescript
import { HashRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./routes/Dashboard";

function Placeholder({ title }: { title: string }): JSX.Element {
  return <div className="p-8"><h1 className="text-3xl font-semibold tracking-tight">{title}</h1></div>;
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/duplicates-exact" element={<Placeholder title="Exact duplicates" />} />
            <Route path="/misplaced" element={<Placeholder title="Misplaced by date" />} />
            <Route path="/zero-byte" element={<Placeholder title="Zero-byte" />} />
            <Route path="/apply" element={<Placeholder title="Apply" />} />
            <Route path="/sessions" element={<Placeholder title="Sessions" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
```

- [ ] **Step 5: Launch and verify**

Run: `pnpm run dev`
Expected: sidebar shows six nav items; clicking each swaps the main panel title; no console errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer package.json pnpm-lock.yaml && git commit -m "feat: router shell with sidebar nav"
```

---

### Task 7: Binary fetch script

**Files:**
- Create: `D:/curator/scripts/fetch-binaries.ps1`

- [ ] **Step 1: Write `scripts/fetch-binaries.ps1`**

```powershell
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root "resources\bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null

function Fetch-Zip($url, $innerExe, $outExe) {
  $tmp = New-TemporaryFile
  $zip = "$($tmp.FullName).zip"
  Rename-Item $tmp.FullName $zip
  Invoke-WebRequest -Uri $url -OutFile $zip
  $extract = "$zip.extracted"
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  $src = Get-ChildItem -Path $extract -Recurse -Filter $innerExe | Select-Object -First 1
  if (-not $src) { throw "$innerExe not found in $url" }
  Copy-Item -Path $src.FullName -Destination (Join-Path $bin $outExe) -Force
  # exiftool Windows distro ships with an `exiftool_files/` Perl-runtime sidecar
  # directory. The renamed .exe loader fails with "Could not find perl5*.dll"
  # without it, so copy the sidecar when present.
  $support = Join-Path $src.Directory.FullName "exiftool_files"
  if (Test-Path $support) {
    $dest = Join-Path $bin "exiftool_files"
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Path $support -Destination $dest -Recurse -Force
  }
  Remove-Item -Recurse -Force $extract, $zip
}

Write-Host "Fetching exiftool..."
# Pin to a specific version — exiftool.org rotates old versions off the root,
# so the URL needs periodic refresh. Check https://exiftool.org/ for current.
Fetch-Zip "https://exiftool.org/exiftool-13.57_64.zip" "exiftool(-k).exe" "exiftool.exe"

Write-Host "Fetching ffmpeg (includes ffprobe)..."
$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$tmp = New-TemporaryFile; $zip = "$($tmp.FullName).zip"; Rename-Item $tmp.FullName $zip
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zip
$extract = "$zip.extracted"
Expand-Archive -Path $zip -DestinationPath $extract -Force
Copy-Item (Get-ChildItem $extract -Recurse -Filter "ffmpeg.exe" | Select -First 1).FullName (Join-Path $bin "ffmpeg.exe") -Force
Copy-Item (Get-ChildItem $extract -Recurse -Filter "ffprobe.exe" | Select -First 1).FullName (Join-Path $bin "ffprobe.exe") -Force
Remove-Item -Recurse -Force $extract, $zip

Write-Host "Done. Binaries in $bin"
Get-ChildItem $bin
```

- [ ] **Step 2: Run it**

Run: `pnpm run fetch-bins`
Expected: `resources/bin/` contains `exiftool.exe`, `ffmpeg.exe`, `ffprobe.exe`.

- [ ] **Step 3: Verify binaries run**

Run: `resources/bin/exiftool.exe -ver && resources/bin/ffprobe.exe -version | head -1`
Expected: exiftool version (e.g., `13.00`); ffprobe version banner.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-binaries.ps1 && git commit -m "chore: add binary fetch script for exiftool + ffmpeg"
```

---

### Task 8: Milestone 1 smoke test with Playwright

**Files:**
- Create: `D:/curator/playwright.config.ts`
- Create: `D:/curator/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Write `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
```

- [ ] **Step 2: Write failing test `tests/e2e/smoke.spec.ts`**

```typescript
import { test, expect, _electron as electron } from "@playwright/test";

test("app launches and shows Dashboard", async () => {
  const app = await electron.launch({ args: ["out/main/index.js"] });
  const win = await app.firstWindow();
  await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 10_000 });
  await expect(win.locator("nav")).toContainText("Exact duplicates");
  await app.close();
});
```

- [ ] **Step 3: Install Playwright browsers**

Run: `pnpm exec playwright install chromium`

- [ ] **Step 4: Build and run test**

Run: `pnpm run build:unpacked 2>/dev/null; pnpm exec electron-vite build && pnpm run test:e2e`

Note: if `build:unpacked` is not a script yet, just run: `pnpm exec electron-vite build && pnpm run test:e2e`
Expected: test PASSES (app launches, Dashboard heading and sidebar visible).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e package.json && git commit -m "test: add Playwright smoke test for app boot"
```

---

## Milestone 2 — Python Sidecar + JSON-RPC (Tasks 9–14)

### Task 9: Python project skeleton

**Files:**
- Create: `D:/curator/python/pyproject.toml`
- Create: `D:/curator/python/requirements.txt`
- Create: `D:/curator/python/curator/__init__.py`
- Create: `D:/curator/python/curator/__main__.py`

- [ ] **Step 1: Verify Python 3.11**

Run: `py -3.11 --version`
Expected: `Python 3.11.x`. If not, install Python 3.11 from python.org or `winget install Python.Python.3.11`. All subsequent venv and pip commands MUST use `py -3.11` (not bare `python`) because the system default may be a newer Python version for which some wheels (pyexiftool, Pillow pins) are not yet available.

- [ ] **Step 2: Write `python/pyproject.toml`**

```toml
[project]
name = "curator"
version = "0.1.0"
requires-python = ">=3.11"

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 3: Write `python/requirements.txt`**

```
xxhash==3.5.0
pillow==10.4.0
pyexiftool==0.5.6
pytest==8.3.2
```

- [ ] **Step 4: Create venv and install**

Run: `cd /d/curator/python && py -3.11 -m venv .venv && .venv/Scripts/python -m pip install -U pip && .venv/Scripts/pip install -r requirements.txt`
Expected: all packages install cleanly; `.venv/Scripts/python.exe --version` reports `Python 3.11.x`.

- [ ] **Step 5: Write `python/curator/__init__.py`**

```python
__version__ = "0.1.0"
```

- [ ] **Step 6: Write placeholder `python/curator/__main__.py`**

```python
from curator.rpc import serve_stdio


def main() -> None:
    serve_stdio()


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "chore: Python sidecar project skeleton"
```

---

### Task 10: JSON-RPC 2.0 server over stdio

**Files:**
- Create: `D:/curator/python/curator/rpc.py`
- Create: `D:/curator/python/tests/test_rpc.py`
- Create: `D:/curator/python/tests/conftest.py`

- [ ] **Step 1: Write `python/tests/conftest.py`**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

- [ ] **Step 2: Write failing test `python/tests/test_rpc.py`**

```python
import json
import io
from curator.rpc import dispatch, register, REGISTRY


def test_dispatch_registered_method():
    REGISTRY.clear()

    @register("echo")
    def echo(payload):
        return {"you_said": payload["msg"]}

    req = {"jsonrpc": "2.0", "id": 1, "method": "echo", "params": {"msg": "hi"}}
    resp = dispatch(req)
    assert resp == {"jsonrpc": "2.0", "id": 1, "result": {"you_said": "hi"}}


def test_dispatch_unknown_method_returns_error():
    REGISTRY.clear()
    req = {"jsonrpc": "2.0", "id": 2, "method": "does_not_exist", "params": {}}
    resp = dispatch(req)
    assert resp["error"]["code"] == -32601
    assert resp["id"] == 2


def test_dispatch_handler_exception_returns_error():
    REGISTRY.clear()

    @register("boom")
    def boom(_payload):
        raise ValueError("kaboom")

    req = {"jsonrpc": "2.0", "id": 3, "method": "boom", "params": {}}
    resp = dispatch(req)
    assert resp["error"]["code"] == -32000
    assert "kaboom" in resp["error"]["message"]
```

- [ ] **Step 3: Run test, expect fail**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_rpc.py -v`
Expected: FAIL — `No module named 'curator.rpc'`.

- [ ] **Step 4: Write `python/curator/rpc.py`**

```python
from __future__ import annotations
import json
import sys
import traceback
from typing import Any, Callable, Dict

Handler = Callable[[Dict[str, Any]], Any]
REGISTRY: Dict[str, Handler] = {}


def register(name: str) -> Callable[[Handler], Handler]:
    def deco(fn: Handler) -> Handler:
        REGISTRY[name] = fn
        return fn
    return deco


def dispatch(req: Dict[str, Any]) -> Dict[str, Any]:
    rid = req.get("id")
    method = req.get("method")
    params = req.get("params", {}) or {}
    handler = REGISTRY.get(method or "")
    if handler is None:
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}}
    try:
        result = handler(params)
        return {"jsonrpc": "2.0", "id": rid, "result": result}
    except Exception as e:
        return {
            "jsonrpc": "2.0", "id": rid,
            "error": {"code": -32000, "message": str(e), "data": traceback.format_exc()},
        }


def serve_stdio() -> None:
    # Line-delimited JSON. One request per line; one response per line.
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            resp = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}}
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
            continue
        resp = dispatch(req)
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()
```

- [ ] **Step 5: Run test, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_rpc.py -v`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
cd /d/curator && git add python/curator/rpc.py python/tests/ && git commit -m "feat: JSON-RPC 2.0 server over stdio"
```

---

### Task 11: Built-in RPC methods (ping, version)

**Files:**
- Modify: `D:/curator/python/curator/__main__.py`
- Create: `D:/curator/python/curator/builtins.py`
- Create: `D:/curator/python/tests/test_builtins.py`

- [ ] **Step 1: Write failing test `python/tests/test_builtins.py`**

```python
from curator.rpc import dispatch, REGISTRY
import curator.builtins  # registers handlers


def test_ping():
    req = {"jsonrpc": "2.0", "id": 1, "method": "ping", "params": {}}
    resp = dispatch(req)
    assert resp["result"] == {"pong": True}


def test_version():
    req = {"jsonrpc": "2.0", "id": 2, "method": "version", "params": {}}
    resp = dispatch(req)
    assert "python" in resp["result"]
    assert resp["result"]["sidecar"] == "0.1.0"
```

- [ ] **Step 2: Run test, expect fail**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_builtins.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `python/curator/builtins.py`**

```python
import sys
from curator import __version__
from curator.rpc import register


@register("ping")
def ping(_params):
    return {"pong": True}


@register("version")
def version(_params):
    return {"sidecar": __version__, "python": sys.version.split()[0]}
```

- [ ] **Step 4: Update `python/curator/__main__.py`**

```python
import curator.builtins  # noqa: F401  (register decorators run on import)
from curator.rpc import serve_stdio


def main() -> None:
    serve_stdio()


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run test, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest -v`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: builtin RPC methods ping + version"
```

---

### Task 12: Node sidecar client (spawn + request/response)

**Files:**
- Create: `D:/curator/src/main/sidecar.ts`
- Create: `D:/curator/tests/main/sidecar.test.ts`

- [ ] **Step 1: Write failing test `tests/main/sidecar.test.ts`**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { Sidecar } from "@main/sidecar";
import { resolve } from "node:path";

describe("Sidecar", () => {
  let sc: Sidecar | null = null;
  afterEach(async () => { if (sc) await sc.close(); sc = null; });

  it("ping returns pong", async () => {
    sc = new Sidecar({
      python: resolve("python/.venv/Scripts/python.exe"),
      cwd: resolve("python"),
      args: ["-m", "curator"],
    });
    await sc.start();
    const result = await sc.call<{ pong: boolean }>("ping", {});
    expect(result.pong).toBe(true);
  });

  it("unknown method rejects with rpc error", async () => {
    sc = new Sidecar({
      python: resolve("python/.venv/Scripts/python.exe"),
      cwd: resolve("python"),
      args: ["-m", "curator"],
    });
    await sc.start();
    await expect(sc.call("nope", {})).rejects.toThrow(/Method not found/);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `pnpm vitest run tests/main/sidecar.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/main/sidecar.ts`**

```typescript
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm vitest run tests/main/sidecar.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sidecar.ts tests/main/sidecar.test.ts && git commit -m "feat: Node sidecar client with JSON-RPC over stdio"
```

---

### Task 13: Wire sidecar into main process lifecycle

**Files:**
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/shared/types.ts`
- Modify: `D:/curator/src/preload/index.ts`
- Modify: `D:/curator/src/renderer/routes/Dashboard.tsx`

- [ ] **Step 1: Extend `src/shared/types.ts`**

```typescript
export type AppVersion = { node: string; electron: string };
export type SidecarVersion = { sidecar: string; python: string };

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
}

declare global {
  interface Window { curator: CuratorApi }
}
```

- [ ] **Step 2: Rewrite `src/main/index.ts`**

```typescript
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { AppVersion, SidecarVersion } from "@shared/types";
import { Sidecar } from "./sidecar";

let sidecar: Sidecar | null = null;

function resolveSidecar(): Sidecar {
  if (app.isPackaged) {
    const exe = join(process.resourcesPath, "sidecar", "curator-sidecar.exe");
    return new Sidecar({ python: exe, cwd: join(process.resourcesPath, "sidecar"), args: [] });
  }
  return new Sidecar({
    python: join(app.getAppPath(), "python", ".venv", "Scripts", "python.exe"),
    cwd: join(app.getAppPath(), "python"),
    args: ["-m", "curator"],
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600, backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  if (!app.isPackaged) win.webContents.openDevTools({ mode: "detach" });
}

ipcMain.handle("curator:getVersion", (): AppVersion => ({
  node: process.versions.node, electron: process.versions.electron,
}));
ipcMain.handle("curator:getSidecarVersion", async (): Promise<SidecarVersion> => {
  return await sidecar!.call<SidecarVersion>("version", {});
});
ipcMain.handle("curator:ping", async (): Promise<boolean> => {
  const r = await sidecar!.call<{ pong: boolean }>("ping", {});
  return r.pong;
});

app.whenReady().then(async () => {
  sidecar = resolveSidecar();
  await sidecar.start();
  createWindow();
});

app.on("window-all-closed", async () => {
  if (sidecar) { await sidecar.close(); sidecar = null; }
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 3: Extend `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from "electron";
import type { CuratorApi } from "@shared/types";

const api: CuratorApi = {
  getVersion: () => ipcRenderer.invoke("curator:getVersion"),
  getSidecarVersion: () => ipcRenderer.invoke("curator:getSidecarVersion"),
  ping: () => ipcRenderer.invoke("curator:ping"),
};
contextBridge.exposeInMainWorld("curator", api);
```

- [ ] **Step 4: Update `src/renderer/routes/Dashboard.tsx`**

```typescript
import { useEffect, useState } from "react";
import type { AppVersion, SidecarVersion } from "@shared/types";

export function Dashboard(): JSX.Element {
  const [app, setApp] = useState<AppVersion | null>(null);
  const [py, setPy] = useState<SidecarVersion | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    window.curator.getVersion().then(setApp);
    window.curator.getSidecarVersion().then(setPy).catch(() => setPy(null));
    window.curator.ping().then(setOk).catch(() => setOk(false));
  }, []);

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">App: {app ? `Electron ${app.electron} • Node ${app.node}` : "…"}</p>
      <p className="text-muted-foreground">Sidecar: {py ? `${py.sidecar} • Python ${py.python}` : "…"}</p>
      <p className="text-muted-foreground">Ping: {ok == null ? "…" : ok ? "pong" : "FAILED"}</p>
    </div>
  );
}
```

- [ ] **Step 5: Run dev, verify**

Run: `pnpm run dev`
Expected: Dashboard shows Electron version, sidecar version, and "Ping: pong".

- [ ] **Step 6: Commit**

```bash
git add src/ && git commit -m "feat: wire Python sidecar into Electron main lifecycle"
```

---

### Task 14: Milestone 2 e2e test

**Files:**
- Modify: `D:/curator/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Extend smoke test**

```typescript
import { test, expect, _electron as electron } from "@playwright/test";

test("app launches with working sidecar", async () => {
  const app = await electron.launch({ args: ["out/main/index.js"] });
  const win = await app.firstWindow();
  await expect(win.locator("h1")).toHaveText("Dashboard", { timeout: 10_000 });
  await expect(win.getByText(/Ping: pong/)).toBeVisible({ timeout: 10_000 });
  await expect(win.getByText(/Sidecar: 0\.1\.0/)).toBeVisible({ timeout: 10_000 });
  await app.close();
});
```

- [ ] **Step 2: Build + run e2e**

Run: `pnpm exec electron-vite build && pnpm run test:e2e`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke.spec.ts && git commit -m "test: e2e verifies sidecar handshake"
```

---

## Milestone 3 — SQLite Index (Tasks 15–19)

### Task 15: Index schema + bootstrap (Node side)

**Files:**
- Create: `D:/curator/src/main/db.ts`
- Create: `D:/curator/tests/main/db.test.ts`

- [ ] **Step 1: Write failing test `tests/main/db.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDb, runMigrations } from "@main/db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

describe("db", () => {
  let dir: string;
  let db: Database.Database;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "curator-db-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
  });
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  it("creates files table with expected columns", () => {
    const cols = db.prepare(`PRAGMA table_info(files)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const n of ["id", "path", "size", "mtime_ns", "xxhash", "canonical_date", "date_source", "exif_json"]) {
      expect(names).toContain(n);
    }
  });

  it("uses WAL mode and NORMAL sync", () => {
    const jm = db.prepare("PRAGMA journal_mode").pluck().get();
    const sy = db.prepare("PRAGMA synchronous").pluck().get();
    expect(jm).toBe("wal");
    expect(sy).toBe(1); // NORMAL = 1
  });

  it("is idempotent on re-run", () => {
    runMigrations(db); // second run should not throw
    const n = (db.prepare("SELECT COUNT(*) FROM migrations").pluck().get() as number);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `pnpm vitest run tests/main/db.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/main/db.ts`**

```typescript
import Database from "better-sqlite3";

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -262144");
  db.pragma("mmap_size = 1073741824");
  db.pragma("temp_store = MEMORY");
  db.pragma("busy_timeout = 5000");
  return db;
}

const MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 1,
    sql: `
      CREATE TABLE files (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        path            TEXT    NOT NULL UNIQUE,
        size            INTEGER NOT NULL,
        mtime_ns        INTEGER NOT NULL,
        xxhash          TEXT,
        canonical_date  TEXT,
        date_source     TEXT,
        exif_json       TEXT,
        kind            TEXT,
        scanned_at      TEXT    NOT NULL
      );
      CREATE INDEX idx_files_xxhash         ON files(xxhash);
      CREATE INDEX idx_files_canonical_date ON files(canonical_date);
      CREATE INDEX idx_files_kind           ON files(kind);

      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        started_at   TEXT NOT NULL,
        completed_at TEXT,
        kind         TEXT NOT NULL
      );
      CREATE TABLE actions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT NOT NULL REFERENCES sessions(id),
        action       TEXT NOT NULL,
        src_path     TEXT NOT NULL,
        dst_path     TEXT,
        reason       TEXT,
        status       TEXT NOT NULL,
        error        TEXT,
        executed_at  TEXT
      );
      CREATE INDEX idx_actions_session ON actions(session_id);
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (db.prepare("SELECT id FROM migrations").all() as Array<{ id: number }>).map((r) => r.id),
  );
  const tx = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      db.exec(m.sql);
      db.prepare("INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?, datetime('now'))").run(m.id);
    }
  });
  tx();
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm vitest run tests/main/db.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db.ts tests/main/db.test.ts && git commit -m "feat: SQLite schema + WAL + migrations"
```

---

### Task 16: Main boots DB at %LOCALAPPDATA%/Curator/index.db

**Files:**
- Modify: `D:/curator/src/main/index.ts`

- [ ] **Step 1: Wire DB into main**

Replace the top of `src/main/index.ts` with:

```typescript
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { AppVersion, SidecarVersion } from "@shared/types";
import { Sidecar } from "./sidecar";
import { resolveCuratorStateDir } from "./paths";
import { openDb, runMigrations } from "./db";

let sidecar: Sidecar | null = null;
let db: Database.Database | null = null;
```

And in the `app.whenReady().then(...)` block, open the DB before the window:

```typescript
app.whenReady().then(async () => {
  const stateDir = resolveCuratorStateDir();
  db = openDb(join(stateDir, "index.db"));
  runMigrations(db);
  sidecar = resolveSidecar();
  await sidecar.start({ DB_PATH: join(stateDir, "index.db") });
  createWindow();
});
```

- [ ] **Step 2: Extend `Sidecar.start()` to accept env**

In `src/main/sidecar.ts`, change the `start` signature:

```typescript
async start(extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  this.proc = spawn(this.opts.python, this.opts.args, {
    cwd: this.opts.cwd,
    env: { ...process.env, ...(this.opts.env ?? {}), ...extraEnv, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // ...rest unchanged
```

- [ ] **Step 3: Run dev, verify DB file appears**

Run: `pnpm run dev`
Expected: App launches; `%LOCALAPPDATA%\Curator\index.db` exists.

Verification command:
Run: `ls "$LOCALAPPDATA/Curator/"`
Expected: `index.db`, `index.db-shm`, `index.db-wal` present.

- [ ] **Step 4: Commit**

```bash
git add src/main/ && git commit -m "feat: open index.db in LOCALAPPDATA and pass path to sidecar"
```

---

### Task 17: Python DB helper

**Files:**
- Create: `D:/curator/python/curator/db.py`
- Create: `D:/curator/python/tests/test_db.py`

- [ ] **Step 1: Write failing test**

```python
import os
import sqlite3
from pathlib import Path
from curator.db import connect, ensure_schema


def test_connect_returns_valid_sqlite(tmp_path: Path, monkeypatch):
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    con = connect()
    ensure_schema(con)
    cur = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='files'")
    assert cur.fetchone() is not None
    con.close()


def test_wal_and_sync_normal(tmp_path: Path, monkeypatch):
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    # simulate that Node side already created the DB and ran migrations
    seed = sqlite3.connect(str(dbp))
    seed.execute("CREATE TABLE files (id INTEGER PRIMARY KEY)")
    seed.commit(); seed.close()

    con = connect()
    assert con.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
    assert con.execute("PRAGMA synchronous").fetchone()[0] == 1
    con.close()
```

- [ ] **Step 2: Write `python/curator/db.py`**

```python
import os
import sqlite3


def connect() -> sqlite3.Connection:
    path = os.environ.get("DB_PATH")
    if not path:
        raise RuntimeError("DB_PATH env var not set")
    con = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA synchronous = NORMAL")
    con.execute("PRAGMA busy_timeout = 5000")
    con.execute("PRAGMA foreign_keys = ON")
    return con


def ensure_schema(con: sqlite3.Connection) -> None:
    # Node main is the owner of schema migrations. This is a no-op guard
    # used by tests and defensive callers.
    con.execute("""
        CREATE TABLE IF NOT EXISTS files (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          path            TEXT    NOT NULL UNIQUE,
          size            INTEGER NOT NULL,
          mtime_ns        INTEGER NOT NULL,
          xxhash          TEXT,
          canonical_date  TEXT,
          date_source     TEXT,
          exif_json       TEXT,
          kind            TEXT,
          scanned_at      TEXT    NOT NULL
        )
    """)
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_db.py -v`
Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: Python DB helper with WAL + NORMAL sync"
```

---

### Task 18: Binary path resolution in sidecar

**Files:**
- Create: `D:/curator/python/curator/paths.py`
- Create: `D:/curator/python/tests/test_paths.py`
- Modify: `D:/curator/src/main/index.ts`

- [ ] **Step 1: Write failing test**

```python
import os
from pathlib import Path
from curator.paths import resolve_bin


def test_resolve_bin_uses_env(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("CURATOR_BIN_DIR", str(tmp_path))
    (tmp_path / "exiftool.exe").write_bytes(b"")
    p = resolve_bin("exiftool.exe")
    assert p == str(tmp_path / "exiftool.exe")


def test_resolve_bin_missing_raises(monkeypatch, tmp_path):
    monkeypatch.setenv("CURATOR_BIN_DIR", str(tmp_path))
    try:
        resolve_bin("nonexistent.exe")
    except FileNotFoundError:
        return
    raise AssertionError("expected FileNotFoundError")
```

- [ ] **Step 2: Write `python/curator/paths.py`**

```python
import os
from pathlib import Path


def resolve_bin(name: str) -> str:
    bin_dir = os.environ.get("CURATOR_BIN_DIR")
    if not bin_dir:
        raise RuntimeError("CURATOR_BIN_DIR env var not set")
    p = Path(bin_dir) / name
    if not p.is_file():
        raise FileNotFoundError(f"binary not found: {p}")
    return str(p)
```

- [ ] **Step 3: Update main to pass CURATOR_BIN_DIR**

In `src/main/index.ts`, extend the sidecar start env:

```typescript
app.whenReady().then(async () => {
  const stateDir = resolveCuratorStateDir();
  db = openDb(join(stateDir, "index.db"));
  runMigrations(db);
  sidecar = resolveSidecar();
  const binDir = app.isPackaged
    ? join(process.resourcesPath, "bin")
    : join(app.getAppPath(), "resources", "bin");
  await sidecar.start({ DB_PATH: join(stateDir, "index.db"), CURATOR_BIN_DIR: binDir });
  createWindow();
});
```

- [ ] **Step 4: Run Python tests**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_paths.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/curator && git add python/ src/main/index.ts && git commit -m "feat: sidecar binary path resolution via CURATOR_BIN_DIR"
```

---

### Task 19: Sidecar exposes binaries RPC (sanity check for Milestone 3)

**Files:**
- Modify: `D:/curator/python/curator/builtins.py`
- Modify: `D:/curator/python/tests/test_builtins.py`

- [ ] **Step 1: Write failing test addition**

Append to `python/tests/test_builtins.py`:

```python
def test_binaries_reports_paths(tmp_path, monkeypatch):
    monkeypatch.setenv("CURATOR_BIN_DIR", str(tmp_path))
    (tmp_path / "exiftool.exe").write_bytes(b"")
    (tmp_path / "ffprobe.exe").write_bytes(b"")
    (tmp_path / "ffmpeg.exe").write_bytes(b"")
    from curator.rpc import dispatch, REGISTRY
    REGISTRY.clear()
    import importlib, curator.builtins
    importlib.reload(curator.builtins)
    resp = dispatch({"jsonrpc": "2.0", "id": 1, "method": "binaries", "params": {}})
    r = resp["result"]
    assert r["exiftool"].endswith("exiftool.exe")
    assert r["ffprobe"].endswith("ffprobe.exe")
    assert r["ffmpeg"].endswith("ffmpeg.exe")
```

- [ ] **Step 2: Add handler in `python/curator/builtins.py`**

```python
from curator.paths import resolve_bin


@register("binaries")
def binaries(_params):
    return {
        "exiftool": resolve_bin("exiftool.exe"),
        "ffprobe":  resolve_bin("ffprobe.exe"),
        "ffmpeg":   resolve_bin("ffmpeg.exe"),
    }
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest -v`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: binaries RPC method reports bundled tool paths"
```

---

## Milestone 4 — Archive Walker (Tasks 20–24)

### Task 20: Python walker with scandir

**Files:**
- Create: `D:/curator/python/curator/walker.py`
- Create: `D:/curator/python/tests/test_walker.py`

- [ ] **Step 1: Write failing test**

```python
from pathlib import Path
from curator.walker import walk_files


def test_walks_nested_dirs(tmp_path: Path):
    (tmp_path / "2015").mkdir()
    (tmp_path / "2015" / "a.jpg").write_bytes(b"\xff\xd8\xff\xd9")
    (tmp_path / "2016").mkdir()
    (tmp_path / "2016" / "b.mp4").write_bytes(b"\x00\x00\x00\x20ftypmp42")
    (tmp_path / "2016" / "nested").mkdir()
    (tmp_path / "2016" / "nested" / "c.heic").write_bytes(b"\x00\x00\x00\x20ftypheic")

    files = list(walk_files(str(tmp_path)))
    names = sorted(Path(f.path).name for f in files)
    assert names == ["a.jpg", "b.mp4", "c.heic"]
    sizes = {Path(f.path).name: f.size for f in files}
    assert sizes["a.jpg"] == 4


def test_walks_non_ascii_path(tmp_path: Path):
    sub = tmp_path / "„OVIDIUS"
    sub.mkdir()
    (sub / "pic.jpg").write_bytes(b"x")
    files = list(walk_files(str(tmp_path)))
    assert len(files) == 1
    assert files[0].path.endswith("pic.jpg")
```

- [ ] **Step 2: Write `python/curator/walker.py`**

```python
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Iterator

# Extensions we index. Everything else is ignored in Phase 1.
INDEX_EXTS = {
    ".jpg", ".jpeg", ".heic", ".heif", ".png", ".webp", ".gif",
    ".mp4", ".mov", ".mts", ".m4v", ".avi", ".mkv", ".3gp",
}


@dataclass(slots=True, frozen=True)
class WalkedFile:
    path: str
    size: int
    mtime_ns: int


def walk_files(root: str) -> Iterator[WalkedFile]:
    stack = [root]
    while stack:
        here = stack.pop()
        try:
            it = os.scandir(here)
        except (PermissionError, FileNotFoundError):
            continue
        with it as entries:
            for e in entries:
                try:
                    if e.is_dir(follow_symlinks=False):
                        stack.append(e.path)
                        continue
                    if not e.is_file(follow_symlinks=False):
                        continue
                    ext = os.path.splitext(e.name)[1].lower()
                    if ext not in INDEX_EXTS:
                        continue
                    st = e.stat(follow_symlinks=False)
                    yield WalkedFile(path=e.path, size=st.st_size, mtime_ns=st.st_mtime_ns)
                except (PermissionError, FileNotFoundError, OSError):
                    continue
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_walker.py -v`
Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/curator/walker.py python/tests/test_walker.py && git commit -m "feat: archive walker with scandir + non-ASCII paths"
```

---

### Task 21: Scan RPC method with batch DB insert

**Files:**
- Create: `D:/curator/python/curator/scan.py`
- Create: `D:/curator/python/tests/test_scan.py`
- Modify: `D:/curator/python/curator/builtins.py`

- [ ] **Step 1: Write failing test**

```python
import sqlite3
from pathlib import Path
from curator.scan import scan_archive
from curator.db import ensure_schema


def make_archive(base: Path) -> None:
    (base / "2020").mkdir()
    for name in ["x.jpg", "y.mp4"]:
        (base / "2020" / name).write_bytes(b"data")


def test_scan_inserts_rows(tmp_path: Path, monkeypatch):
    archive = tmp_path / "arch"; archive.mkdir(); make_archive(archive)
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    sqlite3.connect(str(dbp)).close()
    con = sqlite3.connect(str(dbp)); ensure_schema(con); con.close()

    summary = scan_archive(str(archive))
    assert summary["files_indexed"] == 2
    con = sqlite3.connect(str(dbp))
    n = con.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    assert n == 2


def test_scan_is_idempotent(tmp_path: Path, monkeypatch):
    archive = tmp_path / "arch"; archive.mkdir(); make_archive(archive)
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    sqlite3.connect(str(dbp)).close()
    con = sqlite3.connect(str(dbp)); ensure_schema(con); con.close()

    scan_archive(str(archive))
    scan_archive(str(archive))  # second run should upsert, not duplicate
    con = sqlite3.connect(str(dbp))
    n = con.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    assert n == 2
```

- [ ] **Step 2: Write `python/curator/scan.py`**

```python
from __future__ import annotations
import os
from datetime import datetime, timezone
from typing import Dict
from curator.db import connect
from curator.walker import walk_files

UPSERT_SQL = """
INSERT INTO files (path, size, mtime_ns, scanned_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(path) DO UPDATE SET
  size       = excluded.size,
  mtime_ns   = excluded.mtime_ns,
  scanned_at = excluded.scanned_at
"""


def scan_archive(root: str) -> Dict[str, int]:
    con = connect()
    now_iso = datetime.now(timezone.utc).isoformat()
    n = 0
    batch: list[tuple] = []
    con.execute("BEGIN IMMEDIATE")
    try:
        for f in walk_files(root):
            batch.append((f.path, f.size, f.mtime_ns, now_iso))
            n += 1
            if len(batch) >= 1000:
                con.executemany(UPSERT_SQL, batch); batch.clear()
        if batch:
            con.executemany(UPSERT_SQL, batch)
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK"); raise
    finally:
        con.close()
    return {"files_indexed": n}
```

- [ ] **Step 3: Register RPC**

In `python/curator/builtins.py`, append:

```python
from curator.scan import scan_archive


@register("scan")
def scan_rpc(params):
    root = params["root"]
    if not isinstance(root, str):
        raise ValueError("params.root must be a string")
    return scan_archive(root)
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_scan.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: scan RPC with batched upsert"
```

---

### Task 22: Scan IPC + Dashboard wiring

**Files:**
- Modify: `D:/curator/src/shared/types.ts`
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/preload/index.ts`
- Modify: `D:/curator/src/renderer/routes/Dashboard.tsx`

- [ ] **Step 1: Extend types**

In `src/shared/types.ts`, add:

```typescript
export interface ScanSummary { files_indexed: number }

export interface CuratorApi {
  getVersion: () => Promise<AppVersion>;
  getSidecarVersion: () => Promise<SidecarVersion>;
  ping: () => Promise<boolean>;
  scanArchive: (root: string) => Promise<ScanSummary>;
  pickFolder: () => Promise<string | null>;
  getIndexCount: () => Promise<number>;
}
```

- [ ] **Step 2: Add handlers in `src/main/index.ts`**

```typescript
import { dialog } from "electron";

ipcMain.handle("curator:pickFolder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

ipcMain.handle("curator:scanArchive", async (_e, root: string) => {
  return await sidecar!.call("scan", { root });
});

ipcMain.handle("curator:getIndexCount", (): number => {
  const r = db!.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number };
  return r.n;
});
```

- [ ] **Step 3: Extend preload**

In `src/preload/index.ts`:

```typescript
const api: CuratorApi = {
  getVersion: () => ipcRenderer.invoke("curator:getVersion"),
  getSidecarVersion: () => ipcRenderer.invoke("curator:getSidecarVersion"),
  ping: () => ipcRenderer.invoke("curator:ping"),
  scanArchive: (root) => ipcRenderer.invoke("curator:scanArchive", root),
  pickFolder: () => ipcRenderer.invoke("curator:pickFolder"),
  getIndexCount: () => ipcRenderer.invoke("curator:getIndexCount"),
};
```

- [ ] **Step 4: Rewrite Dashboard with scan button**

```typescript
import { useEffect, useState } from "react";

export function Dashboard(): JSX.Element {
  const [root, setRoot] = useState<string | null>(null);
  const [count, setCount] = useState<number>(0);
  const [status, setStatus] = useState<string>("idle");

  const refresh = () => window.curator.getIndexCount().then(setCount);
  useEffect(() => { refresh(); }, []);

  async function pickAndScan() {
    const picked = await window.curator.pickFolder();
    if (!picked) return;
    setRoot(picked); setStatus("scanning...");
    const r = await window.curator.scanArchive(picked);
    setStatus(`indexed ${r.files_indexed} files`);
    refresh();
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <div className="text-muted-foreground">Indexed files: <span className="font-mono">{count}</span></div>
      {root && <div className="text-sm text-muted-foreground">Archive: <span className="font-mono">{root}</span></div>}
      <button onClick={pickAndScan} className="bg-accent text-accent-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90">
        Pick archive folder + scan
      </button>
      <div className="text-sm">{status}</div>
    </div>
  );
}
```

- [ ] **Step 5: Run dev, scan a small test folder**

Run: `pnpm run dev`
Expected: click button → folder picker → pick a folder with a few images → status shows "indexed N files" → Indexed files count updates.

- [ ] **Step 6: Commit**

```bash
git add src/ && git commit -m "feat: UI scan button wired to sidecar + DB"
```

---

### Task 23: Progress events from sidecar during scan

**Files:**
- Modify: `D:/curator/python/curator/rpc.py`
- Modify: `D:/curator/python/curator/scan.py`
- Modify: `D:/curator/src/main/sidecar.ts`
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/preload/index.ts`
- Modify: `D:/curator/src/renderer/routes/Dashboard.tsx`

- [ ] **Step 1: Add event emission to Python RPC**

In `python/curator/rpc.py`, add:

```python
import threading
_write_lock = threading.Lock()


def emit_event(kind: str, data: dict) -> None:
    msg = {"jsonrpc": "2.0", "method": "event", "params": {"kind": kind, "data": data}}
    with _write_lock:
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()
```

Guard the existing `serve_stdio` write with the same lock (replace the two `sys.stdout.write` calls):

```python
        with _write_lock:
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
```

- [ ] **Step 2: Emit progress in `scan.py`**

Rewrite the scan loop to emit every 500 files:

```python
from curator.rpc import emit_event


def scan_archive(root: str) -> Dict[str, int]:
    con = connect()
    now_iso = datetime.now(timezone.utc).isoformat()
    n = 0
    batch: list[tuple] = []
    con.execute("BEGIN IMMEDIATE")
    try:
        for f in walk_files(root):
            batch.append((f.path, f.size, f.mtime_ns, now_iso))
            n += 1
            if len(batch) >= 1000:
                con.executemany(UPSERT_SQL, batch); batch.clear()
            if n % 500 == 0:
                emit_event("scan.progress", {"files": n})
        if batch:
            con.executemany(UPSERT_SQL, batch)
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK"); raise
    finally:
        con.close()
    emit_event("scan.done", {"files_indexed": n})
    return {"files_indexed": n}
```

- [ ] **Step 3: Route events in Node sidecar**

In `src/main/sidecar.ts`, add an event handler on `Sidecar`:

```typescript
import { EventEmitter } from "node:events";

export class Sidecar extends EventEmitter {
  // ...existing fields

  private onLine(line: string): void {
    let msg: any;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.method === "event") {
      this.emit("event", msg.params.kind, msg.params.data);
      return;
    }
    if (msg.id == null) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message));
    else pending.resolve(msg.result);
  }
```

- [ ] **Step 4: Forward events to renderer via webContents.send**

In `src/main/index.ts`, after window creation:

```typescript
let mainWin: BrowserWindow | null = null;
function createWindow(): void {
  mainWin = new BrowserWindow(/* ...existing... */);
  // existing loadURL/loadFile logic
}

// After sidecar.start():
sidecar.on("event", (kind: string, data: unknown) => {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send("curator:event", { kind, data });
  }
});
```

- [ ] **Step 5: Expose onEvent in preload**

In `src/preload/index.ts`:

```typescript
const api: CuratorApi = {
  // ...existing...
  onEvent: (cb) => {
    const listener = (_: unknown, p: { kind: string; data: unknown }) => cb(p.kind, p.data);
    ipcRenderer.on("curator:event", listener);
    return () => ipcRenderer.removeListener("curator:event", listener);
  },
};
```

And in `src/shared/types.ts`:

```typescript
export interface CuratorApi {
  // ...existing...
  onEvent: (cb: (kind: string, data: unknown) => void) => () => void;
}
```

- [ ] **Step 6: Show progress in Dashboard**

Update the scanning button handler:

```typescript
const [progress, setProgress] = useState<number>(0);

useEffect(() => {
  const off = window.curator.onEvent((kind, data) => {
    if (kind === "scan.progress") setProgress((data as { files: number }).files);
  });
  return off;
}, []);

// In pickAndScan:
setStatus("scanning..."); setProgress(0);
// ... after scanArchive resolves, setStatus, clear progress if you want
```

Render `<div className="text-sm">{progress} files seen</div>` beneath the status.

- [ ] **Step 7: Run dev and verify live progress updates**

Run: `pnpm run dev`
Expected: pick a larger folder; the count ticks up in 500-file increments during scan.

- [ ] **Step 8: Commit**

```bash
git add python/ src/ && git commit -m "feat: scan progress events streamed Python→Node→renderer"
```

---

### Task 24: Milestone 4 checkpoint — e2e scan test

**Files:**
- Modify: `D:/curator/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Create a test fixture folder**

Manually: create `D:/curator/tests/e2e/fixture-archive/2020/` with two tiny files `a.jpg` (`echo dummy > a.jpg`) and `b.mp4` (`echo dummy > b.mp4`).

- [ ] **Step 2: Extend e2e smoke test** — **Note:** folder picker cannot be automated headlessly; use the sidecar directly in a separate test.

Append to `tests/e2e/smoke.spec.ts`:

```typescript
test("scan sidecar indexes fixture archive", async () => {
  // This test bypasses the file dialog and calls the IPC directly via evaluation.
  const app = await electron.launch({ args: ["out/main/index.js"] });
  const win = await app.firstWindow();
  const fixtureAbs = require("node:path").resolve("tests/e2e/fixture-archive");
  const result = await win.evaluate(async (p) => {
    return await (window as any).curator.scanArchive(p);
  }, fixtureAbs);
  expect(result.files_indexed).toBe(2);
  await app.close();
});
```

- [ ] **Step 3: Run e2e**

Run: `pnpm exec electron-vite build && pnpm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ && git commit -m "test: e2e verifies scan indexes fixture archive"
```

---

## Milestone 5 — Exact Deduplication (Tasks 25–29)

### Task 25: xxhash computation in Python

**Files:**
- Create: `D:/curator/python/curator/hasher.py`
- Create: `D:/curator/python/tests/test_hasher.py`

- [ ] **Step 1: Write failing test**

```python
from pathlib import Path
from curator.hasher import xxhash_file, xxhash_files


def test_same_content_same_hash(tmp_path: Path):
    a = tmp_path / "a.bin"; a.write_bytes(b"hello world")
    b = tmp_path / "b.bin"; b.write_bytes(b"hello world")
    assert xxhash_file(str(a)) == xxhash_file(str(b))


def test_different_content_different_hash(tmp_path: Path):
    a = tmp_path / "a.bin"; a.write_bytes(b"hello")
    b = tmp_path / "b.bin"; b.write_bytes(b"world")
    assert xxhash_file(str(a)) != xxhash_file(str(b))


def test_batch_returns_map(tmp_path: Path):
    a = tmp_path / "a.bin"; a.write_bytes(b"hello")
    b = tmp_path / "b.bin"; b.write_bytes(b"world")
    r = xxhash_files([str(a), str(b)])
    assert len(r) == 2
    assert all(len(v) == 16 for v in r.values())  # 64-bit hex
```

- [ ] **Step 2: Write `python/curator/hasher.py`**

```python
from __future__ import annotations
import xxhash
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Iterable, List

CHUNK = 1024 * 1024


def xxhash_file(path: str) -> str:
    h = xxhash.xxh64()
    with open(path, "rb") as f:
        while True:
            buf = f.read(CHUNK)
            if not buf: break
            h.update(buf)
    return h.hexdigest()


def xxhash_files(paths: Iterable[str], workers: int = 4) -> Dict[str, str]:
    paths_list: List[str] = list(paths)
    out: Dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for p, h in zip(paths_list, pool.map(xxhash_file, paths_list)):
            out[p] = h
    return out
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_hasher.py -v`
Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: xxhash file + batch hashing with thread pool"
```

---

### Task 26: Hash-all RPC + persist to DB

**Files:**
- Modify: `D:/curator/python/curator/builtins.py`
- Create: `D:/curator/python/tests/test_hash_rpc.py`

- [ ] **Step 1: Write failing test**

```python
import sqlite3
from pathlib import Path
from curator.db import ensure_schema
from curator.scan import scan_archive
from curator.builtins import hash_all_rpc  # will exist after step 2


def test_hashes_all_unhashed_files(tmp_path: Path, monkeypatch):
    archive = tmp_path / "arch"; archive.mkdir()
    (archive / "2020").mkdir()
    (archive / "2020" / "a.jpg").write_bytes(b"A")
    (archive / "2020" / "b.jpg").write_bytes(b"B")
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    sqlite3.connect(str(dbp)).close()
    con = sqlite3.connect(str(dbp)); ensure_schema(con); con.close()
    scan_archive(str(archive))

    r = hash_all_rpc({})
    assert r["hashed"] == 2

    con = sqlite3.connect(str(dbp))
    rows = con.execute("SELECT xxhash FROM files").fetchall()
    assert all(row[0] and len(row[0]) == 16 for row in rows)
```

- [ ] **Step 2: Add RPC handler**

In `python/curator/builtins.py`:

```python
from curator.hasher import xxhash_file
from curator.db import connect


@register("hashAll")
def hash_all_rpc(_params):
    con = connect()
    try:
        rows = con.execute("SELECT id, path FROM files WHERE xxhash IS NULL").fetchall()
        n = 0
        con.execute("BEGIN IMMEDIATE")
        try:
            for fid, path in rows:
                try:
                    h = xxhash_file(path)
                except OSError:
                    continue
                con.execute("UPDATE files SET xxhash = ? WHERE id = ?", (h, fid))
                n += 1
                if n % 500 == 0:
                    from curator.rpc import emit_event
                    emit_event("hash.progress", {"files": n})
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK"); raise
        return {"hashed": n}
    finally:
        con.close()
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest -v`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: hashAll RPC persists xxhash per file"
```

---

### Task 27: Exact-duplicate cluster query

**Files:**
- Create: `D:/curator/src/main/queries.ts`
- Create: `D:/curator/tests/main/queries.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import { listExactDuplicateClusters } from "@main/queries";

describe("queries.listExactDuplicateClusters", () => {
  let dir: string;
  let db: Database.Database;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "qr-"));
    db = openDb(join(dir, "index.db"));
    runMigrations(db);
    const ins = db.prepare(
      "INSERT INTO files (path, size, mtime_ns, xxhash, scanned_at) VALUES (?, ?, ?, ?, datetime('now'))",
    );
    ins.run("/a/1.jpg", 100, 1, "aaaaaaaaaaaaaaaa");
    ins.run("/a/2.jpg", 100, 2, "aaaaaaaaaaaaaaaa");
    ins.run("/b/3.jpg", 100, 3, "bbbbbbbbbbbbbbbb");
    ins.run("/a/4.jpg", 100, 4, "aaaaaaaaaaaaaaaa");
  });
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  it("groups by xxhash returning only size>=2 clusters", () => {
    const clusters = listExactDuplicateClusters(db);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].xxhash).toBe("aaaaaaaaaaaaaaaa");
    expect(clusters[0].files).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Write `src/main/queries.ts`**

```typescript
import type Database from "better-sqlite3";

export interface ExactCluster {
  xxhash: string;
  files: Array<{ id: number; path: string; size: number; mtime_ns: number }>;
}

export function listExactDuplicateClusters(db: Database.Database): ExactCluster[] {
  const rows = db.prepare(`
    SELECT f.xxhash, f.id, f.path, f.size, f.mtime_ns
    FROM files f
    WHERE f.xxhash IS NOT NULL
      AND f.xxhash IN (
        SELECT xxhash FROM files WHERE xxhash IS NOT NULL
        GROUP BY xxhash HAVING COUNT(*) >= 2
      )
    ORDER BY f.xxhash, f.mtime_ns
  `).all() as Array<{ xxhash: string; id: number; path: string; size: number; mtime_ns: number }>;

  const map = new Map<string, ExactCluster>();
  for (const r of rows) {
    let c = map.get(r.xxhash);
    if (!c) { c = { xxhash: r.xxhash, files: [] }; map.set(r.xxhash, c); }
    c.files.push({ id: r.id, path: r.path, size: r.size, mtime_ns: r.mtime_ns });
  }
  return [...map.values()];
}
```

- [ ] **Step 3: Run test, expect pass**

Run: `pnpm vitest run tests/main/queries.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/queries.ts tests/main/queries.test.ts && git commit -m "feat: exact duplicate cluster query"
```

---

### Task 28: Exact duplicates UI route

**Files:**
- Modify: `D:/curator/src/shared/types.ts`
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/preload/index.ts`
- Create: `D:/curator/src/renderer/routes/DuplicatesExact.tsx`
- Create: `D:/curator/src/renderer/components/ClusterCard.tsx`
- Modify: `D:/curator/src/renderer/App.tsx`

- [ ] **Step 1: Extend types**

```typescript
export interface ExactFile { id: number; path: string; size: number; mtime_ns: number }
export interface ExactCluster { xxhash: string; files: ExactFile[] }

export interface CuratorApi {
  // ...existing...
  hashAll: () => Promise<{ hashed: number }>;
  listExactClusters: () => Promise<ExactCluster[]>;
}
```

- [ ] **Step 2: Add IPC handlers**

```typescript
import { listExactDuplicateClusters } from "./queries";

ipcMain.handle("curator:hashAll", async () => sidecar!.call("hashAll", {}));
ipcMain.handle("curator:listExactClusters", () => listExactDuplicateClusters(db!));
```

- [ ] **Step 3: Extend preload**

```typescript
hashAll: () => ipcRenderer.invoke("curator:hashAll"),
listExactClusters: () => ipcRenderer.invoke("curator:listExactClusters"),
```

- [ ] **Step 4: Write `src/renderer/components/ClusterCard.tsx`**

```typescript
import type { ExactCluster } from "@shared/types";

export function ClusterCard({ cluster }: { cluster: ExactCluster }): JSX.Element {
  return (
    <div className="border border-border rounded-md p-4 space-y-2">
      <div className="text-xs font-mono text-muted-foreground">{cluster.xxhash}</div>
      <div className="text-sm text-muted-foreground">
        {cluster.files.length} copies • {formatBytes(cluster.files[0].size)} each
      </div>
      <ul className="space-y-1">
        {cluster.files.map((f) => (
          <li key={f.id} className="text-sm font-mono break-all">{f.path}</li>
        ))}
      </ul>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
```

- [ ] **Step 5: Write `src/renderer/routes/DuplicatesExact.tsx`**

```typescript
import { useEffect, useState } from "react";
import type { ExactCluster } from "@shared/types";
import { ClusterCard } from "../components/ClusterCard";

export function DuplicatesExact(): JSX.Element {
  const [clusters, setClusters] = useState<ExactCluster[] | null>(null);
  const [hashing, setHashing] = useState(false);

  async function runHash() {
    setHashing(true);
    await window.curator.hashAll();
    const list = await window.curator.listExactClusters();
    setClusters(list);
    setHashing(false);
  }

  useEffect(() => { window.curator.listExactClusters().then(setClusters); }, []);

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Exact duplicates</h1>
        <button
          onClick={runHash}
          disabled={hashing}
          className="bg-accent text-accent-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {hashing ? "Hashing..." : "Hash + find duplicates"}
        </button>
      </div>
      {clusters == null ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : clusters.length === 0 ? (
        <div className="text-muted-foreground">No exact duplicates found.</div>
      ) : (
        <div className="space-y-3">
          {clusters.map((c) => <ClusterCard key={c.xxhash} cluster={c} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire into router**

In `src/renderer/App.tsx`, replace the `/duplicates-exact` placeholder:

```typescript
import { DuplicatesExact } from "./routes/DuplicatesExact";
// ...
<Route path="/duplicates-exact" element={<DuplicatesExact />} />
```

- [ ] **Step 7: Run dev, test with a fixture with known duplicates**

Create two identical small files in a test folder; scan; navigate to Exact duplicates; click Hash+find.
Expected: one cluster listed with both paths.

- [ ] **Step 8: Commit**

```bash
git add src/ && git commit -m "feat: exact duplicates review page"
```

---

### Task 29: Milestone 5 checkpoint

- [ ] **Step 1: Full test suite**

Run: `pnpm run test && cd python && .venv/Scripts/pytest`
Expected: all green.

- [ ] **Step 2: E2E**

Run: `pnpm exec electron-vite build && pnpm run test:e2e`
Expected: PASS.

- [ ] **Step 3: Commit a tag**

```bash
git tag m5-exact-dedup && echo "Milestone 5 complete"
```

---

## Milestone 6 — EXIF + Canonical Date (Tasks 30–35)

### Task 30: pyexiftool wrapper in batch mode

**Files:**
- Create: `D:/curator/python/curator/exif.py`
- Create: `D:/curator/python/tests/test_exif.py`

- [ ] **Step 1: Write failing test**

```python
import os
from pathlib import Path
from curator.exif import extract_many


def test_extract_real_jpeg(tmp_path: Path):
    from PIL import Image
    img = Image.new("RGB", (10, 10), "red")
    p = tmp_path / "x.jpg"
    img.save(str(p), "JPEG")
    # no EXIF yet; should return object with path but minimal tags
    os.environ["CURATOR_BIN_DIR"] = os.environ.get("CURATOR_BIN_DIR") or r"D:\curator\resources\bin"
    r = extract_many([str(p)])
    assert str(p) in r
```

(If exiftool binary is missing, this test will be skipped — add a skip guard.)

Add at the top of the test:

```python
import pytest
if not Path(os.environ.get("CURATOR_BIN_DIR", r"D:\curator\resources\bin") + r"\exiftool.exe").exists():
    pytest.skip("exiftool.exe not present", allow_module_level=True)
```

- [ ] **Step 2: Write `python/curator/exif.py`**

```python
from __future__ import annotations
from typing import Dict, Iterable, List
import exiftool
from curator.paths import resolve_bin


def extract_many(paths: Iterable[str]) -> Dict[str, dict]:
    plist: List[str] = list(paths)
    if not plist:
        return {}
    et_path = resolve_bin("exiftool.exe")
    out: Dict[str, dict] = {}
    with exiftool.ExifToolHelper(executable=et_path, common_args=["-G", "-n", "-charset", "filename=utf8"]) as et:
        metadata = et.get_metadata(plist)
        for m in metadata:
            src = m.get("SourceFile") or m.get("File:FileName")
            if src: out[src] = m
    return out
```

- [ ] **Step 3: Run test**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_exif.py -v`
Expected: PASS (or SKIPPED if binaries missing; in that case run `pnpm run fetch-bins` first).

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: pyexiftool batch-mode wrapper"
```

---

### Task 31: Canonical date resolver — priority chain

**Files:**
- Create: `D:/curator/python/curator/dater.py`
- Create: `D:/curator/python/tests/test_dater.py`

- [ ] **Step 1: Write failing test**

```python
from datetime import datetime, timezone
from curator.dater import resolve_canonical


def iso(y, m, d, h=0, mi=0, s=0) -> str:
    return datetime(y, m, d, h, mi, s, tzinfo=timezone.utc).isoformat()


def test_prefers_exif_datetime_original():
    meta = {"EXIF:DateTimeOriginal": "2015:07:14 10:30:00"}
    r = resolve_canonical("/a/b.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "exif"
    assert r.date.startswith("2015-07-14")


def test_falls_back_to_filename_yymmddhhmmss():
    meta = {}
    r = resolve_canonical("/a/150714103000.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "filename"
    assert r.date.startswith("2015-07-14")


def test_falls_back_to_filename_yyyymmdd():
    meta = {}
    r = resolve_canonical("/a/20150714.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "filename"
    assert r.date.startswith("2015-07-14")


def test_falls_back_to_filename_img_whatsapp():
    meta = {}
    r = resolve_canonical("/a/IMG-20200325-WA0001.jpg", 1_400_000_000 * 10**9, meta)
    assert r.source == "filename"
    assert r.date.startswith("2020-03-25")


def test_final_fallback_to_mtime():
    meta = {}
    # mtime = 2019-06-15T12:00:00Z in ns
    dt = datetime(2019, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
    ns = int(dt.timestamp() * 1e9)
    r = resolve_canonical("/a/unknown-name.jpg", ns, meta)
    assert r.source == "mtime"
    assert r.date.startswith("2019-06-15")
```

- [ ] **Step 2: Write `python/curator/dater.py`**

```python
from __future__ import annotations
import re
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(slots=True, frozen=True)
class CanonicalDate:
    date: str        # ISO 8601 UTC
    source: str      # "exif" | "filename" | "mtime"


EXIF_KEYS = [
    "EXIF:DateTimeOriginal",
    "QuickTime:CreateDate",
    "QuickTime:MediaCreateDate",
    "EXIF:CreateDate",
    "EXIF:DateTimeDigitized",
]

EXIF_FMT = "%Y:%m:%d %H:%M:%S"


FILENAME_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"IMG-(\d{8})-WA\d+", re.I), "%Y%m%d"),
    (re.compile(r"PXL_(\d{8})_\d+", re.I), "%Y%m%d"),
    (re.compile(r"^(\d{8})_(\d{6})"), "%Y%m%d_%H%M%S"),
    (re.compile(r"^(20\d{6})\b"), "%Y%m%d"),
    (re.compile(r"^(\d{12})\b"), "%y%m%d%H%M%S"),
    (re.compile(r"Screen Shot (\d{4}-\d{2}-\d{2})", re.I), "%Y-%m-%d"),
]


def _try_exif(meta: dict) -> str | None:
    for key in EXIF_KEYS:
        v = meta.get(key)
        if not v or not isinstance(v, str): continue
        try:
            dt = datetime.strptime(v.strip(), EXIF_FMT).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def _try_filename(path: str) -> str | None:
    name = path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    for pat, fmt in FILENAME_PATTERNS:
        m = pat.search(name)
        if not m: continue
        combined = "_".join(m.groups()) if len(m.groups()) > 1 else m.group(1)
        try:
            dt = datetime.strptime(combined, fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def resolve_canonical(path: str, mtime_ns: int, meta: dict) -> CanonicalDate:
    exif = _try_exif(meta)
    if exif: return CanonicalDate(date=exif, source="exif")
    fn = _try_filename(path)
    if fn: return CanonicalDate(date=fn, source="filename")
    dt = datetime.fromtimestamp(mtime_ns / 1e9, tz=timezone.utc)
    return CanonicalDate(date=dt.isoformat(), source="mtime")
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_dater.py -v`
Expected: 5 PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: canonical date priority chain (EXIF → filename → mtime)"
```

---

### Task 32: Extract+resolve RPC persists dates

**Files:**
- Modify: `D:/curator/python/curator/builtins.py`
- Create: `D:/curator/python/tests/test_resolve_dates.py`

- [ ] **Step 1: Write failing test**

```python
import sqlite3, json
from pathlib import Path
from curator.db import ensure_schema
from curator.scan import scan_archive
from curator.builtins import resolve_dates_rpc  # to be added


def test_resolves_dates_from_filename(tmp_path: Path, monkeypatch):
    archive = tmp_path / "arch"; archive.mkdir()
    (archive / "2015").mkdir()
    (archive / "2015" / "150714103000.jpg").write_bytes(b"dummy")
    dbp = tmp_path / "index.db"
    monkeypatch.setenv("DB_PATH", str(dbp))
    sqlite3.connect(str(dbp)).close()
    con = sqlite3.connect(str(dbp)); ensure_schema(con); con.close()
    scan_archive(str(archive))
    r = resolve_dates_rpc({})
    assert r["resolved"] == 1
    con = sqlite3.connect(str(dbp))
    row = con.execute("SELECT canonical_date, date_source FROM files").fetchone()
    assert row[1] == "filename"
    assert row[0].startswith("2015-07-14")
```

- [ ] **Step 2: Add RPC in builtins**

```python
import json
from curator.dater import resolve_canonical
from curator.exif import extract_many


@register("resolveDates")
def resolve_dates_rpc(_params):
    con = connect()
    try:
        rows = con.execute("SELECT id, path, mtime_ns FROM files WHERE canonical_date IS NULL").fetchall()
        if not rows:
            return {"resolved": 0}
        paths = [r[1] for r in rows]
        meta_by_path: dict[str, dict] = {}
        # EXIF is best-effort: if exiftool missing, fall back to filename/mtime.
        try:
            meta_by_path = extract_many(paths)
        except Exception:
            meta_by_path = {}
        n = 0
        con.execute("BEGIN IMMEDIATE")
        try:
            for fid, path, mtime_ns in rows:
                meta = meta_by_path.get(path, {})
                r = resolve_canonical(path, mtime_ns, meta)
                con.execute(
                    "UPDATE files SET canonical_date = ?, date_source = ?, exif_json = ? WHERE id = ?",
                    (r.date, r.source, json.dumps(meta) if meta else None, fid),
                )
                n += 1
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK"); raise
        return {"resolved": n}
    finally:
        con.close()
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_resolve_dates.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: resolveDates RPC writes canonical date + source"
```

---

### Task 33: Misplaced-by-date query + route

**Files:**
- Modify: `D:/curator/src/main/queries.ts`
- Modify: `D:/curator/src/shared/types.ts`
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/preload/index.ts`
- Create: `D:/curator/src/renderer/routes/MisplacedByDate.tsx`
- Modify: `D:/curator/src/renderer/App.tsx`

- [ ] **Step 1: Add query**

In `src/main/queries.ts`:

```typescript
export interface MisplacedFile {
  id: number; path: string; canonical_date: string; date_source: string; folder_year: number; canonical_year: number;
}

export function listMisplacedByDate(db: Database.Database): MisplacedFile[] {
  const rows = db.prepare(`
    SELECT id, path, canonical_date, date_source
    FROM files
    WHERE canonical_date IS NOT NULL
  `).all() as Array<{ id: number; path: string; canonical_date: string; date_source: string }>;

  const out: MisplacedFile[] = [];
  for (const r of rows) {
    const canonicalYear = parseInt(r.canonical_date.slice(0, 4), 10);
    const m = r.path.match(/[\\/](\d{4})[\\/]/);
    if (!m) continue;
    const folderYear = parseInt(m[1], 10);
    if (folderYear !== canonicalYear) {
      out.push({ id: r.id, path: r.path, canonical_date: r.canonical_date, date_source: r.date_source, folder_year: folderYear, canonical_year: canonicalYear });
    }
  }
  return out;
}
```

- [ ] **Step 2: Expose via IPC**

In `src/shared/types.ts`:

```typescript
export interface MisplacedFile {
  id: number; path: string; canonical_date: string; date_source: string; folder_year: number; canonical_year: number;
}

export interface CuratorApi {
  // ...existing...
  resolveDates: () => Promise<{ resolved: number }>;
  listMisplaced: () => Promise<MisplacedFile[]>;
}
```

In `src/main/index.ts`:

```typescript
ipcMain.handle("curator:resolveDates", () => sidecar!.call("resolveDates", {}));
ipcMain.handle("curator:listMisplaced", () => listMisplacedByDate(db!));
```

In `src/preload/index.ts`:

```typescript
resolveDates: () => ipcRenderer.invoke("curator:resolveDates"),
listMisplaced: () => ipcRenderer.invoke("curator:listMisplaced"),
```

- [ ] **Step 3: Write route component**

```typescript
import { useEffect, useState } from "react";
import type { MisplacedFile } from "@shared/types";

export function MisplacedByDate(): JSX.Element {
  const [rows, setRows] = useState<MisplacedFile[] | null>(null);
  const [working, setWorking] = useState(false);

  async function resolveAndList() {
    setWorking(true);
    await window.curator.resolveDates();
    const list = await window.curator.listMisplaced();
    setRows(list);
    setWorking(false);
  }

  useEffect(() => { window.curator.listMisplaced().then(setRows); }, []);

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Misplaced by date</h1>
        <button onClick={resolveAndList} disabled={working}
          className="bg-accent text-accent-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          {working ? "Resolving..." : "Resolve dates + list"}
        </button>
      </div>
      {rows == null ? <div className="text-muted-foreground">Loading...</div>
        : rows.length === 0 ? <div className="text-muted-foreground">No misplaced files.</div>
        : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Path</th><th>Folder</th><th>Canonical</th><th>Source</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 font-mono break-all">{r.path}</td>
                  <td>{r.folder_year}</td>
                  <td>{r.canonical_year}</td>
                  <td className="text-muted-foreground">{r.date_source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}
```

- [ ] **Step 4: Wire router**

```typescript
import { MisplacedByDate } from "./routes/MisplacedByDate";
<Route path="/misplaced" element={<MisplacedByDate />} />
```

- [ ] **Step 5: Run dev, test with fixture**

Create a test archive with a file dated 2015 in a folder named `2016/`. Scan, hash, navigate to Misplaced, click Resolve.
Expected: file listed with folder=2016, canonical=2015, source=filename (or exif if EXIF present).

- [ ] **Step 6: Commit**

```bash
git add src/ && git commit -m "feat: misplaced-by-date query + route"
```

---

### Task 34: Zero-byte list route

**Files:**
- Modify: `D:/curator/src/main/queries.ts`
- Modify: `D:/curator/src/shared/types.ts`
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/preload/index.ts`
- Create: `D:/curator/src/renderer/routes/ZeroByte.tsx`
- Modify: `D:/curator/src/renderer/App.tsx`

- [ ] **Step 1: Add query**

```typescript
export interface ZeroByteFile { id: number; path: string }

export function listZeroByte(db: Database.Database): ZeroByteFile[] {
  return db.prepare(`SELECT id, path FROM files WHERE size = 0 ORDER BY path`).all() as ZeroByteFile[];
}
```

- [ ] **Step 2: Expose IPC + type**

```typescript
// shared/types.ts
export interface ZeroByteFile { id: number; path: string }
listZeroByte: () => Promise<ZeroByteFile[]>;
```

```typescript
// main/index.ts
ipcMain.handle("curator:listZeroByte", () => listZeroByte(db!));
// preload
listZeroByte: () => ipcRenderer.invoke("curator:listZeroByte"),
```

- [ ] **Step 3: Route**

```typescript
import { useEffect, useState } from "react";
import type { ZeroByteFile } from "@shared/types";

export function ZeroByte(): JSX.Element {
  const [rows, setRows] = useState<ZeroByteFile[] | null>(null);
  useEffect(() => { window.curator.listZeroByte().then(setRows); }, []);
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Zero-byte files</h1>
      {rows == null ? <div className="text-muted-foreground">Loading...</div>
        : rows.length === 0 ? <div className="text-muted-foreground">None.</div>
        : <ul className="space-y-1">{rows.map((r) => <li key={r.id} className="text-sm font-mono break-all">{r.path}</li>)}</ul>}
    </div>
  );
}
```

- [ ] **Step 4: Router**

```typescript
import { ZeroByte } from "./routes/ZeroByte";
<Route path="/zero-byte" element={<ZeroByte />} />
```

- [ ] **Step 5: Commit**

```bash
git add src/ && git commit -m "feat: zero-byte files route"
```

---

### Task 35: Milestone 6 checkpoint

- [ ] **Step 1: Run full test suite**

Run: `pnpm run test && cd python && .venv/Scripts/pytest && cd .. && pnpm exec electron-vite build && pnpm run test:e2e`
Expected: all green.

- [ ] **Step 2: Commit tag**

```bash
git tag m6-canonical-date && echo "Milestone 6 complete"
```

---

## Milestone 7 — Apply Engine + Undo (Tasks 36–44)

### Task 36: Proposal builder — exact dupes + misplaced

**Files:**
- Create: `D:/curator/src/main/proposals.ts`
- Create: `D:/curator/tests/main/proposals.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDb, runMigrations } from "@main/db";
import { buildProposals, Proposal } from "@main/proposals";

describe("buildProposals", () => {
  let dir: string; let db: Database.Database;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "prop-"));
    db = openDb(join(dir, "index.db")); runMigrations(db);
  });
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  it("proposes quarantine for duplicates keeping oldest mtime", () => {
    const ins = db.prepare("INSERT INTO files (path, size, mtime_ns, xxhash, scanned_at) VALUES (?, ?, ?, ?, datetime('now'))");
    ins.run("/a/newer.jpg", 100, 200, "hhhhhhhhhhhhhhhh");
    ins.run("/a/older.jpg", 100, 100, "hhhhhhhhhhhhhhhh");
    const proposals: Proposal[] = buildProposals(db, "/archive");
    const quarantines = proposals.filter((p) => p.action === "quarantine");
    expect(quarantines).toHaveLength(1);
    expect(quarantines[0].src_path).toBe("/a/newer.jpg");
  });

  it("proposes move for files in wrong year folder", () => {
    db.prepare("INSERT INTO files (path, size, mtime_ns, canonical_date, date_source, scanned_at) VALUES (?, 1, 1, ?, 'filename', datetime('now'))")
      .run("/archive/2016/x.jpg", "2015-07-14T10:00:00+00:00");
    const proposals = buildProposals(db, "/archive");
    const moves = proposals.filter((p) => p.action === "move_to_year");
    expect(moves).toHaveLength(1);
    expect(moves[0].dst_path).toBe("/archive/2015/x.jpg");
  });
});
```

- [ ] **Step 2: Write `src/main/proposals.ts`**

```typescript
import type Database from "better-sqlite3";
import { basename, dirname, join } from "node:path";

export type Action = "quarantine" | "move_to_year";

export interface Proposal {
  action: Action;
  src_path: string;
  dst_path: string | null;
  reason: string;
}

export function buildProposals(db: Database.Database, archiveRoot: string): Proposal[] {
  const out: Proposal[] = [];

  // Exact duplicates: keep oldest mtime per xxhash, quarantine others
  const dupRows = db.prepare(`
    SELECT id, path, xxhash, mtime_ns
    FROM files
    WHERE xxhash IS NOT NULL
      AND xxhash IN (SELECT xxhash FROM files WHERE xxhash IS NOT NULL GROUP BY xxhash HAVING COUNT(*) >= 2)
    ORDER BY xxhash, mtime_ns
  `).all() as Array<{ id: number; path: string; xxhash: string; mtime_ns: number }>;

  const perHash = new Map<string, typeof dupRows>();
  for (const r of dupRows) {
    if (!perHash.has(r.xxhash)) perHash.set(r.xxhash, []);
    perHash.get(r.xxhash)!.push(r);
  }
  for (const group of perHash.values()) {
    const [_keeper, ...rest] = group;
    for (const loser of rest) {
      out.push({ action: "quarantine", src_path: loser.path, dst_path: null, reason: `exact-dup of ${_keeper.path}` });
    }
  }

  // Misplaced-by-date: move to /{canonical_year}/
  const mpRows = db.prepare(`
    SELECT id, path, canonical_date FROM files WHERE canonical_date IS NOT NULL
  `).all() as Array<{ id: number; path: string; canonical_date: string }>;
  for (const r of mpRows) {
    const m = r.path.match(/[\\/](\d{4})[\\/]/);
    if (!m) continue;
    const folderYear = m[1];
    const canonicalYear = r.canonical_date.slice(0, 4);
    if (folderYear === canonicalYear) continue;
    const baseName = basename(r.path);
    const dst = join(archiveRoot, canonicalYear, baseName).replace(/\\/g, "/");
    if (r.path.replace(/\\/g, "/") === dst) continue;
    out.push({ action: "move_to_year", src_path: r.path, dst_path: dst, reason: `canonical year ${canonicalYear} ≠ folder ${folderYear}` });
  }

  return out;
}
```

- [ ] **Step 3: Run test, expect pass**

Run: `pnpm vitest run tests/main/proposals.test.ts`
Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/proposals.ts tests/main/proposals.test.ts && git commit -m "feat: proposal builder for exact dupes + misplaced files"
```

---

### Task 37: Python apply engine (atomic move + quarantine)

**Files:**
- Create: `D:/curator/python/curator/apply.py`
- Create: `D:/curator/python/tests/test_apply.py`

- [ ] **Step 1: Write failing test**

```python
import json, os
from pathlib import Path
from curator.apply import apply_actions


def test_quarantine_moves_to_quarantine_dir(tmp_path: Path):
    archive = tmp_path / "arch"; archive.mkdir()
    f = archive / "old.jpg"; f.write_bytes(b"x")
    actions = [{"action": "quarantine", "src_path": str(f), "dst_path": None, "reason": "dup"}]
    result = apply_actions(actions, str(archive), "sess-1")
    assert result["ok"] == 1
    assert not f.exists()
    quarantined = list((archive / "_curator_quarantine" / "sess-1").rglob("old.jpg"))
    assert len(quarantined) == 1


def test_move_to_year_creates_target_and_moves(tmp_path: Path):
    archive = tmp_path / "arch"; archive.mkdir()
    src = archive / "2016" / "a.jpg"; src.parent.mkdir(); src.write_bytes(b"x")
    dst = archive / "2015" / "a.jpg"
    actions = [{"action": "move_to_year", "src_path": str(src), "dst_path": str(dst), "reason": "x"}]
    result = apply_actions(actions, str(archive), "sess-2")
    assert result["ok"] == 1
    assert not src.exists()
    assert dst.exists()


def test_collision_uses_hash_suffix(tmp_path: Path):
    archive = tmp_path / "arch"; archive.mkdir()
    src = archive / "2016" / "a.jpg"; src.parent.mkdir(); src.write_bytes(b"new")
    existing = archive / "2015" / "a.jpg"; existing.parent.mkdir(); existing.write_bytes(b"existing")
    actions = [{"action": "move_to_year", "src_path": str(src), "dst_path": str(existing), "reason": "x"}]
    result = apply_actions(actions, str(archive), "sess-3")
    assert result["ok"] == 1
    assert existing.read_bytes() == b"existing"  # untouched
    suffixed = list(existing.parent.glob("a_*.jpg"))
    assert len(suffixed) == 1
```

- [ ] **Step 2: Write `python/curator/apply.py`**

```python
from __future__ import annotations
import json, os, shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict


def _relpath_under(root: str, path: str) -> str:
    r = Path(root).resolve()
    p = Path(path).resolve()
    try:
        return str(p.relative_to(r))
    except ValueError:
        return p.name


def _ensure_unique(dst: Path, src: Path) -> Path:
    if not dst.exists(): return dst
    import xxhash
    h = xxhash.xxh64()
    with open(src, "rb") as f:
        while True:
            buf = f.read(1024 * 1024)
            if not buf: break
            h.update(buf)
    suffix = h.hexdigest()[:8]
    return dst.with_name(f"{dst.stem}_{suffix}{dst.suffix}")


def apply_actions(actions: List[Dict], archive_root: str, session_id: str) -> Dict:
    ok = 0; failed = 0; errors: list[dict] = []
    manifest: list[dict] = []
    arch = Path(archive_root)
    qroot = arch / "_curator_quarantine" / session_id
    for a in actions:
        act = a["action"]; src = Path(a["src_path"])
        try:
            if act == "quarantine":
                rel = _relpath_under(str(arch), str(src))
                qdst = qroot / "dup" / rel
                qdst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(qdst))
                manifest.append({"action": act, "src": str(src), "dst": str(qdst), "reason": a.get("reason")})
            elif act == "move_to_year":
                dst = Path(a["dst_path"])
                dst.parent.mkdir(parents=True, exist_ok=True)
                final = _ensure_unique(dst, src)
                shutil.move(str(src), str(final))
                manifest.append({"action": act, "src": str(src), "dst": str(final), "reason": a.get("reason")})
            else:
                raise ValueError(f"unknown action: {act}")
            ok += 1
        except Exception as e:
            failed += 1
            errors.append({"src": str(src), "error": str(e)})

    # Persist undo manifest
    sessions_dir = Path(os.environ.get("LOCALAPPDATA", str(arch))) / "Curator" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    (sessions_dir / f"{session_id}.json").write_text(json.dumps({
        "session_id": session_id,
        "archive_root": archive_root,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "actions": manifest,
    }, indent=2), encoding="utf-8")

    return {"ok": ok, "failed": failed, "errors": errors, "session_id": session_id}
```

- [ ] **Step 3: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_apply.py -v`
Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: apply engine with atomic move + quarantine + session manifest"
```

---

### Task 38: Apply RPC + session recording

**Files:**
- Modify: `D:/curator/python/curator/builtins.py`
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/shared/types.ts`
- Modify: `D:/curator/src/preload/index.ts`

- [ ] **Step 1: Add Python RPC**

```python
from curator.apply import apply_actions


@register("applyActions")
def apply_actions_rpc(params):
    actions = params["actions"]; archive_root = params["archive_root"]; session_id = params["session_id"]
    return apply_actions(actions, archive_root, session_id)
```

- [ ] **Step 2: Add Node RPC + DB session recording**

In `src/main/index.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { buildProposals, Proposal } from "./proposals";

ipcMain.handle("curator:buildProposals", (_e, archiveRoot: string): Proposal[] => {
  return buildProposals(db!, archiveRoot);
});

ipcMain.handle("curator:applyProposals", async (_e, archiveRoot: string, proposals: Proposal[]) => {
  const sessionId = randomUUID();
  db!.prepare("INSERT INTO sessions (id, started_at, kind) VALUES (?, datetime('now'), 'apply')").run(sessionId);
  const insAction = db!.prepare("INSERT INTO actions (session_id, action, src_path, dst_path, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')");
  for (const p of proposals) insAction.run(sessionId, p.action, p.src_path, p.dst_path, p.reason);
  const result = await sidecar!.call<{ ok: number; failed: number; session_id: string }>("applyActions", {
    actions: proposals, archive_root: archiveRoot, session_id: sessionId,
  });
  db!.prepare("UPDATE sessions SET completed_at = datetime('now') WHERE id = ?").run(sessionId);
  return result;
});
```

- [ ] **Step 3: Extend types + preload**

```typescript
// shared/types.ts
export interface Proposal { action: string; src_path: string; dst_path: string | null; reason: string }
export interface ApplyResult { ok: number; failed: number; session_id: string }

export interface CuratorApi {
  // ...existing...
  buildProposals: (archiveRoot: string) => Promise<Proposal[]>;
  applyProposals: (archiveRoot: string, proposals: Proposal[]) => Promise<ApplyResult>;
}
```

```typescript
// preload
buildProposals: (r) => ipcRenderer.invoke("curator:buildProposals", r),
applyProposals: (r, p) => ipcRenderer.invoke("curator:applyProposals", r, p),
```

- [ ] **Step 4: Commit**

```bash
git add python/ src/ && git commit -m "feat: applyProposals RPC + session recording in DB"
```

---

### Task 39: Apply route UI

**Files:**
- Create: `D:/curator/src/renderer/routes/Apply.tsx`
- Modify: `D:/curator/src/renderer/App.tsx`

- [ ] **Step 1: Write route**

```typescript
import { useEffect, useState } from "react";
import type { Proposal, ApplyResult } from "@shared/types";

export function Apply(): JSX.Element {
  const [archiveRoot, setArchiveRoot] = useState<string>("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [working, setWorking] = useState(false);

  async function pick() {
    const p = await window.curator.pickFolder(); if (!p) return;
    setArchiveRoot(p);
  }
  async function loadProposals() {
    if (!archiveRoot) return;
    const ps = await window.curator.buildProposals(archiveRoot);
    setProposals(ps); setResult(null);
  }
  async function runApply() {
    if (!archiveRoot || !proposals) return;
    setWorking(true);
    const r = await window.curator.applyProposals(archiveRoot, proposals);
    setResult(r); setWorking(false); setProposals(null);
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Apply</h1>
      <div className="flex gap-2 items-center">
        <button onClick={pick} className="border border-border rounded-md px-3 py-2 text-sm">Pick archive</button>
        <div className="text-sm font-mono text-muted-foreground">{archiveRoot || "(none)"}</div>
      </div>
      <div className="flex gap-2">
        <button onClick={loadProposals} disabled={!archiveRoot} className="border border-border rounded-md px-3 py-2 text-sm disabled:opacity-50">
          Build proposals
        </button>
        <button onClick={runApply} disabled={!proposals || working}
          className="bg-accent text-accent-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50">
          {working ? "Applying..." : `Apply ${proposals?.length ?? 0} actions`}
        </button>
      </div>
      {proposals && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr><th className="py-2">Action</th><th>Source</th><th>Target</th><th>Reason</th></tr></thead>
          <tbody>
            {proposals.map((p, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-2">{p.action}</td>
                <td className="font-mono break-all">{p.src_path}</td>
                <td className="font-mono break-all">{p.dst_path ?? "—"}</td>
                <td className="text-muted-foreground">{p.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result && (
        <div className="border border-border rounded-md p-4">
          <div>Session: <span className="font-mono">{result.session_id}</span></div>
          <div>OK: {result.ok} • Failed: {result.failed}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Router**

```typescript
import { Apply } from "./routes/Apply";
<Route path="/apply" element={<Apply />} />
```

- [ ] **Step 3: Manual test**

Dev run. Pick a test archive with dupes + misplaced. Build proposals. Apply. Verify files moved on disk.

- [ ] **Step 4: Commit**

```bash
git add src/ && git commit -m "feat: Apply route with proposal review + execute"
```

---

### Task 40: Undo RPC + Python

**Files:**
- Create: `D:/curator/python/curator/undo.py`
- Create: `D:/curator/python/tests/test_undo.py`
- Modify: `D:/curator/python/curator/builtins.py`

- [ ] **Step 1: Write failing test**

```python
from pathlib import Path
from curator.apply import apply_actions
from curator.undo import undo_session


def test_undo_reverses_quarantine(tmp_path: Path, monkeypatch):
    archive = tmp_path / "arch"; archive.mkdir()
    f = archive / "old.jpg"; f.write_bytes(b"x")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    apply_actions(
        [{"action": "quarantine", "src_path": str(f), "dst_path": None, "reason": "dup"}],
        str(archive), "sess-a",
    )
    assert not f.exists()
    r = undo_session("sess-a")
    assert r["restored"] == 1
    assert f.exists()


def test_undo_reverses_move(tmp_path: Path, monkeypatch):
    archive = tmp_path / "arch"; archive.mkdir()
    src = archive / "2016" / "a.jpg"; src.parent.mkdir(); src.write_bytes(b"x")
    dst = archive / "2015" / "a.jpg"
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    apply_actions(
        [{"action": "move_to_year", "src_path": str(src), "dst_path": str(dst), "reason": "x"}],
        str(archive), "sess-b",
    )
    assert dst.exists() and not src.exists()
    undo_session("sess-b")
    assert src.exists() and not dst.exists()
```

- [ ] **Step 2: Write `python/curator/undo.py`**

```python
from __future__ import annotations
import json, os, shutil
from pathlib import Path
from typing import Dict


def _manifest_path(session_id: str) -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / "Curator" / "sessions" / f"{session_id}.json"


def undo_session(session_id: str) -> Dict:
    mp = _manifest_path(session_id)
    if not mp.is_file():
        raise FileNotFoundError(f"session manifest not found: {mp}")
    data = json.loads(mp.read_text(encoding="utf-8"))
    restored = 0; failed = 0; errors: list[dict] = []
    # Reverse order so later actions undo first
    for a in reversed(data["actions"]):
        try:
            src = Path(a["dst"]); dst = Path(a["src"])
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            restored += 1
        except Exception as e:
            failed += 1; errors.append({"src": a.get("src"), "error": str(e)})
    # Mark manifest reversed
    data["reversed"] = True
    mp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return {"restored": restored, "failed": failed, "errors": errors, "session_id": session_id}
```

- [ ] **Step 3: Register RPC**

In `python/curator/builtins.py`:

```python
from curator.undo import undo_session


@register("undoSession")
def undo_session_rpc(params):
    return undo_session(params["session_id"])
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd /d/curator/python && .venv/Scripts/pytest tests/test_undo.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd /d/curator && git add python/ && git commit -m "feat: undo engine reverses session actions"
```

---

### Task 41: Sessions route with Undo button

**Files:**
- Modify: `D:/curator/src/main/queries.ts`
- Modify: `D:/curator/src/shared/types.ts`
- Modify: `D:/curator/src/main/index.ts`
- Modify: `D:/curator/src/preload/index.ts`
- Create: `D:/curator/src/renderer/routes/Sessions.tsx`
- Modify: `D:/curator/src/renderer/App.tsx`

- [ ] **Step 1: Add query**

```typescript
// queries.ts
export interface Session { id: string; started_at: string; completed_at: string | null; kind: string; action_count: number }

export function listSessions(db: Database.Database): Session[] {
  return db.prepare(`
    SELECT s.id, s.started_at, s.completed_at, s.kind,
           (SELECT COUNT(*) FROM actions a WHERE a.session_id = s.id) AS action_count
    FROM sessions s
    ORDER BY s.started_at DESC
  `).all() as Session[];
}
```

- [ ] **Step 2: IPC + preload + types**

```typescript
// shared/types.ts
export interface Session { id: string; started_at: string; completed_at: string | null; kind: string; action_count: number }
listSessions: () => Promise<Session[]>;
undoSession: (id: string) => Promise<{ restored: number; failed: number }>;
```

```typescript
// main/index.ts
import { listSessions } from "./queries";
ipcMain.handle("curator:listSessions", () => listSessions(db!));
ipcMain.handle("curator:undoSession", (_e, id: string) => sidecar!.call("undoSession", { session_id: id }));
```

```typescript
// preload
listSessions: () => ipcRenderer.invoke("curator:listSessions"),
undoSession: (id) => ipcRenderer.invoke("curator:undoSession", id),
```

- [ ] **Step 3: Route**

```typescript
import { useEffect, useState } from "react";
import type { Session } from "@shared/types";

export function Sessions(): JSX.Element {
  const [rows, setRows] = useState<Session[] | null>(null);
  const refresh = () => window.curator.listSessions().then(setRows);
  useEffect(refresh, []);
  async function undo(id: string) {
    if (!confirm(`Undo session ${id}?`)) return;
    await window.curator.undoSession(id);
    refresh();
  }
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
      {rows == null ? <div className="text-muted-foreground">Loading...</div>
        : rows.length === 0 ? <div className="text-muted-foreground">No sessions yet.</div>
        : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Started</th><th>Kind</th><th>Actions</th><th>ID</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2">{r.started_at}</td>
                  <td>{r.kind}</td>
                  <td>{r.action_count}</td>
                  <td className="font-mono text-xs">{r.id}</td>
                  <td><button onClick={() => undo(r.id)} className="border border-border rounded-md px-2 py-1 text-xs">Undo</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}
```

- [ ] **Step 4: Router**

```typescript
import { Sessions } from "./routes/Sessions";
<Route path="/sessions" element={<Sessions />} />
```

- [ ] **Step 5: Manual verify**

Apply then undo a session; verify files return.

- [ ] **Step 6: Commit**

```bash
git add src/ && git commit -m "feat: Sessions route with Undo"
```

---

### Task 42: Milestone 7 e2e — full scan → apply → undo

**Files:**
- Modify: `D:/curator/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add fixture with known state**

Create `tests/e2e/fixture-apply/2016/a.jpg` (bytes `AAAA`) and `tests/e2e/fixture-apply/2015/a.jpg` (bytes `AAAA`) — they are exact duplicates AND the 2016 copy is misplaced if EXIF said 2015. For the test, rely on xxhash match.

- [ ] **Step 2: Extend e2e**

```typescript
import { existsSync } from "node:fs";
import path from "node:path";

test("scan → apply → undo restores file state", async () => {
  const app = await electron.launch({ args: ["out/main/index.js"] });
  const win = await app.firstWindow();
  const fixture = path.resolve("tests/e2e/fixture-apply");
  await win.evaluate(async (p) => await (window as any).curator.scanArchive(p), fixture);
  await win.evaluate(async () => await (window as any).curator.hashAll());
  const proposals = await win.evaluate(async (p) => await (window as any).curator.buildProposals(p), fixture);
  expect(proposals.length).toBeGreaterThan(0);
  const result = await win.evaluate(async (args) => await (window as any).curator.applyProposals(args.p, args.proposals), { p: fixture, proposals });
  expect(result.ok).toBe(proposals.length);
  // Undo
  const undo = await win.evaluate(async (id) => await (window as any).curator.undoSession(id), result.session_id);
  expect(undo.restored).toBe(result.ok);
  // Both original files restored
  expect(existsSync(path.join(fixture, "2016", "a.jpg"))).toBe(true);
  expect(existsSync(path.join(fixture, "2015", "a.jpg"))).toBe(true);
  await app.close();
});
```

- [ ] **Step 3: Run e2e**

Run: `pnpm exec electron-vite build && pnpm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/ && git commit -m "test: e2e scan→apply→undo round-trip"
```

---

### Task 43: Milestone 7 checkpoint

- [ ] **Step 1: Full test suite**

Run: `pnpm run test && cd python && .venv/Scripts/pytest && cd .. && pnpm exec electron-vite build && pnpm run test:e2e`
Expected: all green.

- [ ] **Step 2: Tag**

```bash
git tag m7-apply-undo && echo "Milestone 7 complete"
```

---

## Milestone 8 — Portable Build (Tasks 44–48)

### Task 44: PyInstaller one-file sidecar

**Files:**
- Create: `D:/curator/python/curator-sidecar.spec`
- Create: `D:/curator/scripts/build-sidecar.ps1`

- [ ] **Step 1: Install PyInstaller into Python venv**

Run: `cd /d/curator/python && .venv/Scripts/pip install pyinstaller==6.10.0`

- [ ] **Step 2: Write PyInstaller spec `python/curator-sidecar.spec`**

```python
# -*- mode: python ; coding: utf-8 -*-
a = Analysis(
    ["curator/__main__.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=["curator.builtins"],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=None)
exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name="curator-sidecar",
    debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
    runtime_tmpdir=None, console=True,
    disable_windowed_traceback=False, target_arch=None, codesign_identity=None, entitlements_file=None,
)
```

- [ ] **Step 3: Write `scripts/build-sidecar.ps1`**

```powershell
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "python"
Push-Location $python
try {
  & .\.venv\Scripts\pyinstaller.exe --noconfirm --clean curator-sidecar.spec
  $srcExe = Join-Path $python "dist\curator-sidecar.exe"
  $destDir = Join-Path $root "dist-sidecar"
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -Force $srcExe (Join-Path $destDir "curator-sidecar.exe")
  Write-Host "Built: $destDir\curator-sidecar.exe"
} finally {
  Pop-Location
}
```

- [ ] **Step 4: Build**

Run: `pnpm run build:sidecar`
Expected: `dist-sidecar/curator-sidecar.exe` exists, 15–30 MB.

- [ ] **Step 5: Smoke-test the sidecar exe**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}' | dist-sidecar/curator-sidecar.exe`
Expected: `{"jsonrpc":"2.0","id":1,"result":{"pong":true}}`.

- [ ] **Step 6: Commit**

```bash
git add python/curator-sidecar.spec scripts/build-sidecar.ps1 .gitignore && git commit -m "feat: PyInstaller one-file sidecar build"
```

Add `dist-sidecar/` to `.gitignore` first.

---

### Task 45: electron-builder portable target build

**Files:**
- Modify: `D:/curator/package.json` (verify build config already present from Task 2)

- [ ] **Step 1: Verify resources present**

Run: `ls resources/bin/ dist-sidecar/`
Expected: `exiftool.exe`, `ffmpeg.exe`, `ffprobe.exe` in `resources/bin/`; `curator-sidecar.exe` in `dist-sidecar/`.

- [ ] **Step 2: Build portable**

Run: `pnpm run build`
Expected: `release/Curator-portable.exe` exists, ~150–220 MB.

- [ ] **Step 3: Run the portable exe on a clean path**

Copy `release/Curator-portable.exe` to a different directory (e.g., `C:\tmp\`) and double-click.
Expected: App launches; Dashboard shows Electron + sidecar versions + "Ping: pong".

- [ ] **Step 4: Verify state dir is outside the exe**

Open `%LOCALAPPDATA%\Curator\`.
Expected: `index.db` present after the app has run once.

- [ ] **Step 5: Commit**

```bash
git add package.json && git commit -m "build: verify portable electron-builder target produces working exe"
```

---

### Task 46: README finalization

**Files:**
- Modify: `D:/curator/README.md`

- [ ] **Step 1: Rewrite README**

```markdown
# Archive Curator — Phase 1 MVP

Portable Windows app that scans a personal media archive, detects exact duplicates, resolves canonical dates from EXIF/filename, flags misplaced files, and executes approved moves/renames through a reversible quarantine-based apply engine.

## What it does (Phase 1)

- Scan an archive folder; index every photo/video to SQLite at `%LOCALAPPDATA%\Curator\index.db`
- Compute xxhash for every file; detect exact duplicates
- Resolve canonical date per file (EXIF → filename patterns → mtime)
- List files where folder-year ≠ canonical-year
- Build proposals (quarantine duplicates keeping oldest; move misplaced to correct year folder)
- Apply proposals with atomic moves + collision-hash-suffix fallback
- Undo any past session

## Out of Phase 1 (coming in Phases 2–4)

Perceptual dedup, Motion Photo detection, burst detection, screenshot detection, keeper scoring, edited-version pairs, archive-health histograms, cross-volume moves, JSONL WAL for crash safety.

## Run from source

    pnpm install
    pwsh scripts/fetch-binaries.ps1
    cd python && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
    cd .. && pnpm run dev

## Build portable .exe

    pnpm run fetch-bins
    pnpm run build:sidecar
    pnpm run build

Output: `release/Curator-portable.exe` (~150–220 MB, single file).

## State locations

- `%LOCALAPPDATA%\Curator\index.db` — SQLite index
- `%LOCALAPPDATA%\Curator\sessions\*.json` — undo manifests
- `<archive>\_curator_quarantine\<session-id>\` — quarantined originals
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: Phase 1 README"
```

---

### Task 47: Full test sweep

- [ ] **Step 1: Run everything**

Run: `pnpm run typecheck && pnpm run test && cd python && .venv/Scripts/pytest && cd .. && pnpm exec electron-vite build && pnpm run test:e2e`
Expected: all green.

- [ ] **Step 2: If any test fails, fix before proceeding**

(The engineer should diagnose per the specific failure. Do NOT stub failing tests.)

---

### Task 48: Ship tag

- [ ] **Step 1: Tag release**

```bash
git tag v0.1.0 -m "Phase 1 MVP" && echo "Phase 1 complete — Curator-portable.exe ready"
```

- [ ] **Step 2: Hand off to Phase 2 planning**

Next plan: `docs/superpowers/plans/<date>-curator-phase-2-perceptual-dedup.md` (separate document).

---

## Spec Coverage Self-Review

- Archive scan with walker → Tasks 20, 21, 22, 23
- SQLite index at `%LOCALAPPDATA%` → Tasks 15, 16, 17
- xxhash exact dedup → Tasks 25, 26, 27, 28
- EXIF batch extraction → Task 30
- Canonical date priority chain (EXIF + filename + mtime) → Tasks 31, 32
- Misplaced-by-date detection → Task 33
- Zero-byte list → Task 34
- Proposal builder → Task 36
- Apply engine with quarantine + collision hash-suffix → Task 37
- Session recording + undo → Tasks 38, 40, 41
- Electron + React UI for all of the above → Tasks 4, 6, 22, 28, 33, 34, 39, 41
- Python sidecar with JSON-RPC → Tasks 10, 11, 12, 13, 14
- Bundled binaries (exiftool, ffmpeg, ffprobe) → Tasks 7, 18, 19
- Portable .exe build → Tasks 44, 45

**Placeholder scan:** No "TBD", "TODO", or "similar to Task N" in any step. All test code and implementation code is concrete.

**Type consistency:** `CuratorApi` extended additively across tasks; all fields named consistently. `Proposal`, `ExactCluster`, `MisplacedFile`, `ZeroByteFile`, `Session` shapes match between Node and renderer via `src/shared/types.ts`. Python RPC method names (`ping`, `version`, `binaries`, `scan`, `hashAll`, `resolveDates`, `applyActions`, `undoSession`) match between Python registration and Node `sidecar.call()` usage.

**Out-of-Phase-1 items** (correctly deferred, flagged in README): perceptual dedup, Motion Photo/burst/screenshot classifiers, keeper scoring, edited-version detection, archive-health histograms, JSONL WAL, cross-volume safety.

---

## Execution Notes

- `better-sqlite3` has a native build that requires Visual Studio Build Tools on Windows. If `pnpm install` fails, install "Desktop development with C++" via Visual Studio Installer, then retry.
- Playwright Electron tests require `pnpm exec playwright install chromium` once per machine.
- PyInstaller may flag missing hidden imports from `pyexiftool` or `xxhash` on a fresh machine; if so, add them to `hiddenimports` in `curator-sidecar.spec`.
- The archive path contains Romanian characters (`„OVIDIUS"`). All code paths handle Unicode explicitly — no `latin-1` fallbacks anywhere.
