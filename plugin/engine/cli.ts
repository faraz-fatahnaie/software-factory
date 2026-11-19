#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkAuthority } from "./authority";
import { add, dependsOn, FROM_CONVERSATION, move, parse, type Item, type Section } from "./backlog";
import { claudeRunner } from "./claude";
import { loadConfig, managerOf, parseConfig, projectTeam, readConfig } from "./config";
import { openStore } from "./events";
import { VERSION } from "./upgrade";
import { applyTeam, configure, ensureRoleFiles, detect, DOC_PATHS, doctor, init, nextStep, projectDocs, refreshRoleFiles } from "./init";
import { appendChronicle, appendNotes, chronicleEntry, parseScribe, stageOutput } from "./chronicle";
import { graphifyInstalled, updateGraph } from "./graph";
import { formatChecks, formatInfo, readiness, releaseInfo, tagRelease } from "./release";
import { allTracked, changesSince, formatFindings, scanSecrets } from "./security";
import { activeRoles, chatPrompt, chatPromptFor, describeTeam, perTask, presets, resolveTeam, ROLE_NAME } from "./team";
import { addCustom, changeTeam, moveSettings, offSettings, onSettings, removeCustom, renameSettings, teamForAgents, titleSettings, useSettings } from "./teamctl";
import { runTask, shellGate, stopAll, stubRunner, type Resume, type Runner } from "./pipeline";
import { addSkill, searchSkills, setSkill } from "./skills";
import { deliverStep, takeLock, type Step } from "./deliver";
import { armAutoMerge, baseBranch, closeTask, remoteUrl, ciWorkflow, failingChecksItem, formatStatus, hasChecks, listPrs, mergeTask, pushTask, revertTask, runTexts, syncGithub, vcsStatus, BATCH, pushBatch } from "./vcs";
import { uncommittedWork } from "./worktree";
import { abortUpdate, APPROVED, behindBy, commitAll, ensureWorktree, land, mergeBase, removeWorktree, unresolved, worktreeOf, isLanded, branchOf, git } from "./worktree";

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
factory update <F-id>                           bring a waiting task up to date with main (the Builder resolves any clash; nothing is pushed)
factory reject <F-id> --feedback "<what to change>" [--files a,b]   send a finished task back to the Builder with your comments (same branch, same spec)
factory release info | check [--deploy] | tag <version>   what a release holds, whether the project is ready, and tag it (never pushes)
factory scan [--since <revision>]                scan for hard-coded secrets: the whole project, or what changed since a revision
factory docs save                               commit the documents (docs/, README.md, AGENTS.md...) so task agents can read them
factory configure [--setup "<cmd>"]... [--gate "<cmd>"]...   change the project's setup and gate commands
factory skill search "<words>"                  search skills.sh: packages, install counts and review pages
factory skill suggested                         skills worth attaching to this team's roles, with the command for each (installs nothing)
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
factory vcs [auto-merge on|off | ci | fix <F-id>]  what is waiting to go to GitHub; turn auto-merge on or off; write the checks workflow; add a failing pull request's checks to the backlog
factory revert <F-id>                           undo a merged task: a revert on this branch, or (with a GitHub remote) a branch you push for review
factory discard <F-id>                          delete a task's worktree and branch, and return it to Ready
factory consult <topic> "<question>"            ask one role a question, read-only (for the manager in a terminal session)
factory manager [autopilot|assist|off | set <setting> <value>]  show or change what the Technical Manager may do by itself
factory serve [port]                            start the local control plane (default 127.0.0.1:4400)
factory add "<title>" [--detail "<lines>"] [--priority P1]   add an item to Inbox
factory skill add <owner/repo@skill> --role <r> install a skill and attach it to a role
factory skill attach|detach <skill> --role <r>  attach or detach a skill that is already installed`;

/** Runs backlog items through the pipeline, each in its own worktree, and moves each to Awaiting approval or Blocked. `resume` makes it a send-back of the single item. */
/**
 * Role files for this version of the plugin: a role it gained gets its file, and a generated file nobody edited is rebuilt from the new catalog. Both are
 * committed, because task worktrees branch from HEAD.
 */
function repairRoleFiles(): string[] {
  const { made, rebuilt } = withLock(() => {
    const made = ensureRoleFiles(root);
    if (made.length) commitPaths("software-factory: add role files for roles new in this version", ...made);
    const rebuilt = refreshRoleFiles(root);
    if (rebuilt.length) commitPaths(`software-factory: rebuild role files from the catalog of version ${VERSION}`, ...rebuilt);
    return { made, rebuilt };
  });
  if (made.length) console.log(`created ${made.join(", ")} (roles that are new in this version of the plugin)`);
  if (rebuilt.length) console.log(`rebuilt ${rebuilt.join(", ")} from this version's instructions (your attached skills are kept; a file you edited is left alone)`);
  return [...made, ...rebuilt];
}

