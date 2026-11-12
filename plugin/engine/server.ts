import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "./backlog";
import { loadConfig, parseConfig, ROLES } from "./config";
import { openStore } from "./events";
import { parseFind, roleSkills, SKILLS_CLI } from "./skills";
import { listWorktrees } from "./worktree";

const CLI = join(import.meta.dir, "cli.ts");
const ID = /^F-\d+$/;
const json = (body: unknown, status = 200) => Response.json(body, { status });

// The page ships prebuilt in dist/, so an installed plugin needs no dependencies. The source
// lives outside the plugin folder; where it is present (this repository), it is rebuilt on start.
const DIST = join(import.meta.dir, "..", "dist");
const SOURCE = join(import.meta.dir, "..", "..", "gui", "index.html");
async function buildGui() {
  if (!existsSync(SOURCE)) return;
  rmSync(DIST, { recursive: true, force: true }); // chunk names carry a content hash, so old ones would pile up
  const result = await Bun.build({ entrypoints: [SOURCE], outdir: DIST, minify: true, define: { "process.env.NODE_ENV": '"production"' } });
  if (!result.success) throw new Error(`GUI build failed:\n${result.logs.join("\n")}`);
}

/** Local control plane: a live event stream plus endpoints that run the same CLI a person would. */
export async function serve(root: string, port = 4400) {
  await buildGui();
  mkdirSync(join(root, ".factory"), { recursive: true });
  const store = openStore(join(root, ".factory", "events.db"));
  const running = new Map<string, { kill(signal?: number | NodeJS.Signals): void }>();
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

      if (route === "GET /api/backlog") return json({ items: items(), running: [...running.keys()] });
      if (route === "GET /api/config") return json(loadConfig(root));
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
        return json({ installed, roles: Object.fromEntries(ROLES.map((r) => [r, existsSync(agent(r)) ? roleSkills(readFileSync(agent(r), "utf8")) : []])) });
      }
      if (route === "GET /api/skills/search") {
        const q = url.searchParams.get("q") ?? "";
        if (!/^\w[\w .-]{1,59}$/.test(q)) return json({ error: "search: 2 to 60 letters, digits or spaces" }, 400);
        return json(parseFind((await sh("npx", "-y", SKILLS_CLI, "find", q)).out)); // asks skills.sh
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        // Static page files. Only the file name is used, so a request cannot reach outside dist/.
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
      if (!ids.every((id): id is string => typeof id === "string" && ID.test(id))) return json({ error: "bad id" }, 400);

      if (route === "POST /api/add")
        return typeof body.title === "string" && body.title.trim() && body.title.length <= 500
          ? cli("add", body.title)
          : json({ error: "title: 1 to 500 characters" }, 400);
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
        writeFileSync(join(root, path), content);
        // Committed, because task worktrees branch from HEAD: an uncommitted rule or role edit never reaches a run.
        await sh("git", "add", "--", path);
        const commit = await sh("git", "commit", "-q", "-m", `studio: edit ${path}`, "--", path);
        return json({ ok: true, committed: commit.code === 0 });
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

      if (route === "POST /api/stop") {
        const p = ids.length === 1 && running.get(ids[0]!);
        if (!p) return json({ error: "no run started from this server for that id" }, 404);
        p.kill("SIGTERM"); // the CLI ends its stages and moves the task to Blocked
        return json({ stopping: ids[0] });
      }

      if (route === "POST /api/run") {
        const count = body.parallel ?? 1;
        if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 8) return json({ error: "parallel: 1 to 8" }, 400);
        const chosen = ids.length ? ids : items().filter((i) => i.section === "Ready").slice(0, count).map((i) => i.id);
        if (!chosen.length) return json({ error: "nothing under Ready" }, 409);
        if (chosen.some((id) => running.has(id))) return json({ error: "already running" }, 409);
        const p = Bun.spawn([process.execPath, CLI, "run", ...chosen, ...(body.stub === true ? ["--stub"] : [])], { cwd: root, stdout: "inherit", stderr: "pipe" });
        const stderr = new Response(p.stderr).text();
        for (const id of chosen) running.set(id, p);
        p.exited.then(async (code) => {
          for (const id of chosen) running.delete(id);
          const error = (await stderr).trim();
          // Failures before a run exists (bad state, git errors) would otherwise be invisible to the GUI.
          if (code !== 0 && error) store.emit({ run: "", task: chosen.join(","), stage: "run", type: "command.failed", data: { error: error.slice(-1000) } });
        });
        return json({ started: chosen }, 202);
      }
      return json({ error: "not found" }, 404);
    },
  });
  return server;
}
