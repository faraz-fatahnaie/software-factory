// A smoke test of the whole control plane: `bun run smoke`.
// A throwaway project is filled with every state (running, quiet, blocked, waiting for you, done), then every view is opened
// at a desktop and at a phone width. Each must show what it should, raise no console error, and pass an accessibility check (axe).
// It makes no model calls. Needs Chrome, like `bun run e2e`.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { repo, seedStates } from "../tests/fixture";
import { serve } from "../plugin/engine/server";

const { dir, cli } = repo();
seedStates(dir, cli);
// A stand-in for the claude command for the Talk checks: one command with its output, then a reply that uses every kind of Markdown. It waits a moment so the box can be used while a reply is on its way.
const bin = join(dir, ".factory", "fakebin");
mkdirSync(bin, { recursive: true });
const REPLY = "## Plan\\n\\nHere is **bold**, `code` and a [link](https://example.com).\\n\\n- one\\n- two\\n\\n| A | B |\\n|---|---|\\n| 1 | 2 |\\n\\n```ts\\nconst x = 1;\\n```\\n\\nسلام، این یک پیام فارسی است.";
writeFileSync(join(bin, "claude"), `#!/bin/sh
sleep 1.5
case "$2" in "/compact"*) printf '%s\\n' '{"type":"system","subtype":"compact_boundary","compact_metadata":{"pre_tokens":148000,"post_tokens":9000}}' '{"type":"result","subtype":"success","is_error":false,"result":"","session_id":"11111111-2222-3333-4444-555555555555","total_cost_usd":0.01,"usage":{}}'; exit 0;; esac
printf '%s\\n' '{"type":"assistant","message":{"model":"claude-x","usage":{"input_tokens":10,"cache_read_input_tokens":140000,"cache_creation_input_tokens":7990,"output_tokens":0},"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"git status"}}]}}'
printf '%s\\n' '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"On branch main\\nnothing to commit"}]}}'
printf '%s\\n' '{"type":"result","subtype":"success","is_error":false,"result":"${REPLY}","session_id":"11111111-2222-3333-4444-555555555555","total_cost_usd":0.01,"usage":{},"modelUsage":{"claude-x":{"contextWindow":200000}}}'
`);
chmodSync(join(bin, "claude"), 0o755);
process.env.PATH = `${bin}:${process.env.PATH}`;
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

    // The Technical Manager's strip: her state, what she decided last, and the limits she works within.
    const strip = page.getByRole("article", { name: "Technical Manager" });
    await strip.waitFor();
    await strip.getByRole("button", { name: /what she decided/ }).waitFor(); // her decisions arrive with the event stream
    assert.match(await strip.innerText(), /on autopilot/);
    if (name === "desktop") { // the one-time notice: shown until answered, and gone for good after
      await strip.getByRole("region", { name: "About autopilot" }).waitFor();
      await a11y(page, `${name} autopilot notice`);
      await strip.getByRole("button", { name: "Keep autopilot" }).click();
      await strip.getByRole("region", { name: "About autopilot" }).waitFor({ state: "detached" });
    }
    assert.match(await strip.innerText(), /of \$25 today/);
    await strip.getByRole("button", { name: /what she decided/ }).click();
    assert.ok((await strip.locator(".decisions li").count()) >= 2, `${name}: her decisions are listed`);
    await a11y(page, `${name} manager strip`);

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
    await page.getByRole("tab", { name: "Summary" }).click();
    await page.getByRole("heading", { name: /main has 1 new commit/ }).waitFor();
    await page.getByLabel("What the manager says").getByText(/F-005 is ready for your decision/).waitFor(); // what was checked before the handover (M14)
    await page.getByRole("button", { name: "Update this task" }).waitFor();
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
    await page.getByLabel("What the manager says").getByText(/deposit total/).waitFor(); // her explanation is on the task itself
    await page.getByRole("button", { name: "Send guidance" }).click(); // a blocked task with a spec can be continued with guidance
    const guide = page.getByRole("region", { name: "Send guidance" });
    await guide.getByLabel("Your comments").waitFor();
    await a11y(page, `${name} send guidance`);
    await guide.getByRole("button", { name: "Cancel" }).click();
    await guide.waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
    await page.locator(".bk-panel").waitFor({ state: "detached" });

    // Every other view: it shows its own content and passes the check.
    const views: [string, string][] = [["Talk", ".chat-head .switch"], ["Team", ".status-chip.working"], ["Agents", "text=Models per role"], ["Source", ".scm, .pane"], ["Logs", ".feed li"], ["Worktrees", "text=F-005"], ["Studio", 'nav[aria-label="Files"] .fi']];
    for (const [view, locator] of views) {
      await open(page, view);
      await page.locator(locator).first().waitFor({ timeout: 15_000 });
      await a11y(page, `${name} ${view}`);
    }

    // Team: what she may do by herself, changed and saved.
    await open(page, "Team");
    await page.getByRole("region", { name: /may do by herself/ }).waitFor();
    await page.getByLabel("Assist", { exact: false }).first().click();
    await page.waitForFunction(async () => (await (await fetch("/api/manager")).json()).settings.autonomy === "assist");
    await page.getByLabel(/Spend limit per day/).fill("40");
    await page.getByRole("button", { name: "Save limits" }).click();
    await page.getByText("Saved", { exact: true }).waitFor();
    await a11y(page, `${name} manager settings`);
    await page.getByLabel("Autopilot", { exact: false }).first().click();
    await page.waitForFunction(async () => (await (await fetch("/api/manager")).json()).settings.autonomy === "autopilot");
    await page.evaluate(() => fetch("/api/manager", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perDay: 25 }) })); // back to the default for the next width

    // Talk: a long message makes the box taller; files attach by button and by drop; the box stays open while a reply is coming;
    // the reply is drawn as Markdown and its command is a collapsed step that opens to its output.
    await open(page, "Talk");
    const box = page.getByRole("textbox", { name: "Your message" });
    const before = (await box.boundingBox())!.height;
    await box.fill(Array(12).fill("a long line of text").join("\n"));
    assert.ok((await box.boundingBox())!.height > before * 2, `${name}: the message box grows with a long message`);
    await box.fill("a draft I did not send");
    await open(page, "Overview"); // leaving the page and coming back keeps what was typed
    await open(page, "Talk");
    assert.equal(await box.inputValue(), "a draft I did not send", `${name}: the unsent message survives leaving the tab`);
    await box.fill("");
    await page.locator('input[type="file"]').setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
    await page.locator(".tray .chip-file.pic").waitFor();
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["x"], "notes.md")); document.querySelector(".chat")!.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true })); });
    await page.locator(".drop-hint").waitFor();
    await a11y(page, `${name} Talk dropping`);
    await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(["# notes"], "notes.md")); document.querySelector(".chat")!.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); });
    await page.locator(".tray .chip-file", { hasText: "notes.md" }).waitFor();
    await page.locator(".drop-hint").waitFor({ state: "detached" });
    await box.fill("Please look");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await box.fill("a second thought"); // typing while the reply is on its way
    assert.equal(await box.inputValue(), "a second thought");
    await page.locator(".run-steps").first().waitFor({ timeout: 20_000 });
    assert.equal(await page.locator(".run-steps .run-step pre.out").first().isVisible(), false, `${name}: steps start folded`);
    await page.locator(".run-steps > summary").first().click();
    await page.locator(".run-step > summary").first().click();
    await page.locator(".run-step pre.out", { hasText: "nothing to commit" }).waitFor();
    await page.locator(".chat-md h4", { hasText: "Plan" }).waitFor();
    assert.equal(await page.locator(".chat-md p", { hasText: "فارسی" }).evaluate((e) => getComputedStyle(e).direction), "rtl", `${name}: Persian text reads right to left`);
    assert.equal(await page.locator(".chat-md p", { hasText: "Here is" }).evaluate((e) => getComputedStyle(e).direction), "ltr");
    await page.locator(".chat-md table td", { hasText: "2" }).waitFor();
    await page.locator(".md-code", { hasText: "const x = 1;" }).waitFor();
    await page.locator('.chat-md a[href="https://example.com"]').waitFor();
    await page.locator(".chat-head .ctx.warn", { hasText: "74% of context" }).waitFor(); // how full the conversation is, amber from 70%
    assert.match(await page.locator(".chat-head .ctx").getAttribute("title") ?? "", /148k of 200k tokens/);
    await a11y(page, `${name} Talk reply`);
    // Long: a hint offers to compact. Typed commands: an unknown one is not sent, /compact (with what to keep) leaves a divider and dims what is above it.
    await page.locator(".ctx-hint").getByRole("button", { name: "Compact" }).waitFor();
    const draft = await box.inputValue();
    // Typing a slash suggests the commands; what follows narrows them loosely; the keyboard chooses, completes and closes.
    await box.fill("/");
    const list = page.getByRole("listbox", { name: "Commands" });
    assert.deepEqual(await list.getByRole("option").locator(".cmd").allTextContents(), ["/compact", "/clear"]);
    assert.equal(await box.getAttribute("aria-activedescendant"), "slash-compact");
    await a11y(page, `${name} Talk commands`);
    await box.press("ArrowDown");
    assert.equal(await list.getByRole("option", { selected: true }).locator(".cmd").textContent(), "/clear");
    await box.press("Escape");
    await list.waitFor({ state: "detached" });
    await box.fill("/help");
    await list.getByText("No matching commands").waitFor();
    await box.press("Enter");
    await page.getByRole("alert").filter({ hasText: "/help is not a command here" }).waitFor();
    await box.fill("/pact"); // loose: the letters in order are enough
    assert.deepEqual(await list.getByRole("option").locator(".cmd").allTextContents(), ["/compact"]);
    await box.press("Tab");
    assert.equal(await box.inputValue(), "/compact ", `${name}: Tab completes the command, ready for what to keep`);
    await list.waitFor({ state: "detached" });
    await box.pressSequentially("keep the plan");
    await box.press("Enter");
    await page.locator(".compacted", { hasText: "Compacted · 148k → 9k tokens" }).waitFor({ timeout: 20_000 });
    await page.locator(".chat-head .ctx", { hasText: "5% of context" }).waitFor();
    assert.ok(await page.locator(".bubble.old").count() >= 2, `${name}: what the agent now holds as a summary is shown quieter`);
    assert.equal(await page.locator(".ctx-hint").count(), 0, `${name}: the hint is gone once compacted`);
    await a11y(page, `${name} Talk compacted`);
    await box.fill(draft);

    // A reload keeps the conversation; Stop ends a reply that is coming; New conversation clears it after asking.
    await page.reload();
    await open(page, "Talk");
    await page.locator(".chat-md h4", { hasText: "Plan" }).waitFor();
    assert.equal(await box.inputValue(), "a second thought", `${name}: the unsent message is still there too`);
    await box.fill("stop this one");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByRole("button", { name: "Stop" }).click();
    await page.locator(".bubble.team", { hasText: "Stopped." }).waitFor({ timeout: 5000 });
    await box.fill("/cl"); // Enter on a suggestion runs it: the typed command asks the same question as the Clear button
    await box.press("Enter");
    await a11y(page, `${name} Talk clearing`);
    await page.getByRole("button", { name: "Yes, clear it" }).click();
    await page.getByRole("button", { name: "Start this conversation" }).waitFor();
    assert.equal(await page.locator(".bubble.you").count(), 0, `${name}: the conversation is cleared`);
    await page.reload();
    await open(page, "Talk");
    await page.getByRole("button", { name: "Start this conversation" }).waitFor(); // and it stays cleared
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}
if (problems.length) { console.error(`smoke test found ${problems.length} problem(s):\n${[...new Set(problems)].join("\n")}`); process.exit(1); }
console.log("smoke ok");
