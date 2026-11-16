// The Technical Manager's code half: starts approved work, watches it, and recovers what stops, within limits the person sets.
// No model decides here. A model is asked only to explain a task that needs a person, or to write guidance for the Builder.
// Every action is written to the event log as `manager.decision`, in plain words, so nothing it does is hidden.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Item } from "./backlog";
import { type Autonomy, managerOf, type ManagerSettings, parseConfig } from "./config";
import type { Store } from "./events";
import { followUps, needsTriage } from "./pipeline";
import { milestones } from "./retro";

export type Kind = "rate_limit" | "auth" | "stopped" | "stalled" | "builds" | "setup" | "clash" | "unready" | "other";
/** What kind of failure an error message describes. These are the messages the pipeline and the CLI write. */
export function failureKind(error: string): Kind {
  if (/every model in the .+ chain is rate limited/.test(error)) return "rate_limit";
  if (/: auth:|not logged in/i.test(error)) return "auth";
  if (/^Error: stopped|stopped by request/.test(error)) return "stopped";
  if (/no approved build after/.test(error)) return "builds";
  if (/^Error: not ready:/.test(error)) return "unready";
  if (/setup failed/.test(error)) return "setup";
  if (/conflict markers remain|clash/.test(error)) return "clash";
  return "other";
}

export type Step = { action: "retry" | "guide" | "escalate"; delayMin: number; text: string };
const usd = (n: number) => `$${n.toFixed(2)}`;
/** What to do about a stopped task: retry (after a wait), send the Builder guidance, or hand it to the person. The limits are checked here, once. */
export function decide(kind: Kind, tries: number, spent: number, s: { recoveries: number; perTask: number }): Step {
  const hand = (text: string): Step => ({ action: "escalate", delayMin: 0, text });
  if (kind === "auth") return hand("The Claude command line is not logged in. Run `claude` in a terminal and log in, then retry the task.");
  if (kind === "stopped") return hand("It was stopped on purpose, so I left it alone.");
  if (kind === "setup") return hand("The project's setup or check command failed before any work started. That needs a person to fix the command.");
  if (kind === "unready") return hand("Triage says it is not ready to build: it is too large for one task, or there is no way to check it. Split it or say what done looks like, then run it again.");
  if (kind === "clash") return hand("It clashes with changes on main. Use Update this task, so the Builder can resolve the clash.");
  if (tries >= s.recoveries) return hand(`It was already tried again ${tries} time${tries === 1 ? "" : "s"} and stopped again, so I am not trying a third way on my own.`);
  if (spent >= s.perTask) return hand(`It has used ${usd(spent)}, which is the limit for one task (${usd(s.perTask)}).`);
  if (kind === "rate_limit") { const m = 10 * (tries + 1); return { action: "retry", delayMin: m, text: `Every model was rate limited. Trying again in ${m} minutes.` }; }
  if (kind === "builds") return { action: "guide", delayMin: 0, text: "Three builds did not pass. Sending the Builder guidance and starting a new round." };
  if (kind === "stalled") return { action: "retry", delayMin: 0, text: "It stopped giving any sign of life, so I stopped it. Trying again." };
  return { action: "retry", delayMin: 1, text: "It stopped with an error. Trying again in a minute." };
}

