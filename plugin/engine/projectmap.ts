// A map of the project's files, made without a model (F-125). Spec, build and review each begin by listing and searching the folder to find where things are; the same
// answer, paid for in turns three times a task. The map is written into the run folder as `project.md`, and the stages are told to read it first.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./worktree";

const SOURCE = /\.(tsx?|jsx?|mjs|cjs|py|rs|go|java|kt|swift|rb|php|cs|vue|svelte|css|scss|html|sql|sh)$/i;
const NOISE = /(^|\/)(node_modules|dist|build|vendor|\.next|coverage|graphify-out|\.factory|\.worktrees)\//;
const LOCK = /(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml)$/;
const MAX_FILES = 160, MAX_BYTES = 6000;

export function projectMap(cwd: string, gate: string[] = []): string {
  let files: string[];
  try { files = git(cwd, "ls-files").split("\n").filter((f) => f && !NOISE.test(f) && !LOCK.test(f)); } catch { return ""; }
  const source = files.filter((f) => SOURCE.test(f)), other = files.filter((f) => !SOURCE.test(f));
  const lines = (f: string) => { try { return readFileSync(join(cwd, f), "utf8").split("\n").length; } catch { return 0; } };
  const out: string[] = ["# Project map", "", "Made by the factory from the files in git, so you need not list or search the folder to find where things are. Read the files themselves for detail.", ""];
  if (gate.length) out.push(`Checks that must pass: ${gate.join(" ; ")}`, "");
  try { const scripts = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).scripts ?? {}; if (Object.keys(scripts).length) out.push(`package.json scripts: ${Object.entries(scripts).map(([k, v]) => `${k} = ${v}`).join(" · ").slice(0, 500)}`, ""); } catch { /* no package.json */ }
  const byDir = new Map<string, string[]>();
  for (const f of source) { const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "."; (byDir.get(d) ?? byDir.set(d, []).get(d)!).push(f); }
  out.push(`## Source files (${source.length})`);
  const detail = source.length <= MAX_FILES;
  for (const [d, list] of [...byDir].sort((a, b) => a[0].localeCompare(b[0]))) out.push(detail ? `${d}/: ${list.map((f) => `${f.slice(d.length + (d === "." ? 0 : 1))} (${lines(f)})`).join(", ")}` : `${d}/: ${list.length} files`);
  const docs = other.filter((f) => /\.(md|json|ya?ml|toml)$/i.test(f)).slice(0, 40);
  if (docs.length) out.push("", "## Documents and configuration", docs.join(", "));
  return out.join("\n").slice(0, MAX_BYTES);
}
