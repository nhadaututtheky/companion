#!/bin/sh
# Companion — One-line Docker install
# Usage: curl -fsSL https://companion.theio.vn/install | sh
set -e

REPO="nhadaututtheky/companion"
DIR="companion"
COMPOSE_URL="https://raw.githubusercontent.com/$REPO/main/docker-compose.yml"
ENV_URL="https://raw.githubusercontent.com/$REPO/main/.env.example"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { printf "${BLUE}[INFO]${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
err()   { printf "${RED}[ERR]${NC}   %s\n" "$1" >&2; exit 1; }

# ── Preflight checks ────────────────────────────────────────────────────────

command -v docker >/dev/null 2>&1 || err "Docker is not installed. Get it at https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || err "Docker daemon is not running. Please start Docker Desktop."

if command -v docker compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  err "docker compose is not available. Please update Docker Desktop."
fi

# ── Setup ────────────────────────────────────────────────────────────────────

printf "\n"
printf "${GREEN}  ╔══════════════════════════════════════╗${NC}\n"
printf "${GREEN}  ║       Companion Installer v0.8.1     ║${NC}\n"
printf "${GREEN}  ║  Multi-session UI for Claude Code    ║${NC}\n"
printf "${GREEN}  ╚══════════════════════════════════════╝${NC}\n"
printf "\n"

if [ -d "$DIR" ]; then
  warn "Directory '$DIR' already exists — updating files..."
else
  mkdir -p "$DIR"
  ok "Created $DIR/"
fi

cd "$DIR"

# Download docker-compose.yml
info "Downloading docker-compose.yml..."
curl -fsSL "$COMPOSE_URL" -o docker-compose.yml
ok "docker-compose.yml"

# Download .env (only if not exists — don't overwrite user config)
if [ -f ".env" ]; then
  warn ".env already exists — skipping (won't overwrite your config)"
else
  info "Downloading .env template..."
  curl -fsSL "$ENV_URL" -o .env
  ok ".env template"

  # Generate a random API key
  API_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
  sed -i.bak "s|API_KEY=your-secret-api-key-here|API_KEY=$API_KEY|" .env 2>/dev/null || \
    sed -i '' "s|API_KEY=your-secret-api-key-here|API_KEY=$API_KEY|" .env 2>/dev/null || true
  rm -f .env.bak
  ok "Generated random API key"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

printf "\n"
printf "${GREEN}  ✓ Companion is ready!${NC}\n"
printf "\n"
printf "  Next steps:\n"
printf "\n"
printf "  ${BLUE}1.${NC} cd companion\n"
printf "  ${BLUE}2.${NC} Edit .env if needed (API_KEY is pre-set)\n"
printf "  ${BLUE}3.${NC} Uncomment volume mounts in docker-compose.yml\n"
printf "     for your project directories\n"
printf "  ${BLUE}4.${NC} docker compose up -d\n"
printf "  ${BLUE}5.${NC} Open ${GREEN}http://localhost:3579${NC}\n"
printf "\n"
printf "  Your API key: ${YELLOW}$API_KEY${NC}\n"
printf "  (also saved in .env)\n"
printf "\n"
printf "  Docs: https://companion.theio.vn\n"
printf "  GitHub: https://github.com/$REPO\n"
printf "\n"
