---
name: design
description: Choose the technology and design the system with the user, record the decisions, define the foundation and the gate, and suggest skills. Only when the user asks to design, choose a stack or architect the project.
argument-hint: [anything to keep in mind]
disable-model-invocation: true
allowed-tools: Bash(factory *) WebSearch WebFetch
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role A1 A2 A4 A3 F3 X1`

Its output is your complete instructions. Follow it exactly, starting now. What the user said they want kept in mind, if anything: $ARGUMENTS
