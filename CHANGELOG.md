# Changelog

Each release lists what changed and anything you need to do in your own project. How to update:
[plugin/README.md](plugin/README.md#updating).

## Unreleased

Autopilot takes approved work to GitHub, and the factory spends fewer tokens.

- **Autopilot delivers to GitHub.** After you approve a task it pushes it, opens the pull request and merges it when the checks pass,
  one at a time in `factory integrate` order, and keeps the project's branch level with GitHub (plain pushes, never forced, only
  `factory/*` branches). It runs in the background after the approval, and the dashboard's minute sweep is the backup. Approving
  a task and deploying stay yours. `factory deliver [--watch]`.
- **Problems are said once, in plain words.** Failing checks (with a fix item in your Inbox), a conflict, a merge GitHub refuses
  (a required review, a protected branch), checks pending over 45 minutes, and no GitHub sign-in show on the Manager strip and in a
  notification.
- **Rebuild it** (`factory rebuild <F-id>`): for a clash too large to update, closes the pull request, drops the old branch and builds the
  task again on today's main. A button on every conflicting pull request, next to *Update this branch*.
- **Fewer tokens.** Every stage is told to batch its reads and finish when done (a real task needed about half the turns and cost), and
  a conversation that has grown large compacts itself.
- Syncing no longer skips the update because of untracked files.

## 1.4.0

Autopilot made safe, after a review of everything it may do by itself and the lessons of a real project. **Update, then restart the dashboard (`/software-factory:open` replaces an older one) and any Claude session started before the update. Nothing else to do: role files are refreshed by themselves.**

- **The manager starts nothing you did not ask for.** On autopilot, a proposal in Talk is carried out at once only for the tasks your
  message names, or a plain "yes" to the ones she just named. A question, "wait", "don't" or "stop" is never asking. Her own ideas
  are buttons you press. A start you asked for still keeps the limits (the day's spending, the number running at once, approved tasks
  not merged); past one, it waits for your press and says why.
- **Her guidance is labelled as hers.** When autopilot sends the Builder guidance after failed builds, the Builder and the page show
  it as the manager's, never as "You asked".
- **Assist spends nothing by itself.** The look back at a finished milestone (a model call) now runs only on autopilot.
- **Keeping branches up to date is cautious.** One update at a time; none while the models are short of quota (four updates once
  started in two minutes and all failed on rate limits); and only a clash in at most two files. A bigger clash is handed to you, with
  the advice that rebuilding is often cheaper. A failed update now says so plainly in the manager's feed.
- **New work waits for what is not merged.** A task that names a file a finished task (waiting for you, or approved and not merged)
  changes waits until that task is in main. The Planner gives tasks that change the same file a `Depends on:` line.
- **Pause on every screen.** The side bar shows **Autopilot on · Pause**; one press pauses it, the same line turns it on again.
  With **Notify me** on, a desktop notification says when autopilot pauses itself or a task needs you.
- **The Release Engineer** can now run the read-only git commands this work needs (`git rev-list`, `merge-base`, `for-each-ref`,
  `cherry`); asked to "merge everything" or "fix the conflicts", it gives the order and offers one step at a time as a button. Every
  conversation is told that a refused command is refused on purpose, and never to ask you to loosen the permission mode or allow
  `git` or `gh`.

## 1.3.0

A larger release, inspired by comparing the factory with skill packs such as agent-skills: the bar a change must clear is
checked as code, review loops are cut short, risky work waits for you, and the roles' instructions now reach projects
made by earlier versions. **Update, restart the dashboard (`/software-factory:open` replaces an older one) and any
Claude session started before the update. Then run `factory init` once in each project: it adds `CONSTRAINTS.md`, your
quality bar, and keeps every file you have. Starting the dashboard or a run brings the role files up to date by itself.**


- **Your private instructions stay out of the factory's agents.** Claude Code loaded your personal
  `~/.claude/CLAUDE.md` into every factory stage and conversation, even with project settings only. Factory sessions
  now load no CLAUDE.md by themselves and are given the project's own (with `AGENTS.md` and anything else it imports)
  instead, so the project's rules always reach them and nothing personal does.
- **No stage can overspend.** Each stage is capped at what is left of the limit for one task (`factory manager set
  perTask`, $5 by default), and Claude stops it there. Before, one long stage could spend past the limit before the
  manager's next check. A stage stopped this way ends the run as a budget stop, which is handed to you, never retried.
