// The deterministic half of the security gate (S2): read the change set, scan it for hard-coded
// secrets, and decide whether the security engineer needs to look. No model is involved here.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type SecurityConfig = { always?: boolean; paths?: string[]; keywords?: string[] };
export type Change = { file: string; added: { line: number; text: string }[] };
export type Finding = { file: string; line: number; kind: string };

const MAX_FILE = 200_000, MAX_LINES = 2000;
const SKIP_DIR = /(^|\/)(node_modules|\.factory|\.git|graphify-out|dist|build|\.venv|venv|vendor|__pycache__)\//;
const BINARY = /\.(png|jpe?g|gif|ico|webp|pdf|zip|gz|tgz|woff2?|ttf|otf|mp[34]|mov|wasm|sqlite3?|db)$/i;
const LOCKFILE = /(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const TEST_FILE = /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[\w]+$|(^|\/)test_[\w]+\.py$/;

const git = (cwd: string, ...args: string[]) => {
  try {
    const p = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    return p.exitCode === 0 ? p.stdout.toString() : "";
  } catch { return ""; }
};

/** Reads a unified diff made with `-U0` into the lines each file gained, with their line numbers. */
export function parseDiff(diff: string): Change[] {
  const out: Change[] = [];
  let cur: Change | undefined, line = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) { const f = l.slice(4); cur = f === "/dev/null" ? undefined : { file: f.replace(/^b\//, ""), added: [] }; if (cur) out.push(cur); }
    else if (l.startsWith("@@")) line = Number(l.match(/\+(\d+)/)?.[1] ?? 0);
    else if (cur && l.startsWith("+") && !l.startsWith("+++")) { if (cur.added.length < MAX_LINES) cur.added.push({ line, text: l.slice(1) }); line++; }
  }
  return out;
}

function readAll(cwd: string, file: string): Change {
  const path = join(cwd, file);
  try {
    if (!existsSync(path) || statSync(path).size > MAX_FILE || BINARY.test(file)) return { file, added: [] };
    const text = readFileSync(path, "utf8");
    if (text.includes("\0")) return { file, added: [] };
    return { file, added: text.split("\n").slice(0, MAX_LINES).map((t, i) => ({ line: i + 1, text: t })) };
  } catch { return { file, added: [] }; }
}

const tidy = (changes: Change[]) => changes.filter((c) => !SKIP_DIR.test(c.file)).map((c) => (LOCKFILE.test(c.file) || BINARY.test(c.file) ? { ...c, added: [] } : c));

/** What the working tree changed against HEAD: edits, plus new files that are not ignored. */
export function changesInWorktree(cwd: string): Change[] {
  const edited = parseDiff(git(cwd, "diff", "HEAD", "-U0", "--no-color"));
  const known = new Set(edited.map((c) => c.file));
  const fresh = git(cwd, "ls-files", "--others", "--exclude-standard").split("\n").filter((f) => f && !known.has(f)).map((f) => readAll(cwd, f));
  return tidy([...edited, ...fresh]);
}

/** What changed since a revision (for example the last release tag). */
export function changesSince(cwd: string, ref: string): Change[] {
  if (!/^[\w./~^-]{1,100}$/.test(ref) || ref.startsWith("-")) throw new Error(`not a revision: ${ref}`);
  return tidy(parseDiff(git(cwd, "diff", `${ref}...HEAD`, "-U0", "--no-color")));
}

/** Every tracked file, as if all of it were new. */
export const allTracked = (cwd: string): Change[] => tidy(git(cwd, "ls-files").split("\n").filter(Boolean).map((f) => readAll(cwd, f)));

const entropy = (s: string) => { const n = new Map<string, number>(); for (const ch of s) n.set(ch, (n.get(ch) ?? 0) + 1); return -[...n.values()].reduce((a, c) => a + (c / s.length) * Math.log2(c / s.length), 0); };
const PLACEHOLDER = /example|changeme|change-me|your[_-]|xxxx|placeholder|dummy|sample|<[^>]+>|\$\{|process\.env|os\.environ|getenv|\.\.\.|\*\*\*/i;

// Known token shapes. The pattern sources are split so this file does not trip its own scanner.
const TOKENS: [string, RegExp][] = [
  ["private key", new RegExp("-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")],
  ["AWS access key", new RegExp("\\bAK" + "IA[0-9A-Z]{16}\\b")],
  ["GitHub token", new RegExp("\\bgh[pousr]_[A-Za-z0-9]{36,}\\b|\\bgithub_pat_[A-Za-z0-9_]{50,}\\b")],
  ["Slack token", new RegExp("\\bxox[baprs]-[A-Za-z0-9-]{10,}")],
  ["Stripe live key", new RegExp("\\b[sr]k_li" + "ve_[0-9a-zA-Z]{16,}\\b")],
  ["Google API key", new RegExp("\\bAI" + "za[0-9A-Za-z_-]{35}\\b")],
  ["API secret key", new RegExp("\\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\\b")],
  ["JSON web token", new RegExp("\\bey" + "J[A-Za-z0-9_-]{10,}\\.ey" + "J[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b")],
];
const ASSIGNMENT = /(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key|auth)\w*["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i;
const URL_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]{4,})@[^\s/]+/i;
const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/, ENV_TEMPLATE = /\.(example|sample|template|dist)$/;

/** Finds hard-coded secrets in the lines a change added. Findings name the place and the kind, never the value. */
export function scanSecrets(changes: Change[]): Finding[] {
  const found: Finding[] = [];
  for (const c of changes) {
    if (ENV_FILE.test(c.file) && !ENV_TEMPLATE.test(c.file) && c.added.length) found.push({ file: c.file, line: 1, kind: "environment file committed" });
    for (const { line, text } of c.added) {
      if (text.includes("factory:allow-secret")) continue; // a person marked this line as a known false alarm
      const token = TOKENS.find(([, re]) => re.test(text));
      if (token) { found.push({ file: c.file, line, kind: token[0] }); continue; }
      const value = ASSIGNMENT.exec(text)?.[1];
      if (value && !PLACEHOLDER.test(value) && entropy(value) >= 3) { found.push({ file: c.file, line, kind: "hard-coded secret" }); continue; }
      const password = URL_CREDENTIALS.exec(text)?.[1];
      if (password && !PLACEHOLDER.test(password)) found.push({ file: c.file, line, kind: "password in a connection address" });
    }
  }
  return found;
}

export const formatFindings = (f: Finding[]) => f.map((x) => `- ${x.file}:${x.line} — ${x.kind}`).join("\n");

// Where the security engineer is needed: the sensitive areas from the design, by file name and by the lines added.
const PATH_RULES: [string, RegExp][] = [
  ["a dependency manifest changed", /(^|\/)(package\.json|requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?)$|(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|go\.sum|Cargo\.lock)$/],
  ["a container, pipeline or infrastructure file changed", /(^|\/)(Dockerfile[\w.-]*|docker-compose[\w.-]*\.ya?ml|\.gitlab-ci\.ya?ml|Jenkinsfile)$|(^|\/)(\.github\/workflows|\.circleci|helm|k8s|kubernetes)\/|\.tf$/],
  ["authentication or access control", /(auth|login|logout|signin|signup|session|password|oauth|jwt|permission|rbac|acl)/i],
  ["payments", /(payment|billing|stripe|checkout|invoice|subscription)/i],
  ["the database schema", /(migration|schema\.|\.sql$|prisma)/i],
];
const CONTENT_RULES: [string, RegExp][] = [
  ["authentication or access control", /\b(jwt|bcrypt|argon2|passport|oauth|cookie|authorize|isAdmin|is_admin)\b|\bsessions?\b/i],
  ["cryptography", /\b(createHash|createCipher\w*|encrypt|decrypt|hmac|pbkdf2|scrypt|md5|sha1|Math\.random)\b/i],
  ["file or shell access", /\b(child_process|execSync|spawnSync|Bun\.spawn|subprocess|os\.system|popen|new Function)\b|\beval\(|shell\s*=\s*True|\b(writeFile\w*|unlink\w*|rmSync|rmtree)\b/i],
  ["database queries", /\b(SELECT|INSERT INTO|DELETE FROM|UPDATE)\b[^\n]*\b(FROM|SET|WHERE|VALUES)\b|\.(query|raw|execute)\(/i],
  ["a public endpoint", /\b(app|router)\.(get|post|put|patch|delete|use)\(|@app\.(route|get|post|put|delete)|Bun\.serve|createServer\(|FastAPI\(|HandleFunc\(|@(Get|Post|Put|Delete)Mapping/],
  ["personal or payment data", /\b(ssn|date_of_birth|dateOfBirth|passport|national_id|credit_card|card_number|cvv|iban|stripe|paypal)\b/i],
];

/** Why the security engineer should review this change, or nothing when it touches no sensitive area. */
export function sensitiveReasons(changes: Change[], cfg: SecurityConfig = {}): string[] {
  const reasons = new Set<string>();
  if (cfg.always) reasons.add("the project is configured to review every change");
  for (const c of changes) {
    for (const [why, re] of PATH_RULES) if (re.test(c.file)) reasons.add(why);
    for (const extra of cfg.paths ?? []) if (c.file.includes(extra)) reasons.add(`a file in a path you marked sensitive (${extra})`);
    if (TEST_FILE.test(c.file)) continue; // tests mention these words without handling anything
    for (const { text } of c.added) {
      for (const [why, re] of CONTENT_RULES) if (re.test(text)) reasons.add(why);
      for (const word of cfg.keywords ?? []) if (text.toLowerCase().includes(word.toLowerCase())) reasons.add(`a line with a word you marked sensitive (${word})`);
    }
  }
  return [...reasons];
}
