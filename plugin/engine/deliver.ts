// F-124: on autopilot the factory itself carries an approved task to GitHub, for people who do not know git. Deterministic code, never a model.
// One step per call: push the next approved task (in `factory integrate` order) and open its pull request, or merge the open one when its checks pass.
// Never merges failing checks or a conflict, never force-pushes, only touches factory/* branches. Approving a task and deploying stay the person's.
import type { Item } from "./backlog";
import { plan } from "./integrate";
import { baseBranch, levelWithGitHub, listPrs, mergeTask, pushTask, remoteUrl, runTexts, vcsStatus, BATCH } from "./vcs";

export type Step = { did?: string; needs?: string };

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
    if (pr.checks === "pending") return {};
    mergeTask(root, id);
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
