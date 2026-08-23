#!/usr/bin/env bash
# ==============================================================================
# pi-wishcraft bootstrap / install script
# Compatible with: Linux, macOS, dev containers, Cursor Cloud Agents, CI
# ==============================================================================
set -euo pipefail

PACKAGE_NAME="@groeponline/pi-wishcraft"
PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-${HOME}/.pi/agent}"
SETTINGS_FILE="${PI_AGENT_DIR}/settings.json"

echo "Installing ${PACKAGE_NAME} into Pi environment..."

# 1. Ensure ~/.pi/agent directory exists
mkdir -p "${PI_AGENT_DIR}"

# 2. Check if pi CLI is installed
if command -v pi >/dev/null 2>&1; then
  echo "[ok] pi CLI found: $(command -v pi)"
  # Install/update via pi package manager
  pi install "npm:${PACKAGE_NAME}" || true
else
  echo "[info] pi CLI not in PATH. Configuring settings.json directly..."
fi

# 3. Safely update ~/.pi/agent/settings.json using node
node -e '
const fs = require("node:fs");
const path = require("node:path");

const settingsPath = process.argv[1];
const pkgName = "npm:@groeponline/pi-wishcraft";

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (e) {
    console.warn("[warn] Existing settings.json was not valid JSON, creating fresh configuration.");
    settings = {};
  }
}

// Ensure packages array exists
if (!Array.isArray(settings.packages)) {
  settings.packages = [];
}

// Clean up legacy package names and deduplicate
settings.packages = settings.packages.filter(p => {
  if (typeof p === "string") {
    return p !== "npm:@groeponline/pi-powerline-footer" && p !== "npm:pi-powerline-footer" && p !== pkgName;
  }
  return true;
});

// If local dev checkout is present, keep it, otherwise add npm package
const hasLocalCheckout = settings.packages.some(p => typeof p === "string" && (p.includes("pi-powerline-footer") || p.includes("pi-wishcraft")));
if (!hasLocalCheckout) {
  settings.packages.push(pkgName);
}

// Set default powerline preset if not already configured
if (!settings.powerline) {
  settings.powerline = "chef";
}

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log("[ok] Updated " + settingsPath + " with " + pkgName + " (preset: " + settings.powerline + ")");
' "${SETTINGS_FILE}"

echo "[ok] pi-wishcraft installed successfully. Restart or /reload your agent session."
