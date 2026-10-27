// peer-guard.ts
// Activation-time guard for the host-provided Pi SDK peers.
//
// `peerDependencies` for the three @earendil-works packages must stay "*" (Pi's
// package contract requires it and `verify-pi-package-contract.mjs` enforces
// it), so the manifest cannot express the version floor this extension really
// has. Every runtime symbol it imports exists from 0.86.0 up, and
// `normalizeContext` (pi-ai) is the binding one — it arrived last. Without a
// guard, a host on 0.84.3 loads the extension cleanly and only fails at first
// use: `/vibe` died on a bare `TypeError: normalizeContext is not a function`
// deep inside provider code.
//
// The guard checks the imported *symbol set* rather than a version string:
// symbol presence is what the code actually depends on, and it survives
// backports, republishes, and version-skewed trees where a semver comparison
// would lie. Warn-only by design — an under-floor host still runs every other
// surface, so blocking activation would break more than it fixes.

import * as piAi from "@earendil-works/pi-ai";
import * as piCodingAgent from "@earendil-works/pi-coding-agent";
import * as piTui from "@earendil-works/pi-tui";

/** Oldest Pi SDK release where every imported symbol exists (probed per release). */
export const PEER_FLOOR_VERSION = "0.86.0";

export type PeerPackage =
  | "@earendil-works/pi-ai"
  | "@earendil-works/pi-coding-agent"
  | "@earendil-works/pi-tui";

export interface PeerSymbolRequirement {
  pkg: PeerPackage;
  symbol: string;
  /** Feature that degrades when the symbol is absent. */
  usedBy: string;
}

// The full runtime (non-type) import surface of this package. Type-only
// imports cannot fail at runtime and are deliberately absent; the structural
// test in tests/peer-guard.test.ts keeps this list in exact sync with the
// imports in every published source file, in both directions.
export const PEER_SYMBOL_REQUIREMENTS: readonly PeerSymbolRequirement[] = [
  {
    pkg: "@earendil-works/pi-ai",
    symbol: "normalizeContext",
    usedBy: "/vibe working messages",
  },
  {
    pkg: "@earendil-works/pi-ai",
    symbol: "createAssistantMessageEventStream",
    usedBy: "studio advice pane",
  },
  {
    pkg: "@earendil-works/pi-coding-agent",
    symbol: "CustomEditor",
    usedBy: "sticky Bash mode",
  },
  {
    pkg: "@earendil-works/pi-coding-agent",
    symbol: "copyToClipboard",
    usedBy: "copy shortcuts and /vibe test",
  },
  {
    pkg: "@earendil-works/pi-coding-agent",
    symbol: "loadSkills",
    usedBy: "skill registry",
  },
  {
    pkg: "@earendil-works/pi-coding-agent",
    symbol: "SessionManager",
    usedBy: "/cd",
  },
  {
    pkg: "@earendil-works/pi-tui",
    symbol: "matchesKey",
    usedBy: "keyboard shortcuts",
  },
  {
    pkg: "@earendil-works/pi-tui",
    symbol: "isKeyRelease",
    usedBy: "keyboard shortcuts",
  },
  {
    pkg: "@earendil-works/pi-tui",
    symbol: "visibleWidth",
    usedBy: "status line rendering",
  },
  {
    pkg: "@earendil-works/pi-tui",
    symbol: "truncateToWidth",
    usedBy: "status line rendering",
  },
  {
    pkg: "@earendil-works/pi-tui",
    symbol: "SelectList",
    usedBy: "select overlays",
  },
  {
    pkg: "@earendil-works/pi-tui",
    symbol: "TUI_KEYBINDINGS",
    usedBy: "default keybindings",
  },
];

/**
 * Resolve a symbol from a peer module namespace. Looks on the namespace itself
 * and, for interop shapes where named exports land under `default` (CJS-style
 * wrapping during extension load), there too.
 */
function lookupExport(moduleNs: unknown, symbol: string): unknown {
  if (moduleNs === null || typeof moduleNs !== "object") return undefined;
  const ns = moduleNs as Record<string, unknown>;
  const direct = ns[symbol];
  if (direct !== undefined) return direct;
  const fallback = ns.default;
  if (fallback !== null && typeof fallback === "object") {
    return (fallback as Record<string, unknown>)[symbol];
  }
  return undefined;
}

