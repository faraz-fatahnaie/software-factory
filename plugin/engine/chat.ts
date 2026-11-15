// The conversation roles, in the GUI: the same instructions the slash commands use, run as a headless Claude session
// that is resumed on each message. It may read the project and write documents; it cannot change code or governance files.
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { ATTACH_EXT, ATTACH_MAX_BYTES, ATTACH_MAX_FILES, toolDetail, type ToolStep } from "./state";
import { classify, hookSettings } from "./claude";
import { chatPromptFor, type Preset } from "./team";

/** The conversations the GUI offers. Each names responsibilities, like the matching command, so it works in any team grouping. */
export const TOPICS: Record<string, { title: string; summary: string; ids: string[]; first: string; guide?: boolean }> = {
  brainstorm: { title: "Brainstorm an idea", summary: "Work out what to build, for whom, and what success looks like.", ids: ["D1", "D3"], first: "I would like to brainstorm an idea." },
  research: { title: "Research similar products", summary: "Find what already exists and what can be learned from it.", ids: ["D2"], first: "Please research products similar to this project." },
  plan: { title: "Plan the work", summary: "Turn the brief into requirements, milestones and backlog items.", ids: ["R1", "R2", "R3", "R4", "P1", "P2", "P3"], first: "Please help me plan the work." },
  design: { title: "Design the solution", summary: "Choose the stack and shape the design before building.", ids: ["A1", "A2", "A4", "A3", "F3", "X1"], first: "Please help me design the solution." },
  test: { title: "Test against the stories", summary: "Check the product against what you said it should do.", ids: ["V2", "V3"], first: "Please check the product against the user stories." },
  secure: { title: "Security and performance review", summary: "Threat model, data protection and performance of the design.", ids: ["A5", "S3", "Q1"], first: "Please review the security and performance of the design." },
  audit: { title: "Security audit", summary: "The audit to run before a release.", ids: ["S4"], first: "Please run the security audit." },
  git: { title: "Pull requests and GitHub", summary: "See what is waiting to go to GitHub, and approve a push or a merge.", ids: ["G2"], first: "What is waiting to go to GitHub?" },
  docs: { title: "Keep the documents current", summary: "Update the README, context files and documents.", ids: ["K1", "K3"], first: "Please bring the project documents up to date." },
  guide: { title: "Ask about the factory", summary: "Ask what is happening, why something failed, or how to change a setting. I only answer; I never change anything.", ids: [], first: "What is going on in this project right now?", guide: true },
};

const MODELS = ["fable", "opus", "sonnet", "haiku"], EFFORTS = ["low", "medium", "high", "xhigh", "max"];
// Documents only. Governance files stay out of reach (the guard hook enforces it too), and code is the builder's.
const ALLOW = ["Read", "Grep", "Glob", "WebSearch", "WebFetch", "Write(docs/**)", "Edit(docs/**)", "Write(README.md)", "Edit(README.md)", "Write(CHANGELOG.md)", "Edit(CHANGELOG.md)",
  "Bash(factory docs save:*)", "Bash(factory add:*)", "Bash(factory vcs)", // read-only: pushing and merging are buttons the person presses, never commands this session may run
  "Bash(git status:*)", "Bash(git log:*)", "Bash(git diff:*)", "Bash(graphify query:*)"];

// The Guide only answers questions: it can look at the project and run the read-only commands, and nothing else.
const GUIDE_ALLOW = ["Read", "Grep", "Glob", "Bash(factory doctor:*)", "Bash(factory status:*)", "Bash(factory vcs)", "Bash(git status:*)", "Bash(git log:*)", "Bash(git diff:*)"];
const guidePrompt = (productDir: string) => `You are Bix, the Guide of this project's software factory: a read-only helper who explains what the tool is doing and how to control it. You change nothing: you have no way to edit files, and you must not ask to be allowed to.

What you can look at: factory.config.json (models per role, the gate, the team, GitHub and chat settings), BACKLOG.md, AGENTS.md and the role files in .claude/agents/, the run folders under .factory/runs/, the product's own files in ${productDir} (its README, catalog.json and presets.json), and git history. You may run \`factory doctor\`, \`factory status\` and \`factory vcs\`. Look before you answer; do not guess.

How to answer: in plain words, for someone who is not a software engineer. Short. When something failed, say what failed, why in one sentence, and how to fix it. When asked how to change something, name the exact screen (Studio, Team, Agents, Backlog, Checks) or the exact command (\`factory ...\`) and say what would happen. If a file holds a secret value, never repeat it.

Where things are changed in the page: the model, effort and fallback of each role in Agents (Models per role); the rules, role prompts and skills in Studio; who is on the team and what each person takes care of in Team; tasks in Backlog; what a conversation costs in Talk. The commands that run the project (setup and the gate) are set with \`factory configure\` or in factory.config.json.

Always true: nothing is deployed unless the person asks for it; the Builder is the only role that changes code; every stage runs in its own git worktree; approving a task merges it into main here, and with GitHub connected it stays on its branch until the person pushes; pushes and merges are buttons the person presses.`;

export type Attachment = { name: string; data: string }; // data: base64

export type ChatRequest = { topic: string; message: string; session?: string; model?: string; effort?: string; suggest?: boolean; attachments?: Attachment[] };

