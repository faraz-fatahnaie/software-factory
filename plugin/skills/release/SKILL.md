---
name: release
description: Prepare the project to ship: interview the user about deployment, recommend hosting, write the deployment plan and runbooks, and when asked choose a version, write the changelog and tag it. Never deploys. Only when the user asks to release, prepare to deploy, or version the project.
argument-hint: [what you want]
disable-model-invocation: true
allowed-tools: Bash(factory *) WebSearch WebFetch
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role L2 L3 O2 L1`

Its output is your complete instructions. Follow it exactly, starting now. This command prepares and tags; it never deploys or publishes anything. What the user said they want, if anything: $ARGUMENTS
