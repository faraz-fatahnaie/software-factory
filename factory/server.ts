import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "./backlog";
import { loadConfig } from "./config";
import { openStore } from "./events";

const CLI = join(import.meta.dir, "cli.ts");
const ID = /^F-\d+$/;
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Local control plane: a live event stream plus endpoints that run the same CLI a person would. */
export function serve(root: string, port = 4400) {
  mkdirSync(join(root, ".factory"), { recursive: true });
  const store = openStore(join(root, ".factory", "events.db"));
  const running = new Map<string, { kill(signal?: number | NodeJS.Signals): void }>();
  const items = () => parse(readFileSync(join(root, "BACKLOG.md"), "utf8"));

  // Short commands (add, approve, discard): wait and return what the CLI printed.
  const cli = async (...args: string[]) => {
    const p = Bun.spawn([process.execPath, CLI, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return json({ ok: code === 0, output: `${out}${err}`.trim() }, code === 0 ? 200 : 409);
  };

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
      if (route === "POST /api/approve" || route === "POST /api/discard")
        return ids.length === 1 ? cli(url.pathname.slice(5), ids[0]!) : json({ error: "one id required" }, 400);

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
