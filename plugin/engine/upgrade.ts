// An update replaces the plugin's files, but a dashboard that is already running is a program that keeps running the old ones. This is what makes
// `/software-factory:open` give you the new version: it finds this project's dashboard, and if it runs an older version, stops it and starts the new one.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The version of the plugin this program belongs to. */
export const VERSION: string = (() => { try { return JSON.parse(readFileSync(join(import.meta.dir, "..", ".claude-plugin", "plugin.json"), "utf8")).version ?? "unknown"; } catch { return "unknown"; } })();

/** Whether version `a` is newer than `b` (dotted numbers). An unknown or missing version is older than any. */
export function newer(a: string | undefined, b: string | undefined): boolean {
  const n = (v?: string) => (v && /^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : undefined);
  const x = n(a), y = n(b);
  if (!x) return false;
  if (!y) return true;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d > 0; }
  return false;
}

type Who = { root?: string; version?: string };
/** What the dashboard on a port says it is, or undefined when no dashboard of ours answers there. */
export async function who(port: number): Promise<Who | undefined> {
  try { const r = await fetch(`http://127.0.0.1:${port}/api/project`, { signal: AbortSignal.timeout(1000) }); const j = (await r.json()) as Who; return typeof j?.root === "string" ? j : undefined; } catch { return undefined; }
}

/** The processes listening on a local port. */
export function listeners(port: number): number[] {
  try { return Bun.spawnSync(["lsof", "-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { stdout: "pipe", stderr: "pipe" }).stdout.toString().split("\n").map(Number).filter((n) => n > 0 && n !== process.pid); } catch { return []; }
}

/** This project's dashboards that are running, on any port in the range (a project's own port, or one an earlier session chose): there may be more than one. */
export async function ownDashboards(root: string, from = 4400, to = 4599): Promise<{ port: number; version?: string }[]> {
  let ports: number[] = [];
  try {
    const out = Bun.spawnSync(["lsof", "-nP", `-iTCP:${from}-${to}`, "-sTCP:LISTEN", "-Fn"], { stdout: "pipe", stderr: "pipe" }).stdout.toString();
    ports = [...new Set([...out.matchAll(/^n.*:(\d+)$/gm)].map((m) => Number(m[1])))];
  } catch { /* no lsof: the port the project would use is looked at by the caller */ }
  const found: { port: number; version?: string }[] = [];
  for (const port of ports) { const w = await who(port); if (w?.root === root) found.push({ port, version: w.version }); }
  return found;
}

export type Replaced =
  | { state: "none" }                       // no dashboard of this project on that port
  | { state: "current"; version?: string }  // one is running, and it is this version or newer
  | { state: "replaced"; was?: string }     // an older one was stopped, the port is free
  | { state: "failed"; was?: string; pids: number[] }; // an older one is there and could not be stopped

/**
 * If this project's dashboard on `port` runs an older version than this program, stops it. Only a process that answers as this project's dashboard
 * is ever stopped, so nothing else on the port is touched.
 */
export async function replaceOlder(port: number, root: string, version = VERSION): Promise<Replaced> {
  const w = await who(port);
  if (!w || w.root !== root) return { state: "none" };
  if (!newer(version, w.version)) return { state: "current", version: w.version };
  const pids = listeners(port);
  if (!pids.length) return { state: "failed", was: w.version, pids };
  for (const pid of pids) { try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ } }
  for (let i = 0; i < 40; i++) { if (!(await who(port))) return { state: "replaced", was: w.version }; await Bun.sleep(100); }
  return { state: "failed", was: w.version, pids };
}
