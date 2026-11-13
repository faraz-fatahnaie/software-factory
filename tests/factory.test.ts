import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { add, move, parse } from "../plugin/engine/backlog";
import { agentEvents, claudeArgs, classify } from "../plugin/engine/claude";
import { parseConfig } from "../plugin/engine/config";
import { openStore } from "../plugin/engine/events";
import { BACKLOG, config, repo, role, tmp } from "./fixture";
import { guard } from "../plugin/engine/hooks";
import { applyTeam, detect, doctor, init } from "../plugin/engine/init";
import { activeRoles, catalog, DEFAULT_PRESET, presets, renderRole, toolsFor, validateTeam } from "../plugin/engine/team";
import { followUps, needsTriage, runTask, shellGate, type Runner } from "../plugin/engine/pipeline";
import { serve } from "../plugin/engine/server";
import { costs, elapsed, passRates, roster, series, summarize, toolLine, type Ev } from "../plugin/engine/state";
import { attachSkill, detachSkill, parseFind, roleSkills } from "../plugin/engine/skills";

const task = { id: "F-001", title: "First" };

test("config: rejects bad input and names every problem", () => {
  expect(parseConfig(config)).toEqual(config);
  const bad = { gate: "bun test", roles: { ...config.roles, builder: { ...role, runner: "gemini", effort: "extreme" }, qa: role } };
  expect(() => parseConfig(bad)).toThrow(/gate:[\s\S]*roles\.qa: unknown[\s\S]*builder\.runner[\s\S]*builder\.effort/);
  expect(() => parseConfig(null)).toThrow(/roles\.planner: missing/);
  expect(() => parseConfig({ ...config, setup: "bun install" })).toThrow(/setup:/);
  // Model names become command-line arguments: nothing that reads as an option, and no stray keys.
  expect(() => parseConfig({ ...config, roles: { ...config.roles, builder: { ...role, model: "--dangerously-skip-permissions" } } })).toThrow(/builder\.model/);
  expect(() => parseConfig({ ...config, roles: { ...config.roles, builder: { ...role, fallback: ["haiku", "-x"] } } })).toThrow(/builder\.fallback/);
  expect(parseConfig({ ...config, extra: 1, roles: { ...config.roles, builder: { ...role, model: "claude-opus-5-5[1m]", smuggled: true } } }))
    .toEqual({ ...config, roles: { ...config.roles, builder: { ...role, model: "claude-opus-5-5[1m]" } } });
});

test("backlog: parse, move with detail lines, add, duplicate ids", () => {
  expect(parse(BACKLOG).map((i) => [i.id, i.prio, i.section])).toEqual([["F-001", "P1", "Ready"], ["F-002", undefined, "Ready"]]);
  const done = move(BACKLOG, "F-001", "Done");
  expect(done).toContain("## Done\n- [x] F-001 (P1) First\n  detail line\n");
  expect(parse(done)[0]).toMatchObject({ id: "F-002", section: "Ready" });
  const added = add(done, "multi\nline   title");
  expect(added.id).toBe("F-003");
  expect(added.text).toContain("## Inbox\n- [ ] F-003 multi line title\n");
  expect(move(BACKLOG, "F-002", "Done", "https://example.invalid/pr/1")).toContain("- [x] F-002 Second (https://example.invalid/pr/1)\n");
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
  const result = await runTask(task, { config, store, runner, gate: async () => ({ ok: ++gates > 1, output: "test failed" }), cwd: dir });

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
  expect(args.join(" ")).toContain("--output-format stream-json --verbose");
  const readOnly = claudeArgs({ ...job, role: "reviewer" }, []);
  expect(readOnly[2]).toBe("Stage: build.");
  expect(readOnly.join(" ")).toContain("--permission-mode dontAsk");
  const hooks = (a: string[]) => Object.keys(JSON.parse(a[a.indexOf("--settings") + 1]!).hooks);
  expect(hooks(args)).toEqual(["PreToolUse", "Stop"]); // only the builder is held to the gate
  expect(hooks(readOnly)).toEqual(["PreToolUse"]);
});

