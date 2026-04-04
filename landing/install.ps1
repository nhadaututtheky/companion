# Companion — One-line Docker install for Windows
# Usage: irm https://companion.theio.vn/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Repo = "nhadaututtheky/companion"
$Dir = "companion"
$ComposeUrl = "https://raw.githubusercontent.com/$Repo/main/docker-compose.yml"
$EnvUrl = "https://raw.githubusercontent.com/$Repo/main/.env.example"

function Write-Info($msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Blue }
function Write-Ok($msg)    { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERR]   $msg" -ForegroundColor Red; exit 1 }

# ── Preflight checks ────────────────────────────────────────────────────────

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker is not installed. Get it at https://docs.docker.com/get-docker/"
}

try { docker info 2>$null | Out-Null } catch {
    Write-Err "Docker daemon is not running. Please start Docker Desktop."
}

# ── Setup ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  +======================================+" -ForegroundColor Green
Write-Host "  |       Companion Installer v0.8.1     |" -ForegroundColor Green
Write-Host "  |  Multi-session UI for Claude Code    |" -ForegroundColor Green
Write-Host "  +======================================+" -ForegroundColor Green
Write-Host ""

if (Test-Path $Dir) {
    Write-Warn "Directory '$Dir' already exists - updating files..."
} else {
    New-Item -ItemType Directory -Path $Dir | Out-Null
    Write-Ok "Created $Dir/"
}

Set-Location $Dir

# Download docker-compose.yml
Write-Info "Downloading docker-compose.yml..."
Invoke-WebRequest -Uri $ComposeUrl -OutFile "docker-compose.yml" -UseBasicParsing
Write-Ok "docker-compose.yml"

# Download .env (only if not exists)
if (Test-Path ".env") {
    Write-Warn ".env already exists - skipping (won't overwrite your config)"
    $ApiKey = "(check your existing .env)"
} else {
    Write-Info "Downloading .env template..."
    Invoke-WebRequest -Uri $EnvUrl -OutFile ".env" -UseBasicParsing
    Write-Ok ".env template"

    # Generate random API key
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $ApiKey = [Convert]::ToBase64String($bytes) -replace '[/+=]','' | Select-Object -First 1
    $ApiKey = $ApiKey.Substring(0, [Math]::Min(24, $ApiKey.Length))

    $content = Get-Content ".env" -Raw
    $content = $content -replace "API_KEY=your-secret-api-key-here", "API_KEY=$ApiKey"
    Set-Content ".env" -Value $content -NoNewline
    Write-Ok "Generated random API key"
}

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Companion is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host ""
Write-Host "  1. " -NoNewline -ForegroundColor Blue; Write-Host "cd companion"
Write-Host "  2. " -NoNewline -ForegroundColor Blue; Write-Host "Edit .env if needed (API_KEY is pre-set)"
Write-Host "  3. " -NoNewline -ForegroundColor Blue; Write-Host "Uncomment volume mounts in docker-compose.yml"
Write-Host "     for your project directories"
Write-Host "  4. " -NoNewline -ForegroundColor Blue; Write-Host "docker compose up -d"
Write-Host "  5. " -NoNewline -ForegroundColor Blue; Write-Host "Open http://localhost:3579" -ForegroundColor Green
Write-Host ""
Write-Host "  Your API key: " -NoNewline; Write-Host "$ApiKey" -ForegroundColor Yellow
Write-Host "  (also saved in .env)"
Write-Host ""
Write-Host "  Docs: https://companion.theio.vn"
Write-Host "  GitHub: https://github.com/$Repo"
Write-Host ""
