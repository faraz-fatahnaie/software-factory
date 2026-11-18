import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkSkillFile } from "./authority";
import { projectRoles, projectTeam } from "./config";
import { holderOf } from "./team";

// Pinned: `npx -y` would otherwise run whatever version was published most recently.
export const SKILLS_CLI = "skills@1.8.1";
// Starts with a letter or digit, so a package name can never be read as a command-line option.
const PKG = /^[A-Za-z0-9][\w.-]*\/[\w.-]+@[\w.:-]+$/;

/**
 * Skills worth attaching (F-118), by the responsibility they help with, so they follow the duty to whichever role holds it in a team. Workflows only:
 * they add steps to follow, never tools or permissions, and installing one is still checked by the authority rules. Nothing is installed unless the
 * person runs the command that is offered.
 */
export const SUGGESTED: { id: string; pkg: string; why: string }[] = [
  { id: "B2", pkg: "addyosmani/agent-skills@test-driven-development", why: "red, green, refactor: the failing test first" },
  { id: "B2", pkg: "addyosmani/agent-skills@incremental-implementation", why: "build in thin, verified slices" },
  { id: "B2", pkg: "addyosmani/agent-skills@debugging-and-error-recovery", why: "find the cause of a failing check before changing code" },
  { id: "B1", pkg: "addyosmani/agent-skills@spec-driven-development", why: "a spec with objectives, boundaries and tests before code" },
  { id: "C1", pkg: "addyosmani/agent-skills@code-review-and-quality", why: "a review on five axes, with severities" },
  { id: "S1", pkg: "addyosmani/agent-skills@security-and-hardening", why: "untrusted input, authentication and secrets, checked in order" },
  { id: "Q2", pkg: "addyosmani/agent-skills@performance-optimization", why: "measure before calling something slow" },
];
/** The suggestions this project's team has not attached yet: the role that would get each one, and the command that installs it. */
export function suggestedSkills(cwd: string) {
  const team = projectTeam(cwd), roles = projectRoles(cwd);
  return SUGGESTED.flatMap((s) => {
    const role = holderOf(team, s.id), name = s.pkg.split("@")[1]!;
    if (!role || !roles.includes(role)) return []; // a role with no role file (one that only talks) cannot take a skill yet
    let md = ""; try { md = readFileSync(join(cwd, ".claude", "agents", `${role}.md`), "utf8"); } catch { /* not made yet */ }
    return roleSkills(md).includes(name) ? [] : [{ ...s, role, command: `factory skill add ${s.pkg} --role ${role}` }];
  });
}

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

/** A role list as typed: one role, or several separated by commas. Every one must be a role of this project's team. */
export function parseRoles(cwd: string, text: string): string[] {
  const roles = [...new Set(text.split(",").map((r) => r.trim()).filter(Boolean))];
  const bad = roles.filter((r) => !projectRoles(cwd).includes(r));
  if (!roles.length || bad.length) throw new Error(`--role must be one or more of ${projectRoles(cwd).join(", ")} (separated by commas)${bad.length ? `; not a role: ${bad.join(", ")}` : ""}`);
  return roles;
}

/** Why a skill may not be given to these roles (and be offered to the conversations that have no role file), in plain words. Empty when it widens nothing. */
export function skillProblems(cwd: string, skill: string, roles: string[], md?: string): string[] {
  const text = md ?? (() => { try { return readFileSync(join(cwd, ".claude", "skills", skill, "SKILL.md"), "utf8"); } catch { return ""; } })();
  const team = projectTeam(cwd);
  const found = [...roles.flatMap((r) => checkSkillFile(skill, text, r, team)), ...checkSkillFile(skill, text, undefined, team)];
  return [...new Set(found.map((v) => v.text))];
}

/** Installs a skills.sh package at project level (once) and attaches it to each of the chosen roles. A skill that would give a role more than it is meant to have is not left behind. */
export function addSkill(cwd: string, pkg: string, roles: string | string[]) {
  if (!PKG.test(pkg)) throw new Error(`skill must look like owner/repo@skill, got "${pkg}"`);
  const chosen = parseRoles(cwd, Array.isArray(roles) ? roles.join(",") : roles);
  const name = pkg.split("@")[1]!, had = existsSync(join(cwd, ".claude", "skills", name, "SKILL.md"));
  // argv array, no shell: the package string is never interpreted.
  const p = Bun.spawnSync(["npx", "-y", SKILLS_CLI, "add", pkg, "-a", "claude-code", "-y"], {
    cwd, env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (p.exitCode !== 0) throw new Error(`skills add failed for ${pkg}`);
  const problems = skillProblems(cwd, name, chosen);
  if (problems.length) {
    if (!had) rmSync(join(cwd, ".claude", "skills", name), { recursive: true, force: true });
    throw new Error(`${name} was not added, because it would give more than the roles are meant to have:\n  - ${problems.join("\n  - ")}`);
  }
  for (const role of chosen) {
    const file = join(cwd, ".claude", "agents", `${role}.md`);
    writeFileSync(file, attachSkill(readFileSync(file, "utf8"), name));
  }
}

/** Attaches or detaches a skill that is already installed in this project. */
export function setSkill(cwd: string, action: "attach" | "detach", skill: string, roles: string | string[]) {
  if (!/^[A-Za-z0-9][\w.:-]*$/.test(skill)) throw new Error(`bad skill name "${skill}"`);
  const chosen = parseRoles(cwd, Array.isArray(roles) ? roles.join(",") : roles);
  if (action === "attach" && !existsSync(join(cwd, ".claude", "skills", skill, "SKILL.md")))
    throw new Error(`${skill} is not installed here; use: factory skill add <owner/repo@${skill}> --role ${chosen[0]}`);
  if (action === "attach") {
    const problems = skillProblems(cwd, skill, chosen);
    if (problems.length) throw new Error(`${skill} was not attached, because it would give more than the roles are meant to have:\n  - ${problems.join("\n  - ")}`);
  }
  for (const role of chosen) {
    const file = join(cwd, ".claude", "agents", `${role}.md`);
    writeFileSync(file, (action === "attach" ? attachSkill : detachSkill)(readFileSync(file, "utf8"), skill));
  }
}

/** Searches skills.sh through the pinned CLI. Returns packages with their install counts and review pages. */
export function searchSkills(query: string) {
  if (!/^\w[\w .-]{1,59}$/.test(query)) throw new Error("search: 2 to 60 letters, digits or spaces");
  const p = Bun.spawnSync(["npx", "-y", SKILLS_CLI, "find", query], { stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error(`skills search failed: ${p.stderr.toString().trim().slice(-300)}`);
  return parseFind(p.stdout.toString());
}
