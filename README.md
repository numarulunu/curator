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
