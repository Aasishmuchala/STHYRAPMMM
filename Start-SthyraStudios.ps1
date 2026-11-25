# Sthyra Studios - one-click build and start (Windows, Docker Desktop)
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\Start-SthyraStudios.ps1
# Team access over the office network:
#   powershell -ExecutionPolicy Bypass -File .\Start-SthyraStudios.ps1 -HostName 192.168.1.50:8080
param(
  [string]$HostName = "localhost:8080",
  [int]$Port = 8080,
  [string]$Folder = "$env:USERPROFILE\sthyra-studios"
)
$ErrorActionPreference = "Stop"
$Image = "sthyra-studios:latest"
$Container = "sthyra-studios"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }

Step "Checking tools"
foreach ($tool in "git", "docker") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is not installed. Install Git for Windows and Docker Desktop, then run again." }
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is not running. Start it, wait until it says 'Running', then run again." }

Step "Getting Sthyra Studios source"
if (-not (Test-Path "$Folder\.git")) {
  git -c core.autocrlf=false -c core.longpaths=true clone --depth 1 https://github.com/Aasishmuchala/STHYRAPMMM.git $Folder
} else {
  git -C $Folder pull --ff-only
}

Step "Building the Sthyra Studios image (first time: 20-40 minutes)"
docker build -f "$Folder\docker\prod\Dockerfile" --target all-in-one -t $Image $Folder
if ($LASTEXITCODE -ne 0) { throw "Docker build failed - send the last 50 lines of output." }

Step "Starting Sthyra Studios"
$secretFile = "$Folder\.secret_key_base"
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 64; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  ($bytes | ForEach-Object { $_.ToString("x2") }) -join "" | Set-Content -NoNewline $secretFile
}
$secret = Get-Content $secretFile -Raw
docker rm -f $Container *> $null
docker run -d --name $Container --restart unless-stopped -p "${Port}:80" `
  -e SECRET_KEY_BASE=$secret `
  -e OPENPROJECT_HOST__NAME=$HostName `
  -e OPENPROJECT_HTTPS=false `
  -e OPENPROJECT_DEFAULT__LANGUAGE=en `
  -v sthyra_pgdata:/var/openproject/pgdata `
  -v sthyra_assets:/var/openproject/assets `
  $Image | Out-Null

Step "Waiting for first start (database setup takes a few minutes)"
$url = "http://localhost:$Port"
for ($i = 0; $i -lt 120; $i++) {
  try { $r = Invoke-WebRequest -Uri "$url/health_check" -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { break } } catch {}
  Start-Sleep 5
}
Write-Host "`nSthyra Studios is running at $url" -ForegroundColor Green
Write-Host "First login: admin / admin (you will be asked to change it)."
Write-Host "Secret key saved in $secretFile - keep it, the database needs it."
Start-Process $url
