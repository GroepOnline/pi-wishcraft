import { parsePowerlineConfig } from "../../config/powerline-config.ts";
import { PRESET_NAMES, config as stateConfig, setConfig } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";

/** Apply config changes that are safe to refresh in the currently-running UI. */
export function refreshRuntimeForConfigPath(
  rt: RuntimeState,
  path: string,
  powerlineSettings: unknown,
): void {
  if (path.startsWith("powerline")) {
    setConfig({
      ...stateConfig,
      ...parsePowerlineConfig(powerlineSettings, PRESET_NAMES),
    });
    rt.tuiRef?.requestRender?.();
  }

  if (path.startsWith("wishcraft.welcome.")) {
    rt.refreshWelcomeArt?.();
  }
}
