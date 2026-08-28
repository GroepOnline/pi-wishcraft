#!/usr/bin/env bash
# ==============================================================================
# pi-wishcraft — Cloud Agent start (per-boot service reconciliation)
# ==============================================================================
# Ensures the Docker daemon is running so agents can run containerized and
# parallel test workloads (see scripts/docker-test.sh). Idempotent: it returns
# immediately when dockerd is already up and never starts a second daemon.
set -euo pipefail

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

if $SUDO docker info >/dev/null 2>&1; then
  echo "cloud-agent-start: dockerd already running"
  exit 0
fi

$SUDO mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  # fuse-overlayfs works inside the nested Cloud Agent VM where overlay2 does not.
  printf '%s\n' '{ "storage-driver": "fuse-overlayfs" }' | $SUDO tee /etc/docker/daemon.json >/dev/null
fi

$SUDO sh -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'

for i in $(seq 1 30); do
  if $SUDO docker info >/dev/null 2>&1; then
    echo "cloud-agent-start: dockerd ready (${i}s)"
    exit 0
  fi
  sleep 1
done

echo "cloud-agent-start: dockerd failed to become ready" >&2
$SUDO tail -n 20 /var/log/dockerd.log >&2 2>/dev/null || true
exit 1
