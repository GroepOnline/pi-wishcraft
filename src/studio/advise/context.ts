// ponytail: char-based cap; full token-aware budgeting needs a tokenizer that
// we do not want to depend on. Document the ceiling and upgrade path.
export interface AdviseContextSection {
  name: string;
  content: string;
}

export interface AdviseContextInput {
  body: string;
  references: AdviseContextSection[];
  wiki: AdviseContextSection[];
  maxChars: number;
}

export interface AdviseContext {
  body: string;
  references: AdviseContextSection[];
  wiki: AdviseContextSection[];
  dropped: { wiki: number; references: number; body: boolean };
  budget: { cap: number; used: number };
}

export function capContextByChars(text: string, cap: number): { content: string; truncated: boolean } {
  if (text.length <= cap) {
    return { content: text, truncated: false };
  }
  return { content: text.slice(0, cap), truncated: true };
}

export function buildAdviseContext(input: AdviseContextInput): AdviseContext {
  const cap = Math.max(0, input.maxChars);
  let used = 0;
  const dropped = { wiki: 0, references: 0, body: false };

  // Body is highest priority and never truncated: if the body itself exceeds
  // the cap, we still keep it and mark body=true so the caller knows. Body
  // shape (skill file) is what advice is grounded in.
  const body = input.body;
  used += body.length;

  const references: AdviseContextSection[] = [];
  for (const ref of input.references) {
    if (used >= cap) {
      dropped.references += 1;
      continue;
    }
    const remaining = cap - used;
    const capped = capContextByChars(ref.content, remaining);
    references.push({ name: ref.name, content: capped.content });
    used += capped.content.length;
    if (capped.truncated) {
      // We filled the rest of the budget with this reference; drop the rest.
      dropped.references += input.references.length - references.length;
      break;
    }
  }

  // Wiki is lowest priority: drop from the back when full.
  const wiki: AdviseContextSection[] = [];
  for (const w of input.wiki) {
    if (used + w.content.length > cap) {
      // Try a partial if there is room at all.
      const remaining = Math.max(0, cap - used);
      if (remaining > 0) {
        const capped = capContextByChars(w.content, remaining);
        wiki.push({ name: w.name, content: capped.content });
        used += capped.content.length;
        dropped.wiki += 1;
      } else {
        dropped.wiki += 1;
      }
      continue;
    }
    wiki.push({ name: w.name, content: w.content });
    used += w.content.length;
  }

  if (used > cap) {
    dropped.body = true;
  }

  return {
    body,
    references,
    wiki,
    dropped,
    budget: { cap, used: Math.min(used, cap + body.length) },
  };
}
