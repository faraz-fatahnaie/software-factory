---
name: update
description: Bring a finished software factory task up to date with main when main moved on while it waited. Only when the user explicitly asks to update a specific task.
argument-hint: <F-id>
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, resolve conflicts yourself, or commit on its behalf.

The task must be under Awaiting approval. Run `factory update <F-id>`.

It merges main into the task's own branch (nothing is pushed, main is not touched). With no clash only the checks run again. With a clash the Builder resolves just the clashing files, then the checks, security review and review run again; that uses model usage, so start it in the background and say it has started. If it cannot be finished the branch is put back as it was.

When it finishes, report whether the task is awaiting approval again or blocked, and never approve on your own.
