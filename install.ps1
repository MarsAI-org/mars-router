<#
.SYNOPSIS
  Mars Router installer for Windows.
.DESCRIPTION
  Clones (or updates) the Mars Router repository, installs dependencies, builds,
  and optionally starts the server. Also supports running via Docker.
.EXAMPLE
  iwr -useb https://raw.githubusercontent.com/MarsAI-org/mars-router/master/install.ps1 | iex
.EXAMPLE
  .\install.ps1 -Docker -Port 20128
#>
param(
  [switch]$Docker,
  [switch]$NoStart,
  [string]$Dir = "$HOME\.mars-router",
  [int]$Port = 20128,
  [string]$Ref = "master"
)

$ErrorActionPreference = "Stop"
$Repo = "MarsAI-org/mars-router"
$RequiredNodeMajor = 20

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "warn: $m" -ForegroundColor Yellow }
function Die($m) { Write-Host "error: $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Die "git is required. Install it from https://git-scm.com/downloads and retry."
}

if ($Docker) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Die "Docker is required for -Docker mode. See https://docs.docker.com/desktop/install/windows-install/"
  }
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  Set-Location $Dir
  $dataHome = Join-Path $Dir "data"
  New-Item -ItemType Directory -Force -Path $dataHome | Out-Null
  Info "Writing docker-compose.yml (port $Port)"
  $compose = @"
services:
  mars-router:
    image: `${MARS_ROUTER_IMAGE:-ghcr.io/marsai-org/mars-router:latest}
    container_name: mars-router
    restart: always
    ports:
      - "$Port`:20128"
    volumes:
      - "$dataHome`:/app/data"
    environment:
      DATA_DIR: /app/data
      PORT: "20128"
      HOSTNAME: "0.0.0.0"
      NODE_ENV: production
"@
  Set-Content -Path "docker-compose.yml" -Value $compose -Encoding utf8
  Info "Pulling image and starting Mars Router"
  docker compose up -d
  Info "Done. Dashboard: http://localhost:$Port/dashboard"
  Info "Data persisted in: $dataHome"
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die "Node.js $RequiredNodeMajor+ is required. Install it from https://nodejs.org/"
}
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt $RequiredNodeMajor) {
  Die "Node.js $RequiredNodeMajor+ required (found $(node -v))."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die "npm is required." }

if (Test-Path (Join-Path $Dir ".git")) {
  Info "Updating existing checkout in $Dir"
  git -C $Dir fetch --depth 1 origin $Ref
  git -C $Dir checkout -q FETCH_HEAD
} else {
  Info "Cloning $Repo (ref: $Ref) into $Dir"
  try {
    git clone --depth 1 --branch $Ref "https://github.com/$Repo.git" $Dir
  } catch {
    git clone --depth 1 "https://github.com/$Repo.git" $Dir
    git -C $Dir checkout -q $Ref
  }
}

Set-Location $Dir
$envFile = Join-Path $Dir ".env"
if (-not (Test-Path $envFile) -and (Test-Path (Join-Path $Dir ".env.example"))) {
  Info "Creating .env from .env.example"
  Copy-Item (Join-Path $Dir ".env.example") $envFile
}

Info "Installing dependencies (this can take a few minutes)"
npm install --no-audit --no-fund

Info "Building (production)"
npm run build

Info "Install complete -> $Dir"

# Install the `mars-router` command onto PATH (user-level bin dir).
$binDir = if ($env:MARS_ROUTER_BIN_DIR) { $env:MARS_ROUTER_BIN_DIR } else { Join-Path $HOME ".local\bin" }
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$cmdPath = Join-Path $binDir "mars-router.cmd"
Set-Content -Path $cmdPath -Encoding ascii -Value "@echo off`r`nnode `"$Dir\scripts\mars-router.mjs`" %*"
Info "Installed command: $cmdPath"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$binDir", "User")
  Warn "Added $binDir to your PATH (restart the terminal to use 'mars-router')."
}

if (-not $NoStart) {
  Info "Starting Mars Router on port $Port"
  $env:PORT = "$Port"
  Start-Process -FilePath "node" -ArgumentList "$Dir\scripts\mars-router.mjs", "start" -WorkingDirectory $Dir `
    -RedirectStandardOutput (Join-Path $Dir "mars-router.log") `
    -RedirectStandardError (Join-Path $Dir "mars-router.err.log")
  Info "Started. Dashboard: http://localhost:$Port/dashboard"
  Info "Manage it with: mars-router status | logs | stop"
} else {
  Info "Skipped start. To run later: cd $Dir; `$env:PORT=$Port; mars-router"
}
