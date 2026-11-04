#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Keep output minimal — only errors
bun run typecheck 2>&1 | grep -i "error" | head -20 || true
# madge already in measure, but double-check
bunx madge --circular src 2>&1 | grep -v "No circular" | head -5 || true
