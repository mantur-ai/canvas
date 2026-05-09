#!/usr/bin/env bash
set -euo pipefail

REQUIRED_NODE_MAJOR=24
PM2_APP_NAME="mantur-canvas"
APP_URL="http://localhost:3000"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '[Mantur Canvas] %s\n' "$1"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

node_major_version() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || printf '0'
}

load_volta() {
  export VOLTA_HOME="${VOLTA_HOME:-$HOME/.volta}"
  export PATH="$VOLTA_HOME/bin:$PATH"
}

install_node_with_volta() {
  if ! command_exists curl; then
    log "curl is required to install Node.js automatically. Please install curl first."
    exit 1
  fi

  load_volta

  if ! command_exists volta; then
    log "Node.js ${REQUIRED_NODE_MAJOR}+ was not found. Installing Volta first..."
    curl https://get.volta.sh | bash
    load_volta
  fi

  log "Installing Node.js ${REQUIRED_NODE_MAJOR} with Volta..."
  volta install "node@${REQUIRED_NODE_MAJOR}"
  volta install npm
}

ensure_node() {
  load_volta

  if command_exists node && [ "$(node_major_version)" -ge "$REQUIRED_NODE_MAJOR" ]; then
    log "Node.js $(node -v) detected."
    return
  fi

  install_node_with_volta

  if ! command_exists node || [ "$(node_major_version)" -lt "$REQUIRED_NODE_MAJOR" ]; then
    log "Node.js installation did not complete. Please reopen the terminal and run this script again."
    exit 1
  fi
}

ensure_npm() {
  if command_exists npm; then
    log "npm $(npm -v) detected."
    return
  fi

  log "npm was not found. Installing npm with Volta..."
  load_volta
  volta install npm
}

ensure_opencode() {
  if command_exists opencode; then
    log "opencode $(opencode --version 2>/dev/null || printf 'installed') detected."
    return
  fi

  log "opencode was not found. Installing opencode globally..."
  if ! npm install -g opencode-ai; then
    log "opencode installation failed. Please check npm permissions or network access, then run this script again."
    exit 1
  fi

  if ! command_exists opencode; then
    log "opencode installation completed, but the opencode command is not on PATH. Please reopen the terminal and run this script again."
    exit 1
  fi

  log "opencode $(opencode --version 2>/dev/null || printf 'installed') is ready."
}

ensure_pm2() {
  if command_exists pm2; then
    log "pm2 $(pm2 --version 2>/dev/null || printf 'installed') detected."
    return
  fi

  log "pm2 was not found. Installing pm2 globally..."
  if ! npm install -g pm2; then
    log "pm2 installation failed. Please check npm permissions or network access, then run this script again."
    exit 1
  fi

  if ! command_exists pm2; then
    log "pm2 installation completed, but the pm2 command is not on PATH. Please reopen the terminal and run this script again."
    exit 1
  fi

  log "pm2 $(pm2 --version 2>/dev/null || printf 'installed') is ready."
}

start_with_pm2() {
  local status
  status="$(pm2_app_status)"

  if [ "$status" = "online" ]; then
    log "Restarting Mantur Canvas with pm2 at $APP_URL"
    npm run pm2:reload
    return
  fi

  log "Starting Mantur Canvas with pm2 at $APP_URL"
  npm run pm2:start
}

pm2_app_status() {
  pm2 jlist | node -e "
const appName = process.argv[1];
let input = '';
process.stdin.on('data', (chunk) => input += chunk);
process.stdin.on('end', () => {
  try {
    const apps = JSON.parse(input);
    const app = apps.find((item) => item.name === appName);
    process.stdout.write(app?.pm2_env?.status || 'missing');
  } catch {
    process.stdout.write('unknown');
  }
});
" "$PM2_APP_NAME"
}

show_pm2_diagnostics() {
  log "PM2 status:"
  pm2 status
  log "Recent PM2 logs for $PM2_APP_NAME:"
  pm2 logs "$PM2_APP_NAME" --lines 80 --nostream
}