test("skills: attach is idempotent and creates the list when absent", () => {
  const md = "---\nname: builder\ntools: Read\n---\nBody\n";
  const once = attachSkill(md, "tdd");
  expect(once).toBe("---\nname: builder\ntools: Read\nskills:\n  - tdd\n---\nBody\n");
  expect(attachSkill(attachSkill(once, "review"), "tdd")).toContain("skills:\n  - tdd\n  - review\n---");
  expect(() => attachSkill("no frontmatter", "x")).toThrow();
  expect(roleSkills(attachSkill(once, "review") + "  - not frontmatter\n")).toEqual(["tdd", "review"]);
  expect(roleSkills(md)).toEqual([]);
  expect(detachSkill(attachSkill(once, "review"), "tdd")).toBe("---\nname: builder\ntools: Read\nskills:\n  - review\n---\nBody\n");
  expect(detachSkill(once, "tdd")).toBe(md); // the empty list goes too
  expect(detachSkill(md, "absent")).toBe(md);
  const found = parseFind("\nInstall with npx skills add <owner/repo@skill>\n\n\x1b[1mobra/superpowers@test-driven-development\x1b[0m 276.6K installs\n└ https://skills.sh/obra/superpowers/test-driven-development\n\nobra/superpowers-skills@Using Git Worktrees 534 installs\n");
  expect(found).toEqual([
    { pkg: "obra/superpowers@test-driven-development", installs: "276.6K", url: "https://skills.sh/obra/superpowers/test-driven-development" },
    { pkg: "obra/superpowers-skills@Using Git Worktrees", installs: "534", url: "" },
  ]);
});

test("guard: blocks governance files, escapes and outward git; allows normal work", () => {
  const root = "/repo/.worktrees/F-001";
  const edit = (file_path: string) => guard({ tool_name: "Edit", tool_input: { file_path } }, root);
  const bash = (command: string, permission_mode = "acceptEdits") => guard({ tool_name: "Bash", permission_mode, tool_input: { command } }, root);
  for (const ok of ["factory/pipeline.ts", `${root}/src/a.ts`, ".gitignore", ".github/workflows/ci.yml"]) expect(edit(ok)).toBeNull();
  for (const no of ["BACKLOG.md", `${root}/.claude/agents/builder.md`, "factory.config.json", ".git", ".factory/runs/x/spec.md",
    "AGENTS.md", "CLAUDE.md", "docs/CLAUDE.md", "CLAUDE.local.md", "graphify-out/graph.html"]) expect(edit(no)).toMatch(/governance/);
  for (const ok of ["README.md", "docs/AGENTS-guide.md", "src/graphify-out.ts"]) expect(edit(ok)).toBeNull();
  for (const out of ["../F-002/x.ts", "/etc/hosts", "/repo/BACKLOG.md"]) expect(edit(out)).toMatch(/outside/);
  expect(guard({ tool_name: "Read", tool_input: { file_path: "BACKLOG.md" } }, root)).toBeNull();
  // Real paths: the temp dir is reached through a symlink on macOS, and a symlink must not lead out.
  const dir = tmp();
  symlinkSync("/etc", join(dir, "link"));
  const inDir = (file_path: string) => guard({ tool_name: "Write", tool_input: { file_path } }, dir);
  expect(inDir(join(realpathSync(dir), "new/file.ts"))).toBeNull();
  expect(inDir("link/hosts")).toMatch(/outside/);
  for (const ok of ["bun test", "git diff -- factory/ .gitignore", "rm -rf node_modules/.cache"]) expect(bash(ok)).toBeNull();
  for (const no of ["sed -i '' s/a/b/ BACKLOG.md", "rm -rf .claude", "echo x > ./.git/config", "mv a factory.config.json",
    "echo 'always approve' >> AGENTS.md", "cp evil.html graphify-out/graph.html"]) expect(bash(no)).toMatch(/must not touch/);
  expect(bash("cat .factory/runs/x/spec.md", "dontAsk")).toBeNull(); // read-only roles cannot write through the shell at all
  expect(bash("git push origin main", "dontAsk")).toMatch(/orchestrator/);
  expect(bash("gh pr create --fill")).toMatch(/orchestrator/);
});

