/**
 * ports-parse.ts
 * ---------------------------------------------------------------------------
 * Pure text→rows parsing and rows→text rendering for listening sockets.
 *
 * Split out of `ports.ts` so the probe (which spawns processes) and the
 * pure functions can be reasoned about — and tested — independently. No I/O
 * lives here: everything below is a total function of its arguments.
 * ---------------------------------------------------------------------------
 */

/** A listening socket, deduped by protocol + port. */
export interface ListeningPort {
  proto: "tcp" | "udp";
  port: number;
  /** Every local bind address for this port (`0.0.0.0`, `127.0.0.1`, `::1`). */
  addresses: string[];
  /** `LISTEN` / `UNCONN` / `""` when the variant has no state column. */
  state: string;
  /** Owning process name when `ss -p`/`netstat -p` exposes it. */
  process: string | null;
  pid: number | null;
}

export interface PortsSummary {
  tcp: number;
  udp: number;
  total: number;
  /** Ports bound to a non-loopback address — reachable from other machines. */
  exposed: number;
  /** Ports bound only to loopback. */
  loopback: number;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackAddress(address: string): boolean {
  return LOOPBACK.has(address) || address.startsWith("127.");
}

function parseProcessFromSs(line: string): { process: string | null; pid: number | null } {
  // iproute2 `ss -p`: users:(("sshd",pid=1071,fd=5)); older builds omit pid=.
  const match = /users:\(+\s*"([^"]*)"\s*,?\s*(?:pid=)?(\d+)?/.exec(line);
  if (!match) return { process: null, pid: null };
  return {
    process: match[1] || null,
    pid: match[2] ? Number(match[2]) : null,
  };
}

function parseProcessFromNetstat(tokens: string[]): { process: string | null; pid: number | null } {
  const last = tokens[tokens.length - 1] ?? "";
  const match = /^(\d+)\/(.+)$/.exec(last);
  return match ? { process: match[2] ?? null, pid: Number(match[1]) } : { process: null, pid: null };
}

function inferProto(token: string | undefined): "tcp" | "udp" | null {
  if (!token) return null;
  const lower = token.toLowerCase();
  if (lower.startsWith("tcp")) return "tcp";
  if (lower.startsWith("udp")) return "udp";
  return null;
}

/** First token that parses as a local `addr:port` / macOS `addr.port` bind. */
function findLocalBind(tokens: string[]): string | null {
  for (const token of tokens) {
    if (token.includes("users:")) continue;
    // The peer column ends in `:*` or `*.*`, never bare digits, so it cannot
    // match — but skip it explicitly if it ever does.
    if (/^\d+$/.test(token)) continue;
    if (/(?::|\.)(\d+)$/.test(token) && /[:.]/.test(token.replace(/:\d+$/, ""))) {
      return token;
    }
  }
  return null;
}

function splitBind(bind: string): { address: string; port: number } | null {
  // Linux/ss: `127.0.0.1:631`, `[::1]:631`, `*:8080`.
  // macOS netstat: `*.5900`, `127.0.0.1.631`.
  // Brackets are stripped from IPv6 so `::1` compares equal to the loopback
  // set — leaving them on made an IPv6 loopback bind count as *exposed*.
  const strip = (address: string): string => {
    const unwrapped = address.startsWith("[") && address.endsWith("]")
      ? address.slice(1, -1)
      : address;
    return unwrapped || "*";
  };
  const colon = /:(\d+)$/.exec(bind);
  if (colon) {
    return {
      address: strip(bind.slice(0, bind.length - colon[0].length)),
      port: Number(colon[1]),
    };
  }
  const dot = /\.(\d+)$/.exec(bind);
  if (dot) {
    return {
      address: strip(bind.slice(0, bind.length - dot[0].length)),
      port: Number(dot[1]),
    };
  }
  return null;
}

/**
 * Parse `ss -tulnp` / `netstat -tulnp` output into deduped ports.
 *
 * Column layouts differ between `ss` with and without `-p`, between `ss -H`
 * and headered output, and between Linux and macOS `netstat` — so rather than
 * indexing fixed columns this scans for the protocol token, the state token
 * and the first plausible local bind. Header rows are skipped by pattern.
 */
