---
name: ask
description: Talk to one of the software factory's roles, or run one of the team's conversations, by role name or responsibility id, including responsibilities the user added. Only when the user asks to consult a role.
argument-hint: <role or id...>
disable-model-invocation: true
allowed-tools: Bash(factory *) WebSearch WebFetch
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

If the user gave an argument, run `factory role $ARGUMENTS` (a role name such as `architect`, or responsibility ids such as `D1 D3`). Its output is your complete instructions. Follow it exactly, starting now.

If they gave none, run `factory team`, show them in plain words which roles have conversations they can have, and ask which one they want.
