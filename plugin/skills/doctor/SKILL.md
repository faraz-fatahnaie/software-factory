---
name: doctor
description: Check that the software factory is installed and this project is set up correctly. Use when the factory misbehaves or the user asks to check or diagnose the setup.
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Run `factory doctor`. Lines starting with ✗ are problems that stop the factory working; lines starting with – are optional. Relay the failures with the fix each one suggests, and offer to apply the fixes that are safe (`factory init` never overwrites existing files).
