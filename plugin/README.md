# Software Factory

A team of Claude Code agents that builds software with you, for people who are not software engineers.
You say what you want. The factory turns it into a plan, builds each piece in isolation, checks it,
has it reviewed, and waits for your yes. Nothing reaches your main branch, GitHub or a server
without you.

It works in any language and stack, because the agents read your project and use its own tools.

- **A real team, with faces.** A Product Partner, Planner, Architect, Builder, Tester, Reviewer,
  Security engineer, Scribe and Release engineer, each a robot with a name and a job. You can talk to
  them, see what each one is doing right now, and change who does what.
- **One place to watch it all.** A local dashboard shows what is running, what needs you, what it
  costs, and exactly what changed.
- **You stay in charge.** Approval is a button. Every step that costs money, lands work, pushes or
  deploys waits for you.

> **Example used in these docs.** Dina runs a home bakery, *Crumb*. She wants an order tracker where
> customers pay a deposit by link. Every example, here and in the [runbook](docs/RUNBOOK.md), is her.

## What you need

| | |
| --- | --- |
| **Claude Code**, logged in | The agents are Claude Code sessions. Run `claude` once in a terminal and log in. |
| **Bun** 1.2 or newer | The factory's engine. Install from [bun.sh](https://bun.sh). The plugin tells you if it is missing. |
| **git** | Each task works on its own branch and folder. |
| **gh** (GitHub CLI), optional | Only if you want pull requests. `gh auth login` once. |

macOS or Linux.

## Install

Pick one. All three give you the same plugin.

**1. From the GitHub repository (the usual way).** In Claude Code:

```
/plugin marketplace add faraz-fatahnaie/software-factory
/plugin install software-factory@software-factory
```

The repository is public, so no sign-in is needed to read it.

**2. From a folder on your computer.**

```
/plugin marketplace add /path/to/software-factory
/plugin install software-factory@software-factory
```

**3. Try it without installing.** Start a session with the plugin loaded for that session only:

```
claude --plugin-dir /path/to/software-factory/plugin
```

Choose where it is enabled when you install: just for you in every project (`user`), recorded in the
repository so collaborators are prompted to install it (`project`), or only here (`local`).

To update later: `claude plugin marketplace update software-factory`, then
`claude plugin update software-factory@software-factory`.

## First minutes

```
/software-factory:init        sets up this project: detects your stack, writes the team, rules and backlog
/software-factory:open        opens the dashboard at http://127.0.0.1:4400
```

`init` asks before it writes anything and never overwrites a file you already have. Then talk to the
Product Partner (**Talk** in the dashboard, or `/software-factory:brainstorm`) and tell her what you want
to build.

## What you get

### The pipeline

Every piece of work is one backlog item, and goes through the same stages:

```
Triage → Spec → Build → Check → Security → Review → Summary → you approve
```

Triage only runs for loose ideas. Security only runs when a change touches something sensitive (login,
payments, secrets, data). If the build fails its checks or the review asks for changes, the Builder gets
the findings and tries again, up to three times. Each task runs in its own git branch and folder
(a *worktree*), so several can run at once without touching each other or your files.

### The team

Nine people by default. Make it leaner (6) or fuller (12), or any size from 3 to 12; move any of the 50-odd
responsibilities between people; switch some off; rename roles; add your own responsibilities (advisory,
never able to edit). The dashboard's **Team** view shows what each change would do to the agent count and
the cost of a normal task before you save it.

### The dashboard

| View | What it is for |
| --- | --- |
| **Overview** | What needs you first. Who is working, with a live "Now" line (*Editing `src/orders.ts`*, *Running `bun test`*). A **Health** strip of free checks. Throughput, Claude usage and cost, GitHub status. |
| **Backlog** | The board: Inbox, Ready, In progress, Needs you, Done, and a strip for blocked tasks. Open a task for its pipeline, live activity, spec, review and changes, then **Approve and land**, **Send back with comments** (the Builder changes only what you say, on the same branch and spec), **Update this task** when main moved on while it waited, or **Discard**. |
| **Talk** | Conversations with the people who work with you: brainstorm, research, plan, design, test, security review, documents, GitHub. Each can suggest your next message. **Bix**, the Guide, answers questions about the tool and never changes anything. |
| **Team** | The robots, their jobs and models; change the team with a preview. Click a robot for their panel: live feed, files touched, recent stages. |
| **Agents** | The model, effort and fallbacks for every role, and what each cost. |
| **Source** | Git as you know it from GitHub and VS Code: changes, a commit graph with search, diffs, revert. |
| **Studio** | Edit the rules, role prompts and skills, with a two-step save that commits. |
| **Logs, Worktrees, Graph** | Every event, every task folder, and a map of how your code connects. |
| **Command palette** (`⌘K` / `Ctrl+K`) | One box to run the factory's checks, jump anywhere, and ask Bix. |

