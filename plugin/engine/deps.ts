// New dependencies (F-126): a package is code from a stranger that runs on the person's machine, so an agent never installs one on its own.
// The workflow: the spec names each new package (exact version, reason) in a `## Dependencies` section; that is a risk, so the task waits for the person's
// Build it; then THIS code (not a model) installs exactly what was named, with install scripts off; and a build that adds any other package is sent back.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./worktree";

export type Dep = { name: string; version: string; workspace?: string; dev: boolean; line: string };

const NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** The section's bullets, as written. Anything under a `## Dependencies` heading up to the next heading; `none` or nothing means no dependency. */
function sectionLines(spec: string): string[] {
  const m = /^#{1,4}\s*(?:new\s+)?dependenc(?:y|ies)\b[^\n]*\n([\s\S]*?)(?=^#{1,4}\s|$(?![\s\S]))/im.exec(spec);
  return (m?.[1] ?? "").split("\n").map((l) => l.trim()).filter((l) => /^[-*]\s/.test(l) && !/^[-*]\s*[`*_]*none\b/i.test(l));
}

/** What the spec asks to install: `- npm: left-pad@1.3.0 [in <workspace>] [(dev)] - reason`. A line that does not match is returned in `unsupported`, never installed. */
export function depsOf(spec: string): { deps: Dep[]; unsupported: string[] } {
  const deps: Dep[] = [], unsupported: string[] = [];
  for (const line of sectionLines(spec)) {
    const m = /^[-*]\s*[`*_]*npm[`*_]*\s*:\s*[`*_]*((?:@[^/\s@]+\/)?[^@\s`*_]+)@([^\s`*_,;]+)[`*_]*(?:\s+in\s+[`*_]*([@\w./-]+?)[`*_]*(?=[\s,;(—-]|$))?/i.exec(line);
    if (m && NAME.test(m[1]!) && VERSION.test(m[2]!)) deps.push({ name: m[1]!, version: m[2]!, ...(m[3] && NAME.test(m[3]) && { workspace: m[3] }), dev: /\(\s*dev\b|\bdev(?:elopment)? dependency/i.test(line), line });
    else unsupported.push(line);
  }
  return { deps, unsupported };
}

/** Whether a package.json in the project already names this exact package and version. */
function declared(cwd: string, d: Dep): boolean {
  let files: string[] = [];
  try { files = git(cwd, "ls-files", "--", "package.json", "**/package.json").split("\n").filter(Boolean); } catch { return false; }
  return files.some((f) => { try { const j = JSON.parse(readFileSync(join(cwd, f), "utf8")); return ["dependencies", "devDependencies", "optionalDependencies"].some((k) => j[k]?.[d.name] === d.version); } catch { return false; } });
}

/** Installs what the spec named, exactly, with install scripts off, in the task's own folder. Throws, in plain words, when one cannot be installed. */
export function installDeps(cwd: string, deps: Dep[], run = (argv: string[]) => { const p = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe", timeout: 180_000 }); return { code: p.exitCode, out: `${p.stdout}${p.stderr}`.trim() }; }): string[] {
  const done: string[] = [];
  for (const d of deps) {
    if (declared(cwd, d)) continue;
    const bun = existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"));
    const spec = `${d.name}@${d.version}`;
    const argv = bun ? ["bun", "add", "--exact", "--ignore-scripts", ...(d.dev ? ["--dev"] : []), spec]
      : ["npm", "install", "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund", ...(d.dev ? ["--save-dev"] : []), ...(d.workspace ? ["-w", d.workspace] : []), spec];
    const r = run(argv);
    if (r.code !== 0) throw new Error(`blocked: the dependency ${spec} could not be installed (${r.out.split("\n").at(-1)?.slice(0, 160) ?? "no output"}). Check the name and version, or install it yourself and run the task again`);
    done.push(spec);
  }
  return done;
}

/** The dependency names a package.json declares. */
const namesIn = (json: string): Set<string> => {
  const out = new Set<string>();
  try { const j = JSON.parse(json); for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) for (const n of Object.keys(j[k] ?? {})) out.add(n); } catch { /* not JSON: nothing declared */ }
  return out;
};

/** Packages the build added to any package.json that the spec did not name. */
export function undeclaredDeps(cwd: string, approved: string[]): string[] {
  let changed: string[] = [];
  try { changed = git(cwd, "diff", "HEAD", "--name-only").split("\n").filter((f) => /(^|\/)package\.json$/.test(f)); } catch { return []; }
  const extra: string[] = [];
  for (const f of changed) {
    let before = "{}";
    try { before = git(cwd, "show", `HEAD:${f}`); } catch { /* a new package.json: everything in it is new */ }
    let now = "{}";
    try { now = readFileSync(join(cwd, f), "utf8"); } catch { continue; }
    const old = namesIn(before);
    for (const n of namesIn(now)) if (!old.has(n) && !approved.includes(n) && !extra.includes(n)) extra.push(n);
  }
  return extra;
}

export const depsFeedback = (names: string[]) => `The build added ${names.join(", ")} to package.json, which the spec did not name. A new dependency is the person's decision, made before the build from the spec's "## Dependencies" section; you may not install one. Remove ${names.length === 1 ? "it" : "them"} (and anything in the lockfile that only they brought in) and do the work with what the project already has. If the task truly cannot be done without ${names.length === 1 ? "it" : "them"}, begin your reply with \`BLOCKED: needs the dependency ${names[0]}\` and change nothing.`;
