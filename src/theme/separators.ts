import type {
  SeparatorDef,
  StatusLineSeparatorStyle,
} from "../config/types.ts";
import { getSeparatorChars } from "./icons.ts";

export function getSeparator(style: StatusLineSeparatorStyle): SeparatorDef {
  const chars = getSeparatorChars();

  const registry = new Map<string, SeparatorDef>([
    ["powerline", {
      left: chars.powerlineLeft,
      right: chars.powerlineRight,
      endCaps: {
        left: chars.powerlineRight,
        right: chars.powerlineLeft,
        useBgAsFg: true,
      },
    }],
    ["powerline-thin", {
      left: chars.powerlineThinLeft,
      right: chars.powerlineThinRight,
      endCaps: {
        left: chars.powerlineRight,
        right: chars.powerlineLeft,
        useBgAsFg: true,
      },
    }],
    ["slash", { left: ` ${chars.slash} `, right: ` ${chars.slash} ` }],
    ["pipe", { left: ` ${chars.pipe} `, right: ` ${chars.pipe} ` }],
    ["block", { left: chars.block, right: chars.block }],
    ["none", { left: chars.space, right: chars.space }],
    ["ascii", { left: chars.asciiLeft, right: chars.asciiRight }],
    ["dot", { left: chars.dot, right: chars.dot }],
    ["chevron", { left: "›", right: "‹" }],
    ["star", { left: "✦", right: "✦" }],
  ]);

  const definition = registry.get(style) ?? registry.get("powerline-thin")!;
  return Object.freeze(definition);
}
