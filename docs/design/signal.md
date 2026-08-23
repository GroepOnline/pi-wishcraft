# Signal — The Animated Powerline Specification

## Overview

**Signal** is Wishcraft's animated powerline. While previous terminal footers were static rows of plain text, Signal turns status into an informative, living track.

- **Primary Command**: `/signal` (opens the Signal configuration deck or toggles view modes).
- **Compatibility Alias**: `/powerline` (retained for backward compatibility).

---

## 3-Lane Architecture

Signal divides status information into three distinct, customizable lanes:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ LEFT LANE                    CENTER LANE                    RIGHT LANE           │
│ Model · Git Status           Live Activity & Tools          Context · Queue      │
├──────────────────────────────┼──────────────────────────────┼────────────────────┤
│ ◆ GPT-5.6 ╾━━━━ main ━━━━    │ ╾✦╼━━━━ read_file ━━━━━━━    │ ctx █████░ 47%     │
└──────────────────────────────┴──────────────────────────────┴────────────────────┘
```

1. **Left Lane (Identity & Workspace)**
   - Active Model badge (with provider color accent)
   - Git branch and repository clean/dirty status
   - Workspace directory (truncated gracefully on compact displays)

2. **Center Lane (Live Activity & Motion)**
   - Current agent state (Thinking, Streaming, Tool Execution)
   - Active tool call indicator (`read_file`, `grep`, `execute_command`)
   - Traveling motion pulse representing data throughput

3. **Right Lane (Metrics & Session)**
   - Context window progress bar and percentage
   - Queued user/agent instructions count
   - Session cost / token consumption (if enabled)

---

## Live Motion Sweeps

Signal animates only when actual work is being processed. The track reflects execution states through traveling pulses:

### Token Streaming Wave
```
t0:  ◆ GPT-5.6 ╾▓▒░━━━━ main ━━━━━━━━━ read ━━━━━━━━━ ctx 47%
t1:  ◆ GPT-5.6 ━╾▓▒░━━━ main ━━━━━━━━━ read ━━━━━━━━━ ctx 47%
t2:  ◆ GPT-5.6 ━━━╾▓▒░━ main ━━━━━━━━━ read ━━━━━━━━━ ctx 47%
t3:  ◆ GPT-5.6 ━━━━━━━━ main ╾▓▒░━━━━━ read ━━━━━━━━━ ctx 47%
```

### Tool Execution Traveling Pulse
```
t0:  read ━━━╾✦╼━━━ grep ━━━━━━━━━ edit ━━━━━━━━━
t1:  read ✓ ━━━━━━━ grep ━━━╾✦╼━━━ edit ━━━━━━━━━
t2:  read ✓ ━━━━━━━ grep ✓ ━━━━━━━ edit ━━━╾✦╼━━━
```

---

## Fault Isolation & Error Boundaries

Signal builds on Pi-Wishcraft's existing segment architecture:
- Every segment executes in an isolated `try/catch` wrapper.
- If an individual segment fails (e.g. git command timeout or unexpected API response), it degrades gracefully to a silent fallback or a compact warning glyph without crashing the surrounding status line.
- Segment separators adjust dynamically when neighboring segments are hidden or empty.
