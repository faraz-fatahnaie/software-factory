---
name: git
description: Set up git and GitHub for this project (a private repository, the remote, .gitignore), or see what is waiting to be pushed or merged. Only when the user asks to set up version control, GitHub, pushing or pull requests.
argument-hint: [what you want]
disable-model-invocation: true
allowed-tools: Bash(factory role:*) Bash(factory vcs) Bash(factory add:*) Bash(git status:*) Bash(git remote:*) Bash(git log:*) Bash(gh auth status)
---
`factory` is the software factory's command-line tool; this plugin puts it on the PATH.

Your instructions for this conversation come from the factory. Run:

`factory role G1 G2`

Its output is your complete instructions. Follow it exactly, starting now. Commands that change anything outside this machine (`git init`, `gh repo create`, `git push`, `factory push`, `factory merge`) are deliberately not pre-approved: the user's permission prompt is their approval, so never try to get around it. What the user said they want, if anything: $ARGUMENTS
