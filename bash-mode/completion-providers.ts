import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

import {
  getOneOffBashCommandContext,
  isExtendedCompletionItem,
  supportsShouldTriggerFileCompletion,
} from "./completion.ts";
import type { ExtendedCompletionItem } from "./types.ts";

function applyExtendedCompletion(
  lines: string[],
  cursorLine: number,
  item: ExtendedCompletionItem,
): {
  lines: string[];
  cursorLine: number;
  cursorCol: number;
} {
  const currentLine = lines[cursorLine] || "";
  const startCol = Math.max(0, Math.min(item.startCol, currentLine.length));
  const endCol = Math.max(startCol, Math.min(item.endCol, currentLine.length));
  const nextLine =
    currentLine.slice(0, startCol) +
    item.replacement +
    currentLine.slice(endCol);
  const nextLines = [...lines];
  nextLines[cursorLine] = nextLine;
  return {
    lines: nextLines,
    cursorLine,
    cursorCol: startCol + item.replacement.length,
  };
}

export class BashAutocompleteProvider implements AutocompleteProvider {
  async getSuggestions(): Promise<AutocompleteSuggestions | null> {
    return null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
  ): {
    lines: string[];
    cursorLine: number;
    cursorCol: number;
  } {
    if (!isExtendedCompletionItem(item)) {
      throw new Error(
        "Expected an extended completion item for bash autocomplete",
      );
    }

    return applyExtendedCompletion(lines, cursorLine, item);
  }

  shouldTriggerFileCompletion(): boolean {
    return false;
  }
}

export class OneOffBashAutocompleteProvider implements AutocompleteProvider {
  async getSuggestions(): Promise<AutocompleteSuggestions | null> {
    return null;
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
  ): {
    lines: string[];
    cursorLine: number;
    cursorCol: number;
  } {
    if (!isExtendedCompletionItem(item)) {
      throw new Error(
        "Expected an extended completion item for one-off bash autocomplete",
      );
    }

    return applyExtendedCompletion(lines, cursorLine, item);
  }

  shouldTriggerFileCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): boolean {
    const bang =
      cursorLine === 0 ? getOneOffBashCommandContext(lines[0] || "") : null;
    return bang !== null && cursorCol >= bang.offset;
  }
}

function getProviderTriggerCharacters(
  provider: AutocompleteProvider | undefined,
): string[] {
  const candidate =
    provider && typeof provider === "object"
      ? Reflect.get(provider, "triggerCharacters")
      : undefined;
  return Array.isArray(candidate)
    ? candidate.filter(
        (character): character is string =>
          typeof character === "string" && character.length === 1,
      )
    : [];
}

export class ModeAwareAutocompleteProvider implements AutocompleteProvider {
  readonly triggerCharacters: string[];
  private readonly defaultProvider: AutocompleteProvider | undefined;
  private readonly bashProvider: AutocompleteProvider;
  private readonly oneOffBashProvider: AutocompleteProvider;
  private readonly isBashModeActive: () => boolean;

  constructor(
    defaultProvider: AutocompleteProvider | undefined,
    bashProvider: AutocompleteProvider,
    oneOffBashProvider: AutocompleteProvider,
    isBashModeActive: () => boolean,
  ) {
    this.defaultProvider = defaultProvider;
    this.bashProvider = bashProvider;
    this.oneOffBashProvider = oneOffBashProvider;
    this.isBashModeActive = isBashModeActive;
    this.triggerCharacters = [
      ...new Set([
        ...getProviderTriggerCharacters(defaultProvider),
        ...getProviderTriggerCharacters(bashProvider),
        ...getProviderTriggerCharacters(oneOffBashProvider),
      ]),
    ];
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    if (this.isBashModeActive()) {
      return this.bashProvider.getSuggestions(
        lines,
        cursorLine,
        cursorCol,
        options,
      );
    }

    const shouldUseOneOffBash =
      supportsShouldTriggerFileCompletion(this.oneOffBashProvider) &&
      this.oneOffBashProvider.shouldTriggerFileCompletion(
        lines,
        cursorLine,
        cursorCol,
      );
    if (shouldUseOneOffBash) {
      return this.oneOffBashProvider.getSuggestions(
        lines,
        cursorLine,
        cursorCol,
        options,
      );
    }

    return (
      this.defaultProvider?.getSuggestions(lines, cursorLine, cursorCol, options) ??
      null
    );
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ) {
    if (this.isBashModeActive()) {
      return this.bashProvider.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
    }

    const shouldUseOneOffBash =
      supportsShouldTriggerFileCompletion(this.oneOffBashProvider) &&
      this.oneOffBashProvider.shouldTriggerFileCompletion(
        lines,
        cursorLine,
        cursorCol,
      );
    if (shouldUseOneOffBash) {
      return this.oneOffBashProvider.applyCompletion(
        lines,
        cursorLine,
        cursorCol,
        item,
        prefix,
      );
    }

    if (!this.defaultProvider) {
      return { lines, cursorLine, cursorCol };
    }
    return this.defaultProvider.applyCompletion(
      lines,
      cursorLine,
      cursorCol,
      item,
      prefix,
    );
  }

  shouldTriggerFileCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): boolean {
    if (this.isBashModeActive()) {
      if (!supportsShouldTriggerFileCompletion(this.bashProvider)) {
        return true;
      }
      const bashProvider = this.bashProvider;
      return bashProvider.shouldTriggerFileCompletion(
        lines,
        cursorLine,
        cursorCol,
      );
    }

    const oneOffBashProvider = this.oneOffBashProvider;
    const shouldUseOneOffBash =
      supportsShouldTriggerFileCompletion(oneOffBashProvider) &&
      oneOffBashProvider.shouldTriggerFileCompletion(
        lines,
        cursorLine,
        cursorCol,
      );
    if (shouldUseOneOffBash) {
      return true;
    }

    if (
      !this.defaultProvider ||
      !supportsShouldTriggerFileCompletion(this.defaultProvider)
    ) {
      return false;
    }
    const defaultProvider = this.defaultProvider;
    return defaultProvider.shouldTriggerFileCompletion(
      lines,
      cursorLine,
      cursorCol,
    );
  }
}
