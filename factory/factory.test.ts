import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { add, move, parse } from "./backlog";
import { claudeArgs, classify } from "./claude";
import { parseConfig, type Config } from "./config";
import { openStore } from "./events";
import { followUps, runTask, shellGate, type Runner } from "./pipeline";
import { attachSkill, roleSkills } from "./skills";

const role = { runner: "claude", model: "sonnet", effort: "medium", fallback: ["haiku"] };
const config: Config = { gate: ["true"], roles: { triage: role, architect: role, builder: role, reviewer: role } };
const BACKLOG = "# Backlog\n\n## Inbox\n\n## Ready\n- [ ] F-001 (P1) First\n  detail line\n- [ ] F-002 Second\n\n## In progress\n\n## Blocked\n\n## Done\n";
const tmp = () => mkdtempSync(join(tmpdir(), "factory-"));
const task = { id: "F-001", title: "First" };

test("config: rejects bad input and names every problem", () => {
  expect(parseConfig(config)).toEqual(config);
  const bad = { gate: "bun test", roles: { ...config.roles, builder: { ...role, runner: "gemini", effort: "extreme" }, qa: role } };
  expect(() => parseConfig(bad)).toThrow(/gate:[\s\S]*roles\.qa: unknown[\s\S]*builder\.runner[\s\S]*builder\.effort/);
  expect(() => parseConfig(null)).toThrow(/roles\.triage: missing/);
});

test("backlog: parse, move with detail lines, add, duplicate ids", () => {
  expect(parse(BACKLOG).map((i) => [i.id, i.prio, i.section])).toEqual([["F-001", "P1", "Ready"], ["F-002", undefined, "Ready"]]);
  const done = move(BACKLOG, "F-001", "Done");
  expect(done).toContain("## Done\n- [x] F-001 (P1) First\n  detail line\n");
  expect(parse(done)[0]).toMatchObject({ id: "F-002", section: "Ready" });
  const added = add(done, "multi\nline   title");
  expect(added.id).toBe("F-003");
  expect(added.text).toContain("## Inbox\n- [ ] F-003 multi line title\n");
  expect(() => move(BACKLOG, "F-999", "Done")).toThrow(/no item/);
  expect(() => add(BACKLOG, "  ")).toThrow(/title/);
  expect(() => parse(BACKLOG + "- [ ] F-001 again\n")).toThrow(/duplicate/);
});

test("pipeline: fails over on rate limit, loops on gate failure and review, collects follow-ups", async () => {
  const store = openStore(":memory:");
  let builds = 0, gates = 0;
  const runner: Runner = async ({ stage, model, prompt }) => {
    if (stage === "spec" && model === "sonnet") return { status: "rate_limited", text: "" };
    if (stage === "build") return { status: "ok", text: `build ${++builds} ${prompt.includes("feedback") ? "with feedback" : ""}` };
    if (stage === "review") return { status: "ok", text: builds < 3 ? "REQUEST_CHANGES\nrename x" : "APPROVE\n## Follow-ups\n- Add retry metrics\n## Notes\n- not this" };
    return { status: "ok", text: stage };
  };
  const dir = tmp();
  const result = await runTask(task, { config, store, runner, gate: () => ({ ok: ++gates > 1, output: "test failed" }), cwd: dir });

  expect(result).toMatchObject({ ok: true, followUps: ["Add retry metrics"] });
  expect(builds).toBe(3); // 1: gate fails, 2: review rejects, 3: approved
  const events = store.list(result.run).map((e) => `${e.stage}:${e.type}:${e.model ?? ""}`);
  expect(events).toContain("spec:stage.rate_limited:sonnet");
  expect(events).toContain("spec:stage.ok:haiku");
  expect(events.at(-1)).toBe("run:run.done:");
  expect(readFileSync(join(dir, ".factory/runs", result.run, "build.md"), "utf8")).toContain("with feedback");
});

test("pipeline: stops on auth errors, exhausted chains and build limit", async () => {
  const run = (runner: Runner) => runTask(task, { config, store: openStore(":memory:"), runner, gate: shellGate(["false"]), cwd: tmp() });
  expect(await run(async () => ({ status: "auth", text: "" }))).toMatchObject({ ok: false, error: expect.stringMatching(/auth/) });
  expect(await run(async () => ({ status: "rate_limited", text: "" }))).toMatchObject({ ok: false, error: expect.stringMatching(/rate limited/) });
  expect(await run(async () => ({ status: "ok", text: "APPROVE" }))).toMatchObject({ ok: false, error: expect.stringMatching(/3 attempts/) });
  expect(followUps("no heading\n- nope")).toEqual([]);
});

