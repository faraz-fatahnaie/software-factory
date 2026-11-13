import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoles } from "./config";

// Pinned: `npx -y` would otherwise run whatever version was published most recently.
export const SKILLS_CLI = "skills@1.8.1";
// Starts with a letter or digit, so a package name can never be read as a command-line option.
const PKG = /^[A-Za-z0-9][\w.-]*\/[\w.-]+@[\w.:-]+$/;

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

/** Skills attached to a role: the `  - name` items in its agent file's frontmatter. */
export const roleSkills = (md: string): string[] =>
  [...(md.match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? "").matchAll(/^  - (.+)$/gm)].map((m) => m[1]!);

/** Removes a skill from an agent file's `skills:` list, and the list itself when it empties. */
export function detachSkill(md: string, skill: string): string {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error("agent file has no frontmatter");
  const fm = m[1]!.split("\n").filter((line) => line !== `  - ${skill}`);
  const i = fm.indexOf("skills:");
  if (i >= 0 && !fm[i + 1]?.startsWith("  - ")) fm.splice(i, 1);
  return `---\n${fm.join("\n")}\n---\n${md.slice(m[0].length)}`;
}

/** Parses `npx skills find` output into packages with their install counts and skills.sh pages. */
export function parseFind(stdout: string): { pkg: string; installs: string; url: string }[] {
  const lines = stdout.replace(/\x1b\[[0-9;]*m/g, "").split("\n");
  return lines.flatMap((line, i) => {
    const m = line.match(/^(\S+\/\S+@.+?)\s+([\d.]+[KM]?) installs$/);
    return m ? [{ pkg: m[1]!, installs: m[2]!, url: lines[i + 1]?.match(/https:\/\/skills\.sh\/\S+/)?.[0] ?? "" }] : [];
  });
}

/** Installs a skills.sh package at project level and attaches it to one role. */
export function addSkill(cwd: string, pkg: string, role: string) {
  if (!PKG.test(pkg)) throw new Error(`skill must look like owner/repo@skill, got "${pkg}"`);
  if (!projectRoles(cwd).includes(role)) throw new Error(`--role must be one of ${projectRoles(cwd).join(", ")}`);
  // argv array, no shell: the package string is never interpreted.
  const p = Bun.spawnSync(["npx", "-y", SKILLS_CLI, "add", pkg, "-a", "claude-code", "-y"], {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (p.exitCode !== 0) throw new Error(`skills add failed for ${pkg}`);
  const file = join(cwd, ".claude", "agents", `${role}.md`);
  writeFileSync(file, attachSkill(readFileSync(file, "utf8"), pkg.split("@")[1]!));
}

/** Attaches or detaches a skill that is already installed in this project. */
export function setSkill(cwd: string, action: "attach" | "detach", skill: string, role: string) {
  if (!/^[A-Za-z0-9][\w.:-]*$/.test(skill)) throw new Error(`bad skill name "${skill}"`);
  if (!projectRoles(cwd).includes(role)) throw new Error(`--role must be one of ${projectRoles(cwd).join(", ")}`);
  if (action === "attach" && !existsSync(join(cwd, ".claude", "skills", skill, "SKILL.md")))
    throw new Error(`${skill} is not installed here; use: factory skill add <owner/repo@${skill}> --role ${role}`);
  const file = join(cwd, ".claude", "agents", `${role}.md`);
  writeFileSync(file, (action === "attach" ? attachSkill : detachSkill)(readFileSync(file, "utf8"), skill));
}

/** Searches skills.sh through the pinned CLI. Returns packages with their install counts and review pages. */
export function searchSkills(query: string) {
  if (!/^\w[\w .-]{1,59}$/.test(query)) throw new Error("search: 2 to 60 letters, digits or spaces");
  const p = Bun.spawnSync(["npx", "-y", SKILLS_CLI, "find", query], { stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error(`skills search failed: ${p.stderr.toString().trim().slice(-300)}`);
  return parseFind(p.stdout.toString());
}
