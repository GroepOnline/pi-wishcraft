# Bash mode

Toggle bash mode with either:

- `ctrl+shift+b`
- `/bash-mode on`
- `/bash-mode off`
- `/bash-mode toggle`

Reset the managed shell with `/bash-reset`.

While bash mode is active:

- Enter runs the current shell command
- Right Arrow accepts ghost text into the editor without running it
- Tab completes the ghost suggestion one token/segment at a time (repeat Tab to step through each further token); once the full suggestion is inserted it clears, otherwise Tab does nothing
- Up and Down browse matching shell history
- `escape` exits bash mode and returns to normal prompt mode
- `ctrl+c` interrupts the active shell job before falling back to normal pi behavior

The managed shell is persistent for the current pi session. Command output appears in a transcript below the editor, and shell cwd changes are reflected in the footer path and `shell_mode` segment.

## Execution (v2)

Commands run under a real PTY via `script(1)` (no native dependency), so programs that read stdin work: printable input typed while a command runs is forwarded to the process, and `ctrl+c` interrupts it. SGR color survives into the transcript when the terminal supports it; `NO_COLOR` renders plain text. When `script(1)` is missing, each command degrades to plain pipe execution with a one-time warning (no color, no interactive stdin).

## Shell ghost suggestions

Bash mode is ghost-first. Successful per-project shell history is the primary source, while deterministic path and git continuations can still extend an existing command. Shell-native completion probes are disabled so `!command` predictions never spawn interactive shell completion subprocesses.

At command position, short stems first resolve from the newest successful local command, can use guarded global shell history for high-confidence heads like `git`, and finally fall back to a tiny curated default set when history is absent. Right now that curated set is `g` → `git status` and `c` → `cd ..`.

If the bash prompt is empty, bash mode shows the newest successful project-history ghost suggestion immediately when one exists, including right after mode entry or after the prompt is cleared again. One-off `!command` and `!!command` prompts reuse the same shell prediction pipeline, including ghost text. Right Arrow or Tab accepts ghost text into the editor, and Enter runs the current shell command. Mode entry stays quiet: there is no automatic or manual dropdown completion surface, and ghost suggestions do not run shell-native completion probes.

## Configuration

In `~/.pi/agent/settings.json` (or under `PI_CODING_AGENT_DIR` when that environment variable is set):

```json
{
  "bashMode": {
    "toggleShortcut": "ctrl+shift+b",
    "transcriptMaxLines": 2000,
    "transcriptMaxBytes": 524288,
    "initScript": "export NODE_ENV=development\nalias g='git status'"
  }
}
```

`initScript` is a project-scoped shell setup block: it is sourced once when the managed shell starts (before your first command), so a repo can export env vars, define aliases, or set shell options per project. Put it in the project-local `.pi/settings.json` to keep it repo-specific; omit it (or use a global `bashMode` entry) otherwise.
