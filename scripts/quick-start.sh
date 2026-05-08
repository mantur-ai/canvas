#!/usr/bin/env bash
set -euo pipefail

REQUIRED_NODE_MAJOR=20
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
  mkdir -p db skills
  copy_missing_example_dir "example/db" "db"
  copy_missing_example_dir "example/skills" "skills"
}

main() {
  cd "$PROJECT_DIR"
  ensure_node
  ensure_npm
  ensure_opencode

  install_dependencies
  initialize_example_files

  log "Building Mantur Canvas for production..."
  npm run build

  log "Starting Mantur Canvas at http://localhost:3000"
  npm run start
}

main "$@"
