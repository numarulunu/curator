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
  $support = Join-Path $src.Directory.FullName "exiftool_files"
  if (Test-Path $support) {
    $dest = Join-Path $bin "exiftool_files"
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Path $support -Destination $dest -Recurse -Force
  }
  Remove-Item -Recurse -Force $extract, $zip
}

Write-Host "Fetching exiftool..."
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
