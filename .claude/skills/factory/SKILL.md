---
name: factory
description: Run the software factory pipeline on backlog items. Use when asked to run, queue or add factory work, or to install a skill for a factory role.
---
The orchestrator CLI does all coordination. Run it from the repo root and report its result;
do not perform the pipeline stages yourself.

- `bun run factory run [F-id...] [--parallel N]` — run the top Ready item(s) in `BACKLOG.md`, or the named ones, each in its own worktree.
- `bun run factory add "<title>"` — add an item to Inbox. A person promotes it to Ready.
- `bun run factory skill add <owner/repo@skill> --role <triage|architect|builder|reviewer>`
- `bun run factory approve <F-id>` and `discard <F-id>` — only when the person explicitly asks. Approve merges or opens a pull request; discard deletes the task's work.

A run ends with each item under Awaiting approval or Blocked, and prints a run id. The work is on branch
`factory/<F-id>` in `.worktrees/<F-id>/`, with stage outputs in its `.factory/runs/<run id>/`. For what happened and what it cost:

`sqlite3 .factory/events.db "SELECT stage, type, model, data FROM events WHERE run = '<run id>'"`
