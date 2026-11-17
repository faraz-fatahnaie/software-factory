import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { track, type Job, type Runner, type RunnerResult } from "./pipeline";
import { DENY_FLOOR } from "./authority";
import { roleSkills } from "./skills";

const TIMEOUT_MS = 30 * 60_000;

// Read-only commands any role may run without a prompt. Whether a role has Bash or web
// tools at all is decided by `tools` in its agent file; this list cannot widen that.
export const ALLOW = ["Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git describe:*)", "Bash(git rev-parse:*)", "Bash(git ls-files:*)", "Bash(git grep:*)", "Bash(git blame:*)", "Bash(git shortlog:*)", "Bash(graphify query:*)", "WebSearch", "WebFetch"];

export function claudeArgs(job: Job, gate: string[], skills: string[] = []): string[] {
  // `skills:` in an agent file is not preloaded when the agent runs as the main session
  // (verified on Claude Code 2.1.322), so name them and let the agent load what it needs.
  const prompt = skills.length
    ? `${job.prompt}\n\nSkills attached to your role: ${skills.join(", ")}. Load the ones relevant to this stage with the Skill tool before you start.`
    : job.prompt;
  return [
    "claude", "-p", prompt,
    "--agent", job.role,
    "--model", job.model,
    "--effort", job.effort,
    // One JSON line per message, so tool calls reach the event log while the stage runs.
    "--output-format", "stream-json", "--verbose",
    // Only the build stage may change files. dontAsk still permits read-only shell commands
    // inside the project and the allow list below, and denies everything else.
    "--permission-mode", job.stage === "build" ? "acceptEdits" : "dontAsk",
    "--allowedTools", ...ALLOW, ...gate.map((cmd) => `Bash(${cmd}:*)`), ...skills.map((s) => `Skill(${s})`),
    // Whatever a settings file allows, these are denied (see authority.ts): a deny beats an allow.
    "--disallowedTools", ...DENY_FLOOR,
    // Project settings only. User-level plugins and hooks inject text into agent output
    // (which breaks the reviewer's first-line verdict) and cost about six times the startup tokens.
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--settings", hookSettings(job.stage),
  ];
}

/** Hooks for factory runs only, passed on the command line so your own sessions are unaffected. */
export function hookSettings(stage: string): string {
  const quoted = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
  const hook = (mode: string) => ({
    type: "command",
    command: `${quoted(process.execPath)} ${quoted(join(import.meta.dir, "hooks.ts"))} ${mode}`,
    timeout: 600,
  });
  return JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "Bash|Edit|Write|NotebookEdit", hooks: [hook("guard")] }],
      // The builder cannot finish while the gate fails.
      ...(stage === "build" && { Stop: [{ hooks: [hook("stop")] }] }),
    },
  });
}

/** Turns one stream-json line into the provider-neutral events the GUI shows. */
export function agentEvents(msg: any): { type: string; data: unknown }[] {
  if (msg?.type === "rate_limit_event") return [{ type: "agent.rate_limit", data: msg.rate_limit_info }];
  if (msg?.type !== "assistant") return [];
  return (msg.message?.content ?? []).flatMap((block: any) => {
    if (block.type === "text" && block.text) return [{ type: "agent.message", data: { text: block.text } }];
    if (block.type !== "tool_use") return [];
    const input = JSON.stringify(block.input ?? {});
    // A Write call carries the whole file: keep the log readable.
    return [{ type: "agent.tool", data: { tool: block.name, input: input.length > 2000 ? `${input.slice(0, 2000)}…` : block.input } }];
  });
}

/** Maps a finished run's final `result` line (plus exit code and stderr) to a runner result. */
export function classify(exitCode: number, stdout: string, stderr: string): RunnerResult {
  let r: any;
  try { r = JSON.parse(stdout); } catch { /* not JSON: a crash or CLI usage error */ }
  const usage = r?.type === "result"
    ? {
        costUsd: r.total_cost_usd,
        inputTokens: r.usage?.input_tokens,
        cacheWriteTokens: r.usage?.cache_creation_input_tokens,
        cacheReadTokens: r.usage?.cache_read_input_tokens,
        outputTokens: r.usage?.output_tokens,
        durationMs: r.duration_ms,
        turns: r.num_turns,
        session: r.session_id,
        // Commands the permission system refused: the first place to look when a role says it could not verify.
        denials: (r.permission_denials ?? []).map((d: any) =>
          [d.tool_name, d.tool_input?.command ?? d.tool_input?.skill].filter(Boolean).join(" ")),
      }
    : undefined;
  if (exitCode === 0 && r?.type === "result" && !r.is_error && r.subtype === "success")
    return { status: "ok", text: String(r.result ?? ""), usage };

  const text = String(r?.result ?? "") || stderr.trim().slice(-2000) || `claude exited with code ${exitCode}`;
  const api = r?.api_error_status;
  // Trust the HTTP status when there is one. Pattern-match the text only when it is an
  // error message (is_error, or no JSON at all): model output that mentions "rate limit"
  // must never be read as one.
  const msg = api == null && (!r || r.is_error) ? text : "";
  const status =
    api === 429 || api === 529 || /rate.?limit|usage limit|overloaded/i.test(msg) ? "rate_limited"
    : api === 401 || api === 403 || /not logged in|authenticat|invalid api key/i.test(msg) ? "auth"
    : "error";
  return { status, text, usage };
}

/** Runs one stage as a headless Claude Code session using the role's agent file. */
export const claudeRunner = (gate: string[]): Runner => async (job) => {
  const agent = join(job.cwd, ".claude", "agents", `${job.role}.md`);
  const skills = existsSync(agent) ? roleSkills(readFileSync(agent, "utf8")) : [];
  const p = track(Bun.spawn(claudeArgs(job, gate, skills), {
    cwd: job.cwd,
    // Read by hooks.ts: the task root to confine writes to, and the orchestrator's own copy of the gate.
    env: { ...process.env, FACTORY_ROOT: job.cwd, FACTORY_GATE: JSON.stringify(gate) },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: TIMEOUT_MS,
  }));
  const stderr = new Response(p.stderr).text();
  const decoder = new TextDecoder();
  let buffer = "", result = "";
  for await (const chunk of p.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === "result") result = line;
      else for (const e of agentEvents(msg)) job.emit?.(e.type, e.data);
    }
  }
  return classify(await p.exited, result || buffer, await stderr);
};
