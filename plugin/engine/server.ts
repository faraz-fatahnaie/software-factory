import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "./backlog";
import { chatArgs, chatTurn, managerTurn, resumeChat, stopChat, TOPICS, compactTurn, managerPrompt } from "./chat";
import { loadConfig, managerOf, parseConfig, projectRoles, projectTeam } from "./config";
import { parseProposal, personAsked, type Context, checkSetup } from "./state";
import { checkAuthority, checkRoleFile, checkLimits } from "./authority";
import { trial, waiting } from "./integrate";
import { VERSION } from "./upgrade";
import { commandsFor, projectCommands } from "./commands";
import { appendChat, clearChat, importChat, markActed, markCompacted, readChat, replyMsg } from "./chatlog";
import { allEvents, report, weeklyNote } from "./retro";
import { problemsOf, problemSummary } from "./problems";
import { supervisor, writeManager } from "./supervisor";
import { openStore } from "./events";
import { healthChecks, type Health } from "./health";
import { parseFind, roleSkills, SKILLS_CLI, skillProblems } from "./skills";
import { chatPromptFor, holderOf, stageRole } from "./team";
import { changeTeam, parseChanges, planTeam, presetList, teamView } from "./teamctl";
import { commitDetail, fileDiff, graphInfo, sourceInfo } from "./source";
import { BATCH, hasChecks, remoteUrl, vcsStatus } from "./vcs";
import { behindBy, isLanded, listWorktrees } from "./worktree";

const CLI = join(import.meta.dir, "cli.ts");
const ID = /^F-\d+$/;
const json = (body: unknown, status = 200) => Response.json(body, { status });
// Commands the page may run. Each is a fixed command line, so the page cannot pass anything to a shell.
const COMMANDS: Record<string, string[]> = {
  doctor: ["doctor"], status: ["status"], "release-info": ["release", "info"], "release-check": ["release", "check"], scan: ["scan"], "team-apply": ["team", "apply"],
};

// The page ships prebuilt in dist/, so an installed plugin needs no dependencies. The source
// lives outside the plugin folder; where it is present (this repository), it is rebuilt on start.
const DIST = join(import.meta.dir, "..", "dist");
const SOURCE = join(import.meta.dir, "..", "..", "gui", "index.html");
let building: Promise<void> | undefined;
async function buildGui() {
  if (!existsSync(SOURCE)) return;
  rmSync(DIST, { recursive: true, force: true }); // chunk names carry a content hash, so old ones would pile up
  const result = await Bun.build({ entrypoints: [SOURCE], outdir: DIST, minify: true, define: { "process.env.NODE_ENV": '"production"' } });
  if (!result.success) throw new Error(`GUI build failed:\n${result.logs.join("\n")}`);
}

/** In a source checkout, rebuild the page when anything it is made from is newer than the build, so a refresh shows the latest. */
async function freshGui() {
  const sourceDir = join(import.meta.dir, "..", "..", "gui");
  if (!existsSync(sourceDir)) return; // an installed copy ships the build only
  const newest = Math.max(statSync(join(import.meta.dir, "state.ts")).mtimeMs, ...readdirSync(sourceDir).map((f) => statSync(join(sourceDir, f)).mtimeMs));
  const built = existsSync(join(DIST, "index.html")) ? statSync(join(DIST, "index.html")).mtimeMs : 0;
  if (newest > built) await (building ??= buildGui().finally(() => { building = undefined; }));
}

/** Local control plane: a live event stream plus endpoints that run the same CLI a person would. */
/** Whether a person's conversations end with suggested next messages: their own setting, else on for the Product Partner and the Guide only. */
function suggestOn(root: string, role?: string): boolean {
  if (!role) return false;
  const standard = role === "product-partner" || role === "guide" || role === "technical-manager";
  try { return loadConfig(root).chat?.suggest?.[role] ?? standard; } catch { return standard; }
}

