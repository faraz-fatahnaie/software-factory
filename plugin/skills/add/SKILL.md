---
name: add
description: Add an idea or task to the software factory backlog Inbox. Use when the user wants to queue work for the factory.
argument-hint: <what to build>
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Add one backlog item per distinct piece of work: `factory add "<title>"`. Write the title as a single line that says what should exist afterwards; keep the user's wording where it is clear. Arguments, if given: $ARGUMENTS

For a bigger piece of work that still needs shaping, suggest `/software-factory:plan` instead. A detail and priority can be attached: `factory add "<title>" --detail "<lines>" --priority P2`; a detail line starting `Acceptance:` tells the factory the item already has its checks, so it skips triage.

New items land in Inbox. They run only after a person promotes them: mention `factory promote <F-id>`, and promote only if the user asks you to.
