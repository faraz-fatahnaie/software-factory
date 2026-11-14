// A smoke test of the whole control plane: `bun run smoke`.
// A throwaway project is filled with every state (running, quiet, blocked, waiting for you, done), then every view is opened
// at a desktop and at a phone width. Each must show what it should, raise no console error, and pass an accessibility check (axe).
// It makes no model calls. Needs Chrome, like `bun run e2e`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { repo, seedStates } from "../tests/fixture";
import { serve } from "../plugin/engine/server";

const { dir, cli } = repo();
seedStates(dir, cli);
const server = await serve(dir, 0);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const problems: string[] = [];

/** Opens a view through the address (the rail is a scrolling bar on a phone) and waits for its heading. */
async function open(page: Page, view: string) {
  await page.evaluate((h) => { location.hash = h; }, `#${view.toLowerCase()}`);
  await page.getByRole("heading", { level: 1, name: new RegExp(`^${view}|Studio|Checks`) }).first().waitFor();
}
/** Axe on what is on screen now. The page's own theme colours are checked too. */
async function a11y(page: Page, where: string) {
  // A panel that is still sliding in has half-transparent colours; check it once it has settled.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
  await page.addScriptTag({ content: axe });
  const res = await page.evaluate(async () => (await (globalThis as any).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v: any) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")}`));
  for (const v of res) problems.push(`${where}: ${v}`);
}

try {
  for (const [name, size] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const page = await browser.newPage({ viewport: size });
    page.on("pageerror", (e) => problems.push(`${name}: page error ${e}`));
    page.on("console", (m) => { if (m.type() === "error") problems.push(`${name}: console error ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/`);
    await page.locator(".link.live, .side .link").first().waitFor();

    // Overview: the working people show what they do now, free people what they did last, and the tab says who is working.
    await open(page, "Overview");
    await page.locator(".person-card .now .what", { hasText: /Running|Editing|Reading|Thinking/ }).first().waitFor();
    await page.locator(".person-card .now.quiet").waitFor(); // the reviewer who has gone quiet
    await page.locator(".free-list li", { hasText: "Last:" }).first().waitFor();
    await page.waitForFunction(() => document.title.includes("●"));
    assert.match(await page.title(), /Kofi .* F-002/);
    await a11y(page, `${name} Overview`);

    // The health strip is there (a warning here: the fixture has a placeholder gate), and the palette runs a check from the keyboard or, on a phone, the header button.
    await page.getByRole("article", { name: "Health" }).waitFor();
    if (name === "phone") await page.getByRole("button", { name: "Search or run a command" }).click(); else await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor();
    await page.getByRole("combobox", { name: "Type a command or search" }).fill("secrets");
    await page.keyboard.press("Enter");
    await page.locator(".pal .out").waitFor();
    await a11y(page, `${name} command palette (a check)`);
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Type a command or search" }).waitFor();
    await a11y(page, `${name} command palette (the list)`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "detached" });

    // A person's panel opens from a robot, shows the live feed and files touched, and Esc closes it.
    await page.getByRole("button", { name: "Open Kofi's panel" }).first().click();
    await page.getByRole("dialog", { name: "Kofi" }).waitFor();
    await page.getByRole("tab", { name: "Live feed" }).waitFor();
    await page.locator(".bk-activity li", { hasText: "Running" }).first().waitFor();
    await page.getByRole("tab", { name: /^Files touched/ }).click();
    await page.locator(".pp-table td code", { hasText: "helpers.ts" }).waitFor();
    await a11y(page, `${name} person panel`);
    await page.keyboard.press("Escape");
    await page.locator(".bk-panel").waitFor({ state: "detached" });

    // Backlog: every state on the board, the blocked strip, filter and keys, and a task panel per state.
    await open(page, "Backlog");
    await page.locator(".bk-blocked", { hasText: "F-004" }).waitFor();
    for (const [column, id] of [["Inbox", "F-006"], ["Ready", "F-007"], ["In progress", "F-002"], ["In progress", "F-003"], ["Needs you", "F-005"], ["Done", "F-001"]]) {
      await page.locator(`section[aria-label="${column}"] [data-card="${id}"]`).waitFor();
    }
    await page.getByLabel("Filter tasks").fill("deposit");
    assert.equal(await page.locator("[data-card]").count(), 1, "the filter narrows the board");
    await page.getByRole("button", { name: "Clear filter" }).click();
    await a11y(page, `${name} Backlog`);
    await page.locator('[data-card="F-005"] .open').click();
    await page.getByRole("dialog", { name: "Task F-005" }).waitFor();
    await page.locator(".bk-changes .udiff .ln.add").first().waitFor();
    for (const tab of ["Summary", "Activity", "Spec", "Review"]) await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    await a11y(page, `${name} task panel (needs you)`);
    await page.getByRole("button", { name: "Send back with comments" }).click();
    await page.getByLabel("Your comments").waitFor();
    await a11y(page, `${name} send-back box`);
    await page.keyboard.press("Escape"); // the first Esc closes the box, the next the panel
    await page.keyboard.press("Escape");
    await page.locator(".bk-panel").waitFor({ state: "detached" });
    await page.locator('[data-card="F-002"] .open').click();
    await page.getByRole("heading", { name: "Second" }).waitFor();
    await page.getByRole("tab", { name: /^Activity/ }).click();
    await page.locator(".bk-activity details").first().waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".bk-panel").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Look into it" }).click(); // the blocked task explains itself
    await page.locator(".bk-card.bad", { hasText: "2 tests fail" }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".bk-panel").waitFor({ state: "detached" });

    // Every other view: it shows its own content and passes the check.
    const views: [string, string][] = [["Talk", ".chat-head .switch"], ["Team", ".status-chip.working"], ["Agents", "text=Models per role"], ["Source", ".scm, .pane"], ["Logs", ".feed li"], ["Worktrees", "text=F-005"], ["Studio", 'nav[aria-label="Files"] .fi']];
    for (const [view, locator] of views) {
      await open(page, view);
      await page.locator(locator).first().waitFor({ timeout: 15_000 });
      await a11y(page, `${name} ${view}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}
if (problems.length) { console.error(`smoke test found ${problems.length} problem(s):\n${[...new Set(problems)].join("\n")}`); process.exit(1); }
console.log("smoke ok");
