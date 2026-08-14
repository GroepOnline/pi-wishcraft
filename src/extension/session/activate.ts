import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { parsePowerlineConfig } from "../../config/powerline-config.ts";
import { registerCustomPresets } from "../../config/presets.ts";
import { registerCustomSegments } from "../../segments/index.ts";
import { readSettings } from "../settings/settings-io.ts";
import { registerSessionLifecycle } from "./session-lifecycle.ts";
import { registerCommands } from "../commands/commands.ts";
import { setupInlineInvocation } from "../skills/inline-invocation.ts";
import {
  config,
  createRuntimeState,
  PRESET_NAMES,
  setConfig,
} from "../core/state.ts";

export default function powerlineFooter(pi: ExtensionAPI) {
  const startupSettings = readSettings();
  setConfig(parsePowerlineConfig(startupSettings.powerline, PRESET_NAMES));
  registerCustomSegments(config.segments);
  registerCustomPresets(config.presets);

  const rt = createRuntimeState(startupSettings);

  registerSessionLifecycle(pi, rt);
  registerCommands(pi, rt);
  setupInlineInvocation(pi, rt);
}
