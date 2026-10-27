import { LOCALES, type Locale, type MessageVars } from "./types.ts";
import { NL } from "./nl.ts";

/**
 * Active locale for this process.
 *
 * Kept as module state (not `RuntimeState`) on purpose: config, segments and
 * welcome are leaf domains that must not import the runtime hub for shared
 * values, and language is ambient the same way ANSI colour support is.
 */
let active: Locale = "en";

const CATALOGS: Record<Locale, Record<string, string>> = {
  en: {},
  nl: NL,
};

/** Normalise anything from settings/env into a supported locale. */
export function resolveLocale(value: unknown): Locale {
  if (typeof value !== "string") return "en";
  const token = value.trim().toLowerCase().replace("_", "-");
  if (!token) return "en";
  if ((LOCALES as readonly string[]).includes(token)) return token as Locale;
  // "nl-NL", "nl_be" → "nl"; "en-US" → "en"
  const base = token.split("-")[0]!;
  if ((LOCALES as readonly string[]).includes(base)) return base as Locale;
  return "en";
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getLocale(): Locale {
  return active;
}

/** Set the ambient locale. Unknown values fall back to `"en"`. */
export function setLocale(value: unknown): Locale {
  active = resolveLocale(value);
  return active;
}

function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Translate `key`, falling back to the English literal at the call site.
 *
 * The fallback is interpolated too — `tr("x", "ACTIVE ROUTE: {route}", …)`
 * must substitute regardless of locale, otherwise the default language would
 * print raw `{placeholders}`. No catalog lookup happens when `active` is
 * `"en"`, so hot render loops stay allocation-free unless they pass vars.
 */
export function tr(key: string, english: string, vars?: MessageVars): string {
  const translated =
    active === "en" ? undefined : CATALOGS[active][key];
  const template = translated === undefined ? english : translated;
  return vars ? interpolate(template, vars) : template;
}

/** True when the active locale carries an override for `key`. */
export function isTranslated(key: string): boolean {
  return active !== "en" && CATALOGS[active][key] !== undefined;
}

/** Number of overridden messages for a locale (0 for English, by design). */
export function messageCount(locale: Locale): number {
  return Object.keys(CATALOGS[locale]).length;
}

/** Read a locale out of a settings object (`wishcraft.locale`). */
export function localeFromSettings(settings: Record<string, unknown>): Locale {
  const wishcraft = settings.wishcraft;
  const fromWishcraft =
    typeof wishcraft === "object" && wishcraft !== null
      ? (wishcraft as Record<string, unknown>).locale
      : undefined;
  if (fromWishcraft !== undefined) return resolveLocale(fromWishcraft);
  const powerline = settings.powerline;
  const fromPowerline =
    typeof powerline === "object" && powerline !== null
      ? (powerline as Record<string, unknown>).locale
      : undefined;
  if (fromPowerline !== undefined) return resolveLocale(fromPowerline);
  return resolveLocale(process.env.PI_WISHCRAFT_LOCALE);
}

/** Apply `settings` (and then `overrides`) to the ambient locale. */
export function syncLocaleFromSettings(
  settings: Record<string, unknown>,
): Locale {
  return setLocale(localeFromSettings(settings));
}
