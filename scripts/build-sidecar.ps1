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
