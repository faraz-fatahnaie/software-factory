// `bun run evals:plugin [claude plugin eval options]`: does a natural request reach the right slash command, and does a casual one never reach a
// command only the person may give (F-117)? The cases are in evals/plugin/. The plugin is copied with them into a temporary folder, because eval
// cases must sit below the plugin and nothing for development is shipped in plugin/. Spends tokens: on Haiku, one run per case, by default.
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "factory-plugin-eval-"));
cpSync(join(import.meta.dir, "..", "plugin"), dir, { recursive: true });
cpSync(join(import.meta.dir, "plugin"), join(dir, "evals"), { recursive: true });
const args = process.argv.slice(2);
const has = (k: string) => args.includes(k);
const p = Bun.spawnSync(["claude", "plugin", "eval", dir, "--trust-plugin", "--no-publish",
  ...(has("--model") ? [] : ["--model", "haiku"]), ...(has("--runs") ? [] : ["--runs", "1"]),
  "--output-dir", join(import.meta.dir, "results", `plugin-${new Date().toISOString().replace(/[:.]/g, "-")}`), ...args], { stdout: "inherit", stderr: "inherit" });
process.exit(p.exitCode ?? 1);
