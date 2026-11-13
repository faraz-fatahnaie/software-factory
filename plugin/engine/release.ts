// The deterministic side of releasing: what a release would contain, whether the project is ready,
// and the one git operation a release needs (commit the version files and tag). Nothing here
// publishes or deploys; those stay conversations the user approves step by step.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "./backlog";
import { loadConfig } from "./config";
import { shellGate } from "./pipeline";
import { allTracked, scanSecrets } from "./security";

const git = (dir: string, ...args: string[]) => {
  const p = Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), raw: p.stdout.toString(), err: p.stderr.toString().trim() };
};
const read = (dir: string, file: string) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : "");
const approved = (dir: string, file: string) => /^Status: approved/m.test(read(dir, file));

export type VersionFile = { file: string; version: string };
const JSON_FILES = ["package.json", "composer.json", ".claude-plugin/plugin.json", "plugin/.claude-plugin/plugin.json"];
const TOML_FILES = ["pyproject.toml", "Cargo.toml"];

/** The files that carry the project's version, and what each says. */
export function versionFiles(dir: string): VersionFile[] {
  const found: VersionFile[] = [];
  for (const file of JSON_FILES) {
    try { const v = JSON.parse(read(dir, file)).version; if (typeof v === "string") found.push({ file, version: v }); } catch { /* absent or not JSON */ }
  }
  // ponytail: the first `version = "..."` line in the file; a manifest with several tables may need the version set by hand.
  for (const file of TOML_FILES) { const v = read(dir, file).match(/^version\s*=\s*["']([^"']+)["']/m)?.[1]; if (v) found.push({ file, version: v }); }
  const plain = read(dir, "VERSION").trim();
  if (/^\d+\.\d+\.\d+/.test(plain)) found.push({ file: "VERSION", version: plain });
  return found;
}

// The raw output: trimming it would remove the leading space of the first line and eat a letter of its filename.
const dirtyFiles = (dir: string) => git(dir, "status", "--porcelain").raw.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ""));

export function releaseInfo(dir: string) {
  const tag = git(dir, "describe", "--tags", "--abbrev=0");
  const lastTag = tag.ok && tag.out ? tag.out : undefined;
  const log = git(dir, "log", ...(lastTag ? [`${lastTag}..HEAD`] : []), "--format=%s", "-n", "200");
  const files = versionFiles(dir);
  return {
    branch: git(dir, "rev-parse", "--abbrev-ref", "HEAD").out,
    lastTag,
    commitsSince: log.ok ? log.out.split("\n").filter(Boolean) : [],
    versionFiles: files,
    current: files[0]?.version,
    dirty: dirtyFiles(dir),
  };
}

export const formatInfo = (i: ReturnType<typeof releaseInfo>) => [
  `branch: ${i.branch}`,
  `last release tag: ${i.lastTag ?? "none yet"}`,
  `current version: ${i.current ?? "not found in any version file"}`,
  `version files: ${i.versionFiles.map((f) => `${f.file} (${f.version})`).join(", ") || "none found"}`,
  `uncommitted: ${i.dirty.join(", ") || "nothing"}`,
  `changes ${i.lastTag ? `since ${i.lastTag}` : "so far"} (${i.commitsSince.length}):`,
  ...i.commitsSince.slice(0, 50).map((c) => `  - ${c}`),
  ...(i.commitsSince.length > 50 ? [`  … and ${i.commitsSince.length - 50} more`] : []),
].join("\n");

export type Check = { level: "ok" | "warn" | "fail"; label: string; fix?: string };

/**
 * Is the project ready for a release, or (with `deploy`) to be deployed? Failures must be fixed;
 * warnings are for the user to accept knowingly. Runs the project's gate, so it can take a while.
 */
