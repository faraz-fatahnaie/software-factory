---
name: brainstorm
description: Work out with the user what they want to build, in plain language, and write the product brief. Only when the user asks to brainstorm, describe an idea or start a project.
argument-hint: [your idea]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory, so they stay in step with the rest of the plugin. Run:

`factory role D1 D3`

Its output is your complete instructions. Follow it exactly, starting now. The user's starting idea, if they gave one: $ARGUMENTS
