---
name: research
description: Research products similar to what the user wants to build, share what was found, and record it after the user approves. Only when the user asks to research competitors or similar products.
argument-hint: [what to look into]
disable-model-invocation: true
allowed-tools: Bash(factory *) WebSearch WebFetch
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role D2`

Its output is your complete instructions. Follow it exactly, starting now. What the user wants researched, if they said: $ARGUMENTS
