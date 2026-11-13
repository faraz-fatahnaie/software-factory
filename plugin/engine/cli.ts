#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { add, move, parse, type Item, type Section } from "./backlog";
import { claudeRunner } from "./claude";
import { loadConfig, parseConfig, projectTeam } from "./config";
import { openStore } from "./events";
import { applyTeam, configure, detect, DOC_PATHS, doctor, init, nextStep, projectDocs } from "./init";
import { appendChronicle, appendNotes, chronicleEntry, parseScribe, stageOutput } from "./chronicle";
import { graphifyInstalled, updateGraph } from "./graph";
import { formatChecks, formatInfo, readiness, releaseInfo, tagRelease } from "./release";
import { allTracked, changesSince, formatFindings, scanSecrets } from "./security";
import { activeRoles, chatPrompt, chatPromptFor, describeTeam, perTask, presets, resolveTeam, ROLE_NAME } from "./team";
import { addCustom, changeTeam, moveSettings, offSettings, onSettings, removeCustom, renameSettings, teamForAgents, titleSettings, useSettings } from "./teamctl";
import { runTask, shellGate, stopAll, stubRunner } from "./pipeline";
import { addSkill, searchSkills, setSkill } from "./skills";
import { armAutoMerge, formatStatus, hasChecks, mergeTask, pushTask, runTexts, syncGithub, vcsStatus } from "./vcs";
import { APPROVED, commitAll, ensureWorktree, land, removeWorktree } from "./worktree";

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

