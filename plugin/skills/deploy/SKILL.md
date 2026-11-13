---
name: deploy
description: Put a tagged release in front of real users, one approved step at a time, then smoke-test it and roll back if it fails. Only when the user explicitly asks to deploy now.
argument-hint: [environment]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role release-engineer L4 L5`

Its output is your complete instructions. Follow it exactly, starting now. Nothing outside this project changes without the user's clear yes to that exact step. Which environment the user named, if any: $ARGUMENTS
