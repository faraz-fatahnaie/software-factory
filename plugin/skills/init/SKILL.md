---
name: init
description: Set this project up for the software factory. Use when the user asks to initialize, install or set up the software factory in a project.
disable-model-invocation: true
allowed-tools: Bash(factory *)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH. It does the work. Do not perform pipeline stages, edit `BACKLOG.md`, or commit on its behalf.

Set up the current project. It can be in any language.

1. Run `factory detect`. It prints the stack it recognised and the `setup` and `gate` commands it would use. `setup` runs once in each new task worktree (installing dependencies). `gate` is the project's fast, deterministic checks (tests, type check, lint); every build must pass it before review.
2. Check that proposal against the project: look at the README, the CI configuration and any task runner for the real test and lint commands. Detection only reads marker files at the top level, so correct it where it is wrong or empty.
3. Show the user the stack, setup and gate you intend to use and ask them to confirm or change them. If there is no usable gate, say that builds will then be checked only by the reviewer, and ask whether to continue.
4. Try the gate on the project as it is: `factory gate "<cmd>" "<cmd>"`. A gate that fails on an untouched project would block every task, so fix the commands (or tell the user what is failing) before going on.
5. Choose the team. Run `factory team presets` and explain the three options in plain words: **Lean** (6 roles) for a small or personal project where the user is the only person affected and nothing sensitive is handled; **Balanced** (9 roles, the default) for most projects; **Full** (12 roles) for a product that handles personal data or payments, or that several people depend on. A normal task uses three agents in every team; the bigger teams add specialists who only join when needed. Ask the user a question or two about the project, recommend one with the reason, and let them choose. They can change it later with `/software-factory:team`.
6. Run `factory init`, passing each command explicitly and the team: `factory init --team <lean|balanced|full> --setup "<cmd>" --gate "<cmd>" --gate "<cmd>"`. Leave out `--team` for the default (balanced), and use `factory init` alone only when detection was exactly right. If it reports that this is not a git repository, ask before running `git init`.
7. Report what it created, kept and updated. It never overwrites an existing file, and it commits what it wrote.
8. Offer these stack-neutral skills for the roles, and install only the ones the user accepts. Each is third-party instructions the agents will follow, so say so:
   - `factory skill add obra/superpowers@test-driven-development --role builder`
   - `factory skill add obra/superpowers@verification-before-completion --role builder`
   - `factory skill add getsentry/skills@security-review --role reviewer`
9. Run `factory doctor` and relay anything it flags.

Finish by telling the user the next step. To start from an idea, run `/software-factory:brainstorm <idea>`; to queue a specific piece of work directly, `/software-factory:add`, then `/software-factory:run`. `/software-factory:open` shows the GUI.