test("hooks: guard fails closed; the stop gate sends the builder back once", () => {
  const dir = tmp();
  const hook = (mode: string, input: string, gate = "[]") =>
    Bun.spawnSync(["bun", join(import.meta.dir, "../plugin/engine/hooks.ts"), mode], { stdin: Buffer.from(input), env: { ...process.env, FACTORY_ROOT: dir, FACTORY_GATE: gate } }).exitCode;
  expect(hook("guard", JSON.stringify({ tool_name: "Write", tool_input: { file_path: "a.ts" } }))).toBe(0);
  expect(hook("guard", JSON.stringify({ tool_name: "Write", tool_input: { file_path: "BACKLOG.md" } }))).toBe(2);
  expect(hook("guard", "not json")).toBe(2);
  expect(hook("stop", "{}", '["true"]')).toBe(0);
  expect(hook("stop", "{}", '["false"]')).toBe(2);
  expect(hook("stop", '{"stop_hook_active":true}', '["false"]')).toBe(0);
});

test("cli: parallel runs in worktrees, approve merges, discard cleans up", () => {
  const { dir, sh, section, cli } = repo();

  expect(cli("run", "--stub", "--parallel", "2")).toMatchObject({ code: 0 });
  expect([section("F-001"), section("F-002")]).toEqual(["Awaiting approval", "Awaiting approval"]);
  expect(existsSync(join(dir, ".worktrees/F-001/STUB_BUILD.txt"))).toBe(true);
  expect(existsSync(join(dir, "STUB_BUILD.txt"))).toBe(false); // the main checkout is untouched
  expect(sh("git", "status", "--porcelain").out).toBe(""); // backlog moves were committed
  expect(sh("git", "log", "--format=%s", "factory/F-001", "-1").out).toBe("F-001: First");
  expect(cli("run", "F-001", "--stub").code).toBe(1); // already awaiting approval

  expect(cli("approve", "F-001")).toMatchObject({ code: 0 });
  expect(existsSync(join(dir, "STUB_BUILD.txt"))).toBe(true); // merged
  expect(cli("discard", "F-002")).toMatchObject({ code: 0 });
  expect(existsSync(join(dir, ".worktrees/F-001")) || existsSync(join(dir, ".worktrees/F-002"))).toBe(false);
  expect(sh("git", "branch", "--list", "factory/*").out).toBe("");
  expect([section("F-001"), section("F-002")]).toEqual(["Done", "Ready"]);

  expect(cli("add", "Later thing").code).toBe(0);
  expect(section("F-003")).toBe("Inbox");
  expect(cli("approve", "F-002").code).toBe(1); // nothing to approve
  expect(cli("run", "--parallel", "0").code).toBe(1);
  expect(cli("run", "F-002 F-003", "--stub").out).toMatch(/unknown argument/); // must not fall through to the top Ready item
  expect(section("F-002")).toBe("Ready");
  expect(cli("bogus").code).toBe(1);
}, 60_000);

test("claude: stream lines become provider-neutral agent events", () => {
  const assistant = { type: "assistant", message: { content: [
    { type: "thinking", thinking: "…" },
    { type: "text", text: "Running the tests." },
    { type: "tool_use", name: "Bash", input: { command: "bun test" } },
    { type: "tool_use", name: "Write", input: { file_path: "a.ts", content: "x".repeat(5000) } },
  ] } };
  const events = agentEvents(assistant);
  expect(events.slice(0, 2)).toEqual([
    { type: "agent.message", data: { text: "Running the tests." } },
    { type: "agent.tool", data: { tool: "Bash", input: { command: "bun test" } } },
  ]);
  expect((events[2]!.data as any).input.length).toBe(2001); // large inputs are cut for the log
  expect(agentEvents({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } })).toEqual([{ type: "agent.rate_limit", data: { status: "allowed" } }]);
  expect(agentEvents({ type: "system", subtype: "init" })).toEqual([]);
});

