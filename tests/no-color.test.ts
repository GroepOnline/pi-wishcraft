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

function withNoColor<T>(value: string | undefined, run: () => T): T {
  const original = process.env.NO_COLOR;
  try {
    if (value === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = value;
    return run();
  } finally {
    if (original === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = original;
  }
}

test("NO_COLOR present and non-empty disables wishcraft color", async () => {
  const { colorEnabled, fgOnly, getFgAnsiCode } = await importFreshColors("1");
  withNoColor("1", () => {
    assert.equal(colorEnabled(), false);
    assert.equal(fgOnly("accent", "text"), "text");
    assert.equal(getFgAnsiCode("model"), "");
    assert.equal(fgOnly("sep", "text"), "text");
  });
});

test("empty NO_COLOR keeps color enabled", async () => {
  const { colorEnabled } = await importFreshColors("");
  withNoColor("", () => {
    assert.equal(colorEnabled(), true);
  });
});

test("unset NO_COLOR keeps color enabled", async () => {
  const { colorEnabled } = await importFreshColors("unset");
  withNoColor(undefined, () => {
    assert.equal(colorEnabled(), true);
  });
});
