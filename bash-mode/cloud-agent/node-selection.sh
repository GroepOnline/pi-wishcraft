#!/usr/bin/env bash

# Print the highest installed Node executable that satisfies pi's >=22.19 floor.
pick_compatible_node() {
  local home_dir="${1:-$HOME}"
  local best="" best_version="" d ok version highest

  for d in "$home_dir"/.nvm/versions/node/v*/bin/node; do
    [ -x "$d" ] || continue
    version="$("$d" -p 'process.versions.node' 2>/dev/null || true)"
    ok="$("$d" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.stdout.write((a>22||(a===22&&b>=19))?"ok":"")' 2>/dev/null || true)"
    [ "$ok" = "ok" ] || continue

    if [ -z "$best_version" ]; then
      best="$d"
      best_version="$version"
      continue
    fi

    highest="$(printf '%s\n%s\n' "$best_version" "$version" | sort -V | tail -n 1)"
    if [ "$highest" = "$version" ] && [ "$version" != "$best_version" ]; then
      best="$d"
      best_version="$version"
    fi
  done

  printf '%s' "$best"
}
