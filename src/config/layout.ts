import type {
  CustomItemPosition,
  CustomStatusItem,
  PresetDef,
  StatusLineLayout,
  StatusLineSegmentId,
} from "./types.ts";

export function mergeSegmentsWithCustomItems(
  presetDef: PresetDef,
  customItems: readonly CustomStatusItem[],
  options: {
    layout?: StatusLineLayout | null;
    disabledSegments?: readonly StatusLineSegmentId[];
  } = {},
): {
  leftSegments: StatusLineSegmentId[];
  rightSegments: StatusLineSegmentId[];
  secondarySegments: StatusLineSegmentId[];
} {
  const layout = options.layout ?? null;
  const explicitlyPlaced = new Set([
    ...(layout?.left ?? []),
    ...(layout?.right ?? []),
    ...(layout?.secondary ?? []),
  ]);
  const disabled = new Set(options.disabledSegments ?? []);

  const buildRow = (
    position: CustomItemPosition,
    configured: StatusLineSegmentId[] | undefined,
    presetSegments: readonly StatusLineSegmentId[],
  ): StatusLineSegmentId[] => {
    const segments =
      configured !== undefined
        ? [...configured]
        : presetSegments.filter((id) => !explicitlyPlaced.has(id));

    if (configured === undefined) {
      for (const item of customItems) {
        const segmentId: StatusLineSegmentId = `custom:${item.id}`;
        if (item.position === position && !explicitlyPlaced.has(segmentId)) {
          segments.push(segmentId);
        }
      }
    }

    return segments.filter((id) => !disabled.has(id));
  };

  return {
    leftSegments: buildRow("left", layout?.left, presetDef.leftSegments),
    rightSegments: buildRow("right", layout?.right, presetDef.rightSegments),
    secondarySegments: buildRow(
      "secondary",
      layout?.secondary,
      presetDef.secondarySegments ?? [],
    ),
  };
}