- **The commands you type may run what they are told to.** A new check (N4) compares each slash command's permissions
  with the instructions it loads. It found eight gaps, now closed: read-only commands the docs, security and git
  setup commands needed are allowed, and `gh auth login`, turning on auto-merge and `git push` are declared as yours
  to run, so Claude tells you the command instead of trying it.
- **Docs: starting on a project you already have, and how the factory compares to skill packs** (in the README).
- **Protected code.** Put code between a `factory-protect-start` and a `factory-protect-end` comment and no agent may
  change, move or delete it: the checks compare those blocks with the last commit and send the build back, and no
  reason the Builder gives makes it pass.
- **Uncommitted work is pointed out.** A task starts from the last commit, so changes you have not committed are not in
  it. A run now says so when it starts (in the terminal and the Overview feed) and again in the handover note.
- **Checklists only when a change needs them.** The Reviewer gets a short security, accessibility, performance or
  observability checklist when the change touches what it covers (a login or a query, a screen, a database or network
  call, a route or job), with the reason; an ordinary change gets none, so it costs nothing extra.
- **Suggested skills for each role.** `factory skill suggested` lists workflow skills worth attaching (test-first and
  thin slices for the Builder, a five-axis review for the Reviewer, hardening for security, and more), each with the one
  command that installs it for the role that holds that duty. Nothing is installed until you run it, and every one is
  checked by the authority rules like any other skill.
- **A second review for risky work.** When the spec named a risk (see "Risky work waits for your yes") and the review
  approves, a second reviewer starts fresh and tries to break the change: the input that breaks it, the check it skips,
  the data it loses. A failure it can show sends the task back; a doubt it cannot show is only noted. It runs once per
  task, and never for ordinary work.
- **Oversized changes are flagged, not reviewed round after round.** The Planner writes thin tasks. A build larger than
  the largest change `CONSTRAINTS.md` allows (400 lines if it names none) is flagged to the Reviewer, who may ask for a
  split, and to you. If two reviews still cannot approve it, the task stops with "split it" instead of a third build.
