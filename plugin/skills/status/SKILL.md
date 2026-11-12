---
name: status
description: Show what the software factory is doing: items that are ready, running, awaiting approval or blocked. Use when the user asks about factory progress or state.
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Run `factory status` and relay it briefly. Lead with anything awaiting the user's approval, then anything blocked and why, then what is running.
