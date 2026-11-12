---
name: approve
description: Land a software factory task that is awaiting approval. Only when the user explicitly asks to approve a specific task.
argument-hint: <F-id>
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Run `factory approve $ARGUMENTS` for the task the user named. It opens a pull request if the repository has an `origin`, otherwise it merges the task branch locally, then removes the task's worktree. Report where it landed.

If it reports a conflict, nothing was merged: tell the user the task must be rebuilt (`factory discard <F-id>`, then `factory run <F-id>`) and ask before doing that.
