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
