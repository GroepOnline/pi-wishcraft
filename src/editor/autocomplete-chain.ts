import type { AutocompleteProvider } from "@earendil-works/pi-tui";

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object";
}

function isProvider(val: unknown): val is AutocompleteProvider {
  if (!isObject(val)) return false;
  return typeof val.getSuggestions === "function" && typeof val.applyCompletion === "function";
}

export function getEditorAutocompleteProvider(sourceEditor: unknown): AutocompleteProvider | undefined {
  if (!isObject(sourceEditor) || !("autocompleteProvider" in sourceEditor)) {
    return undefined;
  }
  const provider = sourceEditor.autocompleteProvider;
  if (isProvider(provider)) {
    return provider;
  }
  return undefined;
}

export function passAutocompleteProviderThroughPreviousEditor(
  provider: AutocompleteProvider,
  previousEditor: unknown,
): AutocompleteProvider {
  if (!isObject(previousEditor)) {
    return provider;
  }
  
  if ("setAutocompleteProvider" in previousEditor && typeof previousEditor.setAutocompleteProvider === "function") {
    previousEditor.setAutocompleteProvider(provider);
  }

  const existingProvider = getEditorAutocompleteProvider(previousEditor);
  if (existingProvider !== undefined) {
    return existingProvider;
  }
  
  return provider;
}