/** `supervisor`: the Technical Manager acts by itself, as its autonomy setting allows. Only `factory serve` asks for it; tests and the browser checks do not. */
export async function serve(root: string, port = 4400, opts: { supervisor?: boolean; /** Tests: how often the supervisor looks, and a multiplier for its waits. */ every?: number; scale?: number } = {}) {
  await buildGui();
  mkdirSync(join(root, ".factory"), { recursive: true });
  const store = openStore(join(root, ".factory", "events.db"));
  const running = new Map<string, { kill(signal?: number | NodeJS.Signals): void }>();
  const chatting = new Set<string>(); // conversations with a reply on its way
  /** Starts a command for some tasks in the background, and says so if it fails before a run exists. False when one of them is already running. */
  const launch = (ids: string[], argv: string[]) => {
    if (ids.some((id) => running.has(id))) return false;
    const p = Bun.spawn([process.execPath, CLI, ...argv], { cwd: root, stdout: "inherit", stderr: "pipe", env: process.env });
    const stderr = new Response(p.stderr).text();
    for (const id of ids) running.set(id, p);
    p.exited.then(async (code) => {
      for (const id of ids) running.delete(id);
      const error = (await stderr).trim();
      if (code !== 0 && error) store.emit({ run: "", task: ids.join(","), stage: "run", type: "command.failed", data: { error: error.slice(-1000) } });
    });
    return true;
  };
  const startOne = (id: string, argv: string[]) => (launch([id], argv) ? json({ started: [id] }, 202) : json({ error: "already running" }, 409));
  let healthCache: { at: number; body: Health[] } | undefined;
  const items = () => parse(readFileSync(join(root, "BACKLOG.md"), "utf8"));

  const sh = async (...argv: string[]) => {
    const p = Bun.spawn(argv, { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 120_000, env: { ...process.env, NO_COLOR: "1" } });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { out, err, code };
  };
  // Short commands (add, approve, discard, skills): wait and return what the CLI printed.
  const cli = async (...args: string[]) => {
    const r = await sh(process.execPath, CLI, ...args);
    return json({ ok: r.code === 0, output: `${r.out}${r.err}`.trim() }, r.code === 0 ? 200 : 409);
  };
  // The only files the studio may read or write. Paths are matched against this list, never joined blindly.
  const editable = () =>
    ["AGENTS.md", "CLAUDE.md", ...new Bun.Glob(".claude/agents/*.md").scanSync({ cwd: root, dot: true }), ...new Bun.Glob(".claude/skills/*/SKILL.md").scanSync({ cwd: root, dot: true })]
      .filter((f) => existsSync(join(root, f)))
      .sort();

  // Server-sent events from the event log. `after` is a sequence number, so a reconnect
  // (Last-Event-ID) resumes where it left off and `after=0` replays everything.
  const stream = (after: number) => {
    let timer: ReturnType<typeof setInterval>;
    const body = new ReadableStream({
      start(controller) {
        let idle = 0;
        const tick = () => {
          const rows = store.since(after);
          for (const e of rows) controller.enqueue(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
          if (rows.length) after = rows.at(-1)!.seq;
          else if (++idle % 20 === 0) controller.enqueue(": ping\n\n");
        };
        tick();
        // ponytail: polls SQLite twice a second, since the writers are other processes.
        // Move to a socket or file watch if that latency or load ever matters.
        timer = setInterval(tick, 500);
      },
      cancel: () => clearInterval(timer),
    });
    return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  };

  let vcsCache: { at: number; remote: string | null; body: object } | undefined;
  // With auto-merge on, something has to notice when checks turn green. Once a minute, and only then.
  const sweep = setInterval(async () => {
    try {
      const c = loadConfig(root);
      if (managerOf(c).autonomy === "autopilot") { await sh(process.execPath, CLI, "deliver"); vcsCache = undefined; } // F-124
      else if (c.vcs?.autoMerge) { await sh(process.execPath, CLI, "sync"); vcsCache = undefined; }
    } catch { /* a failed sweep is tried again next minute */ }
  }, 60_000);
  sweep.unref();
  const teamPayload = () => {
    const raw = JSON.parse(readFileSync(join(root, "factory.config.json"), "utf8"));
    return { ...teamView(projectTeam(root), loadConfig(root), store.since(0), raw.team?.preset), presets: presetList() };
  };

  const model = async (id: string, message: string) => {
    const r = await chatTurn(root, { topic: "manager", message, model: "haiku", effort: "low" }, projectTeam(root), { group: "supervisor" }); // its own group: a person stopping a conversation does not stop it
    store.emit({ run: "", task: "", stage: "chat", type: "chat.turn", data: { topic: "supervisor", usage: { costUsd: r.costUsd ?? 0 } } }); // counted in the day's spend like any other model call
    return r.ok ? r.text.replace(/^(ASK [a-z]+:|PROPOSE:) .*$/gm, "").trim() : "";
  };
  /** Approved tasks whose branch is not in main yet: the pile autopilot keeps under its limit. */
  const unmergedTasks = () => items().filter((i) => i.section === "Done" && Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", `refs/heads/factory/${i.id}`], { cwd: root }).exitCode === 0 && !isLanded(root, i.id)).map((i) => i.id);
  const sup = opts.supervisor && !process.env.FACTORY_NO_SUPERVISOR ? supervisor({
    root, store, running, items, launch: (id, argv) => launch([id], argv),
    settings: () => managerOf(loadConfig(root)),
    group: (id) => new Set([...running].filter(([, p]) => p === running.get(id)).map(([k]) => k)).size,
    cli: async (...argv) => { const r = await sh(process.execPath, CLI, ...argv); return { code: r.code, out: `${r.out}${r.err}`.trim() }; },
    every: opts.every, scale: opts.scale,
    hasSpec: (id) => !!store.output(id, "spec"),
    canTriage: () => !!stageRole(projectTeam(root), "triage"),
    weekly: () => weeklyNote(allEvents(store)),
    retro: (name) => model("", `The milestone "${name}" is done. Hold a short retrospective from these facts, counted from the project's log:\n\n${report(items(), allEvents(store))}\n\nSay in plain words, in under 150 words: what went well, what kept going wrong and its likely cause, and whether one role fails or costs far more than the others. Only say what the facts show; with too little history, say so in one sentence. If a change to the project's rules, a role's notes or a skill would prevent a recurring cause, end with a "## Follow-ups" heading and at most three lines starting with "- ", each one a backlog item title a person could approve. Do not add them yourself.`),
    explain: (id, error) => model(id, `Task ${id} stopped with this error:\n${error.slice(0, 1500)}\n\nThe spec:\n${(store.output(id, "spec") ?? "(none)").slice(0, 2000)}\n\nThe reviewer's last findings:\n${(store.output(id, "review") ?? "(none)").slice(0, 2000)}\n\nSay in plain words, in under 100 words, what happened, why, and what the person should do. Reply with that explanation only.`),
    landed: (id) => isLanded(root, id),
    unmerged: unmergedTasks,
    waitingFiles: () => waiting(root, items()).map((w) => ({ id: w.id, files: w.files })),
    clashing: () => {
      const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout.toString().trim();
      return { head, tasks: waiting(root, items()).flatMap((w) => { const f = trial(root, "HEAD", w.branch); return f?.length ? [{ id: w.id, files: f }] : []; }) };
    },
    authority: () => checkAuthority(root).errors.map((v) => v.text),
    setAutonomy: (autonomy) => { try { writeManager(root, { autonomy }); } catch { /* the decision in the log still says what happened */ } },
    // What she needs is handed to her from the log: the run folders live inside the task's worktree, where she cannot read, and asking her to look produced an apology that was then sent to the Builder.
    guide: (id, error) => model(id, `Task ${id} keeps failing: the build does not pass the checks or the review, or it changed nothing. The last error:\n${error.slice(0, 1500)}\n\nThe spec:\n${(store.output(id, "spec") ?? "(none)").slice(0, 2500)}\n\nThe Builder's last summary:\n${(store.output(id, "build") ?? "(none)").slice(0, 1500)}\n\nThe reviewer's last findings:\n${(store.output(id, "review") ?? "(none)").slice(0, 2500)}\n\nWrite guidance for the Builder from this alone: what keeps going wrong and what to change, in under 120 words, no code. Do not say you could not read anything. If the findings are something no change by the Builder can fix, reply with exactly: NONE`),
  }) : undefined;

  const server = Bun.serve({
    hostname: "127.0.0.1", // never reachable from another machine
    port,
    idleTimeout: 0, // event streams stay open
    async fetch(req) {
      const url = new URL(req.url);
      const origins = [`http://127.0.0.1:${server.port}`, `http://localhost:${server.port}`];
      // Host allow-list: a hostile page cannot reach this server by pointing its own domain at 127.0.0.1.
      if (!origins.includes(url.origin)) return json({ error: "forbidden host" }, 403);
      const route = `${req.method} ${url.pathname}`;

      if (route === "GET /api/backlog") {
        const list = items();
        // How far main moved on for each task waiting for a decision (shown as "Main moved on").
        const behind: Record<string, number> = {};
        for (const i of list) if (i.section === "Awaiting approval") try { const n = behindBy(root, i.id); if (n) behind[i.id] = n; } catch { /* no branch: nothing to say */ }
        return json({ items: list, running: [...running.keys()], behind });
      }
      if (route === "GET /api/project") return json({ root, version: VERSION });
      if (route === "GET /api/config") return json(loadConfig(root));
      if (route === "GET /api/team") return json(teamPayload());
      if (route === "GET /api/source") return json(sourceInfo(root, projectTeam(root)));
      if (route === "GET /api/graph") {
        try { return json(graphInfo(root, projectTeam(root), 80, url.searchParams.get("branch") ?? undefined, url.searchParams.get("q") ?? "")); } catch (e) { return json({ error: (e as Error).message }, 400); }
      }
      if (route === "GET /api/filediff") {
        try { return new Response(fileDiff(root, url.searchParams.get("path") ?? "", url.searchParams.get("sha") ?? undefined), { headers: { "content-type": "text/plain; charset=utf-8" } }); }
        catch (e) { return json({ error: (e as Error).message }, 400); }
      }
      if (route === "GET /api/commit") {
        try { return json(commitDetail(root, url.searchParams.get("sha") ?? "")); } catch (e) { return json({ error: (e as Error).message }, 400); }
      }
      if (route === "GET /api/vcs") {
        // Asks GitHub, so the answer is kept for a few seconds; any push, merge or sync clears it.
        if (!vcsCache || vcsCache.remote !== remoteUrl(root) || Date.now() - vcsCache.at > 15_000) {
          let autoMerge = false, autoPush = false;
          try { const v = loadConfig(root).vcs; autoMerge = !!v?.autoMerge; autoPush = !!v?.autoPush; } catch { /* not initialised */ }
          vcsCache = { at: Date.now(), remote: remoteUrl(root), body: { ...vcsStatus(root), autoMerge, autoPush, hasChecks: hasChecks(root) } };
        }
        return json(vcsCache.body);
      }
      if (route === "GET /api/health") {
        // Quick and free, but it reads every tracked file for the secret scan, so the answer is kept for a few seconds. ?fresh asks again.
        if (!healthCache || Date.now() - healthCache.at > 20_000 || url.searchParams.has("fresh")) healthCache = { at: Date.now(), body: healthChecks(root, { items: items(), last: store.last }) };
        return json({ checkedAt: new Date(healthCache.at).toISOString(), checks: healthCache.body });
      }
      if (route === "GET /api/problems") {
        const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 7) || 7)), since = new Date(Date.now() - days * 86_400_000).toISOString();
        const list = problemsOf(allEvents(store)).filter((p) => p.ts >= since);
        return json({ days, problems: list.slice(-50).reverse(), ...problemSummary(list) });
      }
      if (route === "GET /api/manager") {
        const day = new Date(); day.setHours(0, 0, 0, 0);
        // `notice`: the one-time explanation that autopilot is on has not been seen yet (the page asks again until a person has answered it).
        return json({ settings: managerOf(loadConfig(root)), spentToday: store.spent(day.toISOString()), decisions: store.decisions("", 30), notice: !existsSync(join(root, ".factory", "manager-notice")) });
      }
      if (route === "GET /api/chats") {
        // Every conversation that has something in it, as kept on disk, and whether a reply is on its way right now.
        const all = Object.keys(TOPICS).map((t) => [t, { ...readChat(root, t), busy: chatting.has(t) }] as const);
        return json(Object.fromEntries(all.filter(([, c]) => c.messages.length || c.busy)));
      }
      // The role behind a conversation (the Guide has none): its attached skills are the skills its person may run.
      const chatRole = (topic: string) => { const t = TOPICS[topic]; return !t || t.guide ? undefined : holderOf(projectTeam(root), t.ids[0]!); };
      if (route === "GET /api/integrate") {
        const { plan, formatPlan } = await import("./integrate");
        const p = plan(root, items());
        return json({ ...p, text: formatPlan(p) });
      }
      if (route === "GET /api/chat/commands") {
        // What the message box offers when a slash is typed: the dashboard's commands, and what this conversation's agent can run.
        const topic = url.searchParams.get("topic") ?? "";
        if (!(topic in TOPICS)) return json({ error: "topic: one of " + Object.keys(TOPICS).join(", ") }, 400);
        return json(commandsFor(root, readChat(root, topic).commands, chatRole(topic)));
      }
      if (route === "GET /api/chat/topics") {
        const team = projectTeam(root);
        return json(Object.entries(TOPICS).map(([key, t]) => {
          // The role that holds the conversation's first responsibility, so the page shows the right person even after a regrouping.
          const role = t.guide ? undefined : holderOf(team, t.ids[0]!), base = { key, title: t.title, summary: t.summary, first: t.first, manager: t.manager, role, roleTitle: t.guide ? "Guide" : role ? team.roles[role]!.title : undefined, suggest: suggestOn(root, t.guide ? "guide" : role), readOnly: !!t.guide };
          if (t.guide) return { ...base, available: true };
          // The manager's conversation has its own prompt (it also holds unattended responsibilities, which are no conversation by themselves).
          try { if (t.manager) managerPrompt(team); else chatPromptFor(t.ids, team); return { ...base, available: true }; }
          catch (e) { return { ...base, available: false, reason: (e as Error).message }; }
        }));
      }
      if (route === "GET /api/events") {
        const after = Number(req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0);
        return Number.isInteger(after) && after >= 0 ? stream(after) : json({ error: "bad after" }, 400);
      }
      if (route === "GET /api/diff") {
        const id = url.searchParams.get("id") ?? "";
        if (!ID.test(id)) return json({ error: "bad id" }, 400);
        const diff = await sh("git", "diff", `HEAD...factory/${id}`);
        return diff.code === 0
          ? new Response(diff.out.slice(0, 500_000), { headers: { "content-type": "text/plain; charset=utf-8" } })
          : json({ error: "no branch for that task" }, 404);
      }
      if (route === "GET /graph") {
        const file = Bun.file(join(root, "graphify-out", "graph.html"));
        // graph.html is generated from repository content, so it is treated as untrusted: the
        // sandbox gives it a throwaway origin that cannot call this server's API as you.
        return (await file.exists())
          ? new Response(file, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "sandbox allow-scripts" } })
          : new Response("No knowledge graph yet. Run /graphify .", { status: 404 });
      }
      if (route === "GET /api/worktrees") return json(listWorktrees(root));
      if (route === "GET /api/files") return json(editable());
      if (route === "GET /api/file") {
        const path = url.searchParams.get("path") ?? "", rev = url.searchParams.get("rev");
        if (!editable().includes(path)) return json({ error: "not an editable file" }, 400);
        if (rev && !/^[0-9a-f]{7,40}$/.test(rev)) return json({ error: "bad revision" }, 400);
        // Version history is git history: every studio save is a commit of that one file.
        const log = await sh("git", "log", "-15", "--format=%h%x09%cs%x09%s", "--", path);
        const history = log.out.split("\n").filter(Boolean).map((l) => { const [sha, date, subject] = l.split("\t"); return { sha, date, subject }; });
        const content = rev ? (await sh("git", "show", `${rev}:${path}`)).out : readFileSync(join(root, path), "utf8");
        return json({ content, history });
      }
      if (route === "GET /api/skills") {
        const dir = join(root, ".claude", "skills");
        const installed = existsSync(dir) ? [...new Bun.Glob("*/SKILL.md").scanSync({ cwd: dir })].map((f) => f.split("/")[0]!).sort() : [];
        const agent = (role: string) => join(root, ".claude", "agents", `${role}.md`);
        return json({ installed, roles: Object.fromEntries(projectRoles(root).map((r) => [r, existsSync(agent(r)) ? roleSkills(readFileSync(agent(r), "utf8")) : []])) });
      }
      if (route === "GET /api/skills/search") {
        const q = url.searchParams.get("q") ?? "";
        if (!/^\w[\w .-]{1,59}$/.test(q)) return json({ error: "search: 2 to 60 letters, digits or spaces" }, 400);
        return json(parseFind((await sh("npx", "-y", SKILLS_CLI, "find", q)).out)); // asks skills.sh
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        // Static page files. Only the file name is used, so a request cannot reach outside dist/.
        await freshGui();
        const file = Bun.file(join(DIST, url.pathname === "/" ? "index.html" : basename(url.pathname)));
        return (await file.exists()) ? new Response(file, { headers: { "cache-control": "no-cache" } }) : json({ error: "not found" }, 404);
      }
      if (req.method !== "POST") return json({ error: "not found" }, 404);

      // Cross-site request forgery: browsers send Origin on cross-site POSTs, and requiring
      // JSON forces a preflight that fails because this server sends no CORS headers.
      const origin = req.headers.get("origin");
      if (origin && !origins.includes(origin)) return json({ error: "forbidden origin" }, 403);
      if (!req.headers.get("content-type")?.startsWith("application/json")) return json({ error: "send application/json" }, 415);
      const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(body.ids) ? body.ids : body.id === undefined ? [] : [body.id];
      if (!ids.every((id): id is string => typeof id === "string" && (ID.test(id) || (route === "POST /api/merge" && BATCH.test(id))))) return json({ error: "bad id" }, 400);

      if (route === "POST /api/add")
      {
        if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 500) return json({ error: "title: 1 to 500 characters" }, 400);
        if (body.prio !== undefined && !(typeof body.prio === "string" && /^P\d$/.test(body.prio))) return json({ error: "priority: P1, P2 or P3" }, 400);
        if (body.detail !== undefined && !(typeof body.detail === "string" && body.detail.length <= 2000)) return json({ error: "description: up to 2,000 characters" }, 400);
        return cli("add", body.title, ...(body.prio ? ["--priority", body.prio as string] : []), ...(body.detail ? ["--detail", body.detail as string] : []));
      }
      if (["POST /api/approve", "POST /api/discard", "POST /api/promote"].includes(route))
        return ids.length === 1 ? cli(url.pathname.slice(5), ids[0]!) : json({ error: "one id required" }, 400);
      if (route === "POST /api/configure") {
        // The person pressed Apply setup on what a conversation proposed. The commands are checked again here, and what the gate runs after every build may not be something only a person may do.
        const errs = checkSetup(body);
        const gate = Array.isArray(body.gate) ? (body.gate as string[]) : [], setup = Array.isArray(body.setup) ? (body.setup as string[]) : [];
        if (!errs.length) errs.push(...checkLimits(managerOf(loadConfig(root)), [...setup, ...gate]).filter((v) => v.where === "gate").map((v) => v.text));
        if (errs.length) return json({ error: errs.join("; ") }, 400);
        return cli("configure", ...(setup.length ? setup.flatMap((c) => ["--setup", c]) : []), ...(gate.length ? gate.flatMap((c) => ["--gate", c]) : []));
      }
      if (route === "POST /api/skill") {
        const { action, skill, role } = body;
        const ok = ["add", "attach", "detach"].includes(action as string) && typeof skill === "string" && /^[\w./@:-]{1,120}$/.test(skill) && typeof role === "string";
        return ok ? cli("skill", action as string, skill as string, "--role", role as string) : json({ error: "action, skill and role required" }, 400);
      }
      if (route === "POST /api/file") {
        const { path, content } = body;
        if (typeof path !== "string" || !editable().includes(path)) return json({ error: "not an editable file" }, 400);
        if (typeof content !== "string" || content.length > 200_000) return json({ error: "content: text up to 200,000 characters" }, 400);
        // A role file with broken frontmatter fails only when a run reaches it, so catch it here.
        if (path.startsWith(".claude/agents/") && !/^---\n[\s\S]*?^name: \S+[\s\S]*?\n---\n/m.test(content))
          return json({ error: "a role file must start with frontmatter (--- … ---) that has a name" }, 400);
        // What a role file or a skill file grants is checked before it is saved: a person's edit may not give a role more than it is meant to have.
        const roleFile = /^\.claude\/agents\/([\w-]+)\.md$/.exec(path), skillFile = /^\.claude\/skills\/([\w-]+)\/SKILL\.md$/.exec(path);
        if (roleFile) {
          const bad = checkRoleFile(roleFile[1]!, content, projectTeam(root)).filter((v) => !/leaves out/.test(v.text));
          if (bad.length) return json({ error: `not saved, because it would give the role more than it is meant to have:\n- ${bad.map((v) => v.text).join("\n- ")}` }, 400);
        }
        if (skillFile) {
          const users = projectRoles(root).filter((r) => { try { return roleSkills(readFileSync(join(root, ".claude", "agents", `${r}.md`), "utf8")).includes(skillFile[1]!); } catch { return false; } });
          const bad = skillProblems(root, skillFile[1]!, users, content);
          if (bad.length) return json({ error: `not saved, because the skill would give more than the roles are meant to have:\n- ${bad.join("\n- ")}` }, 400);
        }
        // The commit message is the person's to write; a short sentence on one line, and an optional reason below it.
        const subject = typeof body.message === "string" && body.message.trim() ? body.message.trim() : `studio: edit ${path}`;
        const why = typeof body.why === "string" ? body.why.trim() : "";
        if (subject.length > 200 || /[\r\n]/.test(subject)) return json({ error: "message: one line, up to 200 characters" }, 400);
        if (why.length > 2000) return json({ error: "reason: up to 2,000 characters" }, 400);
        writeFileSync(join(root, path), content);
        // Committed, because task worktrees branch from HEAD: an uncommitted rule or role edit never reaches a run.
        await sh("git", "add", "--", path);
        const commit = await sh("git", "commit", "-q", "-m", subject, ...(why ? ["-m", why] : []), "--", path);
        return json({ ok: true, committed: commit.code === 0, sha: commit.code === 0 ? (await sh("git", "rev-parse", "--short", "HEAD")).out.trim() : "" });
      }
      if (route === "POST /api/config") {
        // The model matrix: only `roles` can change here, and only if the whole file still validates.
        try {
          const next = parseConfig({ ...loadConfig(root), roles: body.roles });
          writeFileSync(join(root, "factory.config.json"), `${JSON.stringify(next, null, 2)}\n`);
          return json(next);
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }

      if (route === "POST /api/team/preview" || route === "POST /api/team") {
        try {
          const change = parseChanges(body.changes);
          const plan = planTeam(root, change.edit); // every rule is checked first, preview or not
          if (route.endsWith("preview")) return json({ ...teamView(plan.team, plan.config, store.since(0), plan.clean.preset), presets: presetList() });
          const done = changeTeam(root, change.edit);
          await sh("git", "add", "--", ...done.paths); // committed like the command line does: task worktrees branch from HEAD
          await sh("git", "commit", "-q", "-m", `software-factory: team ${change.label}`, "--", ...done.paths);
          return json(teamPayload());
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }
      if (route === "POST /api/ci") { vcsCache = undefined; return cli("vcs", "ci"); }
      if (["POST /api/revert", "POST /api/fix-checks"].includes(route)) {
        if (ids.length !== 1) return json({ error: "one id required" }, 400);
        vcsCache = undefined;
        return route.endsWith("revert") ? cli("revert", ids[0]!) : cli("vcs", "fix", ids[0]!);
      }
      if (["POST /api/push", "POST /api/merge"].includes(route)) {
        if (ids.length !== 1) return json({ error: "one id required" }, 400);
        vcsCache = undefined;
        return cli(url.pathname.slice(5), ids[0]!); // the same command a person would type, with the same checks
      }
      if (route === "POST /api/push-together") {
        if (ids.length < 2 || ids.length > 8) return json({ error: "two to eight tasks" }, 400);
        vcsCache = undefined;
        return cli("push", ...ids, "--together");
      }
      if (route === "POST /api/sync") { vcsCache = undefined; return cli("sync"); }
      if (route === "POST /api/vcs/auto-push") {
        if (typeof body.on !== "boolean") return json({ error: "on: true or false" }, 400);
        vcsCache = undefined;
        return cli("vcs", "auto-push", body.on ? "on" : "off");
      }
      if (route === "POST /api/vcs/auto-merge") {
        if (typeof body.on !== "boolean") return json({ error: "on: true or false" }, 400);
        vcsCache = undefined;
        return cli("vcs", "auto-merge", body.on ? "on" : "off");
      }
      if (route === "POST /api/command") {
        const argv = typeof body.name === "string" ? COMMANDS[body.name] : undefined;
        if (!argv) return json({ error: `name: one of ${Object.keys(COMMANDS).join(", ")}` }, 400);
        // A check that finds problems exits non-zero. That is its answer, not a failed request.
        const r = await sh(process.execPath, CLI, ...argv);
        return json({ ok: r.code === 0, output: `${r.out}${r.err}`.trim() });
      }
      if (route === "POST /api/chat/suggest") {
        // Suggested next messages are a setting of the person, so every conversation they hold follows it.
        const topic = TOPICS[body.topic as string], role = topic?.guide ? "guide" : holderOf(projectTeam(root), topic?.ids[0] ?? "");
        if (!role || typeof body.on !== "boolean") return json({ error: "topic and on (true or false) required" }, 400);
        try {
          const cur = loadConfig(root);
          const next = parseConfig({ ...cur, chat: { suggest: { ...cur.chat?.suggest, [role]: body.on } } });
          writeFileSync(join(root, "factory.config.json"), `${JSON.stringify(next, null, 2)}\n`);
          return json({ role, on: body.on });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }
      if (route === "POST /api/manager") {
        try {
          const { seen, ...patch } = body as Record<string, unknown>;
          if (seen === true) writeFileSync(join(root, ".factory", "manager-notice"), `${new Date().toISOString()}\n`);
          return json({ settings: Object.keys(patch).length ? writeManager(root, patch as never) : managerOf(loadConfig(root)) });
        } catch (e) { return json({ error: (e as Error).message }, 400); }
      }
      if (route === "POST /api/chat/stop") {
        if (typeof body.topic !== "string" || !(body.topic in TOPICS)) return json({ error: "topic: one of " + Object.keys(TOPICS).join(", ") }, 400);
        return json({ stopped: stopChat(body.topic) });
      }
      if (route.startsWith("POST /api/chats/")) {
        const topic = String(body.topic ?? "");
        if (!(topic in TOPICS)) return json({ error: "topic: one of " + Object.keys(TOPICS).join(", ") }, 400);
        try {
          if (route === "POST /api/chats/clear") { if (chatting.has(topic)) return json({ error: "a reply is on its way: stop it first" }, 409); clearChat(root, topic); return json({ messages: [] }); }
          if (route === "POST /api/chats/acted") return json(markActed(root, topic, body.index as number, body.ok === true, String(body.text ?? "")));
          if (route === "POST /api/chats/import") return json(importChat(root, topic, body.raw));
          if (route === "POST /api/chats/compact") {
            const session = readChat(root, topic).session;
            if (!session) return json({ error: "There is nothing to compact yet: this conversation has not started." }, 409);
            if (chatting.has(topic)) return json({ error: "a reply is on its way: wait for it, or stop it first" }, 409);
            if (body.focus !== undefined && typeof body.focus !== "string") return json({ error: "focus: text" }, 400);
            chatting.add(topic);
            try {
              const r = await compactTurn(root, { topic, session, focus: body.focus as string | undefined, model: body.model as string | undefined }, projectTeam(root));
              return json(r.ok ? markCompacted(root, topic, r.compact!, r.session) : appendChat(root, topic, [{ who: "team", text: r.text, ...(r.status !== "stopped" && r.status !== "ok" && { bad: true }) }]));
            } finally { chatting.delete(topic); }
          }
        } catch (e) { return json({ error: (e as Error).message }, 400); }
      }
      if (route === "POST /api/chat") {
        const topic = body.topic as string;
        let said = false;
        // The reply is written to the conversation's file before it is sent back, so it is kept even if the page has gone meanwhile.
        const done = (out: Parameters<typeof replyMsg>[0] & { session?: string; sessions?: Record<string, string>; context?: Context; contexts?: Record<string, Context>; commands?: string[] }) => {
          store.emit({ run: "", task: "", stage: "chat", type: "chat.turn", data: { topic, usage: { costUsd: out.costUsd ?? 0, denials: out.denials ?? [] } } }); // what a conversation costs counts toward the day's limit
          return json({ ...out, chat: appendChat(root, topic, [replyMsg(out)], { session: out.session, subs: out.sessions, context: out.context, contexts: out.contexts, commands: out.commands }) }); };
        try {
          if (typeof body.topic === "string" && body.topic !== "manager") resumeChat(body.topic);
          if (topic === "manager") body.autonomy = managerOf(loadConfig(root)).autonomy; // she is told how her proposals are handled: the page is not asked
          chatArgs(body as never, projectTeam(root)); // validate before spending anything
          // A skill typed as /name runs as the message, so it is checked against what this person may run: one installed for other roles only is refused.
          const typed = String(body.message ?? "").trim().match(/^\/([a-z0-9][\w.:-]*)/i)?.[1];
          if (typed && typed !== "compact" && typed !== "clear" && projectCommands(root).some((c) => c.name === typed) && !commandsFor(root, undefined, chatRole(topic)).some((c) => c.name === typed))
            return json({ error: `/${typed} is not attached to this role. Attach it in Studio (or with factory skill attach ${typed} --role <role>) to let this person use it.` }, 400);
          if (chatting.has(topic)) return json({ error: "a reply is already on its way in this conversation" }, 409);
          const attached = (body.attachments as { name: string; data: string }[] | undefined) ?? [];
          appendChat(root, topic, [{ who: "you", text: typeof body.shown === "string" && body.shown.trim() ? body.shown.slice(0, 20_000) : String(body.message), ...(attached.length && { files: attached.map((a) => ({ name: a.name, size: Buffer.from(a.data, "base64").length })) }) }]);
          said = true;
          chatting.add(topic);
          // Token saving: every message re-sends the whole conversation, so one that has grown large is compacted first (by Claude's own /compact), by itself.
          const big = readChat(root, topic);
          if (big.session && big.context && (big.context.used >= 100_000 || big.context.used / big.context.window >= 0.6)) {
            try {
              const c = await compactTurn(root, { topic, session: big.session, model: "haiku" }, projectTeam(root));
              if (c.ok && c.compact) { markCompacted(root, topic, c.compact, c.session); if (c.session) body.session = c.session; }
              store.emit({ run: "", task: "", stage: "chat", type: "chat.turn", data: { topic, usage: { costUsd: 0 } } });
            } catch { /* the message goes on in the old session */ }
          }
          if (body.topic !== "manager") return done(await chatTurn(root, body as never, projectTeam(root)));
          const out = await managerTurn(root, body as never, projectTeam(root));
          // On autopilot a proposal to promote, run or retry is carried out at once (the person asked for it in this conversation); on assist the page shows a button.
          const { proposal, text } = out.ok ? parseProposal(out.text) : { proposal: undefined, text: out.text };
          if (!proposal || !["promote", "run", "retry"].includes(proposal.kind) || managerOf(loadConfig(root)).autonomy !== "autopilot") return done(out);
          // F-092: only what the person asked for in this message, and only within the limits autopilot keeps; anything else stays a button, with the reason.
          const before = readChat(root, topic).messages, previous = [...before.slice(0, -1)].reverse().find((m) => m.who === "team")?.text ?? "";
          const asked = personAsked(String(body.message ?? ""), previous), s = managerOf(loadConfig(root));
          const held = !proposal.ids.every((id) => asked.includes(id)) ? `You did not name ${proposal.ids.filter((id) => !asked.includes(id)).join(", ")} yourself, so this waits for your press`
            : proposal.kind !== "promote" && store.spent(new Date(new Date().setHours(0, 0, 0, 0)).toISOString()) >= s.perDay ? `The day's limit ($${s.perDay}) is reached, so I did not start it by myself; press to start it anyway`
            : proposal.kind !== "promote" && running.size >= s.parallel ? `${running.size} task${running.size === 1 ? " is" : "s are"} running, the most at once, so I did not start it by myself; press to start it anyway`
            : proposal.kind !== "promote" && unmergedTasks().length >= s.unmerged ? `${unmergedTasks().length} approved tasks are not merged into main yet, so I did not start more by myself; press to start it anyway`
            : "";
          if (held) return done({ ...out, text: out.text.replace(/^PROPOSE: .*$/m, (line) => `_${held}._\n${line}`) });
          let ok = true, note = "";
          const where = (id: string) => items().find((i) => i.id === id)?.section;
          if (proposal.kind === "promote") {
            // A task that is already past Inbox has been moved (by autopilot, or by an earlier message): that is where she wanted it, not a failure.
            const moved: string[] = [], already: string[] = [];
            for (const id of proposal.ids) {
              const at = where(id);
              if (at && at !== "Inbox") { already.push(`${id} is already ${at === "In progress" ? "in progress" : at === "Awaiting approval" ? "waiting for your approval" : at === "Done" ? "done" : `in ${at}`}`); continue; }
              const r = await sh(process.execPath, CLI, "promote", id);
              if (r.code !== 0) { ok = false; note = `${r.out}${r.err}`.trim(); break; }
              moved.push(id);
            }
            note ||= [moved.length ? `Moved ${moved.join(", ")} to Ready.` : "", ...already.map((a) => `${a}; nothing to move.`)].filter(Boolean).join(" ");
          } else {
            // Risky work that waits for the person's yes (F-111) is never started from a conversation: running it again would only write the spec again and stop.
            const needsYes = (id: string) => { const r = store.lastRun(id); return !!r && /^Error: needs your yes:/.test(String(store.list(r).findLast((e) => e.type === "run.failed")?.data ?? "")); };
            const yes = proposal.ids.filter((id) => where(id) === "Blocked" && needsYes(id));
            const idle = proposal.ids.filter((id) => !running.has(id) && !yes.includes(id) && !["Awaiting approval", "Done"].includes(where(id) ?? ""));
            if (idle.length && launch(idle, ["run", ...idle])) note = `Started ${idle.join(", ")}. Follow it in Backlog.${idle.length + yes.length < proposal.ids.length ? ` The others are already running or finished.` : ""}`;
            else if (!yes.length) note = `${proposal.ids.join(", ")} ${proposal.ids.length === 1 ? "is" : "are"} already running or finished; nothing to start.`;
            if (yes.length) { ok = !!idle.length; note = `${note ? `${note} ` : ""}${yes.join(", ")} ${yes.length === 1 ? "plans" : "plan"} risky work and ${yes.length === 1 ? "waits" : "wait"} for your yes: open ${yes.length === 1 ? "it" : "each"} in Backlog, read the spec and press Build it.`; }
          }
          for (const id of proposal.ids) store.emit({ run: store.lastRun(id) ?? "", task: id, stage: "manager", type: "manager.decision", data: { action: proposal.kind, text: `${id}: ${note}`, auto: true, by: "conversation" } });
          return done({ ...out, text, executed: { proposal, ok, note } });
        } catch (e) {
          if (said) appendChat(root, topic, [{ who: "team", text: (e as Error).message, bad: true }]);
          return json({ error: (e as Error).message }, 400);
        } finally { if (said) chatting.delete(topic); }
      }

      if (route === "POST /api/stop") {
        const p = ids.length === 1 && running.get(ids[0]!);
        if (!p) return json({ error: "no run started from this server for that id" }, 404);
        p.kill("SIGTERM"); // the CLI ends its stages and moves the task to Blocked
        return json({ stopping: ids[0] });
      }

      if (route === "POST /api/reject") {
        // Sending a finished task back to the Builder with comments: one task at a time, and only one that is waiting for a decision.
        const id = ids.length === 1 ? ids[0]! : "", feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
        const files = body.files === undefined ? [] : Array.isArray(body.files) ? body.files : null;
        if (!id) return json({ error: "one id required" }, 400);
        if (!feedback || feedback.length > 4000) return json({ error: "feedback: 1 to 4000 characters" }, 400);
        if (!files || files.length > 20 || files.some((f) => typeof f !== "string" || !f || f.length > 200 || /[\r\n,]/.test(f))) return json({ error: "files: up to 20 file paths" }, 400);
        const where = items().find((i) => i.id === id)?.section;
        // A blocked task can be continued with guidance too, if it got as far as a spec (the round keeps it).
        if (where === "Blocked" && !store.output(id, "spec")) return json({ error: `${id} stopped before it had a spec, so there is nothing to continue: run it again` }, 409);
        if (where !== "Awaiting approval" && where !== "Blocked") return json({ error: `${id} is not waiting for a decision or stopped` }, 409);
        if (running.has(id)) return json({ error: "already running" }, 409);
        return startOne(id, ["reject", id, "--feedback", feedback, ...(files.length ? ["--files", files.join(",")] : []), ...(body.stub === true ? ["--stub"] : [])]);
      }
      if (route === "POST /api/close") return ids.length && ids.length <= 20 && !ids.some((id) => running.has(id)) ? cli("close", ...ids, ...(typeof body.reason === "string" && body.reason.trim() ? ["--reason", body.reason] : [])) : json({ error: "ids: 1 to 20 items that are not running" }, 400);
      if (route === "POST /api/rebuild") return ids.length === 1 && !running.has(ids[0]!) ? cli("rebuild", ids[0]!) : json({ error: "one id required, and it must not be running" }, 400);
      if (route === "POST /api/update") {
        // Bring a waiting task up to date with main: the same command a person would type.
        const id = ids.length === 1 ? ids[0]! : "";
        if (!id) return json({ error: "one id required" }, 400);
        const at = items().find((i) => i.id === id)?.section;
        const unmerged = at === "Done" && Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", `refs/heads/factory/${id}`], { cwd: root }).exitCode === 0 && !isLanded(root, id);
        if (at !== "Awaiting approval" && !unmerged) return json({ error: `${id} is not waiting for a decision or for a merge` }, 409);
        return startOne(id, ["update", id, ...(body.stub === true ? ["--stub"] : [])]);
      }
      if (route === "POST /api/run") {
        const count = body.parallel ?? 1;
        if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 8) return json({ error: "parallel: 1 to 8" }, 400);
        const chosen = ids.length ? ids : items().filter((i) => i.section === "Ready").slice(0, count).map((i) => i.id);
        if (!chosen.length) return json({ error: "nothing under Ready" }, 409);
        if (chosen.some((id) => running.has(id))) return json({ error: "already running" }, 409);
        // Build it (F-111): the person's yes to risky work, from the page only. A conversation's proposal never carries it.
        launch(chosen, ["run", ...chosen, ...(body.stub === true ? ["--stub"] : []), ...(body.anyway === true && ids.length ? ["--anyway"] : [])]);
        return json({ started: chosen }, 202);
      }
      return json({ error: "not found" }, 404);
    },
  });
  const stop = server.stop.bind(server);
  server.stop = (force?: boolean) => { sup?.stop(); clearInterval(sweep); return stop(force); };
  return server;
}