test("server: rejects foreign hosts and origins; streams events; runs, approves and discards over HTTP", async () => {
  const { dir, section } = repo();
  const server = await serve(dir, 0);
  const base = `http://127.0.0.1:${server.port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  try {
    expect((await server.fetch(new Request(`http://evil.example:${server.port}/api/backlog`))).status).toBe(403); // DNS rebinding
    expect((await post("/api/add", { title: "x" }, { origin: "http://evil.example" })).status).toBe(403); // cross-site POST
    expect((await fetch(base + "/api/add", { method: "POST", body: "title=x" })).status).toBe(415); // form post
    expect((await post("/api/run", { ids: ["F-001; rm -rf /"] })).status).toBe(400);
    expect((await post("/api/run", { parallel: 99 })).status).toBe(400);
    expect((await post("/api/stop", { id: "F-001" })).status).toBe(404);
    expect((await post("/api/add", { title: "From the GUI" })).status).toBe(200);
    expect(section("F-003")).toBe("Inbox");
    expect((await post("/api/promote", { id: "F-003" })).status).toBe(200);
    expect(section("F-003")).toBe("Ready");
    expect(await (await fetch(base + "/")).text()).toContain("<title>Software Factory</title>");
    const script = (await (await fetch(base + "/")).text()).match(/src="\.?\/?([^"]+\.js)"/)![1];
    expect((await fetch(`${base}/${script}`)).status).toBe(200); // the prebuilt page script
    expect((await fetch(base + "/..%2f..%2fpackage.json")).status).toBe(404); // only files inside dist/

    const roles = { ...config.roles, builder: { ...role, model: "opus", fallback: [] } };
    expect((await post("/api/config", { roles: { ...roles, builder: { ...role, effort: "extreme" } } })).status).toBe(400);
    expect((await post("/api/config", { roles })).status).toBe(200);
    const onDisk = JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8"));
    expect(onDisk).toMatchObject({ setup: ["true"], gate: ["true"], roles: { builder: { model: "opus" } } }); // only roles changed

    expect((await post("/api/run", { parallel: 2, stub: true })).status).toBe(202);
    expect((await post("/api/run", { ids: ["F-001"], stub: true })).status).toBe(409); // already running
    const reader = (await fetch(`${base}/api/events?after=0`)).body!.getReader();
    let seen = "";
    while ((seen.match(/"type":"run.done"/g) ?? []).length < 2) seen += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    expect(seen).toMatch(/^id: 1\ndata: \{/); // replay starts from the first event
    const backlog = async () => (await (await fetch(`${base}/api/backlog`)).json()) as { running: string[] };
    while ((await backlog()).running.length) await Bun.sleep(50);
    expect([section("F-001"), section("F-002")]).toEqual(["Awaiting approval", "Awaiting approval"]);

    expect(await (await fetch(`${base}/api/diff?id=F-001`)).text()).toContain("+stub build");
    expect((await fetch(`${base}/api/diff?id=F-999`)).status).toBe(404);
    expect((await fetch(`${base}/api/diff?id=../../etc`)).status).toBe(400);
    const get = async (path: string) => (await fetch(base + path)).json() as Promise<any>;
    expect((await get("/api/worktrees")).map((w: any) => [w.id, w.branch, w.ahead, w.uncommitted])).toEqual([["F-001", "factory/F-001", 1, 0], ["F-002", "factory/F-002", 1, 0]]);

    // Studio: only listed files, every save is a commit, old versions stay readable.
    expect(await get("/api/files")).toEqual([".claude/agents/builder.md", ".claude/skills/tdd/SKILL.md", "AGENTS.md"]);
    expect((await fetch(`${base}/api/file?path=../../etc/passwd`)).status).toBe(400);
    expect((await post("/api/file", { path: "factory.config.json", content: "{}" })).status).toBe(400);
    expect((await post("/api/file", { path: ".claude/agents/builder.md", content: "no frontmatter" })).status).toBe(400);
    expect(await (await post("/api/file", { path: "AGENTS.md", content: "# Rules\n\n1. Be brief.\n" })).json()).toEqual({ ok: true, committed: true });
    const doc = await get("/api/file?path=AGENTS.md");
    expect(doc).toMatchObject({ content: "# Rules\n\n1. Be brief.\n", history: [{ subject: "studio: edit AGENTS.md" }, { subject: "base" }] });
    expect((await get(`/api/file?path=AGENTS.md&rev=${doc.history[1].sha}`)).content).toBe("# Rules\n");

    // Per-role skills: attach and detach an installed skill; both are committed.
    expect(await get("/api/skills")).toMatchObject({ installed: ["tdd"], roles: { builder: [], reviewer: [] } });
    expect((await post("/api/skill", { action: "attach", skill: "tdd", role: "builder" })).status).toBe(200);
    expect((await get("/api/skills")).roles.builder).toEqual(["tdd"]);
    expect((await post("/api/skill", { action: "attach", skill: "not-installed", role: "builder" })).status).toBe(409);
    expect((await post("/api/skill", { action: "attach", skill: "tdd", role: "janitor" })).status).toBe(409);
    expect((await post("/api/skill", { action: "detach", skill: "tdd", role: "builder" })).status).toBe(200);
    expect((await get("/api/skills")).roles.builder).toEqual([]);
    expect((await fetch(`${base}/api/skills/search?q=${encodeURIComponent("x; rm -rf /")}`)).status).toBe(400);
    expect((await fetch(`${base}/graph`)).status).toBe(404); // no graph in the throwaway repo
    mkdirSync(join(dir, "graphify-out"));
    writeFileSync(join(dir, "graphify-out/graph.html"), "<script>fetch('/api/approve')</script>");
    expect((await fetch(`${base}/graph`)).headers.get("content-security-policy")).toBe("sandbox allow-scripts"); // untrusted page, throwaway origin
    expect((await post("/api/skill", { action: "add", skill: "-x/y@z", role: "builder" })).status).toBe(409); // not an option

    expect((await post("/api/approve", { id: "F-001" })).status).toBe(200);
    expect((await post("/api/discard", { id: "F-002" })).status).toBe(200);
    expect(await (await post("/api/approve", { id: "F-002" })).json()).toMatchObject({ ok: false, output: expect.stringMatching(/expected Awaiting approval/) });
    expect([section("F-001"), section("F-002")]).toEqual(["Done", "Ready"]);
  } finally {
    server.stop(true);
  }
}, 60_000);