/** Rejects an attachment list in plain words, before anything is saved. */
export function checkAttachments(list: unknown): asserts list is Attachment[] | undefined {
  if (list === undefined) return;
  if (!Array.isArray(list) || list.length > ATTACH_MAX_FILES) throw new Error(`attachments: at most ${ATTACH_MAX_FILES} files`);
  for (const a of list) {
    if (typeof a?.name !== "string" || typeof a?.data !== "string") throw new Error("attachments: each needs a name and its content");
    const ext = extname(a.name).slice(1).toLowerCase();
    if (!ATTACH_EXT.includes(ext)) throw new Error(`attachments: ${a.name} is not a type that can be shown here (pictures, PDF, notebooks, text and code)`);
    if (a.data.length * 0.75 > ATTACH_MAX_BYTES) throw new Error(`attachments: ${a.name} is over 20 MB`);
  }
}

/** Saves the files inside the project (the model reads them with Read) and returns their paths, relative to it. */
export function saveAttachments(root: string, list: Attachment[] = []): string[] {
  if (!list.length) return [];
  const dir = join(".factory", "chat", crypto.randomUUID().slice(0, 8));
  mkdirSync(join(root, dir), { recursive: true });
  return list.map((a, i) => {
    const name = basename(a.name).replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || `file${i}`;
    writeFileSync(join(root, dir, name), Buffer.from(a.data, "base64"));
    return join(dir, name);
  });
}

/** Appended to the conversation's instructions when its person has suggestions on. The page turns the lines into buttons; they only ever send a message. */
export const SUGGEST_RULE = "End every reply with up to three lines, each starting exactly `SUGGEST: ` and then a short message (under 80 characters) the person could most plausibly send next, in their voice and without quotes. They are the best ways to continue. Put nothing after them.";

/** Checks a request from the page and returns the Claude command line for it. Throws a plain-words error when it is not valid. */
export function chatArgs(r: ChatRequest, team: Preset): string[] {
  const topic = TOPICS[r.topic];
  if (!topic) throw new Error(`topic: one of ${Object.keys(TOPICS).join(", ")}`);
  checkAttachments(r.attachments);
  if (typeof r.message !== "string" || (!r.message.trim() && !r.attachments?.length) || r.message.length > 20_000) throw new Error("message: 1 to 20,000 characters");
  if (r.session !== undefined && !/^[\w-]{8,64}$/.test(r.session)) throw new Error("session: not a session id");
  const model = r.model ?? "sonnet", effort = r.effort ?? "medium";
  if (!MODELS.includes(model)) throw new Error(`model: one of ${MODELS.join(", ")}`);
  if (!EFFORTS.includes(effort)) throw new Error(`effort: one of ${EFFORTS.join(", ")}`);
  if (r.suggest !== undefined && typeof r.suggest !== "boolean") throw new Error("suggest: true or false");
  const productDir = join(import.meta.dir, "..");
  const system = `${topic.guide ? guidePrompt(productDir) : chatPromptFor(topic.ids, team)}${r.suggest ? `\n\n${SUGGEST_RULE}` : ""}`; // throws, in plain words, when a responsibility is switched off
  return [
    "claude", "-p", r.message, "--model", model, "--effort", effort,
    "--append-system-prompt", system,
    ...(r.session ? ["--resume", r.session] : []),
    "--output-format", "stream-json", "--verbose",
    "--permission-mode", "dontAsk", ...(topic.guide ? ["--add-dir", productDir] : []), "--allowedTools", ...(topic.guide ? GUIDE_ALLOW : ALLOW),
    "--setting-sources", "project", "--strict-mcp-config",
    "--settings", hookSettings("chat"),
  ];
}

/** One turn of a conversation. Waits for the reply; the tool calls it made are returned so the page can show them. */
export async function chatTurn(root: string, r: ChatRequest, team: Preset) {
  chatArgs(r, team); // validates, before any file is saved
  const files = saveAttachments(root, r.attachments);
  const message = files.length ? `${r.message.trim() || "Please look at the attached file(s)."}\n\nAttached files (open each with the Read tool):\n${files.map((f) => `- ${f}`).join("\n")}` : r.message;
  const argv = chatArgs({ ...r, message, attachments: undefined }, team);
  const p = Bun.spawn(argv, {
    cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 10 * 60_000,
    // FACTORY_ROOT is what the guard hook confines writes to; `factory` must resolve for the save and add commands.
    env: { ...process.env, FACTORY_ROOT: root, PATH: `${join(import.meta.dir, "..", "bin")}:${process.env.PATH}` },
  });
  const stderr = new Response(p.stderr).text();
  const tools: ToolStep[] = [], byId = new Map<string, ToolStep>();
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
      else for (const b of msg.message?.content ?? []) {
        if (msg.type === "assistant" && b.type === "tool_use") { const s: ToolStep = { tool: String(b.name), detail: toolDetail(b.input).slice(0, 4000) }; tools.push(s); byId.set(b.id, s); }
        // What came back, matched to the call by id; long output is cut, the page says so.
        else if (msg.type === "user" && b.type === "tool_result" && byId.has(b.tool_use_id)) {
          const s = byId.get(b.tool_use_id)!, text = typeof b.content === "string" ? b.content : (b.content ?? []).map((c: any) => c.text ?? "").join("\n");
          s.output = text.length > 6000 ? `${text.slice(0, 6000)}\n… (cut)` : text;
          if (b.is_error) s.error = true;
        }
      }
    }
  }
  const out = classify(await p.exited, result || buffer, await stderr);
  const usage = (out.usage ?? {}) as { session?: string; costUsd?: number; denials?: string[] };
  return { ok: out.status === "ok", status: out.status, text: out.text, session: usage.session, costUsd: usage.costUsd, denials: usage.denials ?? [], tools };
}