test("claude: classifies results from real CLI output shapes", () => {
  const ok = JSON.stringify({ type: "result", subtype: "success", is_error: false, api_error_status: null, result: "the rate limit docs", total_cost_usd: 0.0004, num_turns: 1, usage: { input_tokens: 2, output_tokens: 4 },
    permission_denials: [{ tool_name: "Bash", tool_input: { command: "rm x" } }, { tool_name: "Skill", tool_input: { skill: "tdd" } }] });
  expect(classify(0, ok, "")).toMatchObject({ status: "ok", text: "the rate limit docs", usage: { costUsd: 0.0004, outputTokens: 4, denials: ["Bash rm x", "Skill tdd"] } });
  const fail = (api: number | null, result: string) => classify(1, JSON.stringify({ type: "result", subtype: "success", is_error: true, api_error_status: api, result }), "").status;
  expect(fail(404, "There's an issue with the selected model")).toBe("error");
  expect(fail(429, "")).toBe("rate_limited");
  expect(fail(529, "")).toBe("rate_limited");
  expect(fail(null, "Claude usage limit reached")).toBe("rate_limited");
  expect(fail(401, "")).toBe("auth");
  expect(classify(1, "", "error: unknown option")).toEqual({ status: "error", text: "error: unknown option", usage: undefined });
  expect(classify(0, ok.replace('"success"', '"error_max_turns"'), "").status).toBe("error");

  const job = { role: "builder", model: "sonnet", effort: "medium", stage: "build", prompt: "Stage: build.", cwd: "." } as const;
  const args = claudeArgs(job, ["bun test"], ["tdd", "review"]);
  expect(args[2]).toStartWith("Stage: build.\n\nSkills attached to your role: tdd, review.");
  expect(args).toContain("Bash(bun test:*)");
  expect(args).toContain("Skill(review)");
  expect(args.join(" ")).toContain("--agent builder --model sonnet --effort medium");
  expect(args.join(" ")).toContain("--permission-mode acceptEdits");
  expect(args.join(" ")).toContain("--setting-sources project");
  const readOnly = claudeArgs({ ...job, role: "reviewer" }, []);
  expect(readOnly[2]).toBe("Stage: build.");
  expect(readOnly.join(" ")).toContain("--permission-mode dontAsk");
});

test("skills: attach is idempotent and creates the list when absent", () => {
  const md = "---\nname: builder\ntools: Read\n---\nBody\n";
  const once = attachSkill(md, "tdd");
  expect(once).toBe("---\nname: builder\ntools: Read\nskills:\n  - tdd\n---\nBody\n");
  expect(attachSkill(attachSkill(once, "review"), "tdd")).toContain("skills:\n  - tdd\n  - review\n---");
  expect(() => attachSkill("no frontmatter", "x")).toThrow();
  expect(roleSkills(attachSkill(once, "review") + "  - not frontmatter\n")).toEqual(["tdd", "review"]);
  expect(roleSkills(md)).toEqual([]);
});

test("cli: run moves the top Ready item to Done and records events", () => {
  const dir = tmp();
  writeFileSync(join(dir, "BACKLOG.md"), BACKLOG);
  writeFileSync(join(dir, "factory.config.json"), JSON.stringify(config));
  const cli = (...args: string[]) => Bun.spawnSync(["bun", join(import.meta.dir, "cli.ts"), ...args], { cwd: dir });
  expect(cli("run", "--stub").exitCode).toBe(0);
  expect(cli("add", "Later thing").exitCode).toBe(0);
  const items = parse(readFileSync(join(dir, "BACKLOG.md"), "utf8"));
  expect(items.find((i) => i.id === "F-001")?.section).toBe("Done");
  expect(items.find((i) => i.id === "F-003")).toMatchObject({ section: "Inbox", title: "Later thing" });
  expect(cli("run", "F-001").exitCode).toBe(1); // already done
  expect(cli("bogus").exitCode).toBe(1);
});
