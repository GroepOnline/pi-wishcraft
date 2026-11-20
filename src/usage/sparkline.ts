/**
 * Block-element sparkline shared by the usage overlay and the TPS overlay.
 * Pure string math — kept out of usage-store so the fs-free tps-ring can
 * reuse it without importing a persistence module.
 */

export function usageSparkline(values: readonly number[], width = 14): string {
  if (values.length === 0) return "·".repeat(width);
  const blocks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...values, 1);
  const step = Math.max(1, Math.ceil(values.length / width));
  let out = "";
  for (let i = 0; i < values.length && out.length < width; i += step) {
    const slice = values.slice(i, i + step);
    const v = slice.reduce((a, b) => a + b, 0) / slice.length;
    const idx = Math.min(blocks.length - 1, Math.floor((v / max) * (blocks.length - 1)));
    out += blocks[idx];
  }
  return out.padEnd(width, "·");
}
