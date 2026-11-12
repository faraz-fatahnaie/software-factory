---
name: open
description: Start the software factory's control-plane GUI and give the link. Use when the user wants to see or open the factory GUI or dashboard.
argument-hint: [port]
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Start `factory serve` in the background and give the user the link: http://127.0.0.1:4400. A port can be passed: `factory serve 4500`.

If it reports the port is in use, the GUI is most likely already running; give the link instead of starting a second one. It listens on this machine only.
