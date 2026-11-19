# Runbook: building a product with the Software Factory

A complete course. One small business, from the first idea to a release, using every part of the tool.

**The story.** Dina runs a home bakery called *Crumb*. Orders arrive by text and DMs, and she loses track of
them. She wants a small web app: she enters orders, customers pay a deposit by link, and she sees what is due
this week. She is not a software engineer. Everything below is what she does, what the team does, and what
she sees.

Each chapter says what you do, what happens, and where to look. Slash commands (`/software-factory:...`) work
in Claude Code; everything also has a button in the dashboard.

**Chapters**

1. [Before you start](#1-before-you-start)
2. [Meet the team](#2-meet-the-team)
3. [From an idea to a backlog](#3-from-an-idea-to-a-backlog)
4. [**A feature, start to finish**](#4-a-feature-start-to-finish) — the one to read first
5. [**What can happen on the way**](#5-what-can-happen-on-the-way)
6. [Keeping control](#6-keeping-control)
7. [GitHub, checks and undoing](#7-github-checks-and-undoing)
8. [Release and deploy](#8-release-and-deploy)
9. [Cheat sheet](#9-cheat-sheet)

---

## 1. Before you start

**You need:** Claude Code (logged in), Bun, git, and optionally the GitHub CLI. See the
[README](../README.md#what-you-need) for the install lines.

**Dina's first minutes**

1. In an empty folder she runs `git init`, then starts Claude Code there and installs the plugin.
2. `/software-factory:init`. Claude looks at the folder (empty, so no stack yet), explains the three team sizes
   in plain words, and asks a question or two. Dina handles customers' deposits, so it recommends **Full**
   (thirteen roles, because money is involved). She agrees.
3. It writes `BACKLOG.md`, `AGENTS.md`, `factory.config.json`, the role files and `docs/`, and commits them.
   It never overwrites a file that exists.
4. `/software-factory:open`. The dashboard opens at a link on `127.0.0.1` (port 4400-4499, one per project, so several projects can run side by side).

**What she sees.** Overview says "Nothing is waiting for you". The Health strip is green or shows one thing to
look at (for example that no gate commands are configured yet, because there are no tests). Press `⌘K` any time to
run the factory's own checks or jump to any view.

> The payment provider's key will never be written into a file. When it is needed, the plan names an
> environment variable (for example `PAYMENT_API_KEY`) and Dina sets its value on her own machine and on the
> server. The factory's secret scan blocks any task that tries to put a key in a file.

## 2. Meet the team

Open **Team**. Each person is a robot with a name, a job and a model.

| Person | Job | Works |
| --- | --- | --- |
| **Mara** | Product Partner: works out what you want | In Talk, with you |
| **Idris** | Planner: stories, milestones, tasks | In Talk |
| **Tess** | Technical Manager: the face of the team. Talk to her first: she answers, or asks the others and brings you their answers; she says where things stand, why a task stopped and what to do. She also triages loose ideas | In Talk ("Talk to the team"), and on loose ideas |
| **Noor** | Architect: stack, design, and the spec for each task | In Talk, and on every task |
| **Kofi** | Builder: writes the code, tests first | On every task. The only one who changes code |
| **Lena** | Tester: checks the product against the stories | In Talk |
| **Sade** | Reviewer: correctness, scope, guardrails | On every task |
| **Zane** | Security and performance | In Talk, and on risky tasks |
| **Wren** | Scribe: documents and the chronicle | After each approved task |
| **Rafi** | Release engineer: git, GitHub, releases | In Talk and by command |

A normal task uses three of them (Noor, Kofi, Sade). The others join when needed. Click any robot for their
panel: what they are doing right now, the files they touched, their recent stages.

**Try it:** in Team, press *Preview* on a different preset. The agent count and the cost of a normal task change
on screen, and nothing is saved until you say so.

## 3. From an idea to a backlog

Dina does not need to know what to ask for, or whom. **Talk** opens on **Talk to the team**: one conversation
with Tess, the Technical Manager. Dina writes what is on her mind, and Tess answers, or asks the people it
concerns (up to three, who only read) and brings back one reply. What Tess looked at and whom she asked is a
folded list under the reply.

- **Show, do not describe.** Dina attaches a photo of her paper order form and the PDF price list: the button
  next to the message box, drag and drop, or paste. Up to eight files (pictures, PDF, text and code).
- **Keep typing.** A message sent while a reply is coming waits its turn. **Stop** ends a reply, and
  **Clear** (or typing `/clear`) starts a clean one. When a conversation gets long, **Compact** (or `/compact`,
  optionally followed by what to keep) makes the agent keep a summary instead of every message; her messages stay
  on screen. Typing `/` lists the commands, including the skills installed in the project; arrow keys choose, Enter uses one. Each conversation is kept in the project (`.factory/chats/`, never
  committed), so it is still there after she closes the dashboard or opens it in another browser. A small meter
  under the person's name shows how full the conversation's context is.
- **Any language.** Replies are formatted, and right-to-left text reads correctly.

When the Architect proposes the checks every build must pass, the reply shows them with an **Apply setup**
  button: read the commands, then press it to record them (nothing changes before that).

To work something out in depth she picks the person, and that person asks one question at a time:

1. **Brainstorm** (`/software-factory:brainstorm`, or Talk → Mara). Who is it for, what problem, what does
   success look like, what is out of scope. Saves `docs/product/brief.md` only after Dina approves a draft.
   Each reply can end with suggested next messages you click.
2. **Research** (optional). Mara finds similar products on the web, compares them, and helps Dina decide what
   to copy or avoid. Saves `docs/product/research.md`.
3. **Plan** (`/software-factory:plan`). Idris turns the brief into user stories with acceptance criteria and
   non-functional requirements (for example "loads in under a second for 500 orders"). With no technology
   chosen yet, she stops there.
4. **Design** (`/software-factory:design`). Noor proposes a stack with reasons Dina can follow, designs the
   system, records decisions, defines the project's checks (the *gate*), and suggests skills for each role.
   Nothing is installed without a yes. Writes `docs/architecture/`.
5. **Plan again.** Idris now breaks the design into milestones and into tasks "sized for one pipeline run,
   in dependency order". They land in **Inbox**. Each task carries its milestone, the stories it serves, what it depends on, its
   acceptance checks and what is out of scope, and is small enough for one reviewer to read in one sitting.

The tasks wait in Inbox, and adding to the Inbox never builds anything. By default Tess is on **autopilot**: when
Dina tells her to build them (or presses Promote), they move to **Ready** and Tess starts them, one task at a time, and
each one still stops for Dina's decision before anything lands (see [Autopilot](#autopilot); a one-time notice in the
dashboard says so, with the off switch). With autopilot off, nothing runs until a person promotes an item and runs it.

**What she sees:** each document has a line `Status: approved by the user on <date>` and is committed as it is
saved (task agents work from the last commit). `factory status` (or `/software-factory:status`) always
shows what exists and the one command to run next.

**Ask Bix.** At any point, `⌘K` → type a question → *Ask Bix*, or Talk → Bix. Bix reads the project, explains
what is happening and how to change a setting, and cannot change anything.

---

## 4. A feature, start to finish

This is the main loop, and the one you will repeat. Dina asks for a feature, and we follow it from her words
to code on `main`, naming what is produced at every step.

> **Dina:** "Customers should pay a deposit through a payment link, and the order should wait for the deposit."

### Step 0. Ask

Three ways, from smallest to biggest. They all end in the same place: a line in Inbox.

| If the request is... | Do this | What happens |
| --- | --- | --- |
| **Small and clear** | **Backlog → Add item**, or `/software-factory:add "…"`. Add a description beginning `Acceptance:` and a priority. | The item already has its checks, so **triage is skipped**. |
| **A loose idea** | The same, with no acceptance checks. | **Triage runs first**: Tess classifies it (feature, bug, chore or docs), sizes it (and says how to split it if it is large), lists backlog items it overlaps, and writes the acceptance checks and any open questions. She does not design or write code. If triage finds the idea too large for one task, or cannot say how to check it, the task stops there as **not ready**, before anything is specified or built: split it, or say in the item what done looks like, and run it again. |
| **Big or unclear** | Talk → Mara (or Idris, `/software-factory:plan`) | A conversation that ends in several small tasks in dependency order, each with checks. |
| **Not sure which** | Talk → **Talk to the team**, and say it to Tess | She adds it for you, or brings in the person it needs. |

Dina types it in **Backlog → Add item** with priority P1. It becomes `F-007` in **Inbox**.

*Nothing has run and nothing has cost anything.*

### Step 1. Promote

On the card, **Promote to Ready** (or `factory promote F-007`). Ready is run from the top: the first
card says "Runs first". This is your last chance to rethink before any usage is spent: on autopilot, Tess starts
the top Ready card herself when nothing else is running.

### Step 2. Run

Tess starts it, or Dina does not wait: on the Ready card press **Run** (or **Run next**, with a number to run several at once, each in its own
folder; or `/software-factory:run F-007`). Tick **Dry run** first to watch the whole pipeline with canned
outputs and no model calls.

The factory creates a branch `factory/F-007` and a folder `.worktrees/F-007`, runs the project's setup there,
and starts the stages. Dina's own files are never touched while it works.

### Step 3. Watch (or do not)

Close the laptop if you like. You can also follow it live:

- **Overview → the manager's strip.** What Tess is doing, her last decision in one sentence ("F-007 was next in
  line, so I started it"), today's spend against the day's limit, and the list of everything she decided.
- **Overview → On shift.** Kofi's card says *Building F-007*, with a live line: *Editing `src/orders/deposit.ts`*,
  *Running `bun test`*, and the last few actions. If an agent has been quiet for two minutes, the line turns
  amber: "No activity for 3 min".
- **Backlog → open F-007.** A pipeline map with each person's robot, time and cost per stage; **Activity**
  with every tool call in plain words and a replay slider.
- **Click Kofi's robot** for his panel: live feed, the files he has read, edited and written.
- **Notifications.** Turn on *Notify me* in the rail and the browser tells you, while its tab is hidden, when
  someone finishes or gets stuck.

### Step 4. The stages, one by one

Each stage reads the files the earlier ones wrote in the run folder and writes its own. The last reply of a
stage is its output.

| # | Stage | Who | What happens | What it leaves |
| --- | --- | --- | --- | --- |
| 0 | **Triage** | Tess | Only for loose ideas: type, size, overlaps, acceptance checks, open questions. Skipped when the item already has an `Acceptance:` line. | `triage.md` |
| 1 | **Spec** | Noor | Writes the contract for this task: the change, the files, the tests, what is out of scope. | `spec.md` |
| 2 | **Build** | Kofi | Writes the failing test first, then the least code that makes the spec pass, and runs the gate until it does. | `build.md`, the code on the branch |
| 3 | **Check** | the gate | Runs *your* commands (tests, type check, lint). Not an agent. It must pass before anyone reviews. | pass or fail, with the output |
| 4 | **Security** | scripts, then Zane | Scripts always scan the change for hard-coded secrets (free). A model reviews it only if the change touches something sensitive: login, payments, secrets, data. A deposit link touches payments, so **Zane reviews this one**. | `security.md` |
| 5 | **Review** | Sade | Judges correctness, scope, maintainability, and that no guardrail was weakened. Her answer's first line is exactly `APPROVE` or it counts as *changes requested*. | `review.md` |
| 6 | **Summary** | Wren | After an approved review, writes the chronicle entry and notes for the roles. A failure here never blocks the task. | `docs/` entry |

The run folder is `.factory/runs/<run id>/` (not committed). The log keeps every attempt even when a file
keeps only the latest.

### Step 5. It stops and waits for you

When Sade approves, the card moves to **Needs you** and the tab title shows `(1)`. Overview says
"Sade finished and is waiting for your review of F-007". The task's **Summary** has a card, *Checked before it
reached you*: the checks pass, the security check is clean, the review approved it, how many files changed, and
anything worth a look (for example "Code changed, but no test was added or changed with it").

### Step 6. Review what it did

Open the task (or press **Review changes**). It opens on **Changes**: a file tree with `M`, `A`, `D` letters
and +/− counts, and a diff of each file. Read the **Review** tab for Sade's verdict and **Spec** for what was
agreed. The cost and time of every stage are on the stepper.

You can also read it in a terminal: `git diff HEAD...factory/F-007`.

### Step 7. Decide

- **Approve and land.** Without GitHub, the work is merged into `main` on your computer, the task moves to
  **Done**, and the folder is removed. With a GitHub `origin`, the branch is kept and nothing is pushed yet
  (see chapter 7). Wren's summary and role notes are committed.
- **Send back with comments.** Not quite right? Press it, say what to change (starter chips and free text, and optionally which changed files you mean), and **Send back to Kofi**. The task moves back to In progress as **Round 2**: Kofi continues on the same branch with the same spec and changes only what you said, then the checks, the security review and Sade's review run again, and it returns to **Needs you**. Your comments stay on the card and in the panel. If you are really asking for something new, add it as a new item instead. From a terminal: `factory reject F-007 --feedback "…"`.
- **Discard this work.** Asks once, in place. The branch and folder are deleted.
- **Neither yet.** It waits. If a task waits more than a day, the Health strip says so.

### Step 8. After it lands

The task is in **Done**, `main` has the change, and `docs/` has the chronicle entry. Dina can now start the
next feature, run several at once, or ask Lena to test the whole product against the stories.

**Timeline, in one picture**

```
Ask → Inbox → Promote → Ready → Run
   → [Triage] → Spec → Build ⇄ Check ⇄ Security ⇄ Review → Summary
   → Needs you → Review changes → Approve and land → Done
```

The arrows between Build, Check, Security and Review run both ways: any of them can send the work back to the
Builder. That is the next chapter.

---

## 5. What can happen on the way

Almost always the flow above is all you see. These are the other things, what the dashboard shows, and what
(if anything) you do.

### The factory fixes itself

| What happens | What you see | What it does |
| --- | --- | --- |
| **The checks fail** (a test, the type check, lint) | Check turns red in the stepper; Build starts again | Kofi gets the failing output as feedback and fixes exactly that. Up to **three builds** in total. |
| **A secret is found in the change** | Security fails with where (never the value) | Kofi is told to remove it, read it from the environment, and list the setting by name in the example settings file. It loops like any failure. |
| **Zane is not satisfied** | Security fails with his findings | A reply that is not exactly `SECURE` on the first line counts as blocked. The findings go to Kofi, who may adapt a suggested patch. |
| **You send it back** | The card returns to In progress with "Round 2" and your words under it | Kofi gets your comments as feedback, the spec is kept ("kept" on the stepper), and Build, Check, Security and Review run again. A new round has its own three builds. |
| **Sade asks for changes** | Review shows *changes requested*; Build starts again | Her review is the feedback. Anything but `APPROVE` on the first line counts as a request for changes. |
| **A model is rate limited** | A warning line "Rate limited on opus; trying the next model" | The stage moves down that role's **fallback chain** (for example opus → sonnet → haiku). Only rate limits do this. |
| **The agent tries something forbidden** (editing `AGENTS.md`, pushing, opening a pull request) | `denied: …` on the stage | The guard blocks it. The agent is told to list the change under *Follow-ups* instead. |
| **The agent found more to do** | *Follow-ups* appear as new items in Inbox | They wait for you to promote. The agent stays in scope. |

### It stops and needs you

The card moves to the red strip at the top of the board: **Blocked**. On autopilot Tess has already looked: a
rate limit or a passing error she tries again herself, and after builds that did not pass (or two attempts in a row
that changed nothing) she sends Kofi guidance once. What is left is yours. She never goes round again and again:
see *When autopilot stops itself* below. Open it (*Look into it*) and the Summary says what
failed, with the output, and under *The manager* what Tess decided and why, in plain words. Then:

| Why it is blocked | What it means | What to do |
| --- | --- | --- |
| **Blocked from outside** ("It cannot go on until something outside it changes: …") | The Architect, Kofi, Zane or Sade said `BLOCKED:` because something outside the task is missing, most often another task's code that is not merged into main yet, or a decision only you can make. Nothing was retried, because no change by Kofi can fix it | Do what the reason says (merge the other task, decide), then **Retry** |
| **Waits for your yes** ("It plans risky work, so it waits for your yes: …") | The spec says the change touches login or permissions, deletes or rewrites stored data, payments, secrets or a deploy. The run stopped before anything was built; nobody but you can start it again | Press **Read the spec**, read the Spec tab, then press **Build it** (or `factory run F-012 --anyway`). If the spec is not what you want, edit the item and **Retry**, or discard it |
| **Stuck** ("Another attempt would end the same way") | Two attempts in a row changed nothing | Open **Activity** and **Review**: usually the spec asks for something that cannot be done. **Send guidance**, or discard and split the item |
| **No approved build after 3 attempts** | Kofi and the checks or Sade could not agree | Open **Activity**: read the last findings. Often the spec was too big. Press **Send guidance** and say what Kofi should do differently, or discard and split the item, or edit the item's description, then **Retry**. |
| **Not ready** | Triage found the idea too large for one task, or could not say how to check it, and nothing was built. Or the change grew far beyond one task's size (`CONSTRAINTS.md`) and two reviews could not approve it | Split it, or add an `Acceptance:` line that says what done looks like, then **Retry**. |
| **Every model in the chain is rate limited** | You have used your Claude allowance for now | Wait for the window to reset (the Overview meter shows when), then **Retry**. Or give the role a longer fallback chain in Agents. |
| **The Claude command line is not logged in** | An authentication error. The factory does *not* retry it on another model, because that would hide the problem | Run `claude` in a terminal and log in, then **Retry**. |
| **A stage failed to start** | A broken role file or settings | `⌘K` → *Is the setup right?*, or ask Bix. Fix it in Studio, then **Retry**. |
| **You pressed Stop** | The stages end and the task moves to Blocked | **Retry** when you want it, or **Discard**. |
| **Main moved on while it waited** | The card shows "Main moved on" and the panel says "main has 2 new commits since this was built". If the same code changed, Approve stops with "conflicts with work that landed after it was built; nothing was merged" | Press **Update this task** (or `factory update F-007`). Main is merged into the task's own branch; nothing is pushed. No clash: only the checks run again. A clash: Kofi resolves just those files and everything runs again as a new round ("Update from main · round N" on the card). If it cannot be finished, or the checks fail with the new main, the branch is put back exactly as it was. Once a task is approved and waiting for its pull request, update is not available: discard it and run it again. |

**Retry** starts a fresh run from the beginning with the same item. **Send guidance** (on a task that got as
far as a spec) continues on the same branch with the same spec, and Kofi reads your words first. **Discard** asks once, in place, and deletes
the branch and folder. Neither affects `main`.

### Things around the pipeline

- **Two tasks at once.** Each has its own folder. They can only collide when they are *approved*, which is the
  "main moved on" case above, and Update fixes it.
- **Cost.** Each stage's cost appears when it ends. Overview shows usage against Claude's five-hour and weekly
  windows; the Health strip warns at 80%. **Agents** has the model and effort per role.
- **The dashboard says something is wrong.** The Health strip checks, for free and without a model: setup,
  secrets, rule or role edits that were never committed (agents start from the last commit and would not
  see them), a gate that checks nothing, a task waiting over a day, and usage near the limit. Each has *Explain*.
- **The server is stopped.** The page says so and keeps the last data. Start it again with
  `/software-factory:open`. Running tasks live in their own processes, so closing the page does not stop them.
- **You edited a rule while a task ran.** The running stage keeps the prompt it started with. The change applies
  to the next stage that starts.

---

## 6. Keeping control

**Who may do what is checked, not hoped for.** Only you approve, push, merge or deploy; only Kofi edits code; Tess
starts, retries and guides work but never builds or judges it; no unattended role reaches outside the project.
`factory authority` prints who may do what and whether those rules hold; `/software-factory:doctor` and the Health
strip show the same. A change that would break one is refused before anything is written: moving a responsibility
in Team, giving a skill to a role, saving a role file or a skill in Studio. A skill that is already installed and
asks for more than a role should have (for example the shell wholesale) is shown as worth a look, not refused, so an
update never locks you out; installing or attaching one is refused.

| You want to... | Do this |
| --- | --- |
| Change who does what, or the team size | **Team** → pick a preset or size, move a responsibility, switch one off, fold two roles together. Read the preview, then save. |
| Use a smarter or cheaper model | **Agents** → *Models per role*: model, effort, fallback chain. Applies to the next stage. |
| Change a rule every agent follows | **Studio** → `AGENTS.md`. Edit, **Review changes**, **Commit**. The save is two checks, and a change can be discarded. |
| Change how one person works | **Studio** → their role file. Add or remove their skills in the side panel. |
| Add a skill | **Studio** → pick a role → *Find more skills on skills.sh* → *Install*. It warns that a skill is third-party instruction before installing. |
| Change the project's checks | `factory configure` or edit the `gate` in `factory.config.json`. |
| Treat more changes as sensitive | `security` in `factory.config.json`: extra paths and keywords. |
| Ask what is happening, or why it failed | `⌘K` → type your question → *Ask Bix*. |
| See what a person did | Click their robot. |
| Undo a Studio edit | Studio → the file → **History** → pick a version → *Restore this version* (the same two checks apply). |

## 7. GitHub, checks and undoing

The factory uses git and GitHub by default. The rules are fixed on purpose:

**Several tasks waiting, and the order to merge them.** Approving keeps a task on its own branch, so finished tasks pile up
on branches built from the same `main`, and merging one can make the others clash. The Pull requests tile shows **Order to
merge** (and `factory integrate` prints it): what is waiting, which tasks clash with `main` or with each other, and the
order, with dependencies first and independent tasks together. A pull request that says "conflicts" has an **Update this
branch** button: the Builder resolves the clash in the task's own folder (a clean merge needs no new yes), then **Push**
sends the update to the pull request. On autopilot Tess does the update herself while it is cheap, and starts no new work
while three approved tasks are not merged (`factory manager set unmerged N`). Merging stays yours.

- Work always lands through a **pull request that you merge** into `main`. Auto-merge exists and is **off**.
- A push needs your explicit yes: the **Push** button, or approving it in the Release engineer's chat.

**Set up.** `/software-factory:git` (or Talk → Rafi). Rafi checks `gh`, and with your yes creates a private
repository and sets `origin`. Credentials never go in the project.

**The loop with GitHub.**

1. Approve F-007. The branch is kept; **nothing is pushed**. The Overview **GitHub** tile lists it under
   *Ready to push*.
2. **Push** (or `factory push F-007`). The factory first scans for secrets, then pushes the branch and opens a pull
   request with the spec and review in its description.
3. Checks run on GitHub. The tile shows them. If one fails, **Add to backlog** on the pull request adds an item that names the failing checks, with links to
   their logs, so the Builder can fix it as a normal task.
4. **Merge** (the green button, or `factory merge F-007`). It refuses while checks fail. The branch is deleted.
5. **Update from GitHub** (`factory sync`) brings `main` up to date, and the rail chip says where you stand.

**Checks on GitHub.** `factory vcs ci` writes a workflow from your gate commands so pull requests have checks.
**One pull request for several tasks.** On a project with no checks and one person approving, a pull request per
task is only clicking. **Push all** asks whether to open one pull request per task, or **Push together**: the tasks
are merged, one after the other, into a new branch (`factory/batch-<time>`) and go up as a single pull request that
lists each task with its spec and review. A task that changes the same lines as an earlier one is held back and
named (push it on its own); nothing goes up if fewer than two merge cleanly, or if the secret scan finds anything in
the whole batch. The pull request shows as one row with its tasks and one Merge button, and merging it tidies every
task branch inside it. The same from the terminal: `factory push F-001 F-002 --together`, then `factory merge batch-<time>`.

**Fewer clicks.** With several tasks waiting, **Push all** (one confirmation that lists them) pushes each branch and
opens each pull request, and **Merge all** does the same for pull requests that can be merged. In Talk, say "push
everything" and Tess offers one button for all of them. If you would rather not push at all as a separate step, turn
on **Push on approval** (`factory vcs auto-push on`): approving a task then pushes it and opens its pull request at
once. The secret scan still runs first, and a push that fails never undoes the approval. It is off until you turn it on.

**Auto-merge** (`factory vcs auto-merge on`) merges as soon as checks pass, and refuses to turn on without a
workflow to wait for. It is yours to enable.

**Undo.** `factory revert F-007` (or **Source → Log → Revert**) undoes a merged task. Locally it adds a
revert commit. With GitHub it goes up as a pull request you review and merge.

**Source.** The **Source** view looks like GitHub and VS Code: *Changes* (a folder tree, letters, diffs),
*Log* (a commit graph of every branch, search by message, author, hash or task, and a diff of any commit).

## 8. Release and deploy

Releases are prepared by Rafi and **never deploy by themselves**.

1. `⌘K` → *Is it ready to release?* (`factory release check`) lists blockers and warnings. *What would a release
   contain?* (`factory release info`) shows the last tag, the changes since, and every file carrying the version.
2. `/software-factory:release`. Rafi works out the version bump with you, updates the version files and the
   changelog, and the factory commits and tags. Nothing is pushed.
3. Share the tag when you choose to.
4. `/software-factory:deploy`. Only when you ask. It goes **one approved step at a time**, smoke-tests the result,
   and offers a rollback if it fails. Every step waits for your yes.

For Crumb, deployment needs the payment provider's key on the server. Dina sets that herself; the factory only
ever knows the variable's name.

## Autopilot

By default Tess runs the work while the dashboard is open. Dina brainstorms with Mara, Mara adds the items to
the Inbox, and they wait there. When Dina says "build these" (to Tess, or with Promote), they go to Ready and Tess
starts them, one at a time. When a task stops, Tess looks at why.
A rate limit or a network error: she waits and tries again (up to twice). Three builds that did not pass: she
writes the Builder guidance and starts a new round. Not logged in, a broken setup command, a clash with main, or a
task Dina stopped herself: Tess tells her, in plain words, and leaves it. She never approves or deploys. Once Dina approves a task, the factory's own code (not a model) pushes it, opens its pull
request and merges it when the checks pass, one task at a time; failing checks or a conflict are left to Dina. It stops starting new work when $25 has been spent in a day or three tasks wait for Dina. Every
decision is in **Logs**.

What Tess may start is narrow on purpose. Under Ready she starts only what Dina promoted, or named to her in Talk ("build F-012";
a plain "yes" to a task Tess just named counts too; a question, "wait" or "don't" never does). Her own ideas are buttons Dina
presses. A start Dina asked for in Talk still keeps the limits: past the day's spending, the number running at once or three approved
tasks not merged, it waits for Dina's press. When Tess sends the Builder guidance, the Builder and the page show it as hers, never as
Dina's. On assist nothing starts and nothing is spent by itself, not even the look back at a finished milestone.

Main moving on is handled carefully: Tess updates one waiting branch at a time, not while the models are short of quota, and only
when the clash is in at most two files. A bigger clash usually means two changes to the same feature, so it goes to Dina, with the
advice that rebuilding is often cheaper. An update that fails says so in the manager's feed. A new task that names a file a finished,
not-yet-merged task changes waits until that one is merged.

To take control: the **Autopilot on · Pause** line in the side bar (on every screen) pauses it at once, and the same line turns it on
again. Or `factory manager assist` (Tess only proposes, Dina presses the buttons), `factory manager off`, or the **Manager** menu in
Talk. `factory manager set perDay 10` changes a limit. With **Notify me** on, a desktop notification says when autopilot pauses itself
or a task needs Dina.

When the last task of a milestone is finished, Tess says so, names what is due now (the documents, a security
audit, a release check) and looks back at what kept going wrong; anything she proposes lands in the Inbox for
Dina to promote. `factory manager report` prints the facts she works from: milestones, what stopped tasks, and
what each role ran, failed and cost.

### New packages (dependencies)

No agent installs a package by itself: it is code from a stranger that runs on Dina's machine. When a task cannot be done
without one, the architect lists it in the spec under `## Dependencies` (`- npm: name@1.2.3 - why`, exact version). That is a
risk like a login or a payment, so the task stops for **Build it** before anything is built; read the package name and the
reason first. After the yes, the factory itself (not a model) installs exactly those packages with install scripts off. A build
that adds any other package is sent back, and a Builder that cannot do the work without another one stops with
`BLOCKED: needs the dependency <name>`. Only npm is installed this way; for any other kind (pip, cargo) the spec still asks for
the yes, and Dina installs it herself.

### Autopilot takes approved work to GitHub

For people who do not use git, autopilot does the git work after Dina approves a task. It is the factory's own code, not a
model, and it works one step at a time: it brings the project's branch level with GitHub (taking in what GitHub has, then
pushing what only this folder has: a plain push, never forced), pushes the next approved task in `factory integrate` order,
opens its pull request, and merges it when its checks pass. It starts at the approval and keeps going in the background
(`factory deliver --watch`), so it does not need the dashboard open; the dashboard's minute sweep is the backup. Only
`factory/*` branches are touched, one pull request moves at a time, and approving a task and deploying stay Dina's.

When it cannot go on it says so once on the Manager strip (and in a notification), in plain words, and waits for her:

- **The checks fail.** It does not merge, and adds an Inbox item describing what failed: promote it and the team fixes it.
- **The pull request conflicts with main.** *Update this branch* has the Builder resolve a small clash (autopilot does this
  itself when it touches at most two files; Dina's yes comes after). For a large clash, **Rebuild it** (`factory rebuild F-014`)
  closes the pull request, drops the old branch and builds the task again on today's main.
- **GitHub refuses the merge** (a required review, a protected branch): it says which rule, and what to do on GitHub.
- **The checks have been pending for over 45 minutes**, or **GitHub is not signed in** (`gh auth login`, once).

### When autopilot stops itself

A task that needs another task's work (a `Depends on: F-005` line, which the Planner writes, and which a follow-up gets
automatically from the task it was found in) waits in Ready until that work is **merged into main**, not only
approved: with a GitHub `origin` an approved task stays on its own branch until you push and merge it. Tess says
"F-050 waits for F-005 (approved, but not merged into main yet)". `factory run F-050 --anyway` builds it without.

Autopilot **pauses itself**, switches to assist (she only proposes) and says why, when:

- two runs in a row failed (a run you stopped does not count);
- you stopped a task, so the next one does not start behind your back;
- more money went out in the last hour than the day's limit allows (about 40% of it);
- she tried to recover tasks four times in the last hour;

and a run that has spent the limit for one task is stopped while it runs. Switch autopilot on again from the Manager
menu; the count starts afresh. Every one of these is in the decision log, and what a conversation costs now counts
toward the day's limit.

## Updating the plugin

When a new version is released, Dina updates from a terminal (not inside the project's chat):

1. `claude plugin marketplace update software-factory`, then `claude plugin update software-factory@software-factory`.
2. She restarts Claude Code, so the new version is loaded.
3. She stops the dashboard that was running, runs `/software-factory:open` again and refreshes the page. An open
   dashboard keeps the old version until then.
4. `/software-factory:doctor` says whether anything in her project needs a look.

Her bakery project is not touched: backlog, config, role files, skills and tasks stay exactly as they were. The
release's entry in `CHANGELOG.md` says if a new setting or responsibility is worth switching on. The full guide,
with auto-update and how to go back, is in the [README](../README.md#updating).

## 9. Cheat sheet

**In the dashboard**

| To... | |
| --- | --- |
| Run anything, check anything, ask Bix | `⌘K` / `Ctrl+K` |
| Add an item, filter, step through tasks | `N`, `/`, `J` / `K` on the Backlog |
| Open or close a task | Click it, `Esc` |
| Switch tabs in a task | `1` to `5` |
| Open a person | Click their robot |
| Ask the team anything | Talk → **Talk to the team** |
| Show a file to the team | In Talk: the attach button, drag and drop, or paste |
| Shrink or restart a conversation | In Talk: **Compact** / **Clear**, or type `/compact`, `/clear` |

**Commands** (slash command, or `factory ...` in a terminal)

| | |
| --- | --- |
| `/software-factory:init` | Set up the project |
| `…:add "<what>" [--priority P1] [--detail "Acceptance: …"]` | Add to Inbox |
| `factory promote F-007` | Inbox → Ready |
| `…:run [F-007] [--parallel 3] [--stub]` | Run (`--stub` = dry run) |
| `…:status` | Where everything is, and the next step |
| `…:approve F-007`, `…:discard F-007` | Accept or throw away |
| `factory push F-007`, `merge F-007`, `revert F-007`, `sync` | GitHub |
| `factory vcs ci`, `vcs auto-merge on`, `vcs auto-push on` | Checks, auto-merge and push on approval |
| `factory team presets`, `team use lean`, `team agents 7` | The team |
| `…:manage`, `factory manager`, `manager assist`, `manager off`, `manager report` | Talk to Tess in the terminal; what she may do by herself; the facts she works from |
| `factory configure` | The setup and gate commands |
| `factory scan`, `factory doctor` | Secret scan; setup check |
| `…:release`, `…:deploy` | Release; deploy (only when you ask) |

**Where to look when something is wrong**

1. The red strip on **Backlog** or the amber lines in **Overview → Health**.
2. Open the task → **Summary** (what failed) → **Activity** (what led to it).
3. `⌘K` → *Is the setup right?* and *Ask Bix*.
4. **Logs** has every event, and `.factory/runs/<run id>/` has every stage's files.
