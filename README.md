# Archive Curator - Phase 1 MVP

Portable Windows app that scans a personal media archive, detects exact duplicates, resolves canonical dates from EXIF and filename patterns, flags misplaced files, and executes approved moves or renames through a reversible quarantine-based apply engine.

## What it does (Phase 1)

- Scan an archive folder and index every photo or video to SQLite at `%LOCALAPPDATA%\Curator\index.db`
- Compute xxhash for every file and detect exact duplicates
- Resolve canonical date per file (EXIF -> filename patterns -> mtime)
- List files where folder-year != canonical-year
- Build proposals (quarantine duplicates keeping oldest; move misplaced to correct year folder)
- Apply proposals with atomic moves and collision hash-suffix fallback
- Undo any past session

## Out of Phase 1 (coming in Phases 2-4)

Perceptual dedup, Motion Photo detection, burst detection, screenshot detection, keeper scoring, edited-version pairs, archive-health histograms, cross-volume moves, JSONL WAL for crash safety.

## Run from source

    pnpm install
    pwsh scripts/fetch-binaries.ps1
    cd python && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
    cd .. && pnpm run dev

## Build Windows installer

    pnpm run fetch-bins
    pnpm run build:sidecar
    pnpm run build

Output: `release/Curator-Setup-0.1.10.exe` plus `latest.yml` for auto-update publishing.

To build, publish, silently install on this PC, and relaunch the installed app in one step, run `pnpm run ship:win`.

## Auto updates

- Installed builds check GitHub Releases on startup
- Updates download automatically in the background
- The downloaded update installs automatically as soon as the update is ready
- Set `CURATOR_DISABLE_AUTO_UPDATE=1` to skip updater checks for a run

## State locations

- `%LOCALAPPDATA%\Curator\index.db` - SQLite index
- `%LOCALAPPDATA%\Curator\sessions\*.json` - undo manifests
- `<archive>\_curator_quarantine\<session-id>\` - quarantined originals