test("gui state: folds events into stage states, cost and outputs; a rebuild clears later stages", () => {
  let seq = 0;
  const ev = (stage: string, type: string, extra: Partial<Ev> = {}): Ev => ({ seq: ++seq, ts: "2026-01-01T00:00:00.000Z", run: "r1", task: "F-001", stage, type, ...extra });
  const log = [
    ev("run", "run.start"),
    ev("spec", "stage.start", { model: "opus" }), ev("spec", "stage.rate_limited", { model: "opus" }),
    ev("spec", "stage.start", { model: "sonnet" }), ev("spec", "stage.ok", { model: "sonnet", data: { usage: { costUsd: 0.25 }, output: "the spec" } }),
    ev("build", "stage.start", { model: "sonnet" }), ev("build", "agent.rate_limit", { data: { status: "allowed" } }),
    ev("build", "stage.ok", { model: "sonnet", data: { usage: { costUsd: 0.5 } } }),
    ev("check", "stage.start"), ev("check", "stage.failed", { data: "1 test failed" }),
  ];
  const mid = summarize(log).tasks.get("F-001")!;
  expect(mid).toMatchObject({ status: "running", cost: 0.75, outputs: { spec: "the spec" } });
  expect(mid.stages).toMatchObject({ spec: { state: "ok", model: "sonnet" }, build: { state: "ok" }, check: { state: "failed" } });

  log.push(ev("build", "stage.start", { model: "sonnet" }));
  const rebuilt = summarize(log);
  expect(rebuilt.tasks.get("F-001")!.stages).toMatchObject({ spec: { state: "ok", model: "sonnet" }, build: { state: "active", model: "sonnet" } });
  expect(Object.keys(rebuilt.tasks.get("F-001")!.stages)).toEqual(["spec", "build"]); // the stale check is gone
  expect(rebuilt.rateLimit).toEqual({ status: "allowed" });

  log.push(ev("run", "run.failed", { data: "Error: stopped by request" }), { ...ev("run", "command.failed"), run: "", task: "F-009" });
  const done = summarize(log);
  expect(done.tasks.get("F-001")).toMatchObject({ status: "failed", error: "Error: stopped by request", stages: { build: { state: "failed" } } });
  expect(done.notice?.task).toBe("F-009");

  // Dashboard folds: who is working, activity per time bucket, and pass rates.
  expect(roster(rebuilt.tasks)).toEqual([{ task: "F-001", stage: "build", role: "gate", model: "sonnet", since: "2026-01-01T00:00:00.000Z" }]);
  expect(roster(done.tasks)).toEqual([]);
  const t0 = Date.parse("2026-01-01T00:00:00.000Z");
  const buckets = series(log, t0 - 3_600_000, t0 + 3_600_000, 2);
  expect(buckets.map((b) => [b.stages, b.failed, b.cost])).toEqual([[0, 0, 0], [2, 2, 0.75]]); // one failed check, one failed run
  expect(series(log, t0 + 1, t0 + 2, 1)[0]).toMatchObject({ stages: 0, failed: 0 });
  expect(passRates([...log, ev("check", "stage.ok"), ev("review", "stage.ok", { data: { output: "APPROVE" } }), ev("review", "stage.ok", { data: { output: "REQUEST_CHANGES" } })]))
    .toEqual({ gate: { ok: 1, total: 2 }, review: { ok: 1, total: 2 } });

  const by = costs(log);
  expect(by.model.get("sonnet")).toMatchObject({ stages: 2, ok: 2, cost: 0.75 });
  expect(by.model.get("opus")).toMatchObject({ stages: 1, ok: 0, cost: 0 }); // the rate-limited attempt counts against opus
  expect([...by.task.keys()]).toEqual(["F-001"]);

  expect(toolLine({ tool: "Bash", input: { command: "bun   test\n --watch" } })).toBe("Bash  bun test --watch");
  expect(toolLine({ tool: "Read", input: { file_path: "a.ts" } })).toBe("Read  a.ts");
  expect(elapsed("2026-01-01T00:00:00.000Z", Date.parse("2026-01-01T00:01:05.000Z"))).toBe("1m 05s");
});

