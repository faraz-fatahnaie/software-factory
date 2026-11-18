// Checklists loaded only when a change needs them (F-119): what the change touches decides, with no model, and only those go to the Reviewer, so an
// ordinary change costs no extra words. The lists are in plugin/templates/checklists/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sensitiveReasons, type Change, type SecurityConfig } from "./security";

const DIR = join(import.meta.dir, "..", "templates", "checklists");
const TEST = /(^|\/)(tests?|__tests__|specs?|e2e)\/|[._-](test|spec)\.\w+$/i;
const UI = /\.(tsx|jsx|vue|svelte|html?|css|scss|less|astro|erb|hbs|swift|kt|dart)$/i;
const SERVER = /(^|\/)(api|server|routes?|handlers?|controllers?|jobs?|workers?|services?)\//i;
const DATA_OR_NETWORK = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b|\.(query|raw|execute|findMany|findAll|aggregate)\(|\bfetch\(|\baxios\b|\brequests\.(get|post)|http\.(get|request)\(/;
const ENDPOINT = /\b(app|router)\.(get|post|put|patch|delete|use)\(|@app\.(route|get|post)|Bun\.serve|createServer\(|FastAPI\(|HandleFunc\(|@(Get|Post|Put|Delete)Mapping|\b(cron|schedule|queue|worker)\b/i;

/** Which checklists a change calls for, and why. */
export function checklistsFor(changes: Change[], security: SecurityConfig = {}): { name: string; why: string }[] {
  const code = changes.filter((c) => !TEST.test(c.file));
  const lines = code.flatMap((c) => c.added.map((a) => a.text));
  const out: { name: string; why: string }[] = [];
  const sens = sensitiveReasons(changes, security);
  if (sens.length) out.push({ name: "security", why: sens.join("; ") });
  const ui = code.filter((c) => UI.test(c.file)).map((c) => c.file);
  if (ui.length) out.push({ name: "accessibility", why: `it changes what people see (${ui.slice(0, 3).join(", ")})` });
  if (lines.some((l) => DATA_OR_NETWORK.test(l))) out.push({ name: "performance", why: "it queries data or calls over the network" });
  if (lines.some((l) => ENDPOINT.test(l)) || code.some((c) => SERVER.test(c.file))) out.push({ name: "observability", why: "it adds or changes a route, job or service" });
  return out;
}

/** The checklists as text for the Reviewer's prompt, or "" when the change needs none. */
export function checklistText(list: { name: string; why: string }[]): string {
  if (!list.length) return "";
  return `checklists for what this change touches (use the points that apply; a missed point is [required] only when it is a real defect):\n\n${list.map((c) => `### ${c.name[0]!.toUpperCase()}${c.name.slice(1)} (${c.why})\n${readFileSync(join(DIR, `${c.name}.md`), "utf8").trim()}`).join("\n\n")}`;
}
