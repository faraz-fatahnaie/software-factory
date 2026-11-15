---
name: manage
description: Talk to the project's Technical Manager, who knows where things stand, why a task stopped and what to do next, and who asks the other roles for you. Use when the user wants a status, wants to know why something failed or did not start, or wants to hand a question to the whole team.
argument-hint: [what you want to know]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory, so they stay in step with the rest of the plugin. Run:

`factory role manage`

Its output is your complete instructions. Follow it exactly, starting now. If the user gave a question, answer it; if not, run `factory status` and tell them where things stand. What the user asked, if anything: $ARGUMENTS
