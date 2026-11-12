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
5. Run `factory init`, passing each command explicitly: `factory init --setup "<cmd>" --gate "<cmd>" --gate "<cmd>"`. Use `factory init` alone only when detection was exactly right. If it reports that this is not a git repository, ask before running `git init`.
6. Report what it created, kept and updated. It never overwrites an existing file, and it commits what it wrote.
7. Offer these stack-neutral skills for the roles, and install only the ones the user accepts. Each is third-party instructions the agents will follow, so say so:
   - `factory skill add obra/superpowers@test-driven-development --role builder`
   - `factory skill add obra/superpowers@verification-before-completion --role builder`
   - `factory skill add getsentry/skills@security-review --role reviewer`
8. Run `factory doctor` and relay anything it flags.

Finish by telling the user the next steps: `/software-factory:add`, then `/software-factory:run`, and `/software-factory:open` for the GUI.
