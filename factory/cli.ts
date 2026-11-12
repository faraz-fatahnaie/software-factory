#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { add, move, parse, type Item, type Section } from "./backlog";
import { claudeRunner } from "./claude";
import { loadConfig } from "./config";
import { openStore } from "./events";
import { runTask, shellGate, stubRunner } from "./pipeline";
import { addSkill } from "./skills";
import { commitAll, ensureWorktree, land, removeWorktree } from "./worktree";

const root = process.cwd();
const backlogPath = join(root, "BACKLOG.md");
const readItems = () => parse(readFileSync(backlogPath, "utf8"));

// ponytail: one orchestrator process at a time writes the backlog. Add a lock file if two
// `factory` commands ever need to run at once.
function editBacklog(message: string, fn: (text: string) => string) {
  // Re-read before every write: a person may edit the file while a run is in flight.
  writeFileSync(backlogPath, fn(readFileSync(backlogPath, "utf8")));
  // A backlog-only commit, so task branches never carry backlog changes. Skipped outside git.
  Bun.spawnSync(["git", "add", "BACKLOG.md"], { cwd: root });
  const p = Bun.spawnSync(["git", "commit", "-q", "-m", `backlog: ${message}`, "--", "BACKLOG.md"], { cwd: root, stderr: "pipe" });
  const err = p.stderr.toString().trim();
  if (p.exitCode !== 0 && err && !/not a git repository/.test(err)) console.error(`backlog commit skipped: ${err}`);
}

function openEvents() {
  mkdirSync(join(root, ".factory"), { recursive: true });
  return openStore(join(root, ".factory", "events.db"));
}

function find(id: string | undefined, ...sections: Section[]): Item {
  const item = readItems().find((i) => i.id === id);
  if (!item) throw new Error(`no backlog item ${id ?? "(id missing)"}`);
  if (!sections.includes(item.section as Section))
    throw new Error(`${item.id} is under "${item.section}"; expected ${sections.join(" or ")}`);
  return item;
}

const USAGE = `factory run [F-id...] [--parallel N] [--stub]   run the top Ready item(s) or the named ones, each in its own worktree
factory approve <F-id>                          land an approved task: pull request if the repo has an origin, else a local merge
factory discard <F-id>                          delete a task's worktree and branch, and return it to Ready
factory add "<title>"                           add an item to Inbox
factory skill add <owner/repo@skill> --role <r> install a skill and attach it to a role`;

async function main([cmd, ...args]: string[]) {
  if (cmd === "add" && args[0]) {
    const added = add(readFileSync(backlogPath, "utf8"), args.join(" "));
    editBacklog(`add ${added.id}`, () => added.text);
    return console.log(`added ${added.id} to Inbox`);
  }

  if (cmd === "skill" && args[0] === "add" && args[2] === "--role") {
    addSkill(root, args[1]!, args[3] ?? "");
    return console.log(`attached ${args[1]} to ${args[3]}`);
  }

  if (cmd === "approve") {
    const item = find(args[0], "Awaiting approval");
    const where = land(root, item.id, item.title);
    removeWorktree(root, item.id);
    editBacklog(`${item.id} → Done`, (t) => move(t, item.id, "Done", where.startsWith("http") ? where : ""));
    const store = openEvents();
    store.emit({ run: store.lastRun(item.id) ?? "", task: item.id, stage: "pr", type: "task.landed", data: { where } });
    return console.log(`${item.id} → Done: ${where}`);
  }

  if (cmd === "discard") {
    const item = find(args[0], "Awaiting approval", "Blocked", "In progress");
    removeWorktree(root, item.id);
    editBacklog(`${item.id} → Ready (discarded)`, (t) => move(t, item.id, "Ready"));
    const store = openEvents();
    store.emit({ run: store.lastRun(item.id) ?? "", task: item.id, stage: "pr", type: "task.discarded" });
    return console.log(`${item.id} → Ready: worktree and branch deleted`);
  }

  if (cmd === "run") {
    const config = loadConfig(root);
    const runner = args.includes("--stub") ? stubRunner : claudeRunner(config.gate);
    const ids = args.filter((a) => /^F-\d+$/.test(a));
    const p = args.indexOf("--parallel");
    const count = p < 0 ? 1 : Number(args[p + 1]);
    // A mistyped id must not silently fall through to "run the top Ready item".
    const unknown = args.filter((a, i) => !/^F-\d+$/.test(a) && a !== "--stub" && a !== "--parallel" && (p < 0 || i !== p + 1));
    if (unknown.length) throw new Error(`unknown argument: ${unknown.join(" ")}`);
    if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error("--parallel takes a number from 1 to 8");
    const chosen = ids.length
      ? ids.map((id) => find(id, "Inbox", "Ready", "Blocked"))
      : readItems().filter((i) => i.section === "Ready").slice(0, count);
    if (!chosen.length) throw new Error("nothing under Ready");

    const store = openEvents();
    const results = await Promise.all(chosen.map(async (item) => {
      editBacklog(`${item.id} → In progress`, (t) => move(t, item.id, "In progress"));
      console.log(`${item.id} ${item.title}`);
      let run = "", error = "", followUps: string[] = [];
      try {
        const dir = ensureWorktree(root, item.id);
        const setup = await shellGate(config.setup ?? [])(dir);
        if (!setup.ok) throw new Error(`setup failed:\n${setup.output}`);
        const result = await runTask(item, { config, store, runner, gate: shellGate(config.gate), cwd: dir });
        ({ run, followUps } = result);
        if (!result.ok) error = result.error;
        else if (!commitAll(dir, `${item.id}: ${item.title}`)) error = "the review approved a build that changed nothing";
      } catch (e) {
        error = String(e);
      }
      const to: Section = error ? "Blocked" : "Awaiting approval";
      editBacklog(`${item.id} → ${to}`, (t) => followUps.reduce((text, f) => add(text, f).text, move(t, item.id, to)));
      console.log(error
        ? `${item.id} → Blocked: ${error} (run ${run})`
        : `${item.id} → Awaiting approval (run ${run}). Review: git diff HEAD...factory/${item.id}  then: factory approve ${item.id} | factory discard ${item.id}`);
      return !error;
    }));
    store.close();
    if (results.includes(false)) process.exitCode = 1;
    return;
  }

  console.log(USAGE);
  if (cmd) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
