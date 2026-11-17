# Changelog

Each release lists what changed and anything you need to do in your own project. How to update:
[plugin/README.md](plugin/README.md#updating).

## Unreleased

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
