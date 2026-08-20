import test from "node:test";
import assert from "node:assert/strict";

import {
  formatReadHint,
  shouldAppendReadHint,
} from "../src/extension/session/read-hints.ts";

const cases: Array<{
  name: string;
  input: { offset?: number; limit?: number } | undefined;
  text: string;
  details?: { truncation?: { totalLines?: number } };
  append: boolean;
  hint?: string;
}> = [
  {
    name: "full file read without offset or limit",
    input: {},
    text: "alpha\nbeta\ngamma",
    append: false,
  },
  {
    name: "core already includes a showing-lines summary",
    input: { offset: 10, limit: 5 },
    text: "line ten\nline eleven\n\n[Showing lines 10-14 of 100. Use offset=15 to continue.]",
    append: false,
  },
  {
    name: "core already includes a use-offset footer",
    input: { offset: 20 },
    text: "payload\n\n[42 more lines in file. Use offset=25 to continue.]",
    append: false,
  },
  {
    name: "partial read needs a hint when core stayed quiet",
    input: { offset: 10, limit: 5 },
    text: "line ten\nline eleven\nline twelve\nline thirteen\nline fourteen",
    details: { truncation: { totalLines: 100 } },
    append: true,
    hint: "100 lines, showing 10–14, next offset 15",
  },
  {
    name: "partial read at eof does not need a hint",
    input: { offset: 98, limit: 5 },
    text: "ninety-eight\nninety-nine\none hundred",
    details: { truncation: { totalLines: 100 } },
    append: false,
  },
  {
    name: "limit shorter than requested means eof",
    input: { offset: 1, limit: 10 },
    text: "only\nthree\nlines",
    append: false,
  },
];

for (const c of cases) {
  test(`shouldAppendReadHint: ${c.name}`, () => {
    assert.equal(shouldAppendReadHint(c.input, c.text, c.details), c.append);
    if (c.hint) {
      assert.equal(formatReadHint(c.input!, c.text, c.details), c.hint);
    }
  });
}

test("formatReadHint falls back without total line count", () => {
  assert.equal(
    formatReadHint({ offset: 3, limit: 2 }, "c\n d"),
    "2 lines, showing 3–4, next offset 5",
  );
});
