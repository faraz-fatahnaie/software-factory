---
name: factory
description: Run the software factory pipeline on backlog items. Use when asked to run, queue or add factory work, or to install a skill for a factory role.
---
The orchestrator CLI does all coordination. Run it from the repo root and report its result;
do not perform the pipeline stages yourself.

- `bun run factory run [F-id]` — run the top Ready item in `BACKLOG.md`, or a specific one.
- `bun run factory add "<title>"` — add an item to Inbox. A person promotes it to Ready.
- `bun run factory skill add <owner/repo@skill> --role <triage|architect|builder|reviewer>`

A run prints the item, then its final section (Done or Blocked) and a run id. Stage outputs are in
`.factory/runs/<run id>/`. For what happened and what it cost:

`sqlite3 .factory/events.db "SELECT stage, type, model, data FROM events WHERE run = '<run id>'"`
