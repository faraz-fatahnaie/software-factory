// Checks the landing page in a real browser: `bun run site`. Serves site/ locally, scrolls through it at desktop and phone width,
// with and without reduced motion, and fails on a console error, a failed request for the page's own files, or an accessibility violation (axe).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

const dir = join(import.meta.dir, "../site");
const server = Bun.serve({ port: 0, async fetch(req) {
  const p = new URL(req.url).pathname;
  const f = Bun.file(join(dir, p.endsWith("/") ? `${p}index.html` : p)); // like any static host, a folder serves its index.html
  return (await f.exists()) ? new Response(f) : new Response("not found", { status: 404 });
} });
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const problems: string[] = [];
const shots = process.env.SHOTS;

async function a11y(page: Page, where: string) {
  await page.addScriptTag({ content: axe });
  const res = await page.evaluate(async () => (await (globalThis as any).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v: any) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ")}`));
  for (const v of res) problems.push(`${where}: ${v}`);
}

try {
  for (const [name, size, reduced] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844 }, false], ["desktop reduced motion", { width: 1440, height: 900 }, true]] as const) {
    const ctx = await browser.newContext({ viewport: size, reducedMotion: reduced ? "reduce" : "no-preference" });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://127.0.0.1:${server.port}` });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${name}: page error ${e}`));
    page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_/.test(m.text())) problems.push(`${name}: console error ${m.text()}`); });
    page.on("response", (r) => { if (r.url().startsWith(`http://127.0.0.1:${server.port}`) && r.status() >= 400 && !r.url().endsWith("/favicon.ico")) problems.push(`${name}: ${r.status()} ${r.url()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);

    // Hero: the sentence types itself, and the terminal ends on the wait for her yes.
    await page.locator("[data-type]").filter({ hasText: "Customers should pay a deposit by link." }).waitFor({ timeout: 8000 });
    await page.locator(".t3.show").waitFor({ timeout: 8000 });
    if (shots) await page.screenshot({ path: join(shots, `${name}-hero.png`) });

    // How it works: scrolling through the pinned section walks the steps and ends with the change landing on main.
    const how = page.locator("[data-how]");
    const box = await how.evaluate((el) => ({ top: el.getBoundingClientRect().top + scrollY, h: el.getBoundingClientRect().height }));
    const at = async (f: number) => { await page.evaluate((y) => scrollTo(0, y), box.top + f * (box.h - size.height)); await page.waitForTimeout(250); };
    if (!reduced) {
      await at(0.3);
      assert.ok((await page.locator(".steps li.on").count()) >= 2 && (await page.locator(".steps li.on").count()) <= 4, `${name}: the steps light up as you scroll`);
      if (shots) await page.screenshot({ path: join(shots, `${name}-how-mid.png`) });
    }
    await at(1);
    assert.equal(await page.locator(".steps li.on").count(), 7, `${name}: all seven steps are lit at the end`);
    await page.locator("[data-log]").getByText("landed on main").waitFor();
    if (shots) await page.screenshot({ path: join(shots, `${name}-how-end.png`) });

    // Everything else comes into view, the limits type themselves, and copy works.
    for (const id of ["features", "control", "install", "docs"]) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded(); await page.evaluate((i) => document.getElementById(i)!.scrollIntoView(), id); await page.waitForTimeout(900);
      if (shots) await page.screenshot({ path: join(shots, `${name}-${id}.png`) });
    }
    await page.locator("[data-cfg]").getByText('"builder"').waitFor({ timeout: 8000 });
    await page.locator("#install").scrollIntoViewIfNeeded();
    await page.locator("button.code").first().click();
    await page.locator("button.code.ok").first().waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "/plugin marketplace add faraz-fatahnaie/software-factory");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no sideways scroll`);
    await page.evaluate(() => { document.querySelectorAll(".rv").forEach((e) => e.classList.add("in")); });
    await page.waitForTimeout(900);
    await a11y(page, name);

    // Every link on the page leads somewhere: local pages and anchors exist, and the GitHub link is the public repository.
    const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    for (const href of new Set(links)) {
      if (href.startsWith("http")) { assert.ok(href.startsWith("https://github.com/faraz-fatahnaie/software-factory"), `${name}: unexpected external link ${href}`); continue; }
      if (href.startsWith("#")) { assert.ok(await page.$(href), `${name}: no element for ${href}`); continue; }
      assert.equal((await fetch(`http://127.0.0.1:${server.port}/${href.split("#")[0]}`)).status, 200, `${name}: ${href} does not load`);
    }
    await ctx.close();
  }

  // The documentation pages: they load, read well at both widths, pass axe, and every link and anchor in them works.
  for (const [name, size] of [["docs desktop", { width: 1440, height: 900 }], ["docs phone", { width: 390, height: 844 }]] as const) {
    for (const file of ["docs/", "docs/runbook.html"]) {
      const page = await browser.newPage({ viewport: size });
      page.on("pageerror", (e) => problems.push(`${name} ${file}: page error ${e}`));
      page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_/.test(m.text())) problems.push(`${name} ${file}: console error ${m.text()}`); });
      await page.goto(`http://127.0.0.1:${server.port}/${file}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} ${file}: no sideways scroll`);
      assert.ok((await page.locator(".doc h2").count()) >= 5, `${name} ${file}: has sections`);
      await a11y(page, `${name} ${file}`);
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
      for (const href of new Set(hrefs)) {
        if (href.startsWith("http")) { assert.ok(href.startsWith("https://"), `${file}: external link without https ${href}`); continue; } // the docs point to bun.sh, Claude Code and so on
        if (href.startsWith("#")) { assert.ok(await page.$(`[id="${href.slice(1)}"]`), `${file}: no element for ${href}`); continue; }
        const [path, hash] = href.split("#"), url = new URL(path || file, `http://127.0.0.1:${server.port}/${file}`);
        const res = await fetch(url);
        assert.equal(res.status, 200, `${file}: ${href} does not load`);
        if (hash && url.pathname.endsWith(".html")) assert.ok((await res.text()).includes(`id="${hash}"`), `${file}: ${href} has no target`);
      }
      if (shots) await page.screenshot({ path: join(shots, `${name.replace(" ", "-")}-${file.replace(/\W/g, "")}.png`) });
      await page.close();
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
  console.log("site ok");
} finally { await browser.close(); server.stop(); }
