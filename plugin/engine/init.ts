// Setting a project up for the factory, and checking that setup. Works on any stack.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SECTIONS } from "./backlog";
import { loadConfig, parseConfig, projectRoles, teamOf } from "./config";
import { GRAPH_IGNORE, graphifyInstalled, updateGraph } from "./graph";
import { roleSkills } from "./skills";
import { activeRoles, DEFAULT_PRESET, GENERATED, presets, renderRole, resolveTeam } from "./team";

const GENERATED_MARK = GENERATED.slice(0, 40);

const TEMPLATES = join(import.meta.dir, "..", "templates");
/** What `factory docs save` commits: documents, never code. */
export const DOC_PATHS = ["docs", "README.md", "CHANGELOG.md", "AGENTS.md", "CLAUDE.md"];
const RULES_HEADING = "## Software Factory rules";
const IGNORED = [".factory/", ".worktrees/"];

const read = (dir: string, file: string) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : "");

/**
 * A first guess at a project's setup and gate commands from the files at its root.
 * ponytail: marker files only, top level only. It is a proposal for a person to correct,
 * not an analysis; monorepos and unusual layouts need the commands passed explicitly.
 */
export function detect(dir: string): { stack: string; setup: string[]; gate: string[] } {
  const has = (file: string) => existsSync(join(dir, file));
  if (has("package.json")) {
    let scripts: Record<string, string> = {};
    try { scripts = JSON.parse(read(dir, "package.json")).scripts ?? {}; } catch { /* unreadable: propose no gate */ }
    const pm = has("bun.lock") || has("bun.lockb") ? "bun" : has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const real = (s: string) => typeof scripts[s] === "string" && !/no test specified/.test(scripts[s]);
    return { stack: `JavaScript/TypeScript (${pm})`, setup: [`${pm} install`], gate: ["test", "typecheck", "lint"].filter(real).map((s) => `${pm} run ${s}`) };
  }
  if (has("pyproject.toml") || has("requirements.txt")) {
    const py = read(dir, "pyproject.toml");
    const run = has("uv.lock") ? "uv run " : "";
    return {
      stack: "Python",
      setup: has("uv.lock") ? ["uv sync"] : [],
      gate: [...(py.includes("ruff") ? [`${run}ruff check .`] : []), ...(py.includes("pytest") || has("tests") ? [`${run}pytest -q`] : [])],
    };
  }
  if (has("Cargo.toml")) return { stack: "Rust", setup: [], gate: ["cargo build", "cargo test"] };
  if (has("go.mod")) return { stack: "Go", setup: [], gate: ["go vet ./...", "go test ./..."] };
  if (/^test:/m.test(read(dir, "Makefile"))) return { stack: "Make", setup: [], gate: ["make test"] };
  return { stack: "unknown", setup: [], gate: [] };
}

/**
 * Writes the factory's files into a project. Never overwrites: a file that exists is left
 * alone, so running it again is safe. Returns what it did and which paths to commit.
 */