wait_for_pm2_online() {
  local status

  for _ in $(seq 1 30); do
    status="$(pm2_app_status)"

    if [ "$status" = "online" ]; then
      log "PM2 app is online."
      return 0
    fi

    if [ "$status" = "stopped" ] || [ "$status" = "errored" ]; then
      log "PM2 app status is $status."
      return 1
    fi

    sleep 1
  done

  log "PM2 app did not become online in time."
  return 1
}

wait_for_app_url() {
  for _ in $(seq 1 60); do
    if command_exists curl && curl -fsS "$APP_URL" >/dev/null 2>&1; then
      log "Mantur Canvas is ready at $APP_URL"
      return 0
    fi

    sleep 1
  done

  log "Mantur Canvas did not respond at $APP_URL in time."
  return 1
}

open_app_url() {
  log "Opening Mantur Canvas at $APP_URL"

  if command_exists open; then
    open "$APP_URL" >/dev/null 2>&1 || true
    return
  fi

  if command_exists xdg-open; then
    xdg-open "$APP_URL" >/dev/null 2>&1 || true
  fi
}

next_version() {
  node -p "require('./package.json').dependencies.next.replace(/^[^0-9]*/, '')"
}

missing_next_swc_lock_entries() {
  if [ ! -f package-lock.json ]; then
    return 0
  fi

  local swc_packages=(
    "@next/swc-darwin-arm64"
    "@next/swc-darwin-x64"
    "@next/swc-linux-arm64-gnu"
    "@next/swc-linux-arm64-musl"
    "@next/swc-linux-x64-gnu"
    "@next/swc-linux-x64-musl"
    "@next/swc-win32-arm64-msvc"
    "@next/swc-win32-x64-msvc"
  )

  local package_name
  for package_name in "${swc_packages[@]}"; do
    if ! grep -q "\"node_modules/${package_name}\"" package-lock.json; then
      return 0
    fi
  done

  return 1
}

install_dependencies() {
  log "Installing project dependencies..."
  npm install

  if missing_next_swc_lock_entries; then
    log "Repairing Next.js SWC lockfile entries..."
    npm install --package-lock-only --include=optional "next@$(next_version)"
    npm install
  fi
}

copy_missing_example_file() {
  local source_file="$1"
  local target_file="$2"

  if [ -e "$target_file" ]; then
    return
  fi

  mkdir -p "$(dirname "$target_file")"
  cp "$source_file" "$target_file"
}

copy_missing_example_dir() {
  local source_dir="$1"
  local target_dir="$2"
  local source_file
  local relative_file

  if [ ! -d "$source_dir" ]; then
    return
  fi

  while IFS= read -r source_file; do
    relative_file="${source_file#"$source_dir"/}"
    copy_missing_example_file "$source_file" "$target_dir/$relative_file"
  done < <(find "$source_dir" -type f)
}

initialize_example_files() {
  log "Preparing local db and skills from example..."

  if [ -f "db/config.json" ]; then
    log "db/config.json already exists. Skipping example db copy."
  else
    mkdir -p db
    copy_missing_example_dir "example/db" "db"
  fi

  if [ -d "skills" ]; then
    log "skills directory already exists. Skipping example skills copy."
  else
    mkdir -p skills
    copy_missing_example_dir "example/skills" "skills"
  fi
}

main() {
  cd "$PROJECT_DIR"
  ensure_node
  ensure_npm
  ensure_opencode
  ensure_pm2

  install_dependencies
  initialize_example_files

  log "Building Mantur Canvas for production..."
  npm run build

  start_with_pm2
  if ! wait_for_pm2_online; then
    show_pm2_diagnostics
    exit 1
  fi

  if ! wait_for_app_url; then
    show_pm2_diagnostics
    exit 1
  fi

  open_app_url
}

main "$@"
