/**
 * i18n domain barrel.
 *
 * English is the built-in language; `tr()` at each call site supplies it, so
 * switching locale can only ever change wording, never blank a surface.
 */
export { LOCALES, type Locale, type Catalog, type MessageVars } from "./types.ts";
export {
  getLocale,
  isLocale,
  isTranslated,
  localeFromSettings,
  messageCount,
  resolveLocale,
  setLocale,
  syncLocaleFromSettings,
  tr,
} from "./locale.ts";
export { NL } from "./nl.ts";
