---
name: team
description: Choose and shape the software factory team for this project: pick a preset, ask for a number of agents, move, merge, rename or switch off responsibilities, or add your own. Only when the user asks to change or look at the team.
argument-hint: [what you want]
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Help the user choose and shape the team that works on their project. Start with `factory team` (the current team) and `factory team presets` (the options). What the user said they want, if anything: $ARGUMENTS

How the team works, to explain in plain words: every job a software project needs is a *responsibility*, and a *role* is a group of them done by one agent. A normal task uses three agents (spec, build, review) in every team; bigger teams add specialists who only join when needed (for example a security review when a change touches logins or personal data). The number of agents is the user's choice.

1. **Understand the project** with one question at a time: how big it is, who is affected, whether it handles personal data or payments, and whether they want fewer agents (simpler to follow) or more specialists (more careful).
2. **Recommend** a preset, or a number of agents with `factory team agents <n>`, and say why. Lean suits a small personal project, Balanced most projects, Full anything handling personal data or payments or depended on by others.
3. **Offer finer changes** only if they want them: `factory team move <id>... --to <role>`, `factory team merge <role> <into>`, `factory team rename <role> <new-name> "<Title>"`, `factory team title <role> "<Title>"`, and `factory team off <id>...` / `factory team on <id>...` to switch a responsibility off or on. `factory team presets` and the ids in `factory team` show what exists.
4. **Their own responsibility**: ask what it should do and when. Write an instruction of three to eight sentences, in plain language, that only reads (it never edits files). If it is a conversation the user starts, use `--when request`; the user runs it with `/software-factory:ask <role>`. If it is a check on every task, use `--when task`: it runs after the tests and the security gate, reports to the reviewer, may add backlog items, and never blocks. Then `factory team add "<title>" --role <role> --when <request|task> --instruction "<text>"`.
5. Ask before every change, run it, and show the result. The command refuses a change that breaks a rule and says which: the builder can never review its own work, only one role writes code, `B1` `B2` `C1` (spec, build, review) cannot be switched off, and parts that run as one stage (`B2` with `V1`, `S1` with `S5` and `Q2`, `K2` with `K4`) stay together. Explain a refusal plainly and offer what would work.

This command changes only who does what. Model choices are in `factory.config.json` or the Models page of the GUI. Say when a change added a role: it starts with a default model.
