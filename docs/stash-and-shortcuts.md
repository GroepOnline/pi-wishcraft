# Stash & shortcuts

## Editor stash

Use `Alt+S` / `Option+S` as a quick stash toggle while drafting. It keeps one active stash and clears the editor when stashing. Powerline listens for unambiguous Alt/Meta-S escape encodings by default. If your old terminal setup only emits the printable German sharp-S character for Option+S and you still want that to trigger stash, set `"stashSharpSShortcut": true` under `powerline`.

| Editor | Stash | `Alt+S` result |
|--------|-------|----------------|
| Has text | Empty | Stash current text, clear editor |
| Empty | Has stash | Restore stash into editor |
| Has text | Has stash | Update stash with current text, clear editor |
| Empty | Empty | Show "Nothing to stash" |

Auto-restore after an agent run only happens when the editor is still empty. If you typed meanwhile, the stash is preserved.

The `stash` indicator appears in the powerline bar (on presets with `extension_statuses`). Active stash is still session-local and resets on session switch / disable, but stash history is persisted to the agent dir at `powerline-footer/stash-history.json` so it survives restarts. By default the agent dir is `~/.pi/agent`; set `PI_CODING_AGENT_DIR` to move global powerline settings, stash history, sessions, vibes, skills, commands, and extension discovery with Pi.

## Stash history

Open prompt history with either:

- `ctrl+alt+h`
- `/stash-history`

Prompt history now has two sources:

- stashed prompts: up to 12 recent stashed prompts (newest first)
- recent project prompts: up to 50 recent user-submitted prompts pulled from pi sessions in the current project folder

Selecting a stashed entry lets you insert it or promote it to an idea. Project prompt history entries insert into the editor. If the editor already has text, you can choose `Replace`, `Append`, or `Cancel`.

## Editor clipboard and navigation shortcuts

- `ctrl+alt+c`: copy full editor content
- `ctrl+alt+x`: cut full editor content (copy, then clear)
- `ctrl+alt+q`: open the queued-prompt picker
- `cmd+shift+up`: move the editor cursor to the start of the first line
- `cmd+shift+down`: move the editor cursor to the end of the last line

Copy/cut actions do not modify stash state or stash history. Dragging files, folders, images, or screenshots from Finder into the custom editor inserts their path strings. Pi owns chat scrolling, selection, and fixed input behavior natively.

## Shortcut configuration

You can override shortcut keys in the agent settings file:

```json
{
  "powerlineShortcuts": {
    "stashHistory": "ctrl+alt+h",
    "copyEditor": "ctrl+alt+c",
    "cutEditor": "ctrl+alt+x",
    "ideaCapture": null,
    "queueOpen": "ctrl+alt+q",
    "editorStart": "cmd+shift+up",
    "editorEnd": "cmd+shift+down"
  }
}
```

After changing bindings, run `/reload`. Invalid bindings, reserved key conflicts like `Alt+S`, or duplicate conflicts fall back to safe defaults. Set a binding to `null` or `""` to disable that action. `cmd` and `command` are accepted aliases for Pi's `super` modifier for the documented Command navigation keys.

## Editor autocomplete composition

Powerline wraps Pi's autocomplete provider so bash mode can add shell-aware suggestions. When another editor extension was already installed, powerline now passes Pi's provider through that previous editor's `setAutocompleteProvider()` first and then wraps the resulting provider. This preserves prior autocomplete-provider wrappers where possible, but it is not full render/input composition between custom editors.
