// Quick, free checks of the project, shown as the health signal: no model is called and each takes a moment.
// A check is "ok", a "warn" (worth a look, work goes on) or "bad" (something blocks work or is unsafe).
import { loadConfig } from "./config";
import { doctor } from "./init";
import { allTracked, scanSecrets } from "./security";
import type { Item } from "./backlog";

export type Health = { id: string; title: string; state: "ok" | "warn" | "bad"; detail: string };
export type HealthContext = {
  items: Item[];
  /** The newest event of a type, optionally for one task: how long a task has waited, and how much of the Claude allowance is used. */
  last: (type: string, task?: string) => { ts: string; data?: any } | undefined;
  now?: number;
};

const PLACEHOLDER = /^(true|:|exit 0|echo\b.*)$/;
/** A gate made only of commands that always pass checks nothing. (An empty gate is already reported by the setup check.) */
export const gateIsPlaceholder = (gate: string[]) => gate.length > 0 && gate.every((c) => PLACEHOLDER.test(c.trim()));

/** Tasks that have waited for a person for more than a day, with how long. */
export function waitedLong(ctx: HealthContext, hours = 24): { id: string; hours: number }[] {
  const now = ctx.now ?? Date.now();
  return ctx.items.flatMap((i) => {
    if (i.section !== "Awaiting approval" && i.section !== "Blocked") return [];
    const since = ctx.last(i.section === "Blocked" ? "run.failed" : "run.done", i.id)?.ts;
    const h = since ? (now - Date.parse(since)) / 3_600_000 : 0;
    return h >= hours ? [{ id: i.id, hours: Math.floor(h) }] : [];
  });
}

const git = (root: string, ...args: string[]) => { try { return Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" }).stdout.toString().trim(); } catch { return ""; } };
const ago = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} days` : `${h} hours`);

export function healthChecks(root: string, ctx: HealthContext): Health[] {
  const out: Health[] = [];
  const setup = doctor(root);
  const bad = setup.lines.filter((l) => l.startsWith("✗")), soft = setup.lines.filter((l) => l.startsWith("–"));
  out.push(bad.length ? { id: "setup", title: "The setup has a problem", state: "bad", detail: bad.map((l) => l.slice(2)).join("\n") }
    : soft.length ? { id: "setup", title: "The setup is complete, with one extra to fix", state: "warn", detail: soft.map((l) => l.slice(2)).join("\n") }
    : { id: "setup", title: "The setup is complete", state: "ok", detail: "Config, role files, rules and skills." });

  let found = 0;
  try { found = scanSecrets(allTracked(root)).length; } catch { /* not a git repository: the setup check says so */ }
  out.push(found ? { id: "secrets", title: `${found} possible secret${found > 1 ? "s" : ""} in the files`, state: "bad", detail: "Run the secrets check to see where. Values are never shown." } : { id: "secrets", title: "No secrets in the files", state: "ok", detail: "Values are never shown." });

  // Task agents start from the last commit, so a rule or role edit that was never committed does not reach them.
  const loose = git(root, "status", "--porcelain", "--", "AGENTS.md", "CLAUDE.md", "BACKLOG.md", "factory.config.json", ".claude", "docs").split("\n").filter(Boolean).length;
  if (loose) out.push({ id: "uncommitted", title: `${loose} rule, role or settings file${loose > 1 ? "s are" : " is"} not committed`, state: "warn", detail: "Task agents start from the last commit, so they will not see these changes yet. Studio saves as a commit." });

  try { if (gateIsPlaceholder(loadConfig(root).gate)) out.push({ id: "gate", title: "The gate does not check anything", state: "warn", detail: "Every gate command always passes, so a build is only checked by the reviewer. Add your tests or lint commands to the gate." }); } catch { /* the setup check reports a broken config */ }

  const waited = waitedLong(ctx);
  if (waited.length) out.push({ id: "waiting", title: `${waited.map((w) => w.id).join(", ")} ${waited.length > 1 ? "have" : "has"} waited for you`, state: "warn", detail: waited.map((w) => `${w.id}: ${ago(w.hours)}`).join(", ") });

  const used = ctx.last("agent.rate_limit")?.data?.unifiedWindows?.five_hour?.utilization;
  if (typeof used === "number" && used >= 0.8) out.push({ id: "usage", title: `Claude usage is at ${Math.round(used * 100)}% of the 5-hour window`, state: "warn", detail: "Stages may be slowed or switched to the next model in the chain until it resets." });
  return out;
}