/** Runs `fn` while holding the factory lock. Several commands can run at once (a run finishing while the GUI approves another task), so shared files are changed one at a time. */
function withLock<T>(fn: () => T): T {
  const lock = join(root, ".factory", "backlog.lock");
  mkdirSync(join(root, ".factory"), { recursive: true });
  for (let waited = 0; ; waited += 20) {
    try { mkdirSync(lock); break; } catch {
      if (waited > 5000) rmSync(lock, { recursive: true, force: true }); // holder crashed: edits take milliseconds
      Bun.sleepSync(20);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

function editBacklog(message: string, fn: (text: string) => string) {
  withLock(() => {
    // Re-read before every write: a person may edit the file while a run is in flight.
    writeFileSync(backlogPath, fn(readFileSync(backlogPath, "utf8")));
    // A backlog-only commit, so task branches never carry backlog changes.
    commitPaths(`backlog: ${message}`, "BACKLOG.md");
  });
}

const graphEnabled = () => { try { return loadConfig(root).graph !== false && graphifyInstalled(); } catch { return false; } };

/** Writes the chronicle entry and role notes for a landed task, and commits the documents. Returns the files changed. */
function recordLanding(item: Item, where: string, run: string, events: any[]): string[] {
  const date = new Date().toISOString().slice(0, 10);
  const scribe = parseScribe(stageOutput(events, "document"), activeRoles(projectTeam(root)));
  const files = [appendChronicle(root, chronicleEntry({ id: item.id, title: item.title, date, where, run, chronicle: scribe.chronicle, events }), date),
    ...appendNotes(root, item.id, date, scribe.notes)];
  commitPaths(`software-factory: record ${item.id}`, "docs");
  return files;
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

/** Every value given for a repeated flag: --gate "a" --gate "b" gives ["a", "b"]. */
const flag = (args: string[], name: string) => args.flatMap((a, i) => (a === name && args[i + 1] !== undefined ? [args[i + 1]!] : []));

const USAGE = `factory init [--setup <cmd>]... [--gate <cmd>]... [--team lean|balanced|full]   set this project up; without flags the commands are detected and the team is balanced
factory detect                                  show the setup and gate commands init would use
factory gate ["<cmd>"...]                        run the configured gate here, or try the given commands
factory release info | check [--deploy] | tag <version>   what a release holds, whether the project is ready, and tag it (never pushes)
factory scan [--since <revision>]                scan for hard-coded secrets: the whole project, or what changed since a revision
factory docs save                               commit the documents (docs/, README.md, AGENTS.md...) so task agents can read them
factory configure [--setup "<cmd>"]... [--gate "<cmd>"]...   change the project's setup and gate commands
factory skill search "<words>"                  search skills.sh: packages, install counts and review pages
factory team [apply [--force]]                  show the team, or rebuild the role files from the catalog
factory doctor                                  check the machine and this project's setup
factory status                                  what is ready, running, waiting for you or blocked
factory run [F-id...] [--parallel N] [--stub]   run the top Ready item(s) or the named ones, each in its own worktree
factory promote <F-id>...                       move Inbox items to Ready, in the order given
factory role <id>... | <role> [id...]            print the instructions of a conversation, by responsibility or role (used by the commands)
factory approve <F-id>                          accept a finished task: a local merge, or (with a GitHub remote) a branch that waits for your push
factory push <F-id>                             push an approved task's branch and open its pull request (scans for secrets first)
factory merge <F-id>                            merge a task's pull request (refuses failing checks or conflicts)
factory sync                                    update from GitHub: pull merged work in, tidy branches, and auto-merge if it is on
factory vcs [auto-merge on|off]                 what is waiting to go to GitHub, or turn auto-merge on or off
factory discard <F-id>                          delete a task's worktree and branch, and return it to Ready
factory serve [port]                            start the local control plane (default 127.0.0.1:4400)
factory add "<title>" [--detail "<lines>"] [--priority P1]   add an item to Inbox
factory skill add <owner/repo@skill> --role <r> install a skill and attach it to a role
factory skill attach|detach <skill> --role <r>  attach or detach a skill that is already installed`;

async function main([cmd, ...args]: string[]) {
  if (cmd === "add" && args[0]) {
    // Flags may come after the title: factory add "<title>" --detail "<lines>" --priority P1
    const value = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1] ?? (() => { throw new Error(`${flag} needs a value`); })(); };
    const detail = value("--detail"), prio = value("--priority");
    const title = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--detail" && args[i - 1] !== "--priority").join(" ");
    const added = add(readFileSync(backlogPath, "utf8"), title, "Inbox", { detail, prio });
    editBacklog(`add ${added.id}`, () => added.text);
    return console.log(`added ${added.id} to Inbox`);
  }

  if (cmd === "skill" && args[0] === "search" && args[1]) {
    const found = searchSkills(args.slice(1).join(" "));
    return console.log(found.length ? found.map((f) => `${f.pkg}  ${f.installs} installs  ${f.url}`).join("\n") : "no skills found");
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
    const [sub, ...rest] = args;
    // Flags with a value (--to d2); everything else is positional. Unknown flags are errors, not silently ignored.
    const parse = (names: string[]) => {
      const flags: Record<string, string> = {}, pos: string[] = [];
      for (let i = 0; i < rest.length; i++) {
        if (!rest[i]!.startsWith("--")) { pos.push(rest[i]!); continue; }
        if (!names.includes(rest[i]!) || rest[i + 1] === undefined) throw new Error(`${rest[i]} is not understood here (expected: ${names.join(", ") || "no options"}), or it needs a value`);
        flags[rest[i]!] = rest[++i]!;
      }
      return { flags, pos };
    };
    const show = () => {
      const team = projectTeam(root);
      let config: ReturnType<typeof loadConfig> | undefined;
      try { config = loadConfig(root); } catch { /* not initialized: show the defaults */ }
      const t = perTask(team);
      console.log(`${team.title} team, ${Object.keys(team.roles).length} roles. A normal task uses ${t.always} agents (spec, build, review).${t.sometimes.length ? `\nSometimes more: ${t.sometimes.join("; ")}.` : ""}\n`);
      for (const r of describeTeam(team)) {
        const c = config?.roles[r.name] ?? team.roles[r.name]!.defaults;
        console.log(`${r.active ? "●" : "○"} ${r.title} (${r.name})${r.modes.length ? `  [${r.modes.join(" + ")}]` : ""}${c && r.modes.includes("agent") ? `  ${c.model}, ${c.effort}${config?.roles[r.name]?.enabled === false ? ", switched off" : ""}` : ""}\n    built:   ${r.built.join(" ") || "none yet"}\n    planned: ${r.planned.join(" ") || "none"}${Object.entries(config?.roles[r.name]?.stages ?? {}).map(([k, v]) => `\n    ${k} stage: ${v.model}, ${v.effort}`).join("")}`);
      }
      if (team.off.length) console.log(`\nSwitched off: ${team.off.join(" ")}`);
      console.log("\n● has built responsibilities and runs today; ○ is planned.");
    };
    const change = (what: string, edit: Parameters<typeof changeTeam>[1], opts?: Parameters<typeof changeTeam>[2]) => {
      const r = changeTeam(root, edit, opts);
      commitPaths(`software-factory: team ${what}`, ...r.paths);
      const notable = r.lines.filter((l) => !l.startsWith("current"));
      show();
      if (notable.length) console.log(`\nRole files:\n${notable.map((l) => `  ${l}`).join("\n")}`);
    };
    if (!sub) return show();
    if (sub === "presets") {
      parse([]);
      for (const [name, p] of Object.entries(presets)) {
        const t = perTask(resolveTeam({ preset: name }));
        console.log(`${name === (projectTeam(root).title.toLowerCase()) ? "*" : " "} ${name}: ${Object.keys(p.roles).length} roles. ${p.summary}\n    a normal task uses ${t.always} agents; roles: ${Object.keys(p.roles).join(", ")}`);
      }
      return console.log("\n* is this project's team. Change it with: factory team use <preset>, or ask for a size with: factory team agents <n>");
    }
    if (sub === "apply") {
      const r = applyTeam(root, rest.includes("--force"));
      if (r.paths.length) commitPaths("software-factory: rebuild role files from the catalog", ...r.paths);
      return console.log(r.lines.join("\n"));
    }
    if (sub === "use") { const { pos } = parse([]); if (pos.length !== 1) throw new Error("usage: factory team use <preset>"); return change(`use ${pos[0]}`, (t) => useSettings(t, pos[0]!)); }
    if (sub === "agents") { const { pos } = parse([]); if (pos.length !== 1) throw new Error("usage: factory team agents <number>"); return change(`size ${pos[0]}`, (t) => teamForAgents(Number(pos[0]), t)); }
    if (sub === "move") { const { flags, pos } = parse(["--to"]); if (!pos.length || !flags["--to"]) throw new Error("usage: factory team move <id>... --to <role>"); return change(`move ${pos.join(" ")} to ${flags["--to"]}`, (t) => moveSettings(t, pos, flags["--to"]!)); }
    if (sub === "merge") { const { pos } = parse([]); if (pos.length !== 2) throw new Error("usage: factory team merge <role> <into-role>"); return change(`merge ${pos[0]} into ${pos[1]}`, (t) => renameSettings(t, pos[0]!, pos[1]!)); }
    if (sub === "rename") {
      const { pos } = parse([]);
      if (pos.length < 2 || pos.length > 3) throw new Error('usage: factory team rename <role> <new-name> ["New Title"]');
      if (!ROLE_NAME.test(pos[1]!)) throw new Error(`"${pos[1]}" is not a role name (lowercase letters, digits and dashes)`);
      return change(`rename ${pos[0]} to ${pos[1]}`, (t) => renameSettings(t, pos[0]!, pos[1]!, pos[2]), { rename: { [pos[0]!]: pos[1]! } });
    }
    if (sub === "title") { const { pos } = parse([]); if (pos.length !== 2) throw new Error('usage: factory team title <role> "<Title>"'); return change(`title ${pos[0]}`, (t) => titleSettings(t, pos[0]!, pos[1]!)); }
    if (sub === "off" || sub === "on") {
      const { pos } = parse([]);
      if (!pos.length) throw new Error(`usage: factory team ${sub} <id>...`);
      return change(`${sub} ${pos.join(" ")}`, (t) => (sub === "off" ? offSettings(t, pos) : onSettings(t, pos)));
    }
    if (sub === "add") {
      const { flags, pos } = parse(["--role", "--when", "--instruction", "--summary", "--access"]);
      if (pos.length !== 1 || !flags["--role"] || !flags["--when"] || !flags["--instruction"]) throw new Error('usage: factory team add "<title>" --role <role> --when request|task --instruction "<what it does>" [--summary "<one line>"] [--access read,web]');
      return change(`add responsibility ${pos[0]}`, (t) => addCustom(t, {
        title: pos[0]!, summary: flags["--summary"] ?? pos[0]!, when: flags["--when"] as "request" | "task",
        access: flags["--access"]?.split(",").map((a) => a.trim()) ?? ["read"], instruction: flags["--instruction"]!, role: flags["--role"]!,
      }));
    }
    if (sub === "remove") { const { pos } = parse([]); if (pos.length !== 1) throw new Error("usage: factory team remove <U-id>"); return change(`remove ${pos[0]}`, (t) => removeCustom(t, pos[0]!)); }
    throw new Error("usage: factory team [presets | use <preset> | agents <n> | move <id>... --to <role> | merge <role> <into> | rename <role> <new> | title <role> <title> | off|on <id>... | add ... | remove <U-id> | apply [--force]]");
  }

  if (cmd === "release") {
    const [sub, ...rest] = args;
    if (sub === "info" && !rest.length) return console.log(formatInfo(releaseInfo(root)));
    if (sub === "check" && rest.every((a) => a === "--deploy")) {
      const checks = await readiness(root, { deploy: rest.includes("--deploy") });
      console.log(formatChecks(checks));
      if (checks.some((c) => c.level === "fail")) process.exitCode = 1;
      return;
    }
    if (sub === "tag" && rest.length === 1) {
      const r = tagRelease(root, rest[0]!);
      return console.log(`tagged ${r.tag}${r.committed.length ? ` (committed ${r.committed.join(", ")})` : ""}\nNothing was pushed: sharing the tag and publishing are yours to do.`);
    }
    throw new Error("usage: factory release info | check [--deploy] | tag <version>");
  }

  if (cmd === "scan") {
    // The secret scan the pipeline runs on every task, run by hand: the whole project, or what changed since a revision.
    const i = args.indexOf("--since");
    if (args.length && (i !== 0 || args.length !== 2)) throw new Error("usage: factory scan [--since <revision>]");
    const found = scanSecrets(i === 0 ? changesSince(root, args[1]!) : allTracked(root));
    console.log(found.length ? `${found.length} possible secret${found.length > 1 ? "s" : ""} (values are never printed):\n${formatFindings(found)}\nA known false alarm can be marked with "factory:allow-secret" on its line.` : "no secrets found");
    if (found.length) process.exitCode = 1;
    return;
  }

  if (cmd === "docs" && args[0] === "save") {
    // Only documents are committed: a conversation may write these, never anything else.
    const paths = DOC_PATHS.filter((p) => existsSync(join(root, p)));
    const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--", ...paths], { cwd: root, stdout: "pipe" }).stdout.toString().trim();
    if (!dirty) return console.log("documents are already saved");
    commitPaths("software-factory: update documents", ...paths);
    return console.log(`saved:\n${dirty}`);
  }

  if (cmd === "configure") {
    const unknown = args.filter((a, i) => a !== "--setup" && a !== "--gate" && args[i - 1] !== "--setup" && args[i - 1] !== "--gate");
    if (unknown.length || !args.length) throw new Error('usage: factory configure [--setup "<cmd>"]... [--gate "<cmd>"]...');
    const next = configure(root, { ...(args.includes("--setup") && { setup: flag(args, "--setup") }), ...(args.includes("--gate") && { gate: flag(args, "--gate") }) });
    commitPaths("software-factory: update setup and gate", "factory.config.json");
    return console.log(`setup: ${next.setup?.join(" ; ") || "(none)"}\ngate:  ${next.gate.join(" ; ") || "(none)"}`);
  }

  if (cmd === "detect") return console.log(JSON.stringify(detect(root), null, 2));

  if (cmd === "init") {
    if (Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], { cwd: root }).exitCode !== 0)
      throw new Error("not a git repository. Run `git init` first: the factory works in git worktrees.");
    const flagged = ["--setup", "--gate", "--team"];
    const unknown = args.filter((a, i) => !flagged.includes(a) && !flagged.includes(args[i - 1] ?? ""));
    if (unknown.length) throw new Error(`unknown argument: ${unknown.join(" ")}`);
    const r = init(root, { ...(args.includes("--setup") && { setup: flag(args, "--setup") }), ...(args.includes("--gate") && { gate: flag(args, "--gate") }), ...(args.includes("--team") && { team: flag(args, "--team")[0] }) });
    // Committed, because task worktrees branch from HEAD.
    if (r.paths.length) commitPaths("software-factory: initialize", ...r.paths);
    console.log([`Stack: ${r.stack}`, ...r.done, `setup: ${r.config.setup?.join(" ; ") || "(none)"}`, `gate:  ${r.config.gate.join(" ; ") || "(none: only the reviewer will check a build)"}`,
      `graph: ${r.graph}`,
      "Next: tell the factory what you want to build: /software-factory:brainstorm <your idea>"].join("\n"));
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
    const docs = projectDocs(root);
    console.log(`Documents: ${docs.map((d) => `${d.name} ${d.state}`).join(" · ")}`);
    console.log(`Next: ${nextStep(docs, items)}`);
    return console.log(`Inbox ${count("Inbox")} · Ready ${count("Ready")} · In progress ${count("In progress")} · Awaiting approval ${count("Awaiting approval")} · Blocked ${count("Blocked")} · Done ${count("Done")}`);
  }

  if (cmd === "promote") {
    if (!args.length) throw new Error("usage: factory promote <F-id>...");
    for (const id of args) find(id, "Inbox"); // check them all first: promote none unless every id is valid
    for (const id of args) editBacklog(`${id} → Ready`, (t) => move(t, id, "Ready")); // in the order given, so Ready keeps it
    return console.log(args.map((id) => `${id} → Ready`).join("\n"));
  }

  if (cmd === "role") {
    const [name, ...ids] = args;
    if (!name) throw new Error("usage: factory role <role> [id...]  or  factory role <id>...");
    // Named by responsibility (D1 D3), so the commands keep working however the team is grouped; or by role.
    return console.log(/^[A-Z]\d{1,3}$/.test(name) ? chatPromptFor(args, projectTeam(root)) : chatPrompt(name, ids, projectTeam(root)));
  }

  const autoMerge = () => { try { return !!loadConfig(root).vcs?.autoMerge; } catch { return false; } };
  if (cmd === "vcs") {
    const [sub, value] = args;
    if (!sub) return console.log(formatStatus(vcsStatus(root), autoMerge()));
    if (sub === "auto-merge" && (value === "on" || value === "off") && args.length === 2) {
      if (value === "on" && !hasChecks(root)) throw new Error("auto-merge waits for the checks to pass, and this project has none (no workflow in .github/workflows), so it would merge at once. Add checks first, then turn it on");
      const file = join(root, "factory.config.json"), raw = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, `${JSON.stringify(parseConfig({ ...raw, vcs: { ...raw.vcs, autoMerge: value === "on" } }), null, 2)}\n`);
      commitPaths(`software-factory: auto-merge ${value}`, "factory.config.json");
      return console.log(value === "on" ? "auto-merge on: a pull request merges as soon as its checks pass, with nobody to approve it" : "auto-merge off: you merge pull requests");
    }
    throw new Error("usage: factory vcs [auto-merge on|off]");
  }

  if (cmd === "push") {
    const item = find(args[0], "Done");
    const store = openEvents(), run = store.lastRun(item.id) ?? "";
    const { spec, review } = runTexts(root, run);
    const url = pushTask(root, item.id, item.title, spec, review);
    store.emit({ run, task: item.id, stage: "pr", type: "pr.opened", data: { url } });
    store.close();
    let tail = "Merge it when you are ready: the Merge button in the dashboard, factory merge " + item.id + ", or on GitHub.";
    if (autoMerge()) tail = armAutoMerge(root, url) ? "Auto-merge is on: GitHub merges it when the checks pass." : "Auto-merge is on: it merges when the checks pass (the dashboard or factory sync does it).";
    return console.log(`${item.id}: pushed; pull request ${url}\n${tail}`);
  }

  if (cmd === "merge") {
    const item = find(args[0], "Done");
    const lines = mergeTask(root, item.id);
    const store = openEvents();
    store.emit({ run: store.lastRun(item.id) ?? "", task: item.id, stage: "pr", type: "pr.merged", data: { by: "person" } });
    store.close();
    return console.log(lines.join("\n"));
  }

  if (cmd === "sync") return console.log(syncGithub(root, autoMerge()).join("\n") || "already up to date");

  if (cmd === "approve") {
    const item = find(args[0], "Awaiting approval");
    const where = land(root, item.id, item.title);
    removeWorktree(root, item.id, where === APPROVED); // an approved branch is kept: it has not been pushed yet
    editBacklog(`${item.id} → Done`, (t) => move(t, item.id, "Done", where.startsWith("http") ? where : ""));
    const store = openEvents();
    const run = store.lastRun(item.id) ?? "";
    store.emit({ run, task: item.id, stage: "pr", type: "task.landed", data: { where } });
    const events = run ? store.list(run) : [];
    store.close();
    const notes = withLock(() => recordLanding(item, where, run, events));
    // The graph follows the code: only a local merge changes the code on this branch (a pull request lands later).
    let graph = "";
    if (where === "merged locally" && graphEnabled()) {
      const g = updateGraph(root);
      if (g.ok) commitPaths("software-factory: update the knowledge graph", "graphify-out");
      graph = `\ngraph: ${g.ok ? g.message : `not updated (${g.message})`}`;
    }
    return console.log(`${item.id} → Done: ${where}${where === APPROVED ? `\nPush it when you are ready: factory push ${item.id} (or the Push button in the dashboard)` : ""}${notes.length ? `\nrecorded: ${notes.join(", ")}` : ""}${graph}`);
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