export function parseListeningPorts(text: string): ListeningPort[] {
  const byKey = new Map<string, ListeningPort>();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(Netid|Proto|State|Local|Active|Destination)/i.test(line)) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 4) continue;

    const proto = tokens.map(inferProto).find((value) => value !== null) ?? null;
    const bind = findLocalBind(tokens);
    if (!proto || !bind) continue;

    const parsed = splitBind(bind);
    if (!parsed || !Number.isFinite(parsed.port)) continue;

    const stateToken = tokens.find((token) => /^(LISTEN|UNCONN|ESTAB|CLOSED|TIME_WAIT)$/i.test(token));
    const { process, pid } =
      tokens.some((token) => token.includes("users:"))
        ? parseProcessFromSs(line)
        : parseProcessFromNetstat(tokens);

    const key = `${proto}:${parsed.port}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        proto,
        port: parsed.port,
        addresses: [parsed.address],
        state: stateToken ? stateToken.toUpperCase() : "",
        process,
        pid,
      });
      continue;
    }
    if (!existing.addresses.includes(parsed.address)) {
      existing.addresses.push(parsed.address);
    }
    // Prefer whichever duplicate row exposes an owner.
    if (existing.process === null && process !== null) {
      existing.process = process;
      existing.pid = pid;
    }
    if (!existing.state && stateToken) {
      existing.state = stateToken.toUpperCase();
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.port - b.port || (a.proto === b.proto ? 0 : a.proto === "tcp" ? -1 : 1),
  );
}

export function summarizePorts(rows: readonly ListeningPort[]): PortsSummary {
  let tcp = 0;
  let udp = 0;
  let exposed = 0;
  let loopback = 0;

  for (const row of rows) {
    if (row.proto === "tcp") tcp += 1;
    else udp += 1;
    const anyExposed = row.addresses.some(
      (address) => !isLoopbackAddress(address) && address !== "",
    );
    if (anyExposed) exposed += 1;
    else loopback += 1;
  }

  return { tcp, udp, total: rows.length, exposed, loopback };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PROTO_WIDTH = 4;

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/** `0.0.0.0, 127.0.0.1` — the widest address first, then loopback. */
export function formatAddresses(addresses: readonly string[]): string {
  if (addresses.length === 0) return "*";
  const ordered = [...addresses].sort((a, b) => {
    const aLoop = isLoopbackAddress(a) ? 1 : 0;
    const bLoop = isLoopbackAddress(b) ? 1 : 0;
    if (aLoop !== bLoop) return aLoop - bLoop;
    // Plain codepoint order, not locale-aware: the output must be identical
    // on every machine regardless of the host locale.
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return ordered.join(", ");
}

export function formatOwner(row: ListeningPort): string {
  if (!row.process) return "(unknown)";
  return row.pid !== null ? `${row.process} (${row.pid})` : row.process;
}

/** One aligned table row; `width` truncates the owner column only. */
export function formatPortRow(row: ListeningPort, width = 80): string {
  const proto = pad(row.proto, PROTO_WIDTH);
  const port = pad(String(row.port), 5);
  const address = formatAddresses(row.addresses);
  const owner = formatOwner(row);
  const used = PROTO_WIDTH + 1 + 5 + 1 + address.length + 1;
  if (used >= width) {
    const clipped = `${proto} ${port} ${address}`;
    return clipped.slice(0, Math.max(1, width));
  }
  const room = width - used;
  const clippedOwner =
    owner.length > room ? `${owner.slice(0, Math.max(1, room - 1))}…` : owner;
  return `${proto} ${port} ${address} ${clippedOwner}`;
}

/** Column header matching `formatPortRow`'s alignment. */
export function portsTableHeader(): string {
  return `${pad("PROTO", PROTO_WIDTH)} ${pad("PORT", 5)} ADDRESS OWNER`;
}

/**
 * Summary line for the panel head, e.g.
 * `21 tcp · 2 udp · 12 exposed · 9 loopback · sofielocal`.
 */
export function formatPortsSummary(
  summary: PortsSummary,
  host: string | null,
  includeUdp: boolean,
): string {
  const parts = [
    `${summary.tcp} tcp`,
    includeUdp ? `${summary.udp} udp` : null,
    `${summary.exposed} exposed`,
    `${summary.loopback} loopback`,
    host ? `via ${host}` : "local",
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
}

/**
 * Full table body: header, one row per port, and a truncation tail when
 * `maxRows` is exceeded. Shared by the `alt+i` overlay and the Deck route so
 * both surfaces always show the same numbers.
 */
export function portsTableLines(
  rows: readonly ListeningPort[],
  width: number,
  maxRows = 24,
): string[] {
  if (rows.length === 0) return [];
  const lines = [portsTableHeader()];
  const shown = rows.slice(0, maxRows);
  for (const row of shown) lines.push(formatPortRow(row, width));
  if (rows.length > shown.length) {
    lines.push(`… ${rows.length - shown.length} more (↑↓ to scroll)`);
  }
  return lines;
}

/** Free-text filter over port, address and owner — powers `/` in the panel. */
export function filterPorts(
  rows: readonly ListeningPort[],
  query: string,
): ListeningPort[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (row) =>
      String(row.port).includes(q) ||
      row.proto.includes(q) ||
      row.addresses.some((address) => address.toLowerCase().includes(q)) ||
      (row.process ?? "").toLowerCase().includes(q),
  );
}

/** Group rows by owning process — used to answer "what is holding ports?". */
export function groupPortsByProcess(
  rows: readonly ListeningPort[],
): { process: string; ports: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = formatOwner(row);
    const list = groups.get(key) ?? [];
    list.push(`${row.proto}:${row.port}`);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([process, ports]) => ({ process, ports }))
    .sort((a, b) => b.ports.length - a.ports.length || a.process.localeCompare(b.process));
}