test("init: detects the stack, writes without overwriting, and doctor confirms the setup", () => {
  const project = (files: Record<string, string>) => {
    const dir = tmp();
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    return dir;
  };
  expect(detect(project({ "package.json": JSON.stringify({ scripts: { test: "vitest", lint: "eslint .", build: "tsc" } }), "pnpm-lock.yaml": "" })))
    .toEqual({ stack: "JavaScript/TypeScript (pnpm)", setup: ["pnpm install"], gate: ["pnpm run test", "pnpm run lint"] });
  expect(detect(project({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) })).gate).toEqual([]);
  expect(detect(project({ "pyproject.toml": "[tool.ruff]\n[tool.pytest.ini_options]\n", "uv.lock": "" })))
    .toEqual({ stack: "Python", setup: ["uv sync"], gate: ["uv run ruff check .", "uv run pytest -q"] });
  expect(detect(project({ "go.mod": "module x" })).gate).toEqual(["go vet ./...", "go test ./..."]);
  expect(detect(project({ "Cargo.toml": "" })).stack).toBe("Rust");
  expect(detect(project({ Makefile: "build:\n\tcc x.c\ntest:\n\t./run\n" })).gate).toEqual(["make test"]);
  expect(detect(project({ "notes.txt": "" }))).toEqual({ stack: "unknown", setup: [], gate: [] });

  // A Go project that already has its own rules file and one customised role.
  const dir = project({ "go.mod": "module x", "AGENTS.md": "# House rules\n\nTabs.", ".gitignore": "bin/\n" });
  const git = (...argv: string[]) => Bun.spawnSync(["git", ...argv], { cwd: dir }).stdout.toString().trim();
  git("init", "-q", "-b", "main");
  mkdirSync(join(dir, ".claude/agents"), { recursive: true });
  writeFileSync(join(dir, ".claude/agents/builder.md"), "---\nname: builder\n---\nMine.\n");
  expect(doctor(dir).ok).toBe(false);

  const cli = (...args: string[]) => { const p = Bun.spawnSync([join(import.meta.dir, "../plugin/bin/factory"), ...args], { cwd: dir }); return { code: p.exitCode, out: `${p.stdout}${p.stderr}` }; };
  expect(cli("init", "--bogus").out).toMatch(/unknown argument/);
  const first = cli("init", "--gate", "go test ./...");
  expect(first.out).toMatch(/Stack: Go[\s\S]*created  factory.config.json[\s\S]*kept     .claude\/agents\/builder.md[\s\S]*updated  AGENTS.md/);
  expect(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8"))).toMatchObject({ setup: [], gate: ["go test ./..."], roles: { builder: { model: "sonnet" } } });
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toStartWith("# House rules\n\nTabs.\n\n## Software Factory rules\n"); // appended, not replaced
  expect(readFileSync(join(dir, ".claude/agents/builder.md"), "utf8")).toContain("Mine."); // never overwritten
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("bin/\n.factory/\n.worktrees/\n");
  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
  expect(git("log", "--format=%s")).toBe("software-factory: initialize");

  // Running it again changes nothing, and the setup now checks out.
  expect(init(dir).paths).toEqual([]);
  const health = doctor(dir);
  expect(health.lines.filter((l) => l.startsWith("✗"))).toEqual([]);
  expect(cli("status").out).toMatch(/Inbox 0 · Ready 0/);
  expect(cli("add", "First thing").code).toBe(0);
  expect(cli("promote", "F-001").code).toBe(0);
  expect(cli("status").out).toMatch(/Ready:\n  F-001 First thing\nInbox 0 · Ready 1/);
  expect(cli("init").code).toBe(0);
  expect(cli("gate", "true")).toMatchObject({ code: 0, out: "gate passed\n" });
  expect(cli("gate", "echo boom; false")).toMatchObject({ code: 1, out: expect.stringMatching(/gate failed[\s\S]*boom/) });
  const outside = tmp();
  expect(Bun.spawnSync([join(import.meta.dir, "../plugin/bin/factory"), "init"], { cwd: outside }).exitCode).toBe(1); // not a git repository
}, 60_000);

