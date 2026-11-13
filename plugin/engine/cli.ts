#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { add, move, parse, type Item, type Section } from "./backlog";
import { claudeRunner } from "./claude";
import { loadConfig } from "./config";
import { openStore } from "./events";
import { applyTeam, detect, doctor, init } from "./init";
import { describeTeam, presets, DEFAULT_PRESET } from "./team";
import { runTask, shellGate, stopAll, stubRunner } from "./pipeline";
import { addSkill, setSkill } from "./skills";
import { commitAll, ensureWorktree, land, removeWorktree } from "./worktree";

const root = process.cwd();
const backlogPath = join(root, "BACKLOG.md");
const readItems = () => parse(readFileSync(backlogPath, "utf8"));

/** Commits only the given paths, leaving anything else you have staged alone. Skipped outside git. */
function commitPaths(message: string, ...paths: string[]) {
  Bun.spawnSync(["git", "add", "--", ...paths], { cwd: root });
  const p = Bun.spawnSync(["git", "commit", "-q", "-m", message, "--", ...paths], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const err = p.stderr.toString().trim();
  if (p.exitCode !== 0 && err && !/not a git repository/.test(err)) console.error(`commit skipped: ${err}`);
}

function editBacklog(message: string, fn: (text: string) => string) {
  // Several factory commands can run at once (a run finishing while the GUI approves another
  // task), so the read-modify-write is serialized with a lock directory.
  const lock = join(root, ".factory", "backlog.lock");
  mkdirSync(join(root, ".factory"), { recursive: true });
  for (let waited = 0; ; waited += 20) {
    try { mkdirSync(lock); break; } catch {
      if (waited > 5000) rmSync(lock, { recursive: true, force: true }); // holder crashed: edits take milliseconds
      Bun.sleepSync(20);
    }
  }
  try {
    // Re-read before every write: a person may edit the file while a run is in flight.
    writeFileSync(backlogPath, fn(readFileSync(backlogPath, "utf8")));
    // A backlog-only commit, so task branches never carry backlog changes.
    commitPaths(`backlog: ${message}`, "BACKLOG.md");
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
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

const USAGE = `factory init [--setup <cmd>]... [--gate <cmd>]...  set this project up; without flags the commands are detected
factory detect                                  show the setup and gate commands init would use
factory gate ["<cmd>"...]                        run the configured gate here, or try the given commands
factory team [apply [--force]]                  show the team, or rebuild the role files from the catalog
factory doctor                                  check the machine and this project's setup
factory status                                  what is ready, running, waiting for you or blocked
factory run [F-id...] [--parallel N] [--stub]   run the top Ready item(s) or the named ones, each in its own worktree
factory promote <F-id>                          move an Inbox item to Ready
factory approve <F-id>                          land an approved task: pull request if the repo has an origin, else a local merge
factory discard <F-id>                          delete a task's worktree and branch, and return it to Ready
factory serve [port]                            start the local control plane (default 127.0.0.1:4400)
factory add "<title>"                           add an item to Inbox
factory skill add <owner/repo@skill> --role <r> install a skill and attach it to a role
factory skill attach|detach <skill> --role <r>  attach or detach a skill that is already installed`;

async function main([cmd, ...args]: string[]) {
  if (cmd === "add" && args[0]) {
    const added = add(readFileSync(backlogPath, "utf8"), args.join(" "));
    editBacklog(`add ${added.id}`, () => added.text);
    return console.log(`added ${added.id} to Inbox`);
  }

  if (cmd === "skill" && ["add", "attach", "detach"].includes(args[0]!) && args[1] && args[2] === "--role") {
    const [action, skill, , role = ""] = args as ["add" | "attach" | "detach", string, string, string];
    if (action === "add") addSkill(root, skill, role);
    else setSkill(root, action, skill, role);
    // Committed, because task worktrees branch from HEAD: an uncommitted skill or role file never reaches a run.
    commitPaths(`skills: ${action} ${skill} for ${role}`, ".claude", ...(existsSync(join(root, "skills-lock.json")) ? ["skills-lock.json"] : []));
    return console.log(`${action === "detach" ? "detached" : "attached"} ${skill} ${action === "detach" ? "from" : "to"} ${role}`);
  }

  if (cmd === "serve") {
    // Imported here so every other command works without the GUI and its dependencies.
    const { serve } = await import("./server");
    const server = await serve(root, args[0] === undefined ? 4400 : Number(args[0]));
    return console.log(`factory control plane: http://127.0.0.1:${server.port}`);
  }

  if (cmd === "team") {
    if (args[0] === "apply") {
      const r = applyTeam(root, args.includes("--force"));
      if (r.paths.length) commitPaths("software-factory: rebuild role files from the catalog", ...r.paths);
      return console.log(r.lines.join("\n"));
    }
    if (args.length) throw new Error("usage: factory team [apply [--force]]");
    const preset = presets[DEFAULT_PRESET]!;
    let config: ReturnType<typeof loadConfig> | undefined;
    try { config = loadConfig(root); } catch { /* not initialized: show the defaults */ }
    console.log(`${preset.title} team: ${preset.summary}\n`);
    for (const r of describeTeam(preset)) {
      const c = config?.roles[r.name] ?? preset.roles[r.name]!.defaults;
      console.log(`${r.active ? "●" : "○"} ${r.title}${c ? `  ${c.model}, ${c.effort}` : ""}\n    built:   ${r.built.join(" ") || "none yet"}\n    planned: ${r.planned.join(" ") || "none"}`);
    }
    return console.log("\n● has built responsibilities and runs today; ○ is planned.");
  }

  if (cmd === "detect") return console.log(JSON.stringify(detect(root), null, 2));

  if (cmd === "init") {
    if (Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], { cwd: root }).exitCode !== 0)
      throw new Error("not a git repository. Run `git init` first: the factory works in git worktrees.");
    const flag = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] !== undefined ? [args[i + 1]!] : []));
    const unknown = args.filter((a, i) => a !== "--setup" && a !== "--gate" && args[i - 1] !== "--setup" && args[i - 1] !== "--gate");
    if (unknown.length) throw new Error(`unknown argument: ${unknown.join(" ")}`);
    const r = init(root, { ...(args.includes("--setup") && { setup: flag("--setup") }), ...(args.includes("--gate") && { gate: flag("--gate") }) });
    // Committed, because task worktrees branch from HEAD.
    if (r.paths.length) commitPaths("software-factory: initialize", ...r.paths);
    console.log([`Stack: ${r.stack}`, ...r.done, `setup: ${r.config.setup?.join(" ; ") || "(none)"}`, `gate:  ${r.config.gate.join(" ; ") || "(none: only the reviewer will check a build)"}`,
      "Next: factory add \"<what to build>\", factory promote <F-id>, factory run"].join("\n"));
    return;
  }

  if (cmd === "gate") {
    // With commands: try them here, before they go into the config. Without: run the configured gate.
    const result = await shellGate(args.length ? args : loadConfig(root).gate)(root);
    console.log(result.ok ? "gate passed" : `gate failed\n${result.output}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (cmd === "doctor") {
    const r = doctor(root);
    console.log(r.lines.join("\n"));
    if (!r.ok) process.exitCode = 1;
    return;
  }

  if (cmd === "status") {
    const { summarize } = await import("./state");
    const store = openEvents();
    const events = [];
    for (let rows = store.since(0); rows.length; rows = store.since(rows.at(-1)!.seq)) events.push(...rows);
    const { tasks } = summarize(events as any);
    const items = readItems();
    for (const section of ["In progress", "Awaiting approval", "Blocked", "Ready"] as const) {
      const here = items.filter((i) => i.section === section);
      if (!here.length) continue;
      console.log(`${section}:`);
      for (const i of here) {
        const run = tasks.get(i.id);
        const active = Object.entries(run?.stages ?? {}).find(([, st]) => st.state === "active");
        const note = section === "In progress" && active ? `  [${active[0]} on ${active[1].model ?? "gate"}]` : section === "Blocked" && run?.error ? `  [${run.error.slice(0, 120)}]` : "";
        console.log(`  ${i.id} ${i.title}${run?.cost ? `  $${run.cost.toFixed(3)}` : ""}${note}`);
      }
    }
    const count = (s: string) => items.filter((i) => i.section === s).length;
    return console.log(`Inbox ${count("Inbox")} · Ready ${count("Ready")} · In progress ${count("In progress")} · Awaiting approval ${count("Awaiting approval")} · Blocked ${count("Blocked")} · Done ${count("Done")}`);
  }

  if (cmd === "promote") {
    const item = find(args[0], "Inbox");
    editBacklog(`${item.id} → Ready`, (t) => move(t, item.id, "Ready"));
    return console.log(`${item.id} → Ready`);
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
    // Ctrl-C or a stop from the GUI: end the stages, then let each task settle into Blocked below.
    process.on("SIGINT", stopAll);
    process.on("SIGTERM", stopAll);
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
