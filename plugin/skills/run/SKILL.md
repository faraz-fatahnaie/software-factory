---
name: run
description: Run software factory backlog items through triage, spec, build, check and review. Only when the user explicitly asks to run the factory.
argument-hint: [F-id...] [--parallel N]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Run `factory run $ARGUMENTS`. With no arguments it takes the top Ready item; `F-012 F-013` names items; `--parallel 3` takes the top three Ready items. Each task runs in its own git worktree.

A run takes minutes per task and uses the models configured in `factory.config.json`, so start it in the background and tell the user it has started. `factory status` shows progress; `/software-factory:open` shows it live.

When it finishes, report each item's result. "Awaiting approval" means the review passed and a person must look at `git diff HEAD...factory/<F-id>` and then approve or discard. "Blocked" means it failed; give the reason it printed. Never approve or discard on your own.
