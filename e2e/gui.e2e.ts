// End-to-end check of the control plane in a real browser: `bun run e2e`.
// Drives your installed Chrome (no browser download) against a throwaway repo, using dry runs
// so it makes no model calls. Not part of the gate: it needs Chrome and takes a few seconds.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { repo } from "../tests/fixture";
import { serve } from "../plugin/engine/server";

const { dir, sh, section } = repo();
const server = await serve(dir, 0);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // The one refusal this test provokes on purpose (a team change that breaks a rule, answered 400) is not an error.
  let refusals = 0;
  page.on("console", (m) => { if (m.type() !== "error") return; if (m.text().includes("status of 400")) refusals++; else errors.push(m.text()); });
  page.on("dialog", (d) => d.accept());
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const card = (column: string, id: string) => page.locator(`section[aria-label="${column}"] .card`, { hasText: id });
  const view = (name: string) => page.getByRole("navigation", { name: "Views" }).getByRole("link", { name, exact: true }).click();

  // Overview is the landing view: the connection is live and the pipeline shows the two Ready items.
  await page.locator(".link.live").waitFor();
  await page.locator(".line li", { hasText: "Queued" }).locator(".chip-id", { hasText: "F-001" }).waitFor();
  await view("Backlog");

  // Backlog: add an item, promote it.
  await page.getByLabel("New backlog item").fill("Ship the thing");
  await page.keyboard.press("Enter");
  await card("Inbox", "F-003").getByRole("button", { name: "Promote to Ready" }).click();
  await card("Ready", "F-003").waitFor();

  // Pipeline: a dry run goes through all five stages and waits for a person.
  await page.getByLabel("Dry run").check();
  await card("Ready", "F-001").getByRole("button", { name: "Run", exact: true }).click();
  await card("Awaiting approval", "F-001").locator(".stages li.ok").nth(4).waitFor({ timeout: 30_000 });

  // Review: the diff is shown, and replay steps back to the first event and returns to live.
  await card("Awaiting approval", "F-001").getByRole("button", { name: "Review" }).click();
  await page.locator(".diff .add", { hasText: "stub build" }).waitFor();
  await page.getByRole("tab", { name: "Log" }).click();
  await page.locator(".replay input").focus();
  await page.keyboard.press("Home");
  await page.locator(".replay", { hasText: "event 1 of" }).waitFor();
  assert.equal(await page.locator(".log pre").count(), 1, "replay at event 1 shows one log line");
  await page.keyboard.press("End");
  await page.locator(".replay", { hasText: "live" }).waitFor();

  // Approval: lands the work on main and cleans up the worktree.
  await page.getByRole("button", { name: "Approve and land" }).click();
  await card("Done", "F-001").waitFor();
  assert.equal(section("F-001"), "Done");
  assert.ok(existsSync(join(dir, "STUB_BUILD.txt")), "the task's change is merged");
  assert.ok(!existsSync(join(dir, ".worktrees/F-001")), "the worktree is removed");

  // Models: a change is validated and written to the config file.
  await view("Agents");
  await page.getByLabel("builder model").selectOption("opus");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Saved to factory.config.json").waitFor();
  assert.equal(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")).roles.builder.model, "opus");

  // Studio: attach a skill to a role, and edit the rules file; both are commits.
  await view("Studio");
  await page.getByRole("button", { name: "agents/builder.md" }).click();
  await page.getByRole("button", { name: "+ tdd" }).click();
  await page.getByRole("button", { name: "Detach tdd from builder" }).waitFor();
  await page.getByRole("button", { name: "AGENTS.md" }).click();
  await page.getByLabel("Contents of AGENTS.md").fill("# Rules\n\nBe brief.\n");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Saved and committed").waitFor();
  assert.deepEqual(sh("git", "log", "-2", "--format=%s").out.split("\n"), ["studio: edit AGENTS.md", "skills: attach tdd for builder"]);
  assert.equal(sh("git", "status", "--porcelain", "--", ".claude", "AGENTS.md").out, "", "nothing left uncommitted");

  // Cost and Worktrees render from the same data.
  await view("Agents");
  await page.getByText("By model").waitFor();
  await view("Logs");
  await page.locator(".logs .feed li", { hasText: "Landed" }).waitFor();
  // The theme switch flips the page and is remembered.
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), before);
  assert.equal(await page.evaluate(() => localStorage.getItem("factory-theme")), before === "dark" ? "light" : "dark");
  await view("Worktrees");
  await page.getByText("No task worktrees").waitFor();

  // Checks: a command runs and its output is shown.
  await view("Checks");
  await page.locator('section[aria-label="Is the setup right?"]').getByRole("button", { name: "Run" }).click();
  await page.locator('section[aria-label="Is the setup right?"] .out', { hasText: "git repository" }).waitFor();

  // Talk: the conversations are listed (no model is called here), and a conversation needs your first message.
  await view("Talk");
  await page.getByRole("button", { name: /Brainstorm an idea/ }).waitFor();
  await page.getByRole("button", { name: "Start this conversation" }).waitFor();

  // Team: a change is previewed with its cost and not saved until you say so; saving commits it.
  await view("Team");
  await page.locator(".role").first().waitFor();
  assert.equal(await page.locator(".role").count(), 9, "the balanced team has nine roles");
  await page.getByRole("button", { name: /^Lean/ }).click();
  await page.locator(".draft", { hasText: "Switch to the lean team" }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".role").length === 6);
  assert.equal(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")).team, undefined, "a preview writes nothing");
  await page.getByRole("button", { name: "Save to project" }).click();
  await page.locator(".draft").waitFor({ state: "detached" });
  assert.equal(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")).team.preset, "lean");
  assert.match(sh("git", "log", "-1", "--format=%s").out, /team use lean/);
  // A move that breaks a rule is refused with the reason, and the draft stays empty.
  await page.getByLabel(/^Move C1 /).selectOption({ label: "Builder" });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".draft").count(), 0);

  assert.equal(refusals, 1, "exactly the one expected refusal");
  assert.deepEqual(errors, [], "no browser console errors");
  console.log("e2e ok");
} finally {
  await browser.close();
  server.stop(true);
}
