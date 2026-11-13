---
name: test
description: Check the product against its user stories and for accessibility, find what is not proven, and propose tasks to close the gaps. Only when the user asks to test, verify or check quality.
argument-hint: [what to check]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role tester`

Its output is your complete instructions. Follow it exactly, starting now. What the user wants checked, if they said: $ARGUMENTS
