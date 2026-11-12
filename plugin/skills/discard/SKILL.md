---
name: discard
description: Delete a software factory task's work and return it to Ready. Only when the user explicitly asks to discard a specific task.
argument-hint: <F-id>
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Run `factory discard $ARGUMENTS` for the task the user named. This deletes that task's worktree and branch, including uncommitted work, and moves the item back to Ready. It cannot be undone, so confirm the task id with the user first if there is any doubt which one they mean.
