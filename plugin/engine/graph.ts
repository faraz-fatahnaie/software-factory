// The knowledge graph (graphify): on by default, optional, and free to keep current because
// `graphify update` reads code without calling a model. Agents read graphify-out/GRAPH_REPORT.md first.
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Files graphify writes that belong to one machine, not to the repository. */
export const GRAPH_IGNORE = ["graphify-out/cache/", "graphify-out/.graphify_python", "graphify-out/.graphify_root", "graphify-out/20*/"];

export function graphifyInstalled(): boolean {
  if (process.env.FACTORY_NO_GRAPH) return false; // lets tests and CI run without it
  try { return Bun.spawnSync(["graphify", "--version"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0; } catch { return false; }
}

/** Rebuilds the graph of the code in `dir`. Never throws: the graph is a help, not a gate. */
export function updateGraph(dir: string): { ok: boolean; message: string } {
  try {
    const p = Bun.spawnSync(["graphify", "update", "."], { cwd: dir, stdout: "pipe", stderr: "pipe", timeout: 300_000 });
    const out = `${p.stdout}${p.stderr}`.trim().split("\n").filter(Boolean);
    const built = p.exitCode === 0 && existsSync(join(dir, "graphify-out", "graph.json"));
    return { ok: built, message: built ? (out.find((l) => /Rebuilt/.test(l)) ?? "updated").replace(/^\[[^\]]*\]\s*/, "").replace(/^Rebuilt:\s*/, "") : (out.at(-1) ?? "graphify failed").slice(0, 200) };
  } catch (e) {
    return { ok: false, message: String(e).slice(0, 200) };
  }
}
