import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Job, Runner, RunnerResult } from "./pipeline";
import { roleSkills } from "./skills";

const TIMEOUT_MS = 30 * 60_000;

// Read-only commands any role may run without a prompt. Whether a role has Bash or web
// tools at all is decided by `tools` in its agent file; this list cannot widen that.
const ALLOW = ["Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(graphify query:*)", "WebSearch", "WebFetch"];

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
    // ponytail: one JSON result per stage. Switch to stream-json when the GUI needs live tool calls (Phase 4).
    "--output-format", "json",
    // Only the builder may change files. dontAsk still permits read-only shell commands
    // inside the project and the allow list below, and denies everything else.
    "--permission-mode", job.role === "builder" ? "acceptEdits" : "dontAsk",
    "--allowedTools", ...ALLOW, ...gate.map((cmd) => `Bash(${cmd}:*)`), ...skills.map((s) => `Skill(${s})`),
    // Project settings only. User-level plugins and hooks inject text into agent output
    // (which breaks the reviewer's first-line verdict) and cost about six times the startup tokens.
    "--setting-sources", "project",
    "--strict-mcp-config",
  ];
}

/** Maps a finished `claude -p --output-format json` process to a runner result. */
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
  const p = Bun.spawn(claudeArgs(job, gate, skills), {
    cwd: job.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: TIMEOUT_MS,
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return classify(code, out, err);
};
