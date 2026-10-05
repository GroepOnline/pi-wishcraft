#!/bin/sh
# Smoke-test the installed preview package: the exact entries pi loads must
# exist in the shipped artifact.
set -eu
PREFIX="${1:-./pkg}"
PKG="$PREFIX/node_modules/@groeponline/pi-wishcraft"
fail() { echo "preview FAIL: $1" >&2; exit 1; }
test -f "$PKG/index.ts" || fail "missing pi extension entry index.ts"
echo "preview OK: @groeponline/pi-wishcraft (index.ts present)"
