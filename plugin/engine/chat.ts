// The conversation roles, in the GUI: the same instructions the slash commands use, run as a headless Claude session
// that is resumed on each message. It may read the project and write documents; it cannot change code or governance files.
import { join } from "node:path";
import { agentEvents, classify, hookSettings } from "./claude";
import { chatPromptFor, type Preset } from "./team";

/** The conversations the GUI offers. Each names responsibilities, like the matching command, so it works in any team grouping. */
export const TOPICS: Record<string, { title: string; summary: string; ids: string[]; first: string }> = {
  brainstorm: { title: "Brainstorm an idea", summary: "Work out what to build, for whom, and what success looks like.", ids: ["D1", "D3"], first: "I would like to brainstorm an idea." },
  research: { title: "Research similar products", summary: "Find what already exists and what can be learned from it.", ids: ["D2"], first: "Please research products similar to this project." },
  plan: { title: "Plan the work", summary: "Turn the brief into requirements, milestones and backlog items.", ids: ["R1", "R2", "R3", "R4", "P1", "P2", "P3"], first: "Please help me plan the work." },
  design: { title: "Design the solution", summary: "Choose the stack and shape the design before building.", ids: ["A1", "A2", "A4", "A3", "F3", "X1"], first: "Please help me design the solution." },
  test: { title: "Test against the stories", summary: "Check the product against what you said it should do.", ids: ["V2", "V3"], first: "Please check the product against the user stories." },
  secure: { title: "Security and performance review", summary: "Threat model, data protection and performance of the design.", ids: ["A5", "S3", "Q1"], first: "Please review the security and performance of the design." },
  audit: { title: "Security audit", summary: "The audit to run before a release.", ids: ["S4"], first: "Please run the security audit." },
  docs: { title: "Keep the documents current", summary: "Update the README, context files and documents.", ids: ["K1", "K3"], first: "Please bring the project documents up to date." },
};

const MODELS = ["fable", "opus", "sonnet", "haiku"], EFFORTS = ["low", "medium", "high", "xhigh", "max"];
// Documents only. Governance files stay out of reach (the guard hook enforces it too), and code is the builder's.
const ALLOW = ["Read", "Grep", "Glob", "WebSearch", "WebFetch", "Write(docs/**)", "Edit(docs/**)", "Write(README.md)", "Edit(README.md)", "Write(CHANGELOG.md)", "Edit(CHANGELOG.md)",
  "Bash(factory docs save:*)", "Bash(factory add:*)", "Bash(git status:*)", "Bash(git log:*)", "Bash(git diff:*)", "Bash(graphify query:*)"];

export type ChatRequest = { topic: string; message: string; session?: string; model?: string; effort?: string };

/** Checks a request from the page and returns the Claude command line for it. Throws a plain-words error when it is not valid. */
export function chatArgs(r: ChatRequest, team: Preset): string[] {
  const topic = TOPICS[r.topic];
  if (!topic) throw new Error(`topic: one of ${Object.keys(TOPICS).join(", ")}`);
  if (typeof r.message !== "string" || !r.message.trim() || r.message.length > 20_000) throw new Error("message: 1 to 20,000 characters");
  if (r.session !== undefined && !/^[\w-]{8,64}$/.test(r.session)) throw new Error("session: not a session id");
  const model = r.model ?? "sonnet", effort = r.effort ?? "medium";
  if (!MODELS.includes(model)) throw new Error(`model: one of ${MODELS.join(", ")}`);
  if (!EFFORTS.includes(effort)) throw new Error(`effort: one of ${EFFORTS.join(", ")}`);
  const system = chatPromptFor(topic.ids, team); // throws, in plain words, when a responsibility is switched off
  return [
    "claude", "-p", r.message, "--model", model, "--effort", effort,
    "--append-system-prompt", system,
    ...(r.session ? ["--resume", r.session] : []),
    "--output-format", "stream-json", "--verbose",
    "--permission-mode", "dontAsk", "--allowedTools", ...ALLOW,
    "--setting-sources", "project", "--strict-mcp-config",
    "--settings", hookSettings("chat"),
  ];
}

/** One turn of a conversation. Waits for the reply; the tool calls it made are returned so the page can show them. */
export async function chatTurn(root: string, r: ChatRequest, team: Preset) {
  const argv = chatArgs(r, team);
  const p = Bun.spawn(argv, {
    cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 10 * 60_000,
    // FACTORY_ROOT is what the guard hook confines writes to; `factory` must resolve for the save and add commands.
    env: { ...process.env, FACTORY_ROOT: root, PATH: `${join(import.meta.dir, "..", "bin")}:${process.env.PATH}` },
  });
  const stderr = new Response(p.stderr).text();
  const tools: { tool: string; input: unknown }[] = [];
  let buffer = "", result = "";
  const decoder = new TextDecoder();
  for await (const chunk of p.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === "result") result = line;
      else for (const e of agentEvents(msg)) if (e.type === "agent.tool") tools.push(e.data as { tool: string; input: unknown });
    }
  }
  const out = classify(await p.exited, result || buffer, await stderr);
  const usage = (out.usage ?? {}) as { session?: string; costUsd?: number; denials?: string[] };
  return { ok: out.status === "ok", status: out.status, text: out.text, session: usage.session, costUsd: usage.costUsd, denials: usage.denials ?? [], tools };
}
