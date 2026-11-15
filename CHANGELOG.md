# Changelog

Each release lists what changed and anything you need to do in your own project. How to update:
[plugin/README.md](plugin/README.md#updating).

## Unreleased

- **Technical Manager (first step).** A new role, Tess, who will be the face of the team (you talk to her, and she asks
  the others and answers for them) and will run the work: triage, starting and watching tasks, explaining what
  stopped and choosing the fix. This step adds the role, its responsibilities (planned) and
  moves triage to it from the Planner. Balanced is now 10 roles and Full 13; Lean is unchanged. **After updating,
  in each project run `factory team apply` (or `/software-factory:doctor`, which says so)** to create the new role
  file, and check the Team view. The rest of the role comes in following releases.
- **Talk to the team.** The first conversation in Talk: you talk to Tess, who answers or asks the roles a message concerns (read-only, up to three, in parallel) and replies once; each consultation is a folded step you can open. She says where things stand, why a task stopped, and offers promote, run and retry as buttons.
- **Autopilot (on by default).** The Technical Manager now acts by itself while `factory serve` (the dashboard) is running: it promotes items you worked out in conversation, starts Ready items one at a time, tries a stopped task again after a wait, sends the Builder guidance when three builds did not pass, stops a task that shows no sign of life for 20 minutes, and tells you, in plain words, about anything that needs you. It keeps to limits: 2 automatic retries per task, $5 per task and $25 per day, and no new work while 3 tasks wait for your decision. It never approves, pushes, merges or deploys. A task you discarded, and a task that stopped before the dashboard started, are left alone. Every decision is in the Logs. **To turn it off: `factory manager off`** (or `assist`, where it only proposes), or the Manager menu in Talk. Limits: `factory manager set perDay 40`. **Because Ready items now start by themselves, check Ready before you update if you do not want that.**
- **The manager on the page.** Overview has a Manager strip: her state, what she decided last, where things stand in one sentence, today's spend against the limit, and a list of her decisions. Team has her autonomy and limits (autopilot, assist or off; tasks at once, retries, spend per task and per day, how long a silent task may run). A blocked task's panel shows her explanation.
- **`/software-factory:manage`** for the terminal, and `factory consult <topic> "<question>"` to ask one role a question.
- **Fixes.** A message you typed but did not send is kept when you leave Talk and come back (and across a reload), and a message waiting behind a reply is still sent. Right-to-left text (Persian, Arabic, Hebrew) is shown right to left, paragraph by paragraph, in replies, in your own messages and in the message box.

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