/** The files and folders a text names (paths with a slash, or a bare name with a common extension). */
export function pathsIn(text: string): string[] {
  const found = text.match(/(?:[\w.-]+\/)+[\w.-]*|\b[\w-]+\.(?:tsx?|jsx?|json|md|css|html|py|rs|go|sql|ya?ml|toml|sh)\b/g) ?? [];
  return [...new Set(found.map((p) => p.replace(/^\.\//, "")))];
}
const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
/** The first pair of paths, one from each side, that probably mean the same file: equal, one inside the other's folder, or the same file name. */
export function overlap(a: string[], b: string[]): string | undefined {
  for (const x of a) for (const y of b) {
    const dir = (d: string, f: string) => d.endsWith("/") && f.startsWith(d);
    if (x === y || dir(x, y) || dir(y, x) || (!x.endsWith("/") && !y.endsWith("/") && base(x) === base(y))) return x.length >= y.length ? x : y;
  }
}

const RECENT = 7 * 24 * 3_600_000; // a milestone finished longer ago than this is history, not news
const AWAITING_LIMIT = 3; // the person is the bottleneck: no new work while this many tasks wait for a decision
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export type Ctx = {
  root: string; store: Store;
  settings: () => Required<ManagerSettings>;
  items: () => Item[];
  /** Task ids with a running process, and a way to stop one. */
  running: Map<string, { kill(signal?: number | NodeJS.Signals): void }>;
  /** How many tasks the process running this one holds. */
  group: (id: string) => number;
  /** Runs `factory <argv>` for a task in the background. False when it is already running. */
  launch: (id: string, argv: string[]) => boolean;
  /** Runs `factory <argv>` and waits (promote). */
  cli: (...argv: string[]) => Promise<{ code: number; out: string }>;
  /** A model's words: why a task needs a person, or guidance for the Builder. Either may fail; the supervisor then goes on without. */
  explain: (id: string, error: string) => Promise<string>;
  guide: (id: string, error: string) => Promise<string>;
  hasSpec: (id: string) => boolean;
  /** Whether this team has someone to triage a loose idea. Without one, an item with no acceptance checks is not started on autopilot. */
  canTriage?: () => boolean;
  /** A model's retrospective when a milestone is done: what kept going wrong, with proposals under "## Follow-ups". May fail; the milestone is announced either way. */
  retro?: (milestone: string) => Promise<string>;
  every?: number;
  /** The clock; tests move it. */
  now?: () => number;
  /** Multiplies every wait before a retry; tests set 0. */
  scale?: number;
};

/** The loop. One tick looks at stalls, then at stopped tasks, then at what to start. */
export function supervisor(ctx: Ctx) {
  // Tasks that stopped before the supervisor started are left for the person: a restart must not set old work running again.
  const since = new Date().toISOString();
  const retryAt = new Map<string, number>(), settled = new Set<string>(), stalled = new Set<string>();
  const decide_ = (task: string, action: string, text: string, extra: Record<string, unknown> = {}) =>
    ctx.store.emit({ run: ctx.store.lastRun(task) ?? "", task, stage: "manager", type: "manager.decision", data: { action, text, auto: true, ...extra } });
  const once = (key: string) => (settled.has(key) ? false : (settled.add(key), true));

  async function tick() {
    const s = ctx.settings();
    const now = ctx.now?.() ?? Date.now(), items = ctx.items();
    const dayCost = () => ctx.store.spent(startOfDay());

    // M12: say when a milestone is done, once, and look back at it (M16). Said on assist too: it is news, not an action.
    if (s.autonomy !== "off") for (const m of milestones(items)) {
      if (m.open.length || !once(`milestone:${m.name}`)) continue;
      const last = m.ids.map((id) => ctx.store.touched(id) ?? "").sort().pop();
      if (!last || now - Date.parse(last) > RECENT) continue;
      if (ctx.store.decisions("", 1000).some((e) => (e.data as { action?: string; milestone?: string } | undefined)?.action === "milestone" && (e.data as { milestone?: string }).milestone === m.name)) continue;
      decide_("", "milestone", `Milestone "${m.name}" is done: all ${m.ids.length} of its tasks are finished. This is the moment for the milestone work: bring the documents up to date, run a security audit and check that it is ready to release. Ask me in Talk and I will start each with the right person.`, { milestone: m.name });
      if (dayCost() < s.perDay) ctx.retro?.(m.name).then(async (text) => {
        if (!text.trim()) return;
        ctx.store.emit({ run: "", task: "", stage: "manager", type: "manager.note", data: { text: text.split(/^## Follow-ups\s*$/m)[0]!.trim(), milestone: m.name } });
        // Her proposals go to the Inbox like any agent's follow-up: a person promotes them, autopilot does not.
        for (const title of followUps(text).slice(0, 3)) await ctx.cli("add", title.slice(0, 200), "--detail", `Proposed in the retrospective of the milestone "${m.name}".`);
      }).catch(() => {});
    }
    if (s.autonomy !== "autopilot") { retryAt.clear(); return; }

    // Stalled: a running task that has shown no sign of life for too long is stopped, and tried again below.
    for (const it of items) {
      if (it.section !== "In progress") continue;
      const p = ctx.running.get(it.id), seen = ctx.store.touched(it.id);
      if (p && seen && ctx.group(it.id) === 1 && now - Date.parse(seen) > s.stall * 60_000) {
        stalled.add(it.id);
        decide_(it.id, "stall", `${it.id} has shown no sign of life for ${s.stall} minutes, so I stopped it.`);
        p.kill("SIGTERM");
      }
    }

    // Stopped tasks: retry, guide, or hand to the person.
    for (const it of items) {
      if (it.section !== "Blocked" || ctx.running.has(it.id)) continue;
      const fail = ctx.store.last("run.failed", it.id);
      if (!fail || fail.ts < since) continue;
      const error = String(fail.data ?? ""), key = `${it.id}:${fail.seq}`;
      const kind = stalled.has(it.id) && failureKind(error) === "stopped" ? "stalled" : failureKind(error);
      const step = decide(kind, ctx.store.retries(it.id), ctx.store.spent("", it.id), s);
      if (step.action === "escalate") {
        if (!once(key)) continue;
        decide_(it.id, "escalate", `${it.id} needs you. ${step.text}`, { kind });
        if (kind !== "stopped") ctx.explain(it.id, error).then((text) => text && ctx.store.emit({ run: fail.run, task: it.id, stage: "manager", type: "manager.note", data: { text } })).catch(() => {});
        continue;
      }
      if (dayCost() >= s.perDay) { if (once(`day:${startOfDay()}`)) decide_(it.id, "budget", `The day's limit (${usd(s.perDay)}) is reached, so nothing more starts today.`); continue; }
      if (!retryAt.has(it.id)) {
        retryAt.set(it.id, now + step.delayMin * 60_000 * (ctx.scale ?? 1));
        if (step.delayMin > 0) decide_(it.id, "wait", `${it.id}: ${step.text}`, { kind });
      }
      if (now < retryAt.get(it.id)!) continue;
      retryAt.delete(it.id);
      stalled.delete(it.id);
      if (step.action === "guide" && ctx.hasSpec(it.id)) {
        const text = await ctx.guide(it.id, error).catch(() => "");
        if (text.trim() && ctx.launch(it.id, ["reject", it.id, "--feedback", text.trim().slice(0, 3900)])) { decide_(it.id, "guide", `${it.id}: ${step.text}`, { kind, guidance: text.trim().slice(0, 1500) }); continue; }
      }
      if (ctx.launch(it.id, ["run", it.id])) decide_(it.id, "retry", `${it.id}: ${step.action === "guide" ? "Started it again from the beginning." : step.text}`, { kind });
    }

    // New work: start Ready items in order, within the limits. Ready is the person's word that it may be built (they promoted it, or told the manager to: that proposal is carried out at once in the conversation).
    // An item that was only added to the Inbox is never moved by the supervisor: adding is not asking for it to be built, and building spends money.
    const fresh = ctx.items(), awaiting = fresh.filter((i) => i.section === "Awaiting approval").length;
    let room = s.parallel - ctx.running.size;
    if (room <= 0 || awaiting >= AWAITING_LIMIT) return;
    if (dayCost() >= s.perDay) { if (once(`day:${startOfDay()}`)) decide_("", "budget", `The day's limit (${usd(s.perDay)}) is reached, so nothing more starts today.`); return; }
    // A task the person discarded goes back to Ready, but they threw it away: autopilot leaves it until they run it themselves.
    const startable = (i: Item) => i.section === "Ready" && !ctx.running.has(i.id) && ctx.store.lastType(i.id) !== "task.discarded";
    const ready = fresh.filter(startable);
    // M13: a task that names the files a running task is changing waits for it (the spec says what the running one will touch).
    const touching = (i: Item) => pathsIn(`${i.title}\n${i.detail}\n${ctx.store.output(i.id, "spec") ?? ""}`);
    const busyFiles = () => [...ctx.running.keys()].map((id) => ({ id, files: touching(fresh.find((i) => i.id === id) ?? mine(id)) }));
    const mine = (id: string): Item => ({ id, title: "", section: "", detail: "" });
    for (const it of ready) {
      if (room <= 0) break;
      // M14: nothing is built without a way to check it. Triage writes the checks for a loose idea; with no triage in the team, the person does.
      if (needsTriage(it) && ctx.canTriage?.() === false) { if (once(`ready:${it.id}`)) decide_(it.id, "hold", `${it.id} has no acceptance checks, and this team has no triage to write them. Add an "Acceptance:" line to the item, or run it yourself.`); continue; }
      const mineFiles = touching(it);
      const hit = busyFiles().map((b) => ({ id: b.id, file: overlap(mineFiles, b.files) })).find((h) => h.file);
      if (hit) { if (once(`clash:${it.id}:${hit.id}`)) decide_(it.id, "hold", `${it.id} waits for ${hit.id}: both are likely to change ${hit.file}.`, { with: hit.id }); continue; }
      if (ctx.launch(it.id, ["run", it.id])) { decide_(it.id, "start", `${it.id} was next in line, so I started it.`); room--; }
    }
  }

  let busy = false;
  const timer = setInterval(() => { if (busy) return; busy = true; tick().catch(() => {}).finally(() => { busy = false; }); }, ctx.every ?? 15_000);
  return { tick, stop: () => clearInterval(timer) };
}

/** Changes the manager's settings in the project's config. Checked like any other config change. */
export function writeManager(root: string, patch: ManagerSettings): Required<ManagerSettings> {
  const file = join(root, "factory.config.json");
  if (!existsSync(file)) throw new Error("this folder has no factory.config.json: run /software-factory:init first");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.manager = { ...raw.manager, ...patch };
  const next = parseConfig(raw); // throws, in plain words, when a value is out of range
  writeFileSync(file, `${JSON.stringify({ ...raw, manager: next.manager }, null, 2)}\n`);
  return managerOf(next);
}

export const AUTONOMY_TEXT: Record<Autonomy, string> = {
  autopilot: "Autopilot: the manager starts what you ask her to build, and recovers a stuck task, by itself, within the limits",
  assist: "Assist: the manager diagnoses and proposes; you press the buttons",
  off: "Off: the manager does nothing by itself (you can still talk to it)",
};
