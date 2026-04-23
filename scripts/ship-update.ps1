$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $root "_ship_update.log"

function Write-Log {
  param([string]$Message)

  $line = "[{0}] {1}" -f (Get-Date -Format o), $Message
  Add-Content -Path $logPath -Value $line
  Write-Host $Message
}

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Log $Label
  & $Action
}

Set-Content -Path $logPath -Value ""

Push-Location $root
try {
  $pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $version = $pkg.version
  $tag = "v$version"
  $repo = "numarulunu/curator"
  $installerName = "Curator-Setup-$version.exe"
  $installerPath = Join-Path $root "release\$installerName"
  $blockMapPath = "$installerPath.blockmap"
  $latestYmlPath = Join-Path $root "release\latest.yml"
  $desktopInstallerPath = Join-Path ([Environment]::GetFolderPath("Desktop")) $installerName
  $installedExePath = Join-Path $env:LOCALAPPDATA "Programs\Curator\Curator.exe"

  Invoke-Step "Checking GitHub authentication." {
    gh auth status | Out-Null
  }

  Invoke-Step "Rebuilding Electron native modules." {
    & pnpm run rebuild:electron
    if ($LASTEXITCODE -ne 0) { throw "Electron rebuild failed." }
  }

  Invoke-Step "Building the app." {
    & pnpm exec electron-vite build
    if ($LASTEXITCODE -ne 0) { throw "Renderer and main build failed." }
  }

  Invoke-Step "Packaging the Windows installer." {
    & pnpm exec electron-builder --win nsis
    if ($LASTEXITCODE -ne 0) { throw "Windows packaging failed." }
  }

  if (-not (Test-Path $installerPath)) { throw "Installer not found at $installerPath" }
  if (-not (Test-Path $blockMapPath)) { throw "Block map not found at $blockMapPath" }
  if (-not (Test-Path $latestYmlPath)) { throw "latest.yml not found at $latestYmlPath" }

  $releaseExists = $false
  & gh release view $tag --repo $repo --json tagName 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { $releaseExists = $true }

  if ($releaseExists) {
    Invoke-Step "Uploading refreshed release assets for $tag." {
      & gh release upload $tag $installerPath $blockMapPath $latestYmlPath --repo $repo --clobber
      if ($LASTEXITCODE -ne 0) { throw "GitHub asset upload failed." }
    }
  } else {
    Invoke-Step "Creating GitHub release $tag." {
      & gh release create $tag $installerPath $blockMapPath $latestYmlPath --repo $repo --title $tag --notes "Automated Curator ship for $tag."
      if ($LASTEXITCODE -ne 0) { throw "GitHub release creation failed." }
    }
  }

  Invoke-Step "Copying installer to the Desktop." {
    Copy-Item -LiteralPath $installerPath -Destination $desktopInstallerPath -Force
  }

  Invoke-Step "Closing running Curator processes before local install." {
    Get-Process | Where-Object { $_.ProcessName -in @("Curator", "curator-sidecar") } | Stop-Process -Force
  }

  Invoke-Step "Installing Curator silently on this PC." {
    $proc = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
    if ($proc.ExitCode -ne 0) { throw "Installer exited with code $($proc.ExitCode)." }
  }

  if (Test-Path $installedExePath) {
    Invoke-Step "Launching the installed app so the updater is active." {
      Start-Process -FilePath $installedExePath
    }
  } else {
    throw "Installed app not found at $installedExePath"
  }

  Write-Log "Ship complete for $tag."
} catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  throw
} finally {
  Pop-Location
}