export function init(dir: string, opts: { setup?: string[]; gate?: string[]; team?: string } = {}) {
  const guess = detect(dir);
  const done: string[] = [], paths: string[] = [];
  const create = (file: string, content: string) => {
    if (existsSync(join(dir, file))) return done.push(`kept     ${file}`);
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), content);
    paths.push(file);
    done.push(`created  ${file}`);
  };
  const append = (file: string, text: string, why: string) => {
    appendFileSync(join(dir, file), `${read(dir, file) && !read(dir, file).endsWith("\n") ? "\n" : ""}${text}`);
    paths.push(file);
    done.push(`updated  ${file} (${why})`);
  };

  const preset = opts.team ?? DEFAULT_PRESET;
  if (!presets[preset]) throw new Error(`there is no team preset "${preset}" (there are: ${Object.keys(presets).join(", ")})`);
  const team = resolveTeam({ preset });
  const roles = Object.fromEntries(activeRoles(team).map((name) => [name, { runner: "claude", ...team.roles[name]!.defaults! }]));
  const config = parseConfig({ setup: opts.setup ?? guess.setup, gate: opts.gate ?? guess.gate, graph: true, team: { preset }, roles });
  create("factory.config.json", `${JSON.stringify(config, null, 2)}\n`);
  create("BACKLOG.md", readFileSync(join(TEMPLATES, "BACKLOG.md"), "utf8"));
  create("docs/README.md", readFileSync(join(TEMPLATES, "DOCS.md"), "utf8"));
  for (const role of activeRoles(team)) create(`.claude/agents/${role}.md`, renderRole(role, team));

  // The rules go into AGENTS.md, and CLAUDE.md imports it so Claude Code loads them.
  if (!read(dir, "AGENTS.md").includes(RULES_HEADING))
    append("AGENTS.md", `${read(dir, "AGENTS.md") ? "\n" : ""}${readFileSync(join(TEMPLATES, "RULES.md"), "utf8")}`, "added the factory rules");
  if (!read(dir, "CLAUDE.md").includes("@AGENTS.md")) append("CLAUDE.md", "@AGENTS.md\n", "imports AGENTS.md");
  const missing = IGNORED.filter((line) => !read(dir, ".gitignore").split("\n").includes(line));
  if (missing.length) append(".gitignore", `${missing.join("\n")}\n`, "ignores factory working folders");

  // The knowledge graph: on by default, optional. It needs graphify and some code to read.
  let graph: string;
  if (!graphifyInstalled()) graph = "not built: graphify is not installed. Agents work without it, but it saves them tokens (install: uv tool install graphifyy)";
  else {
    const missing = GRAPH_IGNORE.filter((line) => !read(dir, ".gitignore").split("\n").includes(line));
    if (missing.length) { appendFileSync(join(dir, ".gitignore"), `${missing.join("\n")}\n`); if (!paths.includes(".gitignore")) paths.push(".gitignore"); }
    const g = updateGraph(dir);
    if (g.ok) paths.push("graphify-out");
    graph = g.ok ? `built (${g.message})` : `not built yet (${g.message}); it is built after the first task lands`;
  }

  return { stack: guess.stack, config, done, paths, graph };
}

/** Checks the machine and the project. Each line is one check; `ok` is false if any required one failed. */
export function doctor(dir: string) {
  const lines: string[] = [];
  let ok = true;
  const check = (pass: boolean, label: string, fix = "", required = true) => {
    lines.push(`${pass ? "✓" : required ? "✗" : "–"} ${label}${pass || !fix ? "" : `  →  ${fix}`}`);
    if (!pass && required) ok = false;
  };
  const runs = (...argv: string[]) => {
    try { return Bun.spawnSync(argv, { cwd: dir, stdout: "pipe", stderr: "pipe" }).exitCode === 0; } catch { return false; }
  };

  check(runs("git", "rev-parse", "--is-inside-work-tree"), "git repository", "run: git init");
  check(runs("claude", "--version"), "Claude Code on PATH", "install Claude Code and log in");
  check(runs("gh", "--version"), "GitHub CLI (only needed for pull requests)", "install gh to let approve open pull requests", false);

  let config: ReturnType<typeof loadConfig> | undefined, problem = "";
  try { config = loadConfig(dir); } catch (e) { problem = existsSync(join(dir, "factory.config.json")) ? (e as Error).message : "missing"; }
  check(!!config, `factory.config.json${problem && problem !== "missing" ? `: ${problem}` : ""}`, "run: factory init");
  if (config) check(config.gate.length > 0, "gate commands configured", "add test or lint commands to \"gate\" in factory.config.json; without them only the reviewer checks a build", false);

  const backlog = read(dir, "BACKLOG.md");
  check(SECTIONS.every((s) => backlog.split("\n").includes(`## ${s}`)), "BACKLOG.md with all six sections", "run: factory init");
  for (const role of projectRoles(dir)) {
    const file = read(dir, `.claude/agents/${role}.md`);
    check(!!file, `role file .claude/agents/${role}.md`, "run: factory team apply");
    for (const skill of roleSkills(file))
      check(existsSync(join(dir, ".claude", "skills", skill, "SKILL.md")), `skill ${skill} (attached to ${role}) is installed`, `factory skill detach ${skill} --role ${role}, or install it`);
  }
  if (config?.graph !== false) check(graphifyInstalled(), "graphify (the knowledge graph that saves tokens)", "install it: uv tool install graphifyy; or set \"graph\": false in factory.config.json", false);
  check(read(dir, "AGENTS.md").includes(RULES_HEADING), "factory rules in AGENTS.md", "run: factory init");
  check(read(dir, "CLAUDE.md").includes("@AGENTS.md"), "CLAUDE.md imports AGENTS.md", "run: factory init");
  check(IGNORED.every((l) => read(dir, ".gitignore").split("\n").includes(l)), ".gitignore covers .factory/ and .worktrees/", "run: factory init");
  // Task worktrees branch from HEAD, so setup that is not committed never reaches a run.
  const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--", "factory.config.json", ".claude/agents", "AGENTS.md", "CLAUDE.md", ".gitignore", "docs"], { cwd: dir, stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
  check(!dirty, "factory setup and documents are committed", "commit the role files, AGENTS.md, CLAUDE.md, .gitignore and docs/ (factory docs save commits the documents)", false);
  return { ok, lines };
}

