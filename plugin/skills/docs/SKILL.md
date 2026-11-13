---
name: docs
description: Bring the README, user documentation and context files (AGENTS.md) up to date with what has been built, with the user's approval. Only when the user asks to update the documentation.
argument-hint: [what to focus on]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role K1 K3`

Its output is your complete instructions. Follow it exactly, starting now. What the user wants focused on, if anything: $ARGUMENTS