test("team: the Balanced preset covers the catalog and obeys the enforced rules; bad teams are rejected", () => {
  const balanced = presets[DEFAULT_PRESET]!;
  expect(catalog).toHaveLength(51);
  expect(validateTeam(balanced)).toEqual([]);
  expect(activeRoles(balanced)).toEqual(["planner", "architect", "builder", "reviewer"]); // the roles that hold something built

  const copy = () => structuredClone(balanced);
  const moved = copy(); moved.roles.reviewer!.holds = []; moved.roles.builder!.holds.push("C1"); // builder reviews its own work
  expect(validateTeam(moved).join("\n")).toMatch(/builder holds B2 and also C1: the author cannot review/);
  const dropped = copy(); dropped.roles.scribe!.holds = ["K1", "K2", "K3"]; // K4 forgotten
  expect(validateTeam(dropped)).toEqual(["K4 is not held by any role and not switched off"]);
  const off = copy(); off.roles.scribe!.holds = ["K1", "K2", "K3"]; off.off = ["K4"]; // dropped on purpose
  expect(validateTeam(off)).toEqual([]);
  const twice = copy(); twice.roles.tester!.holds.push("C1");
  expect(validateTeam(twice).join("\n")).toMatch(/C1 is held twice \(tester and reviewer\)/);
  const noBuilder = copy(); noBuilder.roles.builder!.holds = noBuilder.roles.builder!.holds.filter((id) => id !== "B2"); noBuilder.off = ["B2"];
  expect(validateTeam(noBuilder).join("\n")).toMatch(/exactly one role must hold B2/);
  const script = copy(); script.scripts.push("D1"); script.roles.product_partner = script.roles["product-partner"]!; delete script.roles["product-partner"];
  expect(validateTeam(script).join("\n")).toMatch(/D1 is not a script responsibility/);
  expect(validateTeam({ ...balanced, off: ["Z9"] }).join("\n")).toMatch(/unknown responsibility Z9/);
});

