---
name: open
description: Start the software factory's control-plane GUI and give the link. Use when the user wants to see or open the factory GUI or dashboard.
argument-hint: [port]
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Start `factory serve` in the background and give the user the link it prints. Each project has its own dashboard on its own port (4400-4499, chosen from the project's path); if this project's is already running, `factory serve` says so and prints its link. Never hand out a link you did not get from `factory serve`: another port may belong to a different project. A port can be passed: `factory serve 4500`. It listens on this machine only.