/**
 * Rebuilds the role files from the catalog. A file that carries the generated marker is rebuilt
 * (keeping its attached skills); a file without it was edited by hand and is left alone unless
 * `force` is set. Returns one line per file and the paths that changed.
 */
export function applyTeam(dir: string, force = false) {
  const lines: string[] = [], paths: string[] = [];
  const team = teamOf(JSON.parse(read(dir, "factory.config.json") || "{}"));
  const wanted = activeRoles(team);
  for (const role of wanted) {
    const file = `.claude/agents/${role}.md`, path = join(dir, file);
    const current = read(dir, file);
    if (current && !current.includes(GENERATED_MARK) && !force) { lines.push(`kept     ${file} (edited by hand; --force rebuilds it)`); continue; }
    const next = renderRole(role, team, roleSkills(current));
    if (next === current) { lines.push(`current  ${file}`); continue; }
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, next);
    paths.push(file);
    lines.push(`${current ? "rebuilt " : "created "} ${file}`);
  }
  // Role files the team no longer has. Listed, never deleted: a person decides.
  const dirAgents = join(dir, ".claude", "agents");
  for (const f of existsSync(dirAgents) ? readdirSync(dirAgents).sort() : []) {
    const role = f.replace(/\.md$/, "");
    if (f.endsWith(".md") && !wanted.includes(role) && read(dir, `.claude/agents/${f}`).includes(GENERATED_MARK))
      lines.push(`unused   .claude/agents/${f} (not part of this team; remove it with: git rm .claude/agents/${f})`);
  }
  return { lines, paths };
}

const DOCS: [string, string][] = [["brief", "docs/product/brief.md"], ["research", "docs/product/research.md"], ["requirements", "docs/product/requirements.md"], ["architecture", "docs/architecture/overview.md"], ["roadmap", "docs/plan/roadmap.md"], ["deployment", "docs/runbooks/deployment-plan.md"]];

/** The product documents and whether each is missing, a draft, or approved by the user. */
export function projectDocs(dir: string) {
  return DOCS.map(([name, file]) => {
    const text = read(dir, file);
    return { name, file, state: !text ? "–" : /^Status: approved/m.test(text) ? "approved" : "draft" };
  });
}

/** The one command the user should run next, from what exists. */
export function nextStep(docs: ReturnType<typeof projectDocs>, items: { section: string }[]): string {
  const has = (name: string) => docs.find((d) => d.name === name)!.state === "approved";
  const count = (s: string) => items.filter((i) => i.section === s).length;
  if (count("Awaiting approval")) return "review what is waiting for you, then /software-factory:approve <F-id> or /software-factory:discard <F-id>";
  if (count("Blocked")) return "look at the blocked task in /software-factory:open and retry or discard it";
  if (count("Ready") || count("In progress")) return count("In progress") ? "wait for the running tasks, or /software-factory:open to watch them" : "/software-factory:run";
  if (count("Inbox") && has("roadmap")) return "promote the tasks you want built (factory promote <F-id>...), then /software-factory:run";
  if (!has("brief")) return "/software-factory:brainstorm <your idea>";
  if (!has("requirements")) return "/software-factory:plan";
  if (!has("architecture")) return "/software-factory:design";
  if (!has("roadmap")) return "/software-factory:plan";
  // Everything planned is built: time to prepare to ship, or to ship when the user chooses.
  if (count("Done") && !has("deployment")) return "/software-factory:release";
  if (count("Done")) return "/software-factory:release for a new version, /software-factory:deploy when you want it live, or /software-factory:add for more work";
  return "/software-factory:add <what to build next>";
}

/** Replaces the setup and gate commands in factory.config.json. The whole file is validated before it is written. */
export function configure(dir: string, opts: { setup?: string[]; gate?: string[] }) {
  const file = join(dir, "factory.config.json");
  const current = loadConfig(dir);
  const next = parseConfig({ ...current, ...(opts.setup && { setup: opts.setup }), ...(opts.gate && { gate: opts.gate }) });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
