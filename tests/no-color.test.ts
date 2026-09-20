import test from "node:test";
import assert from "node:assert/strict";

// colors.ts probes NO_COLOR lazily and caches the result per module instance,
// so each case imports a fresh copy via a cache-busting query.
async function importFreshColors(nocache: string | undefined) {
  const url = new URL(`../src/theme/colors.ts`, import.meta.url);
  url.searchParams.set("case", String(nocache));
  const mod = await import(url.href);
  return mod as typeof import("../src/theme/colors.ts");
}

async function withNoColor<T>(
  value: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const original = process.env.NO_COLOR;
  try {
    if (value === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = value;
    return await run();
  } finally {
    if (original === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = original;
  }
}

test("NO_COLOR present and non-empty disables wishcraft color", { concurrency: false }, async () => {
  await withNoColor("1", async () => {
    const { colorEnabled, fgOnly, getFgAnsiCode } = await importFreshColors("1");
    assert.equal(colorEnabled(), false);
    assert.equal(fgOnly("accent", "text"), "text");
    assert.equal(getFgAnsiCode("model"), "");
    assert.equal(fgOnly("sep", "text"), "text");
  });
});

test("empty NO_COLOR keeps color enabled", { concurrency: false }, async () => {
  await withNoColor("", async () => {
    const { colorEnabled } = await importFreshColors("");
    assert.equal(colorEnabled(), true);
  });
});

test("unset NO_COLOR keeps color enabled", { concurrency: false }, async () => {
  await withNoColor(undefined, async () => {
    const { colorEnabled } = await importFreshColors("unset");
    assert.equal(colorEnabled(), true);
  });
});

test("fgGradientCode ramps between palette tokens and respects NO_COLOR", { concurrency: false }, async () => {
  await withNoColor(undefined, async () => {
    const { fgGradientCode, getFgAnsiCode } = await importFreshColors("grad-on");
    // Endpoints land exactly on the palette colors (accent is truecolor
    // hex; sep is approximated in truecolor from its 256-code).
    assert.equal(fgGradientCode("accent", "sep", 0), getFgAnsiCode("accent"));
    assert.equal(fgGradientCode("accent", "sep", 1), "\x1b[38;2;128;128;128m");
    // Midpoint is a distinct interpolated truecolor code between endpoints.
    const mid = fgGradientCode("accent", "sep", 0.5);
    assert.match(mid, /^\x1b\[38;2;\d+;\d+;\d+m$/);
    const channels = (code: string): [number, number, number] => {
      const m = code.match(/^\x1b\[38;2;(\d+);(\d+);(\d+)m$/)!;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const a = channels(getFgAnsiCode("accent"));
    const b = channels(fgGradientCode("accent", "sep", 1));
    const m = channels(mid);
    for (let i = 0; i < 3; i++) {
      assert.ok(m[i]! > Math.min(a[i]!, b[i]!) && m[i]! < Math.max(a[i]!, b[i]!), `channel ${i} not interpolated`);
    }
    // Out-of-range t clamps instead of extrapolating.
    assert.equal(fgGradientCode("accent", "sep", -3), fgGradientCode("accent", "sep", 0));
    assert.equal(fgGradientCode("accent", "sep", 9), fgGradientCode("accent", "sep", 1));
  });
  await withNoColor("1", async () => {
    const { fgGradientCode } = await importFreshColors("grad-off");
    assert.equal(fgGradientCode("accent", "sep", 0.5), "");
  });
});
