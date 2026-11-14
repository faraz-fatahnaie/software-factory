---
name: reject
description: Send a finished software factory task back to the Builder with the user's comments. Only when the user explicitly asks to send a specific task back.
argument-hint: <F-id> <what to change>
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

The task must be under Awaiting approval. Take the task id and the user's own words about what to change, and run `factory reject <F-id> --feedback "<their words>"`. Keep their wording; do not add requests of your own. If they name files, add `--files path/one,path/two`.

The Builder continues on the same branch with the same spec, and the checks, security review and review run again. This uses model usage, so start it in the background and say it has started. `factory status` shows progress.

If what they ask for is a new feature rather than a fix to this task, suggest `/software-factory:add` instead. When it finishes, report whether it is awaiting approval again or blocked, and never approve on your own.