async function runItems(config: ReturnType<typeof loadConfig>, runner: Runner, chosen: Item[], resume?: Resume, consent = false) {
  repairRoleFiles();
  // Nothing runs in a project that gives a role more than it is meant to have.
  const { errors } = checkAuthority(root);
  if (errors.length) throw new Error(`not started: the project breaks a rule about who may do what:\n  - ${errors.map((v) => v.text).join("\n  - ")}\nRun \`factory authority\` for the whole picture.`);
  const store = openEvents();
  // Uncommitted work in the main folder (F-120): the tasks start from the last commit and will not see it. Said now, and again in each handover.
  const uncommitted = uncommittedWork(root);
  if (uncommitted.length) {
    const text = `Your main folder has changes that are not committed (${uncommitted.slice(0, 5).join(", ")}${uncommitted.length > 5 ? ` and ${uncommitted.length - 5} more` : ""}). ${chosen.map((i) => i.id).join(", ")} start${chosen.length === 1 ? "s" : ""} from the last commit and will not include them: commit them first if the task${chosen.length === 1 ? "" : "s"} need${chosen.length === 1 ? "s" : ""} them.`;
    console.warn(text);
    store.emit({ run: "", task: "", stage: "manager", type: "manager.note", data: { text } });
  }
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
      const result = await runTask(item, { config, store, runner, gate: shellGate(config.gate), cwd: dir, resume, consent, uncommitted });
      ({ run, followUps } = result);
      if (!result.ok) error = result.error;
      else if (resume?.update && unresolved(dir, resume.files).length) error = `conflict markers remain in ${unresolved(dir, resume.files).join(", ")}`;
      else if (!commitAll(dir, `${item.id}: ${item.title}${resume ? ` (round ${resume.round})` : ""}`) && !resume?.update) error = "the review approved a build that changed nothing";
    } catch (e) {
      error = String(e);
    }
    // An update that could not be finished puts the branch back as it was: nothing is lost.
    if (error && resume?.update) try { abortUpdate(worktreeOf(root, item.id)); } catch { /* already restored */ }
    // Said plainly (F-125): a failed update used to show only as "the update failed; approved as it was" in the backlog's history.
    if (error && resume?.update) {
      const quota = /rate limited|usage limit/i.test(error);
      store.emit({ run, task: item.id, stage: "manager", type: "manager.decision", data: { action: "update-failed", auto: true, text: `${item.id}: the update from main could not be finished${quota ? ", because the models ran out of quota" : ` (${error.replace(/^Error: /, "").split("\n")[0]!.slice(0, 160)})`}. Its branch is back as it was, so nothing is lost, and it still clashes with main. ${quota ? "Try Update this branch again when your quota is back" : "Try Update this branch again, or discard it and build it again on today's main"}.` } });
    }
    const to: Section = error ? "Blocked" : "Awaiting approval";
    editBacklog(`${item.id} → ${to}`, (t) => followUps.reduce((text, f) => add(text, f, "Inbox", { detail: `Depends on: ${item.id}\nFound while building ${item.id}.` }).text, move(t, item.id, to)));
    console.log(error
      ? `${item.id} → Blocked: ${error} (run ${run})`
      : `${item.id} → Awaiting approval (run ${run}). Review: git diff HEAD...factory/${item.id}  then: factory approve ${item.id} | factory reject ${item.id} --feedback "..." | factory discard ${item.id}`);
    return !error;
  }));
  store.close();
  if (results.includes(false)) process.exitCode = 1;
}

/** What a send-back or an update needs from the task's last run: its spec, and the next round number. */
function resumeFrom(item: Item, feedback: string, files: string[], update = false): Resume {
  const store = openEvents(), before = store.last("run.start", item.id), lastRun = store.lastRun(item.id);
  const spec = store.output(item.id, "spec") ?? ""; // the log keeps it: the task's run folder is in its worktree
  store.close();
  return { spec, feedback, files, update, round: (((before?.data as { round?: number } | undefined)?.round) ?? 1) + 1 };
}

