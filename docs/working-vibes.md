# Working vibes

Transform boring "Working..." messages into themed phrases that match your style:

```text
/vibe star trek    → "Running diagnostics...", "Engaging warp drive..."
/vibe pirate       → "Hoisting the sails...", "Charting course..."
/vibe zen          → "Breathing deeply...", "Finding balance..."
/vibe noir         → "Following the trail...", "Checking the angles..."
/vibe              → Shows current theme, mode, and model
/vibe off          → Disables (back to "Working...")
/vibe model        → Shows current model
/vibe model openai/gpt-4o-mini → Use a different model
/vibe mode         → Shows current mode (generate or file)
/vibe mode file    → Switch to file-based mode (instant, no API calls)
/vibe mode generate → Switch to on-demand generation (contextual)
/vibe generate mafia 200 → Pre-generate 200 vibes and save to file
/vibe test mafia          → Preview 3 sample vibes without committing the theme
```

## Configuration

In the agent settings file:

```json
{
  "workingVibe": "star trek",                              // Theme phrase
  "workingVibeMode": "generate",                           // "generate" (on-demand) or "file" (pre-generated)
  "workingVibeModel": "openai-codex/gpt-5.4-mini",         // Optional: model to use (default)
  "workingVibeFallback": "Working",                        // Optional: fallback message
  "workingVibeRefreshInterval": 30,                        // Optional: seconds between refreshes (default 30)
  "workingVibePrompt": "Generate a {theme} loading message for: {task}",  // Optional: custom prompt template
  "workingVibeMaxLength": 65                         // Optional: max message length (default 65)
}
```

## Modes

| Mode | Description | Pros | Cons |
|------|-------------|------|------|
| `generate` | On-demand AI generation (default) | Contextual, hints at actual task | Model-dependent cost and latency |
| `file` | Pull from pre-generated file | Instant, zero cost, works offline | Not contextual |

**File mode setup:**

```bash
/vibe generate mafia 200    # Generate 200 vibes, save to the agent dir
/vibe mode file             # Switch to file mode
/vibe mafia                 # Now uses the file
```

**How file mode works:**

1. Vibes are loaded from `vibes/{theme}.txt` in the agent dir into memory
2. Uses seeded shuffle (Mulberry32 PRNG): cycles through all vibes before repeating
3. New seed each session: different order every time you restart pi
4. Zero latency, zero cost, works offline

**Prompt template variables (generate mode only):**

- `{theme}`: the current vibe theme (e.g., "star trek", "mafia")
- `{task}`: context hint (user prompt initially, then agent's response text or tool info on refresh)
- `{exclude}`: recent vibes to avoid (auto-populated, e.g., "Don't use: vibe1, vibe2...")

**How it works:**

1. When you send a message, shows "Channeling {theme}..." placeholder
2. AI generates a themed message in the background (3s timeout)
3. Message updates to the themed version (e.g., "Engaging warp drive...")
4. During long tasks, refreshes on tool calls (rate-limited, default 30s)
5. Cost and latency depend on your configured `workingVibeModel`