### The commands

Everything in the dashboard also exists as a slash command. Commands that spend usage, land work or
delete it can only be started by you.

| Command | What it does |
| --- | --- |
| `/software-factory:init` | Set up the project. |
| `/software-factory:brainstorm`, `:research`, `:plan`, `:design` | Conversations that turn an idea into documents and backlog items. |
| `/software-factory:add <what>` | Put an idea in the Inbox. |
| `/software-factory:run` | Run the top Ready item, or the ones you name. |
| `/software-factory:status` | Where every task stands, and the next step. |
| `/software-factory:approve`, `:reject`, `:update`, `:discard` | Accept, send back with your comments, bring up to date with main, or throw away a finished task. |
| `/software-factory:git` | Set up git and GitHub with you; see what is waiting to be pushed. |
| `/software-factory:test`, `:secure` | Check against the user stories; security and performance review. |
| `/software-factory:docs` | Bring the README and documents up to date. |
| `/software-factory:release`, `:deploy` | Prepare a release; deploy, only when you ask. |
| `/software-factory:team`, `:ask` | Change the team; ask which person handles something. |
| `/software-factory:open`, `:doctor` | Open the dashboard; check the setup. |

The same engine has more commands for the terminal: `factory add | promote | run | approve | reject | update | discard |
push | merge | revert | sync | vcs | team | configure | scan | release | status | doctor`
(`factory` is on your PATH while the plugin is on).

## What you can change, and what you cannot

**You can change** (all of it from the dashboard or a file in your project):

| | Where |
| --- | --- |
| Who is on the team, what each person takes care of, names and titles | Team view; `factory team ...` |
| Which model, effort and fallbacks each role uses, even per stage | Agents view; `factory.config.json` |
| The commands that must pass before a review (tests, lint) and the setup command | `factory configure`; `factory.config.json` |
| The rules every agent follows | `AGENTS.md`, in Studio |
| A role's instructions and tools | `.claude/agents/<role>.md`, in Studio. Edits survive a rebuild unless you ask to overwrite. |
| Skills, per role | Studio: attach, detach, search skills.sh and install |
| What counts as sensitive for the security review | `security` in `factory.config.json` (always, paths, keywords) |
| Auto-merge of pull requests (off by default) | The GitHub tile, `factory vcs auto-merge on` |
| Whether a person's conversation suggests your next message | The switch in the chat header |
| Whether the code graph is built | `graph` in `factory.config.json` |

**You cannot change, on purpose:**

- Agents cannot edit `BACKLOG.md`, `factory.config.json`, `AGENTS.md`, `.claude`, `.git`, `.factory`, or
  push to GitHub or open pull requests. A guard blocks it, and only you and the factory change them.
- Only the Builder changes code. Everyone else reads and writes documents.
- Nothing deploys automatically. Nothing lands without your approval.
- Secrets never go in files. Settings hold the *name* of an environment variable, never its value.
- The factory's own code. It is replaced when the plugin updates. Change behaviour through settings, role
  files, rules and skills, which belong to your project.

## Where things live

Everything the factory makes is in your project, so you can read it, commit it, and remove it:

| | |
| --- | --- |
| `BACKLOG.md` | The plan: six sections, one line per item. |
| `factory.config.json` | Models, the gate, the team, settings. Holds no secret values. |
| `AGENTS.md`, `.claude/agents/`, `.claude/skills/` | Rules, role prompts, skills. |
| `docs/` | Brief, research, requirements, roadmap, architecture and decisions, the chronicle of what was done. |
| `.worktrees/<F-id>/` | One folder and branch (`factory/<F-id>`) per task in flight. Not committed. |
| `.factory/` | Run files and the event log. Not committed. |

## Learn more

The [runbook](docs/RUNBOOK.md) is a complete course: one bakery, from the first idea to a deployed
release, including **what happens, step by step, when you ask for a feature**, and everything that can
go wrong on the way and what you see when it does.