async function main([cmd, ...args]: string[]) {
  if (cmd === "add" && args[0]) {
    // Flags may come after the title: factory add "<title>" --detail "<lines>" --priority P1
    const value = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1] ?? (() => { throw new Error(`${flag} needs a value`); })(); };
    const detail = value("--detail"), prio = value("--priority");
    const title = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--detail" && args[i - 1] !== "--priority").join(" ");
    // An item a conversation adds was worked out with the person: autopilot may start it. Agents' follow-ups carry no such mark.
    const added = add(readFileSync(backlogPath, "utf8"), title, "Inbox", { detail: process.env.FACTORY_SOURCE === "chat" ? [detail, FROM_CONVERSATION].filter(Boolean).join("\n") : detail, prio });
    editBacklog(`add ${added.id}`, () => added.text);
    return console.log(`added ${added.id} to Inbox`);
  }

  if (cmd === "skill" && args[0] === "suggested") {
    const { suggestedSkills } = await import("./skills");
    const list = suggestedSkills(root);
    if (!list.length) return console.log("every suggested skill is attached already (or the roles that would take them only talk)");
    return console.log(`Suggested skills, none installed until you run the line:\n${list.map((s) => `  ${s.role.padEnd(20)} ${s.why}\n    ${s.command}`).join("\n")}`);
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
    return console.log(`${action === "detach" ? "detached" : "attached"} ${skill} ${action === "detach" ? "from" : "to"} ${role.split(",").join(", ")}`);
  }

  if (cmd === "serve") {
    // Imported here so every other command works without the GUI and its dependencies.
    const { serve } = await import("./server");
    // One dashboard per project: each project prefers its own port (4400-4499, from its path) and moves on if another project holds it.
    repairRoleFiles();
    const { replaceOlder, ownDashboards, VERSION } = await import("./upgrade");
    // This project may already have a dashboard on any port (an earlier session chose its own): an older one is stopped, and a current one is the one to use, not a second.
    for (const d of await ownDashboards(root)) {
      const r = await replaceOlder(d.port, root);
      if (r.state === "current") return console.log(`this project's control plane is already running: http://127.0.0.1:${d.port}${r.version ? ` (version ${r.version})` : ""}`);
      if (r.state === "replaced") console.log(`stopped this project's dashboard on port ${d.port}, which was running ${r.was ? `version ${r.was}` : "an older version"}, to start version ${VERSION}`);
      if (r.state === "failed") console.log(`this project's dashboard on port ${d.port} runs ${r.was ? `version ${r.was}` : "an older version"} and could not be stopped: stop it (${r.pids.length ? `kill ${r.pids.join(" ")}` : `find it with: lsof -nP -iTCP:${d.port} -sTCP:LISTEN`}), then open again`);
    }
    const auto = args[0] === undefined, start = Number(Bun.hash(root) % 100n);
    for (let i = 0; i < (auto ? 100 : 1); i++) {
      const port = auto ? 4400 + ((start + i) % 100) : Number(args[0]);
      // An update does not stop a dashboard that is already running: one of this project's that runs an older version is replaced, so opening it gives the new version.
      const old = await replaceOlder(port, root);
      if (old.state === "current") return console.log(`this project's control plane is already running: http://127.0.0.1:${port}${old.version ? ` (version ${old.version})` : ""}`);
      if (old.state === "replaced") console.log(`stopped this project's dashboard on port ${port}, which was running ${old.was ? `version ${old.was}` : "an older version"}, to start version ${VERSION}`);
      if (old.state === "failed") console.log(`this project's dashboard on port ${port} runs ${old.was ? `version ${old.was}` : "an older version"} and could not be stopped: stop it (${old.pids.length ? `kill ${old.pids.join(" ")}` : `find it with: lsof -nP -iTCP:${port} -sTCP:LISTEN`}), then open again`);
      try { const server = await serve(root, port, { supervisor: true }); return console.log(`factory control plane: http://127.0.0.1:${server.port}`); }
      catch (e) { if ((e as { code?: string }).code !== "EADDRINUSE") throw e; }
    }
    throw new Error(auto ? "no free port between 4400 and 4499" : `port ${args[0]} is in use by another program or project`);
  }

  if (cmd === "manager") {
    // What the Technical Manager may do by itself. The dashboard's Talk page has the same switch.
    const { AUTONOMY, MANAGER_DEFAULTS } = await import("./config");
    const { AUTONOMY_TEXT, writeManager } = await import("./supervisor");
    const [sub, key, value] = args;
    if (sub === "report") { // the facts she works from: milestones, what stopped tasks, what each role cost
      const { allEvents, report } = await import("./retro");
      const store = openEvents();
      try { return console.log(report(readItems(), allEvents(store))); } finally { store.close(); }
    }
    let m = managerOf(loadConfig(root));
    if (sub && (AUTONOMY as string[]).includes(sub)) m = writeManager(root, { autonomy: sub as never });
    else if (sub === "set") {
      if (!key || !(key in MANAGER_DEFAULTS) || key === "autonomy" || value === undefined || Number.isNaN(Number(value))) throw new Error(`usage: factory manager set <${Object.keys(MANAGER_DEFAULTS).filter((k) => k !== "autonomy").join("|")}> <number>`);
      m = writeManager(root, { [key]: Number(value) });
    } else if (sub) throw new Error("usage: factory manager [autopilot|assist|off | report | set <setting> <value>]");
    if (sub) commitPaths(`manager: ${sub === "set" ? `${key} ${value}` : sub}`, "factory.config.json");
    return console.log(`${AUTONOMY_TEXT[m.autonomy]}.\nAt most ${m.parallel} task${m.parallel === 1 ? "" : "s"} at once · ${m.recoveries} automatic retries per task · up to $${m.perTask} per task and $${m.perDay} per day · a task with no sign of life for ${m.stall} minutes is stopped · no new work while ${m.unmerged} approved tasks are not merged yet.`);
  }

  if (cmd === "integrate") {
    // What is waiting to reach main, which of it will clash, and the order to merge it in. Only reads.
    const { plan, formatPlan } = await import("./integrate");
    const p = plan(root, readItems());
    return console.log(args.includes("--json") ? JSON.stringify(p) : formatPlan(p));
  }

  if (cmd === "authority") {
    // Who may do what, and whether the rules about it hold.
    const { authorityMatrix, checkAuthority: check } = await import("./authority");
    const a = check(root);
    console.log("Who may do what");
    for (const r of authorityMatrix(root)) console.log(`  ${r.title} (${r.role}): ${r.can.join("; ") || "talks and advises"}${r.proposes.length ? `  [proposes, you press: ${r.proposes.join(", ")}]` : ""}${r.conversations.length ? `  [talks: ${r.conversations.join(", ")}]` : ""}${r.skills.length ? `  [skills: ${r.skills.join(", ")}]` : ""}`);
    console.log("  Only a person: approve, push, merge, deploy, discard, revert, and change the configuration.");
    const list = (title: string, vs: { rule: string; where: string; text: string }[]) => { if (vs.length) console.log(`\n${title}\n${vs.map((v) => `  [${v.rule}] ${v.text}`).join("\n")}`); };
    list(`Problems (${a.errors.length}): these stop work`, a.errors);
    list(`Worth a look (${a.warnings.length})`, a.warnings);
    list(`Known gaps (${a.known.length}): written down, to be closed (F-098)`, a.known);
    if (!a.errors.length) console.log("\nThe rules hold.");
    return process.exit(a.errors.length ? 1 : 0);
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

  if (cmd === "consult") {
    // One question to one role, read-only: what the manager uses in a terminal session to ask the team.
    const { askable, chatTurn } = await import("./chat");
    const [topic, ...words] = args, question = words.join(" ").trim(), team = projectTeam(root);
    const known = askable(team).map((a) => a.key);
    if (!topic || !question || !known.includes(topic)) throw new Error(`usage: factory consult <${known.join("|")}> "<question>"`);
    const r = await chatTurn(root, { topic, message: `The Technical Manager is asking you for the person, who is talking to the manager and not to you. Answer in under 200 words, in plain words. Do not ask the person questions: if you need something, say what is missing.\n\n${question}`, model: "sonnet", effort: "medium" }, team, { readOnly: true });
    if (!r.ok) throw new Error(`${topic} could not answer: ${r.text}`);
    return console.log(r.text);
  }

  if (cmd === "role") {
    const [name, ...ids] = args;
    if (!name) throw new Error("usage: factory role <role> [id...]  or  factory role <id>...  or  factory role manage");
    if (name === "manage") return console.log((await import("./chat")).managerPrompt(projectTeam(root), true)); // the Technical Manager, for a terminal session
    // Named by responsibility (D1 D3), so the commands keep working however the team is grouped; or by role.
    return console.log(/^[A-Z]\d{1,3}$/.test(name) ? chatPromptFor(args, projectTeam(root)) : chatPrompt(name, ids, projectTeam(root)));
  }

  const autoPush = () => { try { return !!loadConfig(root).vcs?.autoPush; } catch { return false; } };
  const autoMerge = () => { try { return !!loadConfig(root).vcs?.autoMerge; } catch { return false; } };
  if (cmd === "vcs") {
    const [sub, value] = args;
    if (!sub) return console.log(formatStatus(vcsStatus(root), autoMerge(), autoPush()));
    if (sub === "auto-push" && (value === "on" || value === "off") && args.length === 2) {
      const file = join(root, "factory.config.json"), raw = readConfig(root);
      writeFileSync(file, `${JSON.stringify(parseConfig({ ...raw, vcs: { ...raw.vcs, autoPush: value === "on" } }), null, 2)}\n`);
      commitPaths(`software-factory: push on approval ${value}`, "factory.config.json");
      return console.log(value === "on" ? "push on approval on: approving a task pushes its branch and opens its pull request at once (the secret scan still runs first)" : "push on approval off: you push each task yourself");
    }
    if (sub === "auto-merge" && (value === "on" || value === "off") && args.length === 2) {
      if (value === "on" && !hasChecks(root)) throw new Error("auto-merge waits for the checks to pass, and this project has none (no workflow in .github/workflows), so it would merge at once. Add checks first, then turn it on");
      const file = join(root, "factory.config.json"), raw = readConfig(root);
      writeFileSync(file, `${JSON.stringify(parseConfig({ ...raw, vcs: { ...raw.vcs, autoMerge: value === "on" } }), null, 2)}\n`);
      commitPaths(`software-factory: auto-merge ${value}`, "factory.config.json");
      return console.log(value === "on" ? "auto-merge on: a pull request merges as soon as its checks pass, with nobody to approve it" : "auto-merge off: you merge pull requests");
    }
    if (sub === "ci" && args.length === 1) {
      const file = ".github/workflows/factory-checks.yml";
      if (existsSync(join(root, file))) throw new Error(`${file} already exists. Edit it instead`);
      const cfg = loadConfig(root), yml = ciWorkflow(detect(root).stack, cfg.setup ?? [], cfg.gate);
      if (!yml) throw new Error("this project has no gate commands to run as checks. Set them with: factory configure --gate \"<cmd>\"");
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(join(root, file), yml);
      commitPaths("software-factory: add GitHub checks (CI)", file);
      return console.log(`wrote ${file} from the setup and gate commands. Read it; it runs on GitHub once you push, and auto-merge can now be turned on.`);
    }
    if (sub === "fix" && value && /^F-\d+$/.test(value) && args.length === 2) {
      const pr = listPrs(root)?.get(value);
      if (!pr) throw new Error(`${value} has no pull request that GitHub reports`);
      const { title, detail } = failingChecksItem(value, pr);
      const added = add(readFileSync(backlogPath, "utf8"), title, "Inbox", { detail });
      editBacklog(`add ${added.id}`, () => added.text);
      return console.log(`added ${added.id} to Inbox`);
    }
    throw new Error("usage: factory vcs [auto-merge on|off | ci | fix <F-id>]");
  }

  /** Pushes an approved task and opens its pull request. Throws, in plain words, when it cannot (a possible secret, not signed in). */
  const pushItem = (item: Item) => {
    const store = openEvents(), run = store.lastRun(item.id) ?? "";
    const { spec, review } = runTexts(store, item.id);
    const url = pushTask(root, item.id, item.title, spec, review);
    store.emit({ run, task: item.id, stage: "pr", type: "pr.opened", data: { url } });
    store.close();
    const tail = autoMerge() ? (armAutoMerge(root, url) ? "Auto-merge is on: GitHub merges it when the checks pass." : "Auto-merge is on: it merges when the checks pass (the dashboard or factory sync does it).")
      : "Merge it when you are ready: the Merge button in the dashboard, factory merge " + item.id + ", or on GitHub.";
    return `${item.id}: pushed; pull request ${url}\n${tail}`;
  };
  if (cmd === "push" && args.includes("--together")) {
    // Several approved tasks as one pull request. A task that clashes with an earlier one is held back, and said so.
    const ids = args.filter((a) => /^F-\d+$/.test(a)), odd = args.filter((a) => !/^F-\d+$/.test(a) && a !== "--together");
    if (odd.length || ids.length < 2) throw new Error("usage: factory push <F-id> <F-id>... --together   (two to eight approved tasks)");
    const store = openEvents();
    const tasks = ids.map((id) => { const item = find(id, "Done"); return { id, title: item.title, ...runTexts(store, id) }; });
    const r = pushBatch(root, tasks);
    for (const id of r.included) store.emit({ run: store.lastRun(id) ?? "", task: id, stage: "pr", type: "pr.opened", data: { url: r.url, batch: r.branch } });
    store.close();
    const tail = autoMerge() ? (armAutoMerge(root, r.url) ? "Auto-merge is on: GitHub merges it when the checks pass." : "Auto-merge is on: it merges when the checks pass (the dashboard or factory sync does it).")
      : `Merge it when you are ready: the Merge button in the dashboard, factory merge ${r.branch.slice("factory/".length)}, or on GitHub.`;
    return console.log(`${r.included.join(", ")}: pushed as one pull request ${r.url}${r.held.map((h) => `\n${h.id}: held back, ${h.why}. Push it on its own: factory push ${h.id}`).join("")}\n${tail}`);
  }
  if (cmd === "push") return console.log(pushItem(find(args[0], "Done")));

  if (cmd === "revert") return console.log(revertTask(root, find(args[0], "Done").id));

  if (cmd === "merge" && BATCH.test(args[0] ?? "")) return console.log(mergeTask(root, args[0]!).join("\n")); // a combined pull request
  if (cmd === "merge") {
    const item = find(args[0], "Done");
    const lines = mergeTask(root, item.id);
    const store = openEvents();
    store.emit({ run: store.lastRun(item.id) ?? "", task: item.id, stage: "pr", type: "pr.merged", data: { by: "person" } });
    store.close();
    return console.log(lines.join("\n"));
  }

  if (cmd === "deliver") {
    // F-124: autopilot only. One step: push the next approved task, or merge the open pull request when its checks pass. `--watch` keeps taking steps until
    // nothing is left (or a person is needed), so delivery goes on after the dashboard is closed.
    if (managerOf(loadConfig(root)).autonomy !== "autopilot") return console.log("deliver runs only on autopilot");
    const unlock = takeLock(root);
    if (!unlock) return console.log("deliver is already running");
    const store = openEvents();
    const once = (): Step => {
      try {
        const r = deliverStep(root, readItems(), store);
        const text = r.did ?? r.needs;
        let text2 = text;
        const same = (id: string) => !r.did && JSON.stringify(store.decisions(id, 1)[0]?.data ?? "").includes(JSON.stringify(text ?? "").slice(1, -1)); // a blocked message is said once
        const failId = /^(F-\d+): the checks on its pull request #\d+ are failing/.exec(text ?? "")?.[1];
        if (failId && !same(failId)) { // with the fix waiting in the Inbox for the person's yes
          const pr = listPrs(root)?.get(failId);
          if (pr) { const { title, detail } = failingChecksItem(failId, pr); const added = add(readFileSync(backlogPath, "utf8"), title, "Inbox", { detail }); editBacklog(`add ${added.id}`, () => added.text); text2 = `${text} I added ${added.id} to your Inbox describing what failed: promote it and the team fixes it.`; }
        }
        if (text) { const id = /^(F-\d+)/.exec(text)?.[1] ?? ""; if (!same(id)) store.emit({ run: store.lastRun(id) ?? "", task: id, stage: "manager", type: "manager.decision", data: { action: r.did ? "deliver" : "deliver-blocked", auto: true, text: text2 } }); }
        console.log(text2 ?? (r.waiting ? "waiting for checks" : "nothing to deliver"));
        return r;
      } catch (e) {
        const text = `Delivery to GitHub stopped: ${(e as Error).message.split("\n")[0]}. Nothing was lost; push or merge it yourself, or fix that and it goes on.`;
        store.emit({ run: "", task: "", stage: "manager", type: "manager.decision", data: { action: "deliver-blocked", auto: true, text } });
        console.log(text);
        return { needs: text };
      }
    };
    try {
      if (!args.includes("--watch")) { once(); return; }
      const until = Date.now() + 3 * 3_600_000; // a watcher never outlives three hours
      while (Date.now() < until) {
        const r = once();
        if (r.needs) break; // a person is needed: the next approval or the dashboard starts it again
        if (!r.did && !r.waiting) break; // nothing left
        if (!r.did) await Bun.sleep(30_000);
      }
    } finally { store.close(); unlock(); }
    return;
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
    // Opt-in: approving also pushes. A push that cannot happen (a possible secret, not signed in) never undoes the approval.
    let pushed = where === APPROVED ? `\nPush it when you are ready: factory push ${item.id} (or the Push button in the dashboard)` : "";
    if (where === APPROVED && autoPush()) {
      try { pushed = `\n${pushItem({ ...item, section: "Done" })}`; } catch (e) { pushed = `\nApproved, but not pushed: ${(e as Error).message}\nPush it yourself when that is fixed: factory push ${item.id}`; }
    }
    // Autopilot delivers at once and keeps watching the pull request, so delivery needs neither the dashboard nor a second command.
    if (where === APPROVED && !autoPush() && !process.env.FACTORY_NO_WATCH && remoteUrl(root) && managerOf(loadConfig(root)).autonomy === "autopilot") {
      try { Bun.spawn([process.execPath, import.meta.path, "deliver", "--watch"], { cwd: root, stdio: ["ignore", "ignore", "ignore"] }).unref(); pushed = `\nAutopilot is taking it to GitHub in the background: it pushes, opens the pull request and merges it when the checks pass. Progress is in the manager's feed.`; } catch { pushed = `\nApproved. Autopilot will deliver it within a minute while the dashboard is open.`; }
    }
    return console.log(`${item.id} → Done: ${where}${pushed}${notes.length ? `\nrecorded: ${notes.join(", ")}` : ""}${graph}`);
  }

  if (cmd === "rebuild") {
    // The way out of a clash too large to update: the task goes back to Ready, its old branch (and open pull request) are dropped, and it is built again on today's main.
    const item = find(args[0], "Awaiting approval", "Done", "Blocked");
    let closed: string | null = null;
    if (remoteUrl(root)) { try { closed = closeTask(root, item.id); } catch (e) { throw new Error(`${(e as Error).message}\nNothing was changed.`); } }
    removeWorktree(root, item.id);
    editBacklog(`${item.id} → Ready (rebuild)`, (t) => move(t, item.id, "Ready"));
    const store = openEvents();
    store.emit({ run: store.lastRun(item.id) ?? "", task: item.id, stage: "pr", type: "task.discarded", data: { rebuild: true } });
    store.close();
    return console.log(`${item.id} → Ready: the old branch${closed ? ` and ${closed}` : ""} are gone; run it again to build it on today's ${baseBranch(root)}`);
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
    const unknown = args.filter((a, i) => !/^F-\d+$/.test(a) && a !== "--stub" && a !== "--anyway" && a !== "--parallel" && (p < 0 || i !== p + 1));
    if (unknown.length) throw new Error(`unknown argument: ${unknown.join(" ")}`);
    if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error("--parallel takes a number from 1 to 8");
    // A task that needs another task's work is not built before that work is in main: it would be built without it, and fail the same way every time.
    const waiting = (i: Item) => dependsOn(i).flatMap((id) => {
      const dep = readItems().find((x) => x.id === id);
      if (!dep) return [];
      return dep.section !== "Done" ? [`${id} (still ${dep.section})`] : isLanded(root, id) ? [] : [`${id} (approved, but not merged into main yet)`];
    });
    const anyway = args.includes("--anyway");
    const chosen = ids.length
      ? ids.map((id) => find(id, "Inbox", "Ready", "Blocked"))
      : readItems().filter((i) => i.section === "Ready" && (anyway || !waiting(i).length)).slice(0, count);
    if (!chosen.length) throw new Error(readItems().some((i) => i.section === "Ready") ? "every item under Ready is waiting for another task to land first (see `factory status`), or run one with --anyway" : "nothing under Ready");
    if (!anyway) for (const i of chosen) if (waiting(i).length) throw new Error(`${i.id} needs ${waiting(i).join(", ")} first. Land it (push and merge it, or \`factory sync\`), or build ${i.id} without it with --anyway`);

    // --anyway is the person's word: build it without what it waits for, and build risky work the spec names (F-111).
    return runItems(config, runner, chosen, undefined, anyway);
  }

  if (cmd === "reject") {
    // A person sends a finished task back: same branch and folder, the earlier spec, and what they said handed to the Builder.
    const value = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1] ?? (() => { throw new Error(`${flag} needs a value`); })(); };
    const feedback = (value("--feedback") ?? "").trim(), files = (value("--files") ?? "").split(",").map((f) => f.trim()).filter(Boolean);
    const id = args.find((a) => /^F-\d+$/.test(a));
    // --from manager: the guidance is the Technical Manager's (autopilot's recovery), and is labelled hers, never the person's.
    const fromManager = args.includes("--from") && value("--from") === "manager";
    if (args.includes("--from") && !fromManager) throw new Error("--from takes: manager");
    const unknown = args.filter((a, i) => a !== id && a !== "--stub" && a !== "--feedback" && a !== "--files" && a !== "--from" && args[i - 1] !== "--feedback" && args[i - 1] !== "--files" && args[i - 1] !== "--from");
    if (unknown.length) throw new Error(`unknown argument: ${unknown.join(" ")}`);
    if (!feedback || feedback.length > 4000) throw new Error('usage: factory reject <F-id> --feedback "<what to change, up to 4000 characters>" [--files a,b] [--stub]');
    if (files.length > 20 || files.some((f) => f.length > 200 || /[\r\n]/.test(f))) throw new Error("--files: up to 20 paths of up to 200 characters");
    const item = find(id, "Awaiting approval", "Blocked");
    const again = { ...resumeFrom(item, feedback, files), ...(fromManager && { from: "manager" as const }) };
    if (item.section === "Blocked" && !again.spec) throw new Error(`${item.id} stopped before it had a spec, so there is nothing to continue: run it again (factory run ${item.id})`);
    return runItems(loadConfig(root), args.includes("--stub") ? stubRunner : claudeRunner(loadConfig(root).gate), [item], again);
  }

  if (cmd === "update") {
    // Main moved on while the task waited for a decision: merge it into the task's own branch, never into main, and check again.
    const unknown = args.filter((a) => !/^F-\d+$/.test(a) && a !== "--stub");
    if (unknown.length) throw new Error(`unknown argument: ${unknown.join(" ")}`);
    const item = find(args.find((a) => /^F-\d+$/.test(a)), "Awaiting approval", "Done");
    // An approved task (with a GitHub origin its branch waits for a pull request to be merged) has no folder any more: one is made for the update, and removed again.
    const approved = item.section === "Done";
    if (approved && (Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", `refs/heads/${branchOf(item.id)}`], { cwd: root }).exitCode !== 0 || isLanded(root, item.id)))
      throw new Error(`${item.id} is already in ${baseBranch(root)}: there is nothing to update`);
    const config = loadConfig(root), base = baseBranch(root), dir = worktreeOf(root, item.id);
    if (approved && !existsSync(dir)) git(root, "worktree", "add", "-q", dir, branchOf(item.id));
    const runner = args.includes("--stub") ? stubRunner : claudeRunner(config.gate);
    const behind = behindBy(root, item.id);
    if (!behind) { if (approved) removeWorktree(root, item.id, true); return console.log(`${item.id} is already up to date with ${base}`); }
    const store = openEvents(), run = store.lastRun(item.id) ?? "";
    const note = (type: string, data: unknown, stage = "update") => store.emit({ run, task: item.id, stage, type, data });
    note("update.start", { base, commits: behind });
    const clash = mergeBase(dir, base);
    if (clash.length) {
      note("update.conflict", { files: clash });
      store.close();
      console.log(`${item.id}: ${base} has ${behind} new commit(s) and ${clash.join(", ")} clash${clash.length === 1 ? "es" : ""}; the Builder resolves it`);
      await runItems(config, runner, [item], resumeFrom(item, `Update from ${base}: resolve the conflicts in ${clash.join(", ")}`, clash, true));
      // New code (the Builder's resolution) needs the person's yes again. If it could not be resolved, the task is approved as it was: the branch is put back, and the failure stays in the log.
      if (approved && readItems().find((i) => i.id === item.id)?.section === "Blocked") { editBacklog(`${item.id} → Done (the update failed; approved as it was)`, (t) => move(t, item.id, "Done")); removeWorktree(root, item.id, true); }
      return;
    }
    // A clean merge: the Builder changed nothing, so only the checks run again. A failure puts the branch back as it was.
    store.emit({ run, task: item.id, stage: "check", type: "stage.start" });
    const check = await shellGate(config.gate)(dir);
    store.emit({ run, task: item.id, stage: "check", type: check.ok ? "stage.ok" : "stage.failed", data: check.output });
    if (!check.ok) {
      abortUpdate(dir);
      if (approved) removeWorktree(root, item.id, true);
      note("update.failed", { output: check.output.slice(-1000) });
      store.close();
      throw new Error(`${item.id} was not updated: the checks fail with the new ${base}. Nothing changed. Send it back with a comment to have the Builder fix it.\n${check.output}`);
    }
    for (const st of ["security", "review"]) store.emit({ run, task: item.id, stage: st, type: "stage.skipped", data: "kept: the code did not change" });
    note("update.done", { base, commits: behind });
    store.close();
    if (approved) removeWorktree(root, item.id, true); // the branch keeps the merge; there is no folder to keep
    return console.log(`${item.id} is up to date with ${base} (${behind} commit(s) merged, checks pass). Nothing was pushed.${approved ? ` Push the update to its pull request with: factory push ${item.id}` : ""}`);
  }

  console.log(USAGE);
  if (cmd) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