- **Your quality bar in one file: `CONSTRAINTS.md`.** `factory init` writes it with defaults (the largest change in one
  task, coverage held at today's level, accessibility, performance, dependencies) for you to edit. The Builder is told to
  read it, the Reviewer treats a missed bar as required, and agents may not change it. An existing project: run
  `factory init` once; it adds the file and keeps everything you have.
- **A standard definition of done.** A project that has not written its own (in `docs/plan/roadmap.md`) is now
  reviewed against a standard one: correct and tested, clean, fits the rest of the code, documented, safe to ship.
  Your own, when you write it, replaces it.
- **Risky work waits for your yes before it is built.** The spec now ends with a `Risk:` line. When it names login or
  permissions, deleting or rewriting stored data, payments, secrets or a deploy, the run stops before anything is built
  and the task shows **Build it** instead of Retry. Only you can say yes, there or with `factory run <F-id> --anyway`:
  autopilot and the manager's conversation never start it.
- **The roles that build and judge are told the excuses that do not hold.** The Builder, its testing duty, the Reviewer
  and the security review now name the reasons agents give for skipping a step ("I'll add the tests afterwards", "the
  tests pass, so it is right", "it is internal only") with the answer, the signs that something is going wrong, and the
  evidence their reply must show.
- **Role instructions now reach a project after an update.** Until now a project kept the role files of the version it
  was made with, so fixes to what roles are told (such as the `BLOCKED:` rule of 1.2.0) never reached it. Starting the
  dashboard or a run now rebuilds each generated role file whose text nobody changed, keeps the skills attached to it,
  and commits it. A file you edited, or one without the "Generated from…" line, is left alone. Each file now carries a
  short stamp of its text so an edit can be told apart.
- **A check made green by lowering the bar fails.** After the project's checks pass, the factory reads the change itself
  (no model): a new suppression comment (`@ts-ignore`, `eslint-disable`, `noqa`, `type: ignore`…), a skipped or focused
  test, deleted tests or assertions, a lowered coverage threshold or an unimplemented stub sends the build back to the
  Builder with what it found. When one is truly right, the Builder names the file under `## Weakened checks` with a
  reason: the Reviewer judges it and the handover note shows it to you. Tests moved between files are not a loss.

- **Only a required finding sends a task back.** The Reviewer labels each finding `[required]`, `[optional]`, `[nit]`
  or `[fyi]`. A review whose findings are all below Required lets the task through, and they are listed in the handover
  note for you to decide (optional ones also go to Inbox). The Builder, sent back, is told to fix the Required ones only.
  The rule is in the Reviewer's prompt, so it holds for role files written by an earlier version too.

## 1.2.2

A small release: the authority rules now check that nobody is told to do what it cannot. **Update, restart the dashboard
(`/software-factory:open` replaces an older one) and any Claude session started before the update; nothing else is needed.**

- **Nobody is told to do what it cannot.** The authority rules now also check the other direction: everything a role's
  instruction tells it to run through git, gh, graphify or the factory is something it may run (or is named for you to run),
  every button a role is taught to ask for exists on the page, and `factory authority` shows which role proposes which
  (`[proposes, you press: …]`). The read-only git the instructions already asked for (`git describe`, `show`, `rev-parse`,
  `ls-files`, `grep`, `blame`, `shortlog`) is now allowed to stages and conversations. The Release Engineer's and the
  Technical Manager's descriptions say what they really do: explain and propose, you press.

## 1.2.1

A fix release. **Update, then run `/software-factory:open`: it now stops this project's older dashboard (on any
port) and starts this one, and the left rail shows the version it runs.** Update the plugin once, restart any Claude
session that was started before the update, and nothing else is needed in your project.

- **Fix: Push on approval, Auto-merge and the manager's settings failed on a project made before the Technical Manager
  existed** ("Invalid factory.config.json: roles.technical-manager: missing"). Everything that reads or changes the
  configuration now gives an older config the roles it lacks, and the tests run every such action against configs shaped
  like each earlier release.
- **Merge order and conflicts have an owner.** Approving a task with a GitHub `origin` keeps its branch, so finished tasks
  pile up on branches built from the same main, and merging one made the others clash. Now (the Release Engineer's new
  G3, with git alone and no model):
  - `factory integrate` (and the Pull requests tile) lists what is waiting to reach main, which tasks clash with main or
    with each other, and the order to merge them in: dependencies first, independent tasks together, the smallest
    clashing change first, and which tasks to update after each step.
  - `factory update <F-id>` now also works on an **approved** task waiting on GitHub: a clean merge needs no new yes; a
    clash goes to the Builder in the task's own folder and comes back for your yes. A pull request that says "conflicts"
    has an **Update this branch** button (and Tess can propose it), and **factory push** sends the update to the open pull
    request.
  - On autopilot, a finished task that clashes with main is updated once for each state of main, while that is cheap.
  - **No new work while three approved tasks are not merged yet** (a setting: `factory manager set unmerged N`, 1 to 10),
    so branches stop piling up.
- **What agents may never do, whatever a settings file allows.** A deny floor is passed to every session the factory
  starts: no `git push`, `commit`, `reset`, `checkout`, `merge`, `rebase` and the other git commands that change things,
  no `gh`, and none of the commands only you may run. A deny beats an allow, including one in your project's own
  `.claude/settings.json`, which factory sessions read. So allowing `Bash(git *)` and `Bash(gh *)` for the Release
  Engineer's sake no longer lets every agent change history; `factory authority`, `doctor` and the Health strip also say
  when the project settings allow more than the factory's rules assume, and point to `factory integrate` and
  `factory update`, which let the Builder resolve a clash.
- **Updating replaces an older dashboard.** `/software-factory:open` finds this project's dashboards on any port, stops
  one that runs an older version, and the rail shows which version a dashboard runs.

## Also new since 1.2.0

- **Fix: a task that waited for another to land is built on it.** A task that had built nothing yet kept the old main it was
  first branched from, so running it again after the task it needed had landed failed the same way. It is now brought up to
  the latest main first (a task that has changed files or committed keeps its work: use Update this task).
- **Apply setup button.** When the design conversation proposes the install command and the checks every build must pass, the
  page shows them as a card with an **Apply setup** button. Nothing changes until you press it; pressing it records them
  (`factory configure`, committed) and the message says it is done. The commands are checked again before they are
  applied: one line each, not an option, and nothing only a person may do (no `git push` in the gate).
- **No conversation is told to do what it cannot.** The two contradictions the authority check found are closed. The
  design conversation no longer claims it records the gate: the gate runs after every build, so it is yours to set, and it
  shows you the exact `factory configure` command to run. The docs conversation no longer claims it edits `AGENTS.md`
  (a governance file no agent may change): it writes a proposal to `docs/context/AGENTS.proposed.md` and you apply what you
  accept in Studio. Commands a conversation only names for you (`factory promote`, `factory skill add`) are now declared
  as such in the catalog (`proposes`), and `factory team` (the read-only listing) is granted exactly.

## 1.2.0

Who may do what is now checked, not hoped for. **Update, restart the dashboard (and any Claude session started before
the update), and run `factory authority` once** to see the rules and whether your project keeps them. Nothing in an
existing project is blocked by the update: skills you already installed that ask for more than a role should have are
shown as worth a look, not refused.

- **Who may do what is now checked.** The rules about what each role, skill, conversation and script may do are written
  down in one place and checked wherever they could be broken (`factory authority` shows them and the result):
  - **Only the builder edits code, and the manager cannot also build or judge** what she starts, retries and guides.
    Nothing that runs by itself may reach outside the project, change governance files or change configuration. Every
    way of changing the team (use, move, off, agents, a preset) goes through these rules and is refused, with the
    reason, before anything is written.
  - **A skill may not widen a role.** Installing or attaching one that grants edits to anyone but the builder, the shell
    wholesale, something only a person may do, or its own hooks is refused (and a skill that was just installed is
    removed again); saving such a skill or a role file in Studio is refused too. Skills that are already installed are
    shown as worth a look, so an update never locks a project out.
  - **A role file cannot grant more than its responsibilities need,** and cannot set its own permissions, hooks or connections.
  - **What a conversation is told to run, it must be allowed to run.** Two real gaps were found and written down (F-098);
    the dashboard conversations for tests and audits can now run `factory gate`, `factory scan` and `factory skill search`.
    A new gap fails the tests until it is decided.
  - **The manager's limits must agree** (a task's limit cannot be above the day's).
  - Nothing is started, by hand or by autopilot, while a rule is broken, and `factory doctor` and the Health strip say so.

## 1.1.1

A patch release: it stops loops that spent money, and fixes what Tess says about autopilot. **Update, restart the
dashboard, and nothing else is needed in your projects.** (Run `factory team apply` once if you have not since 1.1.0.)

- **Fix: loops that spent money are stopped.** A task that could not be built because another task's code was not merged
  yet used to go round and round: the Builder changed nothing, the Reviewer asked for changes, autopilot sent guidance
  and started again. Now:
  - **A stage can say `BLOCKED: <reason>`** (the Architect, the Builder, security or the Reviewer) when something
    outside the task is missing. The run stops there, is never retried, and the manager tells you the reason.
  - **Two attempts in a row that change nothing end the run**, so the third build is not paid for. The manager tries
    guidance once, and if she has nothing a Builder could act on, it is yours.
  - **Guidance goes out once** per task, and is made from the log (the spec, the Builder's summary, the reviewer's
    findings), so it is never an apology like "I couldn't read the files".
  - **`Depends on:` is now read.** A task waits until the tasks it needs are merged into main (with a GitHub `origin`,
    approved is not enough); follow-ups depend on the task they were found in. `factory run --anyway` is the way past it.
  - **Autopilot pauses itself** (switches to assist and says why) after two failed runs in a row, when you stop a task,
    when money is spent faster than the day's limit allows, or after four automatic recoveries in an hour. A run that
    reaches the limit for one task is stopped while it runs, not after. What a conversation costs now counts toward
    the day's limit.
- **Fix: adding to the Inbox no longer builds anything.** Autopilot used to move every item added in conversation to Ready and build it, so asking Tess to "add these to the Inbox" started builds (and spent money) you had not asked for. Now an item only added to the Inbox stays there; autopilot starts what is under Ready, which is what you promote or tell her to build. Tess also knows this now, can say why something started (`factory manager report` lists her latest decisions), and no longer says she does not know why the factory ran something.
- **Approve from the manager's chat.** After she reviews a task you can ask her to approve it: her reply ends with an **Approve and land** button, and only your press approves, even on autopilot. Before, she could only tell you to run a slash command. She still never approves, pushes, merges or deploys on her own.
- **Fix: the manager no longer says she cannot do what she just did.** On autopilot she was still told her proposals show as buttons, so after moving a task to Ready and starting it she could tell you to "press the button" and that she "can't move it myself". She is now told how her proposals are handled (autopilot: promote, run and retry happen at once, in the present tense; assist: buttons), and to check where a task is with `factory status` before proposing. A second proposal for a task that has already moved is no longer shown as Failed: it says where the task is.

## 1.1.0

**Before you update, two things change in your projects.** The Technical Manager (Tess) is on **autopilot by
default**: while the dashboard is open she starts what you worked out in conversation and retries a stuck task, inside
limits (one task at a time, $5 per task, $25 a day). A one-time notice in the dashboard says so, with a switch to
assist or off (`factory manager assist|off`). And **run `factory team apply` once in each project** (or
`/software-factory:doctor`, which says so) to create her role file. Nothing is pushed, merged or deployed without
your yes, as before.

- **Technical Manager (first step).** A new role, Tess, who will be the face of the team (you talk to her, and she asks
  the others and answers for them) and will run the work: triage, starting and watching tasks, explaining what
  stopped and choosing the fix. This step adds the role, its responsibilities (planned) and
  moves triage to it from the Planner. Balanced is now 10 roles and Full 13; Lean is unchanged. **After updating,
  in each project run `factory team apply` (or `/software-factory:doctor`, which says so)** to create the new role
  file, and check the Team view. The rest of the role comes in following releases.
- **Talk to the team.** The first conversation in Talk: you talk to Tess, who answers or asks the roles a message concerns (read-only, up to three, in parallel) and replies once; each consultation is a folded step you can open. She says where things stand, why a task stopped, and offers promote, run and retry as buttons.
- **Autopilot (on by default).** The Technical Manager now acts by itself while `factory serve` (the dashboard) is running: it promotes items you worked out in conversation, starts Ready items one at a time, tries a stopped task again after a wait, sends the Builder guidance when three builds did not pass, stops a task that shows no sign of life for 20 minutes, and tells you, in plain words, about anything that needs you. It keeps to limits: 2 automatic retries per task, $5 per task and $25 per day, and no new work while 3 tasks wait for your decision. It never approves, pushes, merges or deploys. A task you discarded, and a task that stopped before the dashboard started, are left alone. Every decision is in the Logs. **To turn it off: `factory manager off`** (or `assist`, where it only proposes), or the Manager menu in Talk. Limits: `factory manager set perDay 40`. **Because Ready items now start by themselves, check Ready before you update if you do not want that.**
- **The manager on the page.** Overview has a Manager strip: her state, what she decided last, where things stand in one sentence, today's spend against the limit, and a list of her decisions. Team has her autonomy and limits (autopilot, assist or off; tasks at once, retries, spend per task and per day, how long a silent task may run). A blocked task's panel shows her explanation.
- **Fewer clicks to push.** **Push all** and **Merge all** on the GitHub tile (one confirmation that lists the tasks, then one after the other, stopping at the first that fails). Tess can offer one button for several tasks ("push everything"). **Push on approval** (off by default; `factory vcs auto-push on`) pushes a task and opens its pull request when you approve it; the secret scan still runs, and a failed push never undoes the approval. A task that is pushed but has no pull request yet now says "Open pull request". **Push together** opens ONE pull request that holds several approved tasks (`factory push F-001 F-002 --together`; Tess offers it as `batch`): they are merged in order into `factory/batch-<time>`, a task that clashes with an earlier one is held back and named, and the pull request shows as one row with one Merge button that tidies every task inside it.
- **`/software-factory:manage`** for the terminal, and `factory consult <topic> "<question>"` to ask one role a question.
- **Clear and compact a conversation.** Each conversation has **Compact** and **Clear** in its header, and the message box takes `/compact` (optionally followed by what to keep) and `/clear`, as in Claude Code. Compact runs Claude's own compaction on that conversation: the agent keeps a summary, a line shows the size before and after, and the earlier messages stay readable, shown quieter. From 70% of the context a hint offers it. Clear asks once and deletes the conversation from disk. Any other `/word` is not sent. Typing `/` lists the commands under the message box, laid out as in the Claude Code command line (name, then a short description; the chosen one in colour), narrowed loosely by what you type next (`/pact` and `/cmp` both find compact, `*` stands for anything): arrow keys choose, Enter uses, Tab completes, Esc closes.
- **Choose who gets a skill.** Installing a skill in Studio now asks who gets it (tick any of the people, not only the one whose file is open), and `factory skill add|attach|detach <skill> --role a,b` takes several roles at once (all or nothing). A conversation offers only the skills attached to its person's role, and a skill typed for someone else is refused. People who only talk (Product Partner, Planner, Tester) have no role file to attach to yet, so they are still offered every skill.
- **Skills and plugin commands in the conversation.** The command list under the message box also offers what that conversation can run: the skills and commands installed in the project (with their own short descriptions) and the commands its plugins bring. The list comes from what the agent itself reports at the start of each reply, so a newly installed skill or plugin appears by itself, and nothing is hard-coded per kind of agent. Typing one sends it to the agent, under the same limits as any message. The agent's own built-in commands (model, config and the like) stay out.
- **Fix: a project set up before this version still loads.** Model settings left in `factory.config.json` for a role that no longer runs unattended (the Planner, whose triage moved to the Technical Manager) made the whole config invalid, so the Team page and runs failed. They are now ignored.
- **Context usage in every conversation.** Under each person's name in Talk a small meter shows how full that conversation's context is after the last reply ("74% of context"; hover for the token counts, and for the manager, the roles she asked). It turns amber at 70% and red at 90%.
- **Conversations are kept in the project.** What you said to each person in Talk is now stored on disk in the project (`.factory/chats/`, never committed), not in the browser. It is there after you close the dashboard, in another browser, and when the dashboard moves to another port; a reply that finishes after you closed the tab is kept too, and a page reloaded while a reply is coming waits for it. **New conversation** deletes it from disk. Conversations an earlier version kept in the browser are moved over once.
- **Overview: Health moved down.** The Health box now sits below the work, so a "Needs attention" box is no longer the first thing on the first page. The chip in the rail still says when something needs a look.
- **Landing page and runbook.** The landing page, its screenshot and the runbook walk-through now show the Technical Manager: Talk to the team, attachments, autopilot and its limits, her strip on Overview, and what she does when a task stops.
- **Milestones, a retrospective and team health.** When the last task of a milestone is finished, the manager says so, names what is due now (documents, a security audit, release readiness) and looks back: what kept going wrong and why, with up to three proposed fixes added to the Inbox for you to promote. Ask her in Talk where a milestone stands, what keeps failing, or which role costs or fails the most. `factory manager report` prints the facts she works from.
- **Ready and done are checked.** A loose idea that triage finds too large for one task, or cannot write acceptance checks for, now stops as "not ready" before anything is specified or built, and the manager hands it to you instead of retrying. When you saved a definition of done in the roadmap, the Reviewer checks each change against it. A task waiting for your decision says on its Summary what was checked before it reached you, and what to look at (for example, code changed with no test).
- **Parallel tasks do not clash.** With more than one task allowed at once, autopilot holds back a Ready item that names the same files or folders as a running task (its title, detail or the running spec), says so once in the decision log, and starts it when the other finishes.
- **Send guidance to a blocked task.** A task that stopped after it had a spec now has **Send guidance** next to Retry: say what the Builder should do differently, and a new round continues on the same branch with the same spec and reads your words first (Retry still starts from the beginning). `factory reject <F-id> --feedback "…"` works on a blocked task too; one that stopped before it had a spec says so and asks to be run again.
- **Talk: stop, and nothing lost on reload.** While a reply is coming, the send button becomes **Stop** (or press Esc): it ends the reply, and anything the manager asked other roles for it, at once. Conversations are kept in the browser, per project and per conversation, so a reload shows them again (text only; pictures and file contents are not kept). **New conversation** clears one, after asking.
- **Fixes.** A task sent back with comments (and a blocked task continued with guidance) now keeps its spec; before, the Builder got an empty one in round two. Pull requests now carry the spec and the review of the task. The first time the dashboard opens after the update it explains that autopilot is on, and offers to keep it, switch to assist, or turn it off. A role file that the update needs is created by itself. A message you typed but did not send is kept when you leave Talk and come back (and across a reload), and a message waiting behind a reply is still sent. Right-to-left text (Persian, Arabic, Hebrew) is shown right to left, paragraph by paragraph, in replies, in your own messages and in the message box.

## 1.0.1

- **One dashboard per project.** `/software-factory:open` no longer shows another project's dashboard. Each
  project gets its own port (4400-4499), and "already running" is only reported for the same project. After
  updating, restart any dashboard that is open.
- **Talk.** Attach pictures, PDFs, notebooks, text and code (button, drag and drop, or paste). The message box
  grows with long text, and you can keep typing while a reply is coming (the message goes out afterwards). Replies
  are drawn as Markdown (headings, lists, tables, code with a copy button). What a reply ran is folded into
  expandable steps with their output. The chat is taller.

## 1.0.0

First public release.
