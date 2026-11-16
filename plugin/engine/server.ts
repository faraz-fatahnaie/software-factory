import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "./backlog";
import { chatArgs, chatTurn, managerTurn, resumeChat, stopChat, TOPICS } from "./chat";
import { loadConfig, managerOf, parseConfig, projectRoles, projectTeam } from "./config";
import { parseProposal } from "./state";
import { allEvents, report } from "./retro";
import { supervisor, writeManager } from "./supervisor";
import { openStore } from "./events";
import { healthChecks, type Health } from "./health";
import { parseFind, roleSkills, SKILLS_CLI } from "./skills";
import { chatPromptFor, holderOf, stageRole } from "./team";
import { changeTeam, parseChanges, planTeam, presetList, teamView } from "./teamctl";
import { commitDetail, fileDiff, graphInfo, sourceInfo } from "./source";
import { BATCH, hasChecks, remoteUrl, vcsStatus } from "./vcs";
import { behindBy, listWorktrees } from "./worktree";

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
    try { if (loadConfig(root).vcs?.autoMerge) { await sh(process.execPath, CLI, "sync"); vcsCache = undefined; } } catch { /* a failed sweep is tried again next minute */ }
  }, 60_000);
  sweep.unref();
  const teamPayload = () => {
    const raw = JSON.parse(readFileSync(join(root, "factory.config.json"), "utf8"));
    return { ...teamView(projectTeam(root), loadConfig(root), store.since(0), raw.team?.preset), presets: presetList() };
  };

  const model = async (id: string, message: string) => {
    const r = await chatTurn(root, { topic: "manager", message, model: "haiku", effort: "low" }, projectTeam(root), { group: "supervisor" }); // its own group: a person stopping a conversation does not stop it
    return r.ok ? r.text.replace(/^(ASK [a-z]+:|PROPOSE:) .*$/gm, "").trim() : "";
  };
  const sup = opts.supervisor && !process.env.FACTORY_NO_SUPERVISOR ? supervisor({
    root, store, running, items, launch: (id, argv) => launch([id], argv),
    settings: () => managerOf(loadConfig(root)),
    group: (id) => new Set([...running].filter(([, p]) => p === running.get(id)).map(([k]) => k)).size,
    cli: async (...argv) => { const r = await sh(process.execPath, CLI, ...argv); return { code: r.code, out: `${r.out}${r.err}`.trim() }; },
    every: opts.every, scale: opts.scale,
    hasSpec: (id) => !!store.output(id, "spec"),
    canTriage: () => !!stageRole(projectTeam(root), "triage"),
    retro: (name) => model("", `The milestone "${name}" is done. Hold a short retrospective from these facts, counted from the project's log:\n\n${report(items(), allEvents(store))}\n\nSay in plain words, in under 150 words: what went well, what kept going wrong and its likely cause, and whether one role fails or costs far more than the others. Only say what the facts show; with too little history, say so in one sentence. If a change to the project's rules, a role's notes or a skill would prevent a recurring cause, end with a "## Follow-ups" heading and at most three lines starting with "- ", each one a backlog item title a person could approve. Do not add them yourself.`),
    explain: (id, error) => model(id, `Task ${id} stopped with this error:\n${error.slice(0, 1500)}\n\nLook at the task and its latest run with \`factory status\` and the run files. Say in plain words, in under 100 words, what happened, why, and what the person should do. Reply with that explanation only.`),
    guide: (id, error) => model(id, `Task ${id} was built three times and the checks or the review still did not pass. The last error:\n${error.slice(0, 1500)}\n\nRead the latest run's files (build.md, review.md) with \`factory status\` to find the run. Write guidance for the Builder: what keeps going wrong and what to change, in under 120 words, no code. Reply with the guidance only.`),
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
      if (route === "GET /api/project") return json({ root });
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
      if (route === "GET /api/manager") {
        const day = new Date(); day.setHours(0, 0, 0, 0);
        // `notice`: the one-time explanation that autopilot is on has not been seen yet (the page asks again until a person has answered it).
        return json({ settings: managerOf(loadConfig(root)), spentToday: store.spent(day.toISOString()), decisions: store.decisions("", 30), notice: !existsSync(join(root, ".factory", "manager-notice")) });
      }
      if (route === "GET /api/chat/topics") {
        const team = projectTeam(root);
        return json(Object.entries(TOPICS).map(([key, t]) => {
          // The role that holds the conversation's first responsibility, so the page shows the right person even after a regrouping.
          const role = t.guide ? undefined : holderOf(team, t.ids[0]!), base = { key, title: t.title, summary: t.summary, first: t.first, manager: t.manager, role, roleTitle: t.guide ? "Guide" : role ? team.roles[role]!.title : undefined, suggest: suggestOn(root, t.guide ? "guide" : role), readOnly: !!t.guide };
          if (t.guide) return { ...base, available: true };
          try { chatPromptFor(t.ids, team); return { ...base, available: true }; }
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
      if (route === "POST /api/chat") {
        try {
          if (typeof body.topic === "string" && body.topic !== "manager") resumeChat(body.topic);
          chatArgs(body as never, projectTeam(root)); // validate before spending anything
          if (body.topic !== "manager") return json(await chatTurn(root, body as never, projectTeam(root)));
          const out = await managerTurn(root, body as never, projectTeam(root));
          // On autopilot a proposal to promote, run or retry is carried out at once (the person asked for it in this conversation); on assist the page shows a button.
          const { proposal, text } = out.ok ? parseProposal(out.text) : { proposal: undefined, text: out.text };
          if (!proposal || !["promote", "run", "retry"].includes(proposal.kind) || managerOf(loadConfig(root)).autonomy !== "autopilot") return json(out);
          let ok = true, note = "";
          if (proposal.kind === "promote") {
            for (const id of proposal.ids) { const r = await sh(process.execPath, CLI, "promote", id); if (r.code !== 0) { ok = false; note = `${r.out}${r.err}`.trim(); break; } }
            note ||= `Moved ${proposal.ids.join(", ")} to Ready.`;
          } else if (launch(proposal.ids, ["run", ...proposal.ids])) note = `Started ${proposal.ids.join(", ")}. Follow it in Backlog.`;
          else { ok = false; note = "It is already running."; }
          for (const id of proposal.ids) store.emit({ run: store.lastRun(id) ?? "", task: id, stage: "manager", type: "manager.decision", data: { action: proposal.kind, text: `${id}: ${note}`, auto: true, by: "conversation" } });
          return json({ ...out, text, executed: { proposal, ok, note } });
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
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
      if (route === "POST /api/update") {
        // Bring a waiting task up to date with main: the same command a person would type.
        const id = ids.length === 1 ? ids[0]! : "";
        if (!id) return json({ error: "one id required" }, 400);
        if (items().find((i) => i.id === id)?.section !== "Awaiting approval") return json({ error: `${id} is not waiting for a decision` }, 409);
        return startOne(id, ["update", id, ...(body.stub === true ? ["--stub"] : [])]);
      }
      if (route === "POST /api/run") {
        const count = body.parallel ?? 1;
        if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 8) return json({ error: "parallel: 1 to 8" }, 400);
        const chosen = ids.length ? ids : items().filter((i) => i.section === "Ready").slice(0, count).map((i) => i.id);
        if (!chosen.length) return json({ error: "nothing under Ready" }, 409);
        if (chosen.some((id) => running.has(id))) return json({ error: "already running" }, 409);
        launch(chosen, ["run", ...chosen, ...(body.stub === true ? ["--stub"] : [])]);
        return json({ started: chosen }, 202);
      }
      return json({ error: "not found" }, 404);
    },
  });
  const stop = server.stop.bind(server);
  server.stop = (force?: boolean) => { sup?.stop(); clearInterval(sweep); return stop(force); };
  return server;
}
