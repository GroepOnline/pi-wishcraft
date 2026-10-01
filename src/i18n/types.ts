/**
 * i18n types.
 *
 * Wishcraft ships English inline at every call site (`tr(key, english)`), so an
 * untranslated key never blanks the UI — it simply returns the English literal.
 * Translated locales only carry the overrides that actually differ.
 */
export const LOCALES = ["en", "nl"] as const;

export type Locale = (typeof LOCALES)[number];

/** `{"{n} items": "{n} items"`} — raw message overrides for one locale. */
export type Catalog = Record<string, string>;

/** Values interpolated into `{placeholder}` slots. */
export type MessageVars = Record<string, string | number>;
