// `bun run rehearse <project folder>`: this version of the factory, tried on a private copy of a real project before a release (F-101).
//
// Fixtures are made by the tests and agree with the code by construction; a real project carries what earlier versions left behind (an old config, role
// files from an older catalog, branches, chats, an event log). That is where 1.2.0's stale role files and 1.1's old-config failure were found, by a user.
// Nothing here touches the project: it is cloned (only read; this also works when it is itself a git worktree, which a file copy would share git data
// with), its uncommitted files are laid on top, and the copy's remote is removed so nothing can be pushed. No model is called and nothing reaches GitHub.
import { cpSync, existsSync, mkdtempSync, readdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(join(source, "factory.config.json"))) { console.error("usage: bun run rehearse <a factory project's folder>"); process.exit(2); }
const run = (cwd: string, ...argv: string[]) => { const p = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, FACTORY_GH: gh } }); return { code: p.exitCode, out: `${p.stdout}${p.stderr}`.trim() }; };

// A stand-in for gh that is never signed in, so nothing reaches GitHub.
const bin = mkdtempSync(join(tmpdir(), "rehearse-bin-")), gh = join(bin, "gh");
writeFileSync(gh, "#!/bin/sh\necho 'not signed in (rehearsal)' >&2\nexit 1\n"); chmodSync(gh, 0o755);

const copy = join(mkdtempSync(join(tmpdir(), "rehearse-")), "project");
const steps: { what: string; ok: boolean; note: string }[] = [];
const step = (what: string, ok: boolean, note = "") => { steps.push({ what, ok, note }); console.log(`${ok ? "✓" : "✗"} ${what}${note ? `: ${note.split("\n")[0]!.slice(0, 160)}` : ""}`); };

// 1. The copy: every branch, the same checkout, and the files that are not committed (the event log and chats included, the task folders not).
const head = run(source, "git", "rev-parse", "--abbrev-ref", "HEAD").out;
step("clone the project (read only)", run(tmpdir(), "git", "clone", "-q", "--no-hardlinks", source, copy).code === 0, copy);
for (const ref of run(copy, "git", "for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/").out.split("\n").filter((r) => r && r !== "origin/HEAD" && r !== "origin")) {
  const name = ref.replace(/^origin\//, "");
  if (name !== head) run(copy, "git", "branch", "-q", name, ref);
}
run(copy, "git", "checkout", "-q", head);
for (const f of readdirSync(source)) if (![".git", "node_modules", ".worktrees"].includes(f)) cpSync(join(source, f), join(copy, f), { recursive: true, filter: (p) => !/\/(node_modules|\.worktrees|\.factory\/runs)(\/|$)/.test(p) });
run(copy, "git", "remote", "remove", "origin");
const start = run(copy, "git", "rev-parse", "HEAD").out;
step("nothing can be pushed from the copy", run(copy, "git", "remote").out === "");

// 2. The commands a person runs, as this version: each must answer, not crash.
const cli = join(import.meta.dir, "..", "plugin", "engine", "cli.ts");
for (const args of [["doctor"], ["status"], ["authority"], ["integrate"], ["manager"], ["vcs"], ["team"], ["skill", "suggested"]]) {
  const r = run(copy, process.execPath, cli, ...args);
  // doctor and authority exit 1 to say something is wrong in the project: that is an answer. A crash prints a stack or "error:".
  const crashed = /\n\s+at .+:\d+:\d+|^error:|TypeError|ReferenceError|Invalid factory\.config\.json/m.test(r.out);
  step(`factory ${args.join(" ")}`, !crashed && (r.code === 0 || ["doctor", "authority"].includes(args[0]!)), crashed ? r.out : r.out.split("\n").at(-1) ?? "");
}

// 3. The dashboard on the copy, started as /software-factory:open starts it (which is when an update repairs role files): every page's data answers.
const port = 4499 - Math.floor(Math.random() * 40);
const dash = Bun.spawn([process.execPath, cli, "serve", String(port)], { cwd: copy, stdout: "pipe", stderr: "pipe", env: { ...process.env, FACTORY_GH: gh } });
try {
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 100 && !up; i++) { await Bun.sleep(100); up = await fetch(`${base}/api/project`).then((r) => r.ok, () => false); }
  step("the dashboard starts", up, up ? base : (await new Response(dash.stderr).text()).slice(0, 300));
  for (const path of ["/", "/api/project", "/api/backlog", "/api/config", "/api/team", "/api/source", "/api/vcs", "/api/health", "/api/manager", "/api/chats", "/api/integrate", "/api/chat/topics", "/api/worktrees", "/api/files", "/api/skills"]) {
    const r = await fetch(`${base}${path}`).catch((e) => ({ status: 0, text: async () => String(e) }) as Response);
    const body = await r.text();
    let ok = r.status === 200;
    if (ok && path !== "/") try { JSON.parse(body); } catch { ok = false; }
    step(`GET ${path}`, ok, ok ? "" : `${r.status} ${body.slice(0, 200)}`);
  }
} finally { dash.kill(); await dash.exited; }

// 4. What updating would change in the project, as commits the factory made in the copy.
const made = run(copy, "git", "log", "--format=%s", `${start}..HEAD`).out;
const changed = run(copy, "git", "status", "--porcelain").out;
console.log(`\nWhat this version did to the copy (the project itself is untouched):\n${made ? made.split("\n").map((l) => `  commit: ${l}`).join("\n") : "  no commits"}${changed ? `\n${changed.split("\n").map((l) => `  ${l}`).join("\n")}` : ""}`);
const failed = steps.filter((s) => !s.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} passed. The copy is kept at ${copy}`);
process.exit(failed.length ? 1 : 0);
