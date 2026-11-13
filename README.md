# Software Factory

A pipeline that takes items from `BACKLOG.md` and runs each one through Triage, Spec, Build,
Check and Review using headless Claude Code, then waits for a person to approve the result.
A local web page shows the whole thing live and lets you steer it.

Release 1 runs every role on Claude models. Other runners (Codex CLI, local models through
Ollama) are queued in `BACKLOG.md`.

## Requirements

- macOS or Linux, `git`, and [Bun](https://bun.sh) 1.2 or newer
- [Claude Code](https://claude.com/claude-code) installed and logged in (`claude` on your PATH)
- `gh`, only if you want approvals to open pull requests
- Chrome, only for `bun run e2e`

## Quick start

```sh
bun install
bun run factory serve          # control plane on http://127.0.0.1:4400
```

In the page: add an item, promote it to Ready, and press Run. Tick **Dry run** first to watch
the pipeline with canned stage outputs and no model calls.

The same from a terminal:

```sh
bun run factory add "Export a VERSION constant from plugin/engine/config.ts"
bun run factory promote F-026
bun run factory run                # top Ready item; or: run F-026 F-027, or: run --parallel 3
git diff HEAD...factory/F-026      # review the work
bun run factory approve F-026      # or: discard F-026
```

## Starting from an idea

You do not need to know what to ask for. Three conversations take you from a rough idea to a
backlog the factory can build; each runs in your own Claude Code session (on whichever model
you have selected, so switch with `/model` first) and asks one question at a time:

| Command | What it does | Saves, after you approve it |
| --- | --- | --- |
| `/software-factory:brainstorm <idea>` | Works out what you want: who it is for, the problem, what success looks like, what is out of scope | `docs/product/brief.md` |
| `/software-factory:research` | Finds similar products on the web, compares them, and helps you decide what to adopt or avoid | `docs/product/research.md` |
| `/software-factory:plan` | Turns the brief into user stories, non-functional requirements, scope, milestones and a task list | `docs/product/requirements.md`, `docs/plan/roadmap.md`, and tasks in the backlog Inbox |

Nothing is written until you approve a draft, every document starts with a
`Status: approved by the user on <date>` line, and the tasks it adds wait in Inbox until you
promote them (`factory promote F-010 F-011 ...`, in the order given). `factory status` shows
which documents exist and the one command to run next.

## How a task flows

1. **Intake.** `BACKLOG.md` has six sections: Inbox, Ready, In progress, Awaiting approval,
   Blocked, Done. People add to Inbox and promote to Ready. Only the orchestrator moves items
   after that, and each move is its own commit.
2. **Isolation.** Each task gets a git worktree at `.worktrees/<F-id>/` on branch
   `factory/<F-id>`. Your checkout is never touched by a build, and tasks can run in parallel.
3. **Stages.** For an ad-hoc item the Planner triages it first (an item that already carries an `Acceptance` line in its backlog detail skips this), then the Architect writes a spec, the Builder implements it,
   the gate (`gate` in `factory.config.json`) runs, and the Reviewer checks the result against
   the spec. A failed gate or a rejected review sends the task back to Build, up to three times.
   Stages hand off through files in the worktree's `.factory/runs/<run>/`, never shared memory.
4. **Approval.** An approved build is committed on its branch and waits under Awaiting approval.
   `approve` opens a pull request if the repo has an `origin`, otherwise merges locally.
   `discard` deletes the worktree and branch and returns the item to Ready.
5. **Follow-ups.** Work an agent finds outside its task goes to Inbox, not into the build.

## Control plane

`bun run factory serve [port]` serves these views:

| View | What it does |
| --- | --- |
| Overview | Agents working, backlog progress, Claude usage and gate pass rate; the pipeline as a line of five stations; throughput over 1 hour, 24 hours or 7 days; who is working now; live activity; what is waiting for you. |
| Backlog | The backlog as a board. Cards show stage state, model, elapsed time and cost. A task panel has the live log with replay, the spec, the review and the diff, with Approve and Discard. |
| Agents | Who is working, the model, effort and fallback chain per role, and spend and pass rate by model, role and task. |
| Logs | Every event from every task, filterable by kind and task. |
| Worktrees | Every task worktree with its branch and state. |
| Studio | Edit `AGENTS.md`, role files and skills; each save is a commit and older versions can be restored. Attach, detach, search and install skills per role. |
| Graph | The graphify knowledge graph of this repository. |

The header shows whether the live connection is up and switches between the dark and light themes.

## Configuration

`factory.config.json`:

```json
{
  "setup": ["bun install"],
  "gate": ["bun test", "bun run typecheck"],
  "roles": {
    "builder": { "runner": "claude", "model": "sonnet", "effort": "medium", "fallback": ["haiku"] }
  }
}
```

- `setup` runs once in each new worktree. `gate` must pass before a build is reviewed.
- Each role that exists today (`planner`, `architect`, `builder`, `reviewer`) has a model, an effort
  level and a fallback chain. A rate limit moves the stage to the next model in the chain.
- Role prompts and tools live in `.claude/agents/<role>.md`, assembled from the responsibilities the role holds (`factory team` shows the team; `factory team apply` rebuilds the files). `AGENTS.md` holds the rules every
  role follows.
- Skills are per role: `bun run factory skill add <owner/repo@skill> --role <role>` installs one
  from [skills.sh](https://skills.sh) and attaches it. A skill is third-party instructions your
  agents will follow, so read it before you attach it.

## Safety model

Enforced in code, whatever the model does:

- **The gate** is run by the orchestrator after every build, and by a hook that stops the
  Builder from finishing while it fails.
- **Only the Builder can change files.** The other roles can read and search, and their writes
  are denied.
- **A guard hook** blocks edits to governance files (`BACKLOG.md`, `factory.config.json`,
  `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.git`, `.factory/`, `graphify-out/`), writes outside
  the task's worktree, and pushes or pull requests by agents.
- **Nothing lands without a person.** Agents cannot commit, push or merge.
- **Runs are isolated from your own Claude setup.** Stages load project settings only, so your
  personal plugins and hooks do not leak into agent output.
- **The server is local.** It binds to 127.0.0.1, rejects requests with a foreign Host or
  Origin, and shows the knowledge graph in a sandboxed frame.

Not enforced, so keep in mind:

- The guard matches shell commands as text. It is not a sandbox: a Builder can still run
  arbitrary code through the tests it writes. Review diffs before approving, and treat a diff
  that touches `plugin/engine/hooks.ts`, the gate or the tests as a change to the guardrails.
- Anything on your machine can call the local server. Do not run it on a shared host.
- The event log in `.factory/events.db` records agent messages and tool inputs. It is not
  committed, but it may contain whatever the agents read.

## Tests

```sh
bun test            # unit and HTTP tests, part of the gate
bun run typecheck   # part of the gate
bun run e2e         # drives the page in your installed Chrome with dry runs
```

## Layout

| Path | Purpose |
| --- | --- |
| `plugin/` | The product: everything a user receives when installing the plugin |
| `plugin/engine/` | Orchestrator: CLI, pipeline, Claude runner, worktrees, hooks, event log, server |
| `gui/` | Source of the control plane page (React, plain CSS); built into `plugin/dist/` |
| `plugin/templates/` | Role files, rules, backlog and config written into a project on init |
| `tests/`, `e2e/` | Unit and HTTP tests; browser end-to-end test |
| `docs/PLUGIN.md` | How the plugin is built, tested and released |
| `.claude/agents/`, `.claude/skills/` | Role prompts and installed skills |
| `AGENTS.md` | Rules for every agent working in this repo |
| `BACKLOG.md` | The intake queue, including what is planned next |
