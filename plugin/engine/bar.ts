// The bar a change must not quietly lower (F-108). An agent stuck on a red check can turn it green by silencing it: a suppression comment, a skipped
// test, a deleted test or assertion, a lowered threshold, a stub. The gate cannot see that, and a review can miss it. This reads the change itself,
// with no model: anything found fails the check unless the Builder names the file under `## Weakened checks` with a reason, and a named one goes to the
// Reviewer to judge and to the person in the handover. Nothing here is silent.
import { changesInWorktree } from "./security";

export type Weakening = { file: string; line?: number; kind: string };

const TEST = /(^|\/)(tests?|__tests__|specs?|e2e)\/|[._-](test|spec)\.\w+$|(^|\/)test_[^/]+\.py$|_test\.go$/i;
const PROSE = /\.(md|mdx|txt|rst|adoc)$/i;
const SUPPRESS = /@ts-(ignore|nocheck|expect-error)\b|eslint-disable|biome-ignore|#\s*type:\s*ignore|#\s*noqa\b|pylint:\s*disable|\/\/\s*nolint\b|@SuppressWarnings|#\[allow\(|\b(istanbul|c8|v8)\s+ignore\b|rubocop:disable|swiftlint:disable/i;
const SKIP = /\b(it|test|describe|context|suite)\.(skip|only|todo)\b|\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(|@pytest\.mark\.(skip|xfail)|@unittest\.skip|\bt\.Skip(Now)?\(|#\[ignore\]|@Disabled\b|@Ignore\b/;
const STUB = /throw new Error\(\s*["'`]not implemented|raise NotImplementedError|\btodo!\(|\bunimplemented!\(|panic\(\s*"not implemented/i;
const CASE = /^\s*(it|test|describe)(\.\w+)?\s*\(|^\s*(async\s+)?def test_|^\s*func Test\w*\(|^\s*#\[test\]|^\s*@Test\b/;
const ASSERT = /\bexpect\s*\(|\bassert\w*\b|\bt\.(Error|Fatal)f?\(/;
const LIMIT = /cov|fail[_-]?under|threshold/i;

const git = (cwd: string, ...args: string[]) => {
  const p = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return p.exitCode === 0 ? p.stdout.toString() : "";
};

/** The lines each file lost against HEAD, and the files deleted outright. Read from `git diff -U0`, headers told apart from removed lines by position. */
export function removedLines(diff: string): { file: string; lines: string[]; deleted: boolean }[] {
  const out: { file: string; lines: string[]; deleted: boolean }[] = [];
  let cur: (typeof out)[number] | undefined, hunk = false;
  for (const l of diff.split("\n")) {
    if (l.startsWith("diff --git")) { hunk = false; cur = undefined; }
    else if (!hunk && l.startsWith("--- ")) { const f = l.slice(4); cur = f === "/dev/null" ? undefined : { file: f.replace(/^a\//, ""), lines: [], deleted: false }; if (cur) out.push(cur); }
    else if (!hunk && l === "+++ /dev/null" && cur) cur.deleted = true;
    else if (l.startsWith("@@")) hunk = true;
    else if (hunk && cur && l.startsWith("-")) cur.lines.push(l.slice(1));
  }
  return out;
}

/** What a change in this folder does to the bar, against HEAD. */
export function weakenings(cwd: string): Weakening[] {
  return findWeakenings(changesInWorktree(cwd), removedLines(git(cwd, "diff", "HEAD", "-U0", "--no-color")));
}

/** The rules, on the lines a change added and the lines it removed. Moving tests between files is not a loss: cases and assertions are counted over all test files. */
export function findWeakenings(added: { file: string; added: { line: number; text: string }[] }[], removed: { file: string; lines: string[]; deleted: boolean }[]): Weakening[] {
  const found: Weakening[] = [];
  for (const c of added) {
    if (PROSE.test(c.file)) continue;
    const test = TEST.test(c.file);
    for (const { line, text } of c.added) {
      if (SUPPRESS.test(text)) found.push({ file: c.file, line, kind: "a check is silenced" });
      else if (test && SKIP.test(text)) found.push({ file: c.file, line, kind: "a test is skipped or focused" });
      else if (!test && STUB.test(text)) found.push({ file: c.file, line, kind: "an unimplemented stub" });
    }
  }
  // Tests and assertions: the net change per test file, flagged only when the total went down.
  const net = new Map<string, { cases: number; asserts: number; deleted: boolean }>();
  const at = (f: string) => net.get(f) ?? net.set(f, { cases: 0, asserts: 0, deleted: false }).get(f)!;
  const count = (f: string, lines: string[], sign: number) => { const n = at(f); for (const t of lines) { if (CASE.test(t)) n.cases += sign; if (ASSERT.test(t)) n.asserts += sign; } };
  for (const c of added) if (TEST.test(c.file)) count(c.file, c.added.map((a) => a.text), 1);
  for (const r of removed) if (TEST.test(r.file)) { count(r.file, r.lines, -1); if (r.deleted) at(r.file).deleted = true; }
  const total = (k: "cases" | "asserts") => [...net.values()].reduce((s, n) => s + n[k], 0);
  const lostCases = total("cases") < 0, lostAsserts = total("asserts") < 0;
  for (const [file, n] of net) {
    if (n.deleted && (lostCases || !added.some((c) => TEST.test(c.file)))) found.push({ file, kind: "a test file is deleted" });
    else if (lostCases && n.cases < 0) found.push({ file, kind: `${-n.cases} test case${n.cases === -1 ? "" : "s"} removed` });
    else if (lostAsserts && n.asserts < 0) found.push({ file, kind: `${-n.asserts} assertion${n.asserts === -1 ? "" : "s"} removed` });
  }
  // A threshold edited down: the same line, removed and added again with a smaller number.
  const shape = (t: string) => t.replace(/\d+(\.\d+)?/g, "#").trim();
  const nums = (t: string) => [...t.matchAll(/\d+(\.\d+)?/g)].map((m) => Number(m[0]));
  for (const r of removed) {
    const now = added.find((c) => c.file === r.file);
    if (!now || PROSE.test(r.file)) continue;
    for (const old of r.lines.filter((l) => LIMIT.test(l))) {
      const twin = now.added.find((a) => shape(a.text) === shape(old));
      if (twin && nums(twin.text).some((v, i) => v < nums(old)[i]!)) found.push({ file: r.file, line: twin.line, kind: `a threshold is lowered (${old.trim().slice(0, 80)} → ${twin.text.trim().slice(0, 80)})` });
    }
  }
  return found;
}

/** The files the Builder named, with a reason, under `## Weakened checks` in its reply. */
const named = (reply: string) => (reply.split(/^## Weakened checks\s*$/m)[1]?.split(/^## /m)[0] ?? "");
export const justified = (reply: string, w: Weakening) => named(reply).includes(w.file);

export const formatWeakenings = (ws: Weakening[]) => ws.map((w) => `- ${w.file}${w.line ? `:${w.line}` : ""}: ${w.kind}`).join("\n");

/** What the Builder is told when the check finds a weakening it did not name. */
export const weakeningFeedback = (ws: Weakening[]) =>
  `The checks pass only because the bar was lowered:\n${formatWeakenings(ws)}\n\nFix the code so the check passes as it was. If one of these is truly right (a test that no longer applies, a suppression a tool needs), keep it and name the file under a \`## Weakened checks\` heading in your reply, with the reason: the Reviewer and the person will judge it.`;