test("team: role files are assembled from the responsibilities a role holds", () => {
  const builder = renderRole("builder", undefined, ["tdd"]);
  expect(builder).toStartWith("---\nname: builder\ndescription: Implements one spec");
  expect(builder).toContain("tools: Read, Grep, Glob, Bash, Edit, Write, Skill\nskills:\n  - tdd\n---\n<!-- Generated");
  expect(builder).toMatch(/## Implement the spec[\s\S]*## Test the change/); // B2 then V1; F1, F2, F4, O1 are not built, so absent
  expect(builder).not.toContain("scaffold");
  expect(toolsFor(["B1"])).toEqual(["Read", "Grep", "Glob", "Bash", "WebSearch", "WebFetch", "Skill"]); // the spec role may search the web
  expect(toolsFor(["C1"])).toEqual(["Read", "Grep", "Glob", "Bash", "Skill"]); // the reviewer cannot edit
  expect(toolsFor(["D1"])).toEqual(["Read", "Grep", "Glob", "Bash", "Skill"]); // nothing built: the safe minimum
  expect(renderRole("reviewer")).toContain("Your first line must be exactly `APPROVE` or `REQUEST_CHANGES`");
  expect(() => renderRole("scribe")).toThrow(/nothing that is built yet/);
  expect(() => renderRole("janitor")).toThrow(/no role "janitor"/);
});

test("team apply: rebuilds generated files, keeps skills, leaves hand-edited files alone", () => {
  const { dir, cli } = repo();
  expect(cli("init").code).toBe(0);
  const file = (role: string) => join(dir, ".claude/agents", `${role}.md`);
  expect(readFileSync(file("planner"), "utf8")).toContain("## Triage an item"); // init wrote the generated files
  expect(applyTeam(dir).lines.every((l) => l.startsWith("current") || l.startsWith("kept"))).toBe(true);

  writeFileSync(file("reviewer"), "---\nname: reviewer\n---\nMy own reviewer.\n"); // a hand-written file has no marker
  writeFileSync(file("architect"), readFileSync(file("architect"), "utf8").replace("## Write the spec", "## Write the spec (outdated)"));
  expect(cli("skill", "attach", "tdd", "--role", "architect").code).toBe(0);
  const out = cli("team", "apply").out;
  expect(out).toMatch(/kept     \.claude\/agents\/reviewer\.md \(edited by hand/);
  expect(out).toMatch(/rebuilt  \.claude\/agents\/architect\.md/);
  expect(readFileSync(file("reviewer"), "utf8")).toContain("My own reviewer.");
  expect(readFileSync(file("architect"), "utf8")).toContain("  - tdd"); // attached skills survive a rebuild
  expect(readFileSync(file("architect"), "utf8")).not.toContain("outdated");
  expect(cli("team", "apply", "--force").out).toMatch(/rebuilt  \.claude\/agents\/reviewer\.md/);
  expect(cli("team").out).toMatch(/○ Product Partner[\s\S]*● Planner {2}sonnet, medium\n {4}built: {3}P4/);
  expect(cli("team", "bogus").code).toBe(1);
}, 60_000);

test("pipeline: the planner triages ad-hoc items only; items with acceptance checks skip it", async () => {
  expect(needsTriage({})).toBe(true);
  expect(needsTriage({ detail: "Export it from config.\nAcceptance: a test asserts the value" })).toBe(false);
  expect(needsTriage({ detail: "An acceptable approach is fine." })).toBe(true); // a whole word, not a prefix

  const run = async (detail?: string) => {
    const store = openStore(":memory:");
    const stages: string[] = [], roles: string[] = [];
    const runner: Runner = async ({ stage, role }) => { stages.push(stage); roles.push(role); return { status: "ok", text: stage === "review" ? "APPROVE" : stage }; };
    const dir = tmp();
    const result = await runTask({ ...task, detail }, { config, store, runner, gate: async () => ({ ok: true, output: "" }), cwd: dir });
    return { stages, roles, events: store.list(result.run).map((e) => `${e.stage}:${e.type}`), taskFile: readFileSync(join(dir, ".factory/runs", result.run, "task.md"), "utf8") };
  };
  const adhoc = await run();
  expect(adhoc.stages).toEqual(["triage", "spec", "build", "review"]);
  expect(adhoc.roles[0]).toBe("planner");
  const planned = await run("Acceptance: the value is exported");
  expect(planned.stages).toEqual(["spec", "build", "review"]);
  expect(planned.events).toContain("triage:stage.skipped");
  expect(planned.taskFile).toBe("# F-001 First\n\nAcceptance: the value is exported\n"); // the detail reaches the agents

  const log = [{ seq: 1, ts: "2026-01-01T00:00:00.000Z", run: "r", task: "F-001", stage: "run", type: "run.start" }, { seq: 2, ts: "2026-01-01T00:00:00.000Z", run: "r", task: "F-001", stage: "triage", type: "stage.skipped", data: "carries acceptance checks" }];
  expect(summarize(log as Ev[]).tasks.get("F-001")!.stages.triage!.state).toBe("skipped"); // not shown as a failure
});

test("backlog: indented lines under an item are its detail", () => {
  const text = "# Backlog\n\n## Ready\n- [ ] F-001 (P1) First\n  detail line\n   second line\n- [ ] F-002 Second\n\n## Done\n";
  expect(parse(text).map((i) => [i.id, i.detail])).toEqual([["F-001", "detail line\nsecond line"], ["F-002", ""]]);
});
