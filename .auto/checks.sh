#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Keep output minimal — only errors
npm run typecheck 2>&1 | grep -i "error" | head -20 || true
# madge already in measure, but double-check
npx madge --circular src 2>&1 | grep -v "No circular" | head -5 || true
