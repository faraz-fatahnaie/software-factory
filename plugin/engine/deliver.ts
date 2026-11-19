// F-124: on autopilot the factory itself carries an approved task to GitHub, for people who do not know git. Deterministic code, never a model.
// One step per call: push the next approved task (in `factory integrate` order) and open its pull request, or merge the open one when its checks pass.
// Never merges failing checks or a conflict, never force-pushes, only touches factory/* branches. Approving a task and deploying stay the person's.
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Item } from "./backlog";
import { plan } from "./integrate";
import { baseBranch, levelWithGitHub, listPrs, mergeTask, pushTask, remoteUrl, runTexts, vcsStatus, BATCH } from "./vcs";

export type Step = { did?: string; needs?: string; /** Checks are still running: nothing to do yet, look again soon. */ waiting?: boolean };

/** What a person should do when GitHub refuses a merge, in plain words. */
export function explainRefusal(err: string): string {
  const e = err.toLowerCase();
  if (/review|approv|protect|required status|not allowed|policy/.test(e)) return "GitHub's own rules for this repository (a required review, or a protected branch) do not let it merge yet. Open the pull request on GitHub, give the review it asks for and merge it there; or relax the rule in the repository's settings.";
  if (/auth|login|token|403|401/.test(e)) return "GitHub did not accept the sign-in. Run gh auth login once, then it goes on by itself.";
  if (/conflict|not mergeable|out of date/.test(e)) return "the pull request changed on GitHub and now conflicts. Press Update this branch, or Rebuild it if the clash is large.";
  return `GitHub refused it (${err.replace(/^GitHub refused the merge: /, "").split("\n")[0]!.slice(0, 160)}). Open the pull request on GitHub to see why.`;
}

/** Checks that run longer than this are said to be stuck (once). */
const PENDING_LIMIT_MS = 45 * 60_000;
function pendingSince(root: string, id: string | null): number {
  const file = join(root, ".factory", "deliver.json");
  let state: Record<string, number> = {};
  try { state = JSON.parse(readFileSync(file, "utf8")); } catch { /* none yet */ }
  if (id === null) { if (Object.keys(state).length) try { writeFileSync(file, "{}"); } catch { /* best effort */ } return 0; }
  if (!state[id]) { state[id] = Date.now(); try { mkdirSync(join(root, ".factory"), { recursive: true }); writeFileSync(file, JSON.stringify(state)); } catch { /* best effort */ } }
  return Date.now() - state[id]!;
}

/** One deliver at a time in a project (the dashboard, an approval and a watcher can all ask): true when this caller got the lock. */
export function takeLock(root: string): (() => void) | undefined {
  const file = join(root, ".factory", "deliver.lock");
  try { const pid = Number(readFileSync(file, "utf8")); if (pid && pid !== process.pid) { try { process.kill(pid, 0); return undefined; } catch { /* the holder is gone */ } } } catch { /* no lock */ }
  try { mkdirSync(join(root, ".factory"), { recursive: true }); writeFileSync(file, String(process.pid)); } catch { return undefined; }
  return () => { try { if (readFileSync(file, "utf8") === String(process.pid)) unlinkSync(file); } catch { /* already gone */ } };
}

export function deliverStep(root: string, items: Item[], store: Parameters<typeof runTexts>[0]): Step {
  if (!remoteUrl(root)) return {};
  const s = vcsStatus(root, false);
  if (!s.ghReady) return { needs: "GitHub is not set up or not signed in, so nothing was delivered. Run gh auth login once." };
  const prs = listPrs(root);
  if (!prs) return {};
  // One at a time: while a pull request is open, only it moves.
  const open = [...prs].filter(([id, pr]) => pr.state === "OPEN" && (BATCH.test(id) || items.some((i) => i.id === id)));
  if (open.length) {
    const [id, pr] = open[0]!;
    if (pr.checks === "failing") return { needs: `${id}: the checks on its pull request #${pr.number} are failing, so it was not merged. Look at them, then Rebuild it or fix on GitHub.` };
    if (!pr.mergeable) return { needs: `${id}: its pull request #${pr.number} conflicts with ${baseBranch(root)}, so it was not merged. Press Update this branch (or Rebuild it if the clash is large) on its pull request.` };
    if (pr.checks === "pending") {
      if (pendingSince(root, id) > PENDING_LIMIT_MS) return { needs: `${id}: the checks on its pull request #${pr.number} have been running for over 45 minutes. Open it on GitHub to see what they wait for; it merges by itself when they pass.` };
      return { waiting: true };
    }
    try { mergeTask(root, id); } catch (e) { return { needs: `${id}: pull request #${pr.number} was not merged: ${explainRefusal((e as Error).message)}` }; }
    pendingSince(root, null);
    return { did: `${id}: ${pr.checks === "none" ? "no checks to wait for" : "checks passed"}, pull request #${pr.number} merged and ${baseBranch(root)} brought up to date.` };
  }
  // Level first: a pull request is made from this folder's branch, so what only this folder has must be on GitHub before one is opened.
  const level = levelWithGitHub(root);
  if (level) return { did: level };
  const p = plan(root, items);
  const next = p.steps.flatMap((st) => st.ids).map((id) => p.waiting.find((w) => w.id === id)).find((w) => w && w.state === "approved" && !p.main.some((m) => m.id === w.id) && !prs.has(w.id));
  if (!next) return {};
  const { spec, review } = runTexts(store, next.id);
  const url = pushTask(root, next.id, next.title, spec, review);
  return { did: `${next.id}: pushed and its pull request opened (${url}). It is merged when its checks pass.` };
}