export async function readiness(dir: string, opts: { deploy?: boolean } = {}): Promise<Check[]> {
  const out: Check[] = [];
  const add = (level: Check["level"], label: string, fix?: string) => out.push({ level, label, ...(fix && { fix }) });
  const deploy = !!opts.deploy;
  const info = releaseInfo(dir);

  if (!git(dir, "rev-parse", "--is-inside-work-tree").ok) { add("fail", "not a git repository", "run: git init"); return out; }
  info.dirty.length ? add("fail", `uncommitted changes (${info.dirty.length}): ${info.dirty.slice(0, 5).join(", ")}`, "commit or discard them; a release is made from committed work only") : add("ok", "everything is committed");

  try {
    const items = parse(read(dir, "BACKLOG.md"));
    const named = (section: string) => items.filter((i) => i.section === section).map((i) => i.id);
    const running = named("In progress"), waiting = named("Awaiting approval"), blocked = named("Blocked");
    running.length ? add("fail", `tasks are still running: ${running.join(", ")}`, "wait for them or stop them: a finishing task changes the code") : add("ok", "no task is running");
    if (waiting.length) add("warn", `tasks are waiting for your approval and are not in this release: ${waiting.join(", ")}`, "approve or discard them first if they should be included");
    if (blocked.length) add("warn", `blocked tasks are not in this release: ${blocked.join(", ")}`);
  } catch { add("warn", "BACKLOG.md could not be read"); }

  try {
    const config = loadConfig(dir);
    if (!config.gate.length) add("warn", "no gate commands are configured, so nothing automatic checks the project", "set them with /software-factory:design or factory configure");
    else {
      const gate = await shellGate(config.gate)(dir);
      gate.ok ? add("ok", "the gate passes") : add("fail", `the gate fails: ${gate.output.split("\n").slice(0, 3).join(" ").slice(0, 200)}`, "fix it before releasing; run: factory gate");
    }
  } catch { add("warn", "factory.config.json could not be read, so the gate was not run", "run: factory doctor"); }

  const secrets = scanSecrets(allTracked(dir));
  secrets.length ? add("fail", `${secrets.length} possible hard-coded secret${secrets.length > 1 ? "s" : ""}`, "run: factory scan, remove them, and change any real key that was committed") : add("ok", "no hard-coded secrets found");

  const tag = info.lastTag;
  if (deploy) {
    const exact = git(dir, "describe", "--tags", "--exact-match", "HEAD");
    exact.ok && exact.out ? add("ok", `deploying release ${exact.out}`) : add("fail", "the current commit is not a release tag", "make a release first: /software-factory:release");
  } else if (tag && !info.commitsSince.length) add("fail", `nothing has changed since ${tag}`, "there is nothing new to release");

  const planOk = approved(dir, "docs/runbooks/deployment-plan.md");
  const runbooksOk = ["deploy.md", "rollback.md"].every((f) => approved(dir, `docs/runbooks/${f}`));
  const level = deploy ? "fail" : "warn";
  planOk ? add("ok", "the deployment plan is approved") : add(level, "there is no approved deployment plan", "run: /software-factory:release to prepare it");
  runbooksOk ? add("ok", "the deploy and rollback runbooks are approved") : add(level, "the deploy and rollback runbooks are missing or not approved", "run: /software-factory:release");

  const since = tag ? git(dir, "log", "-1", "--format=%cs", tag).out : "";
  const audits = existsSync(join(dir, "docs/quality")) ? readdirSync(join(dir, "docs/quality")).filter((f) => /^security-audit-\d{4}-\d{2}-\d{2}\.md$/.test(f)) : [];
  const latest = audits.map((f) => f.slice(15, 25)).sort().at(-1);
  latest && (!since || latest >= since) ? add("ok", `a security audit was done on ${latest}`) : add("warn", "no security audit since the last release", "run: /software-factory:secure audit");

  if (!deploy && !existsSync(join(dir, "CHANGELOG.md"))) add("warn", "there is no CHANGELOG.md yet", "the release conversation writes it");
  return out;
}

export const formatChecks = (checks: Check[]) => checks.map((c) => `${c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✗"} ${c.label}${c.fix && c.level !== "ok" ? `  →  ${c.fix}` : ""}`).join("\n");

/**
 * Commits the version files and CHANGELOG.md and tags the release. Refuses unless the version is
 * well formed and new, the changelog has an entry for it, every version file already says it, and
 * nothing else has changed. Never pushes.
 */
export function tagRelease(dir: string, version: string): { tag: string; committed: string[] } {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`"${version}" is not a version like 1.2.0`);
  const tag = `v${version}`;
  if (git(dir, "rev-parse", "-q", "--verify", `refs/tags/${tag}`).ok) throw new Error(`the tag ${tag} already exists`);
  if (!new RegExp(`^## \\[?v?${version.replace(/[.+]/g, "\\$&")}\\]?( |$)`, "m").test(read(dir, "CHANGELOG.md")))
    throw new Error(`CHANGELOG.md has no entry for ${version}: add a heading like "## [${version}] - <date>" first`);
  const files = versionFiles(dir);
  const stale = files.filter((f) => f.version !== version);
  if (stale.length) throw new Error(`these files do not say ${version} yet: ${stale.map((f) => `${f.file} (${f.version})`).join(", ")}`);

  const allowed = new Set([...files.map((f) => f.file), "CHANGELOG.md"]);
  const dirty = dirtyFiles(dir);
  const other = dirty.filter((f) => !allowed.has(f));
  if (other.length) throw new Error(`other files have changed too, so nothing was committed or tagged: ${other.slice(0, 5).join(", ")}. Commit or discard them first`);
  if (dirty.length) {
    const add = git(dir, "add", "--", ...dirty);
    const commit = git(dir, "commit", "-q", "-m", `release ${version}`, "--", ...dirty);
    if (!add.ok || !commit.ok) throw new Error(`could not commit the release: ${commit.err || add.err}`);
  }
  const made = git(dir, "tag", "-a", tag, "-m", `Release ${version}`);
  if (!made.ok) throw new Error(`could not create the tag: ${made.err}`);
  return { tag, committed: dirty };
}
