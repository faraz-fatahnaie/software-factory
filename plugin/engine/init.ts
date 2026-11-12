// Setting a project up for the factory, and checking that setup. Works on any stack.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SECTIONS } from "./backlog";
import { loadConfig, parseConfig, ROLES } from "./config";
import { roleSkills } from "./skills";

const TEMPLATES = join(import.meta.dir, "..", "templates");
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
export function init(dir: string, opts: { setup?: string[]; gate?: string[] } = {}) {
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

  const template = JSON.parse(readFileSync(join(TEMPLATES, "factory.config.json"), "utf8"));
  const config = parseConfig({ ...template, setup: opts.setup ?? guess.setup, gate: opts.gate ?? guess.gate });
  create("factory.config.json", `${JSON.stringify(config, null, 2)}\n`);
  create("BACKLOG.md", readFileSync(join(TEMPLATES, "BACKLOG.md"), "utf8"));
  for (const role of ROLES) create(`.claude/agents/${role}.md`, readFileSync(join(TEMPLATES, "agents", `${role}.md`), "utf8"));

  // The rules go into AGENTS.md, and CLAUDE.md imports it so Claude Code loads them.
  if (!read(dir, "AGENTS.md").includes(RULES_HEADING))
    append("AGENTS.md", `${read(dir, "AGENTS.md") ? "\n" : ""}${readFileSync(join(TEMPLATES, "RULES.md"), "utf8")}`, "added the factory rules");
  if (!read(dir, "CLAUDE.md").includes("@AGENTS.md")) append("CLAUDE.md", "@AGENTS.md\n", "imports AGENTS.md");
  const missing = IGNORED.filter((line) => !read(dir, ".gitignore").split("\n").includes(line));
  if (missing.length) append(".gitignore", `${missing.join("\n")}\n`, "ignores factory working folders");

  return { stack: guess.stack, config, done, paths };
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
  for (const role of ROLES) {
    const file = read(dir, `.claude/agents/${role}.md`);
    check(!!file, `role file .claude/agents/${role}.md`, "run: factory init");
    for (const skill of roleSkills(file))
      check(existsSync(join(dir, ".claude", "skills", skill, "SKILL.md")), `skill ${skill} (attached to ${role}) is installed`, `factory skill detach ${skill} --role ${role}, or install it`);
  }
  check(read(dir, "AGENTS.md").includes(RULES_HEADING), "factory rules in AGENTS.md", "run: factory init");
  check(read(dir, "CLAUDE.md").includes("@AGENTS.md"), "CLAUDE.md imports AGENTS.md", "run: factory init");
  check(IGNORED.every((l) => read(dir, ".gitignore").split("\n").includes(l)), ".gitignore covers .factory/ and .worktrees/", "run: factory init");
  // Task worktrees branch from HEAD, so setup that is not committed never reaches a run.
  const dirty = Bun.spawnSync(["git", "status", "--porcelain", "--", "factory.config.json", ".claude/agents", "AGENTS.md", "CLAUDE.md", ".gitignore"], { cwd: dir, stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();
  check(!dirty, "factory setup is committed", "commit the role files, AGENTS.md, CLAUDE.md and .gitignore", false);
  return { ok, lines };
}
