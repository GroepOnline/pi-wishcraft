#!/usr/bin/env bash
# ==============================================================================
# pi-wishcraft — Cloud Agent install (idempotent repository bootstrap)
# ==============================================================================
# Refreshes repository dependencies and, self-healing, ensures the pi CLI and
# its wishcraft dev config are present so an agent can test the extension end to
# end inside real pi.
#
# Heavy, stable installs (Docker, the pi CLI itself) are normally baked into the
# environment snapshot. This script re-establishes them when missing so setup
# still converges from a bare base image. It never starts long-running services;
# dockerd is started per boot by scripts/cloud-agent-start.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# --- 1. Repository dependencies ----------------------------------------------
npm ci

# --- 2. Locate a Node >= 22.19 (pi's engine floor; platform node may be older)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true

pick_node() {
  local best="" d ok
  for d in "$HOME"/.nvm/versions/node/v*/bin/node; do
    [ -x "$d" ] || continue
    ok="$("$d" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.stdout.write((a>22||(a===22&&b>=19))?"ok":"")' 2>/dev/null || true)"
    [ "$ok" = "ok" ] && best="$d"
  done
  printf '%s' "$best"
}

NODE_BIN="$(pick_node)"
if [ -z "$NODE_BIN" ] && command -v nvm >/dev/null 2>&1; then
  nvm install 24 >/dev/null
  NODE_BIN="$(pick_node)"
fi
if [ -z "$NODE_BIN" ]; then
  echo "cloud-agent-install: no Node >= 22.19 available for pi" >&2
  exit 1
fi
NODE_PREFIX="$(dirname "$(dirname "$NODE_BIN")")"
NPM_BIN="$NODE_PREFIX/bin/npm"

# --- 3. pi CLI, pinned to the wishcraft peer range ---------------------------
PI_CLI="$NODE_PREFIX/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
if [ ! -f "$PI_CLI" ]; then
  "$NODE_BIN" "$NPM_BIN" install -g --ignore-scripts --prefix "$NODE_PREFIX" \
    '@earendil-works/pi-coding-agent@>=0.81.0 <0.85.0'
fi

# --- 4. pi launcher that always runs under the >= 22.19 node ------------------
# The npm bin shebang is `env node`, which on this platform resolves to a node
# older than pi's engine floor. A thin wrapper pins the correct interpreter.
PI_WRAPPER="$NODE_PREFIX/bin/pi"
cat > "$PI_WRAPPER" <<EOF
#!/bin/sh
exec "$NODE_BIN" "$PI_CLI" "\$@"
EOF
chmod +x "$PI_WRAPPER"

# --- 5. Dev config: load the local wishcraft checkout in pi ------------------
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
mkdir -p "$PI_AGENT_DIR"
if [ ! -f "$PI_AGENT_DIR/settings.json" ]; then
  cat > "$PI_AGENT_DIR/settings.json" <<EOF
{
  "packages": ["$REPO_ROOT"],
  "powerline": { "preset": "chef", "placement": "above", "welcome": true }
}
EOF
fi

echo "cloud-agent-install: done (pi $("$PI_WRAPPER" --version 2>/dev/null || echo '?'), node $("$NODE_BIN" --version))"