/** Which required symbols are absent from the given peer namespaces? */
export function findMissingPeerSymbols(
  exportsByPkg: Readonly<Partial<Record<PeerPackage, unknown>>>,
  requirements: readonly PeerSymbolRequirement[] = PEER_SYMBOL_REQUIREMENTS,
): PeerSymbolRequirement[] {
  return requirements.filter(
    ({ pkg, symbol }) => lookupExport(exportsByPkg[pkg], symbol) === undefined,
  );
}

/** The live peer namespaces, collected for the runtime check. */
function collectPeerExports(): Record<PeerPackage, unknown> {
  return {
    "@earendil-works/pi-ai": piAi,
    "@earendil-works/pi-coding-agent": piCodingAgent,
    "@earendil-works/pi-tui": piTui,
  };
}

/** The runtime check against the peers this process actually loaded. */
export function checkPeerRuntime(): PeerSymbolRequirement[] {
  return findMissingPeerSymbols(collectPeerExports());
}

/** Multi-line console warning naming every missing symbol and its blast radius. */
export function formatPeerGuardWarning(
  missing: readonly PeerSymbolRequirement[],
): string {
  const lines = missing.map(
    (m) => `  - ${m.symbol} (${m.pkg}) — needed by ${m.usedBy}`,
  );
  return [
    `Pi SDK below the supported floor: ${missing.length} imported symbol${missing.length === 1 ? " is" : "s are"} missing (all of them exist from ${PEER_FLOOR_VERSION} up).`,
    ...lines,
    `The extension stays loaded and affected features fall back; upgrade @earendil-works/pi-coding-agent with its matching pi-ai/pi-tui to ${PEER_FLOOR_VERSION} or newer.`,
  ].join("\n");
}

/** One-line variant for `ctx.ui.notify`. */
export function formatPeerGuardNotice(
  missing: readonly PeerSymbolRequirement[],
): string {
  const symbols = missing.map((m) => m.symbol).join(", ");
  return `Pi SDK < ${PEER_FLOOR_VERSION}: missing ${symbols} — upgrade the Pi SDK to restore full functionality`;
}

/** Actionable error for a call site that cannot degrade gracefully. */
function missingSymbolError(symbol: string): Error {
  const requirement = PEER_SYMBOL_REQUIREMENTS.find(
    (r) => r.symbol === symbol,
  );
  const pkg = requirement?.pkg ?? "@earendil-works/pi-*";
  const feature = requirement?.usedBy ?? symbol;
  return new Error(
    `${feature} needs ${symbol} from ${pkg}, which the installed Pi SDK does not provide — upgrade @earendil-works/pi-* to ${PEER_FLOOR_VERSION} or newer`,
  );
}

/**
 * Call-site guard: fail with the actionable message instead of letting a
 * missing export surface later as "x is not a function".
 */
export function requirePeerSymbol<T>(
  value: T | undefined | null,
  symbol: string,
): T {
  if (value === undefined || value === null) throw missingSymbolError(symbol);
  return value;
}

let noticeDelivered = false;

/** Minimal slice of Pi's ExtensionContext the warning needs. */
export interface PeerGuardContext {
  hasUI?: boolean;
  ui?: {
    notify(message: string, level?: "warning" | "error" | "info"): void;
  };
}

/**
 * One-shot UI warning at session start. `check` is injectable so tests can
 * drive the missing-symbol path without an under-floor SDK.
 */
export function maybeNotifyPeerGuard(
  ctx: PeerGuardContext | undefined,
  check: () => PeerSymbolRequirement[] = checkPeerRuntime,
): void {
  if (noticeDelivered || !ctx?.hasUI || typeof ctx.ui?.notify !== "function") {
    return;
  }
  const missing = check();
  if (missing.length === 0) return;
  noticeDelivered = true;
  ctx.ui.notify(formatPeerGuardNotice(missing), "warning");
}

/** Reset the one-shot latch (tests only). */
export function resetPeerGuardNotice(): void {
  noticeDelivered = false;
}
