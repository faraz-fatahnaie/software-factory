---
name: secure
description: Work out the threats, data protection and performance risks of the project with the user, or audit it before a release. Only when the user asks about security, privacy, performance or a release audit.
argument-hint: [audit]
disable-model-invocation: true
allowed-tools: Bash(factory *) WebSearch WebFetch
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory, and depend on what the user asked for.

- If the user's request below starts with the word `audit`, they want the audit before a release. Run `factory role S4`.
- Otherwise run `factory role A5 S3 Q1`: the threat model, data protection, and the performance review of the design.

The command's output is your complete instructions. Follow it exactly, starting now. The user's request: $ARGUMENTS
