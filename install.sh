#!/bin/sh
set -e

# Mars Router Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/MarsAI-org/mars-router/master/install.sh | sh
#
# Options:
#   --docker        Install and run via Docker (recommended for a server)
#   --native        Install from source and run with Node.js (default)
#   --dir <path>    Install directory (default: ~/.mars-router)
#   --port <port>   Service port (default: 20128)
#   --ref <ref>     Git ref (tag/branch/commit) to install (default: master)
#   --no-start      Install only; do not start the server
#   -h, --help      Show this help

REPO="MarsAI-org/mars-router"
DEFAULT_DIR="${MARS_ROUTER_DIR:-$HOME/.mars-router}"
DEFAULT_PORT="${PORT:-20128}"
DEFAULT_REF="master"
REQUIRED_NODE_MAJOR=20

MODE="native"
INSTALL_DIR="$DEFAULT_DIR"
PORT="$DEFAULT_PORT"
REF="$DEFAULT_REF"
START=1

log()  { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m warn\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31merror\033[0m %s\n' "$1" >&2; exit 1; }

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# ---- parse args ----
while [ $# -gt 0 ]; do
  case "$1" in
    --docker) MODE="docker"; shift ;;
    --native) MODE="native"; shift ;;
    --dir)    shift; [ -n "$1" ] || die "Missing value for --dir"; INSTALL_DIR="$1"; shift ;;
    --dir=*)  INSTALL_DIR="${1#*=}"; shift ;;
    --port)   shift; [ -n "$1" ] || die "Missing value for --port"; PORT="$1"; shift ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --ref)    shift; [ -n "$1" ] || die "Missing value for --ref"; REF="$1"; shift ;;
    --ref=*)  REF="${1#*=}"; shift ;;
    --no-start) START=0; shift ;;
    -h|--help) usage ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

command -v git >/dev/null 2>&1 || die "git is required. Install it and retry."

# =========================================================
# Docker mode
# =========================================================
install_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is required for --docker mode. See https://docs.docker.com/get-docker/"
  if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    die "docker compose (v2) or docker-compose is required."
  fi
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"

  DATA_HOME="$INSTALL_DIR/data"
  mkdir -p "$DATA_HOME"

  # Write a self-contained compose file so the install never depends on a repo
  # file that may use a different image/port contract.
  log "Writing docker-compose.yml (port $PORT, data $DATA_HOME)"
  cat > docker-compose.yml <<EOF
services:
  mars-router:
    image: \${MARS_ROUTER_IMAGE:-ghcr.io/marsai-org/mars-router:latest}
    container_name: mars-router
    restart: always
    ports:
      - "$PORT:20128"
    volumes:
      - "$DATA_HOME:/app/data"
    environment:
      DATA_DIR: /app/data
      PORT: "20128"
      HOSTNAME: "0.0.0.0"
      NODE_ENV: production
EOF

  log "Pulling image and starting Mars Router"
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d
  else
    docker-compose up -d
  fi
  log "Done. Dashboard: http://localhost:$PORT/dashboard"
  log "Data persisted in: $DATA_HOME"
  exit 0
}

# =========================================================
# Native mode (Node.js from source)
# =========================================================
install_native() {
  command -v node >/dev/null 2>&1 || die "Node.js $REQUIRED_NODE_MAJOR+ is required. See https://nodejs.org/"
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  [ "$NODE_MAJOR" -ge "$REQUIRED_NODE_MAJOR" ] || \
    die "Node.js $REQUIRED_NODE_MAJOR+ required (found $(node -v)). See https://nodejs.org/"
  command -v npm >/dev/null 2>&1 || die "npm is required."

  if [ -d "$INSTALL_DIR/.git" ]; then
    log "Updating existing checkout in $INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$REF" || die "git fetch failed"
    git -C "$INSTALL_DIR" checkout -q FETCH_HEAD
  else
    log "Cloning $REPO (ref: $REF) into $INSTALL_DIR"
    git clone --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$INSTALL_DIR" 2>/dev/null \
      || { git clone --depth 1 "https://github.com/$REPO.git" "$INSTALL_DIR" && git -C "$INSTALL_DIR" checkout -q "$REF"; }
  fi

  cd "$INSTALL_DIR"

  if [ ! -f .env ]; then
    log "Creating .env from .env.example"
    cp .env.example .env 2>/dev/null || true
  fi

  log "Installing dependencies (this can take a few minutes)"
  npm install --no-audit --no-fund

  log "Building (production)"
  npm run build

  # Install the `mars-router` command onto PATH.
  BIN_DIR="${MARS_ROUTER_BIN_DIR:-$HOME/.local/bin}"
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/mars-router" <<EOF
#!/bin/sh
exec node "$INSTALL_DIR/scripts/mars-router.mjs" "\$@"
EOF
  chmod +x "$BIN_DIR/mars-router"
  log "Installed command: $BIN_DIR/mars-router"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) warn "Add $BIN_DIR to your PATH to run 'mars-router' from anywhere:
    export PATH=\"$BIN_DIR:\$PATH\"" ;;
  esac

  log "Install complete → $INSTALL_DIR"
  if [ "$START" -eq 1 ]; then
    log "Starting Mars Router on port $PORT"
    PORT="$PORT" nohup node "$INSTALL_DIR/scripts/mars-router.mjs" start > "$INSTALL_DIR/mars-router.log" 2>&1 &
    log "Started (pid $!). Dashboard: http://localhost:$PORT/dashboard"
    log "Manage it with: mars-router status | logs | stop"
  else
    log "Skipped start. To run later:"
    echo "  cd $INSTALL_DIR && PORT=$PORT mars-router"
  fi
}

case "$MODE" in
  docker) install_docker ;;
  native) install_native ;;
esac
