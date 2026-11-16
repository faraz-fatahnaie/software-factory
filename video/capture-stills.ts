// Captures real dashboard stills for the video: `bun video/capture-stills.ts`. Dev tooling, not part of the product.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { repo, seedStates } from "../tests/fixture";
import { serve } from "../plugin/engine/server";

const { dir, cli } = repo();
seedStates(dir, cli);
const bl = join(dir, "BACKLOG.md");
const TASK = "Deposit payment link on each order"; // the scenario's task
const rename = (from: string, to: string) => writeFileSync(bl, readFileSync(bl, "utf8").replace(from, to));
rename("Second", TASK); // the build shot shows the scenario's task; it is renamed back for the board
const server = await serve(dir, 0);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = join(import.meta.dir, "stills");
const meta: Record<string, unknown> = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.port}/#overview`);
  await page.locator(".link.live").waitFor();
  const shot = (name: string) => page.screenshot({ path: join(out, `${name}.png`) });
  const open = async (view: string) => { await page.evaluate((h) => { location.hash = h; }, `#${view}`); await page.waitForTimeout(900); };

  // Overview, with the manager's strip: the landing page's hero is cut from this one (the rail's 232px off the left, as a JPEG).
  await page.locator(".tile.manager").waitFor(); await page.waitForTimeout(900); await shot("overview");

  // Talk, with her sentence in the box (the wipe in the video types it).
  await open("talk");
  const box = page.locator("textarea").first();
  await shot("talk-empty");
  await box.fill("Customers should pay a deposit by link.");
  await shot("talk");
  meta.talk = await typing(box);

  await open("team"); await page.waitForTimeout(600); await shot("team");

  await open("backlog");
  await page.locator('[data-card="F-002"] .open').click();
  await page.getByRole("dialog", { name: "Task F-002" }).waitFor(); await page.waitForTimeout(900); await shot("building");
  await page.keyboard.press("Escape"); rename(TASK, "Second"); rename("Order status page", TASK); await page.waitForTimeout(2600);

  await page.locator('[data-card="F-005"] .open').click();
  await page.getByRole("dialog", { name: "Task F-005" }).waitFor();
  await page.getByRole("tab", { name: "Summary" }).click(); await page.waitForTimeout(900); await shot("waiting");
  meta.update = await page.getByRole("button", { name: "Update this task" }).boundingBox();

  await page.getByRole("button", { name: "Send back with comments" }).click();
  const fb = page.getByLabel("Your comments");
  await page.waitForTimeout(400); await shot("sendback-empty");
  await fb.fill("Make the deposit 30% of the total, not half.");
  await page.waitForTimeout(500); await shot("sendback");
  meta.sendback = await typing(fb);
  meta.approve = await page.getByRole("button", { name: "Approve and land" }).boundingBox();
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  meta.approveWaiting = await page.getByRole("button", { name: "Approve and land" }).boundingBox();
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  await shot("board");
  await page.locator('[data-card="F-005"] .open').click();
  await page.getByRole("button", { name: "Approve and land" }).click();
  await page.locator('section[aria-label="Done"] [data-card]', { hasText: "F-005" }).waitFor();
  await page.waitForTimeout(900); await shot("landed");
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 1));
} finally { await browser.close(); server.stop(); }

/** Where the text sits in a box, so the video can wipe it in from the left like typing. */
async function typing(box: import("playwright-core").Locator) {
  return box.evaluate((el: HTMLTextAreaElement) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), c = document.createElement("canvas").getContext("2d")!;
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const x = r.x + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    return { x: r.x, y: r.y, w: r.width, h: r.height, textX: x, textW: c.measureText(el.value).width, bg: cs.backgroundColor };
  });
}
