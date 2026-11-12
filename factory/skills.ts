import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROLES, type Role } from "./config";

const PKG = /^[\w.-]+\/[\w.-]+@[\w.:-]+$/;

/** Adds a skill to an agent file's frontmatter `skills:` list. Idempotent. */
export function attachSkill(md: string, skill: string): string {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error("agent file has no frontmatter");
  const fm = m[1]!.split("\n");
  if (fm.includes(`  - ${skill}`)) return md;
  let i = fm.indexOf("skills:");
  if (i < 0) i = fm.push("skills:") - 1;
  let j = i + 1;
  while (j < fm.length && fm[j]!.startsWith("  - ")) j++;
  fm.splice(j, 0, `  - ${skill}`);
  return `---\n${fm.join("\n")}\n---\n${md.slice(m[0].length)}`;
}

/** Installs a skills.sh package at project level and attaches it to one role. */
export function addSkill(cwd: string, pkg: string, role: string) {
  if (!PKG.test(pkg)) throw new Error(`skill must look like owner/repo@skill, got "${pkg}"`);
  if (!ROLES.includes(role as Role)) throw new Error(`--role must be one of ${ROLES.join(", ")}`);
  // argv array, no shell: the package string is never interpreted.
  const p = Bun.spawnSync(["npx", "-y", "skills", "add", pkg, "-a", "claude-code", "-y"], {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (p.exitCode !== 0) throw new Error(`skills add failed for ${pkg}`);
  const file = join(cwd, ".claude", "agents", `${role}.md`);
  writeFileSync(file, attachSkill(readFileSync(file, "utf8"), pkg.split("@")[1]!));
}
