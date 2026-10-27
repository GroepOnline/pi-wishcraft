import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { parsePowerlineConfig } from "../../config/powerline-config.ts";
import { registerCustomPresets } from "../../config/presets.ts";
import { registerCustomSegments } from "../../segments/index.ts";
import { readSettings } from "../settings/settings-io.ts";
import { syncLocaleFromSettings } from "../../i18n/index.ts";
import { registerSessionLifecycle } from "./session-lifecycle.ts";
import { registerCommands } from "../commands/commands.ts";
import { setupHooks } from "../hooks/index.ts";
import { setupInlineInvocation } from "../skills/inline-invocation.ts";
import {
  config,
  createRuntimeState,
  PRESET_NAMES,
  setConfig,
} from "../core/state.ts";
import {
  checkPeerRuntime,
  formatPeerGuardWarning,
} from "../core/peer-guard.ts";

export default function powerlineFooter(pi: ExtensionAPI) {
  // peerDependencies are "*" by contract, so the manifest cannot express the
  // real SDK floor. Check the imported symbol set up front and say what is
  // missing, instead of letting an under-floor host fail at first use.
  const missingPeers = checkPeerRuntime();
  if (missingPeers.length > 0) {
    console.warn(`[wishcraft] ${formatPeerGuardWarning(missingPeers)}`);
  }

  const startupSettings = readSettings();
  // Ambient UI language: resolved before anything renders, so the very first
  // frame of the status line and welcome overlay is already in the right
  // language. Unknown or unset values resolve to English.
  syncLocaleFromSettings(startupSettings);
  setConfig(parsePowerlineConfig(startupSettings.powerline, PRESET_NAMES));
  registerCustomSegments(config.segments);
  registerCustomPresets(config.presets);

  const rt = createRuntimeState(startupSettings);
  rt.queueStore.setSentRetentionMs(config.queue.retentionHours * 60 * 60 * 1000);

  registerSessionLifecycle(pi, rt);
  registerCommands(pi, rt);
  setupInlineInvocation(pi, rt);
  setupHooks(pi, rt, process.cwd());
}
