/**
 * ports-proc.ts
 * ---------------------------------------------------------------------------
 * Last-resort listening-socket reader for Linux hosts without `ss` or
 * `netstat` (minimal containers, busybox).
 *
 * Lives in its own module because it is the only probe rung that touches the
 * filesystem synchronously, and it must stay off the render path: it is only
 * ever reached through the async ladder in `ports.ts`, never called from a
 * segment render.
 *
 * Addresses are recovered from the kernel's hex form so the row shape matches
 * what `ss`/`netstat` produce — without that, every bind looked exposed.
 * ---------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";

import type { ListeningPort } from "./ports-parse.ts";

/** `/proc/net/tcp` marks a LISTEN socket in the `st` column. */
const PROC_LISTEN_STATE = "0A";

function decodeHexAddress(hex: string, ipv6: boolean): string {
  if (!ipv6) {
    // Little-endian 32-bit word: `0100007F` is 127.0.0.1.
    const bytes = hex.match(/.{2}/g) ?? [];
    const ordered = [...bytes].reverse();
    return ordered.length === 4
      ? ordered.map((byte) => Number.parseInt(byte, 16)).join(".")
      : "";
  }
  // IPv6 is four little-endian 32-bit words; expand to eight 16-bit groups.
  const groups: string[] = [];
  for (let i = 0; i + 8 <= hex.length; i += 8) {
    const word = hex.slice(i, i + 8).match(/.{2}/g) ?? [];
    const [a, b, c, d] = [...word].reverse();
    groups.push(((Number.parseInt(a ?? "0", 16) << 8) | Number.parseInt(b ?? "0", 16)).toString(16));
    groups.push(((Number.parseInt(c ?? "0", 16) << 8) | Number.parseInt(d ?? "0", 16)).toString(16));
  }
  if (groups.length !== 8) return "";
  // Compress the longest zero run into `::`, matching `ss` output.
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  let runLength = 0;
  for (let i = 0; i < groups.length; i++) {
    if (Number.parseInt(groups[i]!, 16) === 0) {
      if (runStart === -1) runStart = i;
      runLength += 1;
      if (runLength > bestLength) {
        bestLength = runLength;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
      runLength = 0;
    }
  }
  if (bestLength < 2) return groups.join(":");
  const head = groups.slice(0, bestStart).join(":");
  const tail = groups.slice(bestStart + bestLength).join(":");
  return `${head}::${tail}`;
}

/**
 * Parse one `/proc/net/{tcp,tcp6,udp,udp6}` file into rows.
 *
 * Exported for tests; not part of the segment surface.
 */
export function parseProcNetListening(
  text: string,
  proto: "tcp" | "udp",
  ipv6: boolean,
): ListeningPort[] {
  const rows: ListeningPort[] = [];
  for (const line of text.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4) continue;
    if (proto === "tcp" && cols[3] !== PROC_LISTEN_STATE) continue;
    const local = cols[1] ?? "";
    const colon = local.lastIndexOf(":");
    if (colon <= 0) continue;
    const port = Number.parseInt(local.slice(colon + 1), 16);
    if (!Number.isFinite(port)) continue;
    const address = decodeHexAddress(local.slice(0, colon), ipv6);
    rows.push({
      proto,
      port,
      addresses: [address || "*"],
      // /proc/net exposes no process owner; the inode would need a /proc/<pid>
      // walk, which is not worth it on a fallback path.
      state: proto === "tcp" ? "LISTEN" : "UNCONN",
      process: null,
      pid: null,
    });
  }
  return rows;
}

function readProcNet(file: string): string | null {
  try {
    return readFileSync(`/proc/net/${file}`, "utf8");
  } catch {
    // File may not exist (non-Linux, restricted /proc, or a namespace without
    // IPv6 tables) — skip it rather than failing the whole probe.
    return null;
  }
}

/**
 * Read listening sockets straight from `/proc/net`. Returns `null` when no
 * table could be read at all, so the caller can report "unknown" rather than
 * a confident zero.
 */
export function readProcListeningPorts(includeUdp: boolean): ListeningPort[] | null {
  const files: { name: string; proto: "tcp" | "udp"; ipv6: boolean }[] = [
    { name: "tcp", proto: "tcp", ipv6: false },
    { name: "tcp6", proto: "tcp", ipv6: true },
    ...(includeUdp
      ? ([
          { name: "udp", proto: "udp" as const, ipv6: false },
          { name: "udp6", proto: "udp" as const, ipv6: true },
        ] as const)
      : []),
  ];

  const rows: ListeningPort[] = [];
  let readAny = false;
  for (const file of files) {
    const text = readProcNet(file.name);
    if (text === null) continue;
    readAny = true;
    rows.push(...parseProcNetListening(text, file.proto, file.ipv6));
  }
  if (!readAny) return null;

  // Dedupe dual-stack binds the same way the ss/netstat rungs do.
  const byKey = new Map<string, ListeningPort>();
  for (const row of rows) {
    const key = `${row.proto}:${row.port}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    for (const address of row.addresses) {
      if (!existing.addresses.includes(address)) existing.addresses.push(address);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.port - b.port || (a.proto === b.proto ? 0 : a.proto === "tcp" ? -1 : 1),
  );
}