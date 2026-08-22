#!/usr/bin/env bash
# ==============================================================================
# pi-wishcraft — containerized test runner
# ==============================================================================
# Runs the full check suite (typecheck + tests + circular) inside disposable
# Docker containers. Each container gets its own copy of the working tree (and
# its own .git), so any number of runs are safe in parallel — useful for
# reproducing CI in isolation or fanning out variations at once.
#
# Dependencies are installed inside each container with npm ci (from the copied
# package-lock.json). Host node_modules is never mounted — host ABI/OS packages
# must not leak into node:24.
#
# Usage:
#   scripts/docker-test.sh              # 1 container, full suite
#   scripts/docker-test.sh -n 3         # 3 isolated containers in parallel
#   WC_TEST_IMAGE=node:24 scripts/docker-test.sh
#
# Requires the Docker daemon (started by scripts/cloud-agent-start.sh).
set -euo pipefail

IMAGE="${WC_TEST_IMAGE:-node:24}"
PARALLEL=1

while [ $# -gt 0 ]; do
  case "$1" in
    -n|--parallel) PARALLEL="${2:?-n needs a count}"; shift 2 ;;
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$PARALLEL" in
  ''|*[!0-9]*)
    echo "docker-test: --parallel must be a positive integer" >&2
    exit 2
    ;;
esac
if [ "$PARALLEL" -lt 1 ]; then
  echo "docker-test: --parallel must be at least 1" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
if ! $DOCKER info >/dev/null 2>&1; then
  echo "docker-test: Docker daemon is not reachable. Run scripts/cloud-agent-start.sh first." >&2
  exit 1
fi

# Isolate each run: copy the tree (minus node_modules) into a writable dir, then
# install deps inside the container so they match the image's Node ABI/OS.
SUITE='set -e
(cd /src && tar -cf - --exclude=./node_modules .) | (mkdir -p /app && cd /app && tar -xf -)
cd /app
git config --global --add safe.directory /app
npm ci
npm run typecheck
npm test
npm run circular'

run_one() {
  id="$1"
  $DOCKER run --rm --name "wc-test-${id}-$$" \
    -e HOME=/tmp \
    -v "$REPO_ROOT":/src:ro \
    "$IMAGE" bash -c "$SUITE"
}

if [ "$PARALLEL" -le 1 ]; then
  run_one 1
  exit $?
fi

echo "docker-test: launching $PARALLEL isolated containers on $IMAGE"
pids=""
rc=0
tmpdir="$(mktemp -d)"
for n in $(seq 1 "$PARALLEL"); do
  ( set +e; run_one "$n" >"$tmpdir/$n.log" 2>&1; echo $? >"$tmpdir/$n.rc" ) &
  pids="$pids $!"
done
for p in $pids; do wait "$p" || true; done

for n in $(seq 1 "$PARALLEL"); do
  crc="$(cat "$tmpdir/$n.rc" 2>/dev/null || echo 1)"
  echo "----- container $n (exit $crc) -----"
  grep -E '(tests|suites|pass|fail) [0-9]|No circular|error' "$tmpdir/$n.log" | tail -8 || true
  [ "$crc" -eq 0 ] || rc=1
done
rm -rf "$tmpdir"
exit "$rc"
