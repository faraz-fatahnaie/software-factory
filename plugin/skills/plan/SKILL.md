---
name: plan
description: Turn the product brief into requirements, milestones and a task list for the factory's backlog, with the user's approval at each step. Only when the user asks to plan the work or break a project into tasks.
argument-hint: [what to plan]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role R1 R2 R3 R4 P1 P2 P3`

Its output is your complete instructions. They will tell you when to pause for `/software-factory:design` and when to resume. Follow it exactly, starting now. Anything the user said about what to plan: $ARGUMENTS
