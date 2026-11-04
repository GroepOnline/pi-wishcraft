import { tr } from "../i18n/index.ts";

/**
 * Quick Launch rows. The welcome cockpit renders these and lets non-printable
 * navigation move between them, so the list lives here once instead of being
 * hardcoded inside the widget.
 *
 * `insert` is the text primed in the prompt editor when the row is activated.
 * Rows without `insert` are genuine keybindings — the overlay cannot press a
 * key for the operator, so activating them only closes the overlay.
 */
export interface QuickLaunchItem {
  id: string;
  keys: string;
  label: string;
  insert?: string;
}

export function quickLaunchItems(): QuickLaunchItem[] {
  return [
    {
      id: "idea",
      keys: "# <idea>",
      label: tr("welcome.shortcuts.idea", "capture idea to queue"),
      insert: "# ",
    },
    {
      id: "deck",
      keys: "alt+p",
      label: tr("welcome.shortcuts.deck", "tactical powerline overlay"),
    },
    {
      id: "bash",
      keys: "!cmd",
      label: tr("welcome.shortcuts.bash", "sticky bash session"),
      insert: "! ",
    },
    {
      id: "stash",
      keys: "alt+s",
      label: tr("welcome.shortcuts.stash", "stash/pop prompt draft"),
    },
  ];
}
