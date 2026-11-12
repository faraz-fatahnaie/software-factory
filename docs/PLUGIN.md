# Building and publishing the plugin

How the software factory is packaged as a Claude Code plugin, and the rules to follow when
changing or releasing it. The facts below come from the official Claude Code plugin docs
(read 2026-11-12): [plugins](https://code.claude.com/docs/en/plugins),
[reference](https://code.claude.com/docs/en/plugins-reference),
[marketplaces](https://code.claude.com/docs/en/plugin-marketplaces),
[discover and install](https://code.claude.com/docs/en/discover-plugins).
Re-read them before a release; plugin behaviour changes between Claude Code versions.

## Two things in one repository

| | Where | Ships to users |
| --- | --- | --- |
| **The product** | `plugin/` | Yes, and nothing else does |
| **Developing the product** | everything outside `plugin/`: `tests/`, `e2e/`, `docs/`, this repo's `.claude/`, `AGENTS.md`, `BACKLOG.md`, `factory.config.json` | No |

Claude Code copies only the plugin folder into its cache when a user installs, so a file
outside `plugin/` cannot reach a user. That is the whole separation: **anything the product
needs at runtime must live inside `plugin/`, and nothing dev-only may.**

This repo is also a project that uses the factory (its own role files, backlog and config are
an ordinary installation). The factory is not used to develop itself: a broken working copy
could disable its own guardrails mid-run.

## Layout

```
.claude-plugin/marketplace.json   the marketplace: one plugin, source "./plugin"
plugin/
  .claude-plugin/plugin.json      manifest (only this file goes in .claude-plugin/)
  skills/<name>/SKILL.md          the slash commands, invoked as /software-factory:<name>
  bin/factory                     on the Bash tool's PATH while the plugin is enabled
  engine/                         pipeline, runner, hooks, worktrees, event log, server
  gui/                            the control-plane page
  templates/                      what `init` writes into a project
```

## Rules that come from how plugins work

1. **Everything sits at the plugin root except the manifest.** `skills/`, `bin/`, `hooks/`
   and the rest are siblings of `.claude-plugin/`, never inside it.
2. **Commands are skills.** Use `skills/<name>/SKILL.md`; the docs call `commands/` the older
   format. A skill named `init` is invoked as `/software-factory:init`.
3. **The install path changes on every update.** Never store state in the plugin folder and
   never hard-code its path. Inside skills, hooks and MCP config use `${CLAUDE_PLUGIN_ROOT}`;
   inside the engine use `import.meta.dir`.
4. **State that must survive updates goes in `${CLAUDE_PLUGIN_DATA}`** (the list of
   initialized projects, for example). Per-project state goes in the project.
5. **The plugin variables are not in the environment of Bash-tool commands.** They resolve in
   skill bodies and hook commands only. `bin/factory` finds the engine from its own location.
6. **Paths may not leave the plugin root.** `..` and symlinks pointing outside are rejected.
7. **Role files are project files, not plugin agents.** Plugin-shipped agents ignore
   `permissionMode` and `hooks`, and factory stages load project settings only. `init` copies
   the role templates into the project's `.claude/agents/`, where the project owns them.
8. **Dependencies.** If the plugin root has `package.json` plus a lockfile, Claude Code installs
   them itself with exact versions and no lifecycle scripts. The aim is to need none at
   runtime: the engine uses only Bun built-ins, and the GUI is to be shipped prebuilt.
9. **`version` in `plugin.json` pins what users get.** They stay on it until the string
   changes, so every release must bump it. Without it, every commit counts as an update.
10. **Bun is a prerequisite on the user's machine.** `bin/factory` says so when it is missing.

## Scopes

Users choose where the plugin is enabled: `--scope user` (every project, recorded in
`~/.claude/settings.json`), `project` (recorded in the repo's `.claude/settings.json`, so
collaborators are prompted to install it) or `local`. The product must work in all three. At
user scope the GUI is meant to show every initialized project; at project scope, that one.

## Developing and testing

```sh
bun test && bun run typecheck && bun run e2e    # this repo's checks
claude plugin validate plugin                    # the plugin manifest and components
claude plugin validate .                         # the marketplace
claude --plugin-dir ./plugin                     # load the working copy into a session
```

`/reload-plugins` picks up changes inside a running session. Test the installed shape, not
just the working copy: copy `plugin/` alone to a temporary folder and run `bin/factory` from
there against an unrelated project, because that is what a user's cache looks like.

## Release checklist

1. All checks above pass, including a run from a copied `plugin/` folder on a non-JavaScript project.
2. Bump `version` in `plugin/.claude-plugin/plugin.json` (and `package.json`).
3. Update `README.md` with the install lines for the real repository.
4. Commit, then tag. `claude plugin tag` creates `software-factory--v<version>`.
5. Push to the public GitHub repository. Users install with:
   ```
   /plugin marketplace add <owner>/<repo>
   /plugin install software-factory@software-factory
   ```
6. Users on third-party marketplaces do not auto-update by default; they run
   `claude plugin marketplace update software-factory` and `claude plugin update software-factory@software-factory`.

Listing in Anthropic's public directory is optional and goes through the submission portal
at `claude.ai/directory/manage` (needs a paid plan; review criteria are not published in the
docs). The `owner` in `marketplace.json` and an `author` in `plugin.json` should be filled in
with the real maintainer before the first public release.

## Known gaps

- The GUI still needs `react` from `node_modules`, so `factory serve` returns an error page
  from a copied install. Shipping it prebuilt fixes this.
- There are no skills yet; the commands exist only as `factory <command>`.
