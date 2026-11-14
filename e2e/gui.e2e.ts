// End-to-end check of the control plane in a real browser: `bun run e2e`.
// Drives your installed Chrome (no browser download) against a throwaway repo, using dry runs
// so it makes no model calls. Not part of the gate: it needs Chrome and takes a few seconds.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { fakeGh, ghPr, repo, tmp } from "../tests/fixture";
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
  const card = (column: string, id: string) => page.locator(`section[aria-label="${column}"] [data-card]`, { hasText: id });
  const view = (name: string) => page.getByRole("navigation", { name: "Views" }).getByRole("link", { name, exact: true }).click();

  // Overview is the landing view: the connection is live and the pipeline shows the two Ready items.
  await page.locator(".link.live").waitFor();
  await page.locator(".line li", { hasText: "Queued" }).locator(".chip-id", { hasText: "F-001" }).waitFor();
  await view("Backlog");

  // Backlog: add an item, promote it.
  await page.getByRole("button", { name: "Add item" }).first().click();
  await page.getByLabel("What should be built?").fill("Ship the thing");
  await page.getByRole("group", { name: "New item priority" }).getByRole("button", { name: "P2" }).click();
  await page.getByLabel(/^Description/).fill("It must be small.");
  await page.getByRole("button", { name: "Add to Inbox" }).click();
  await card("Inbox", "F-003").getByRole("button", { name: "Promote to Ready" }).click();
  await card("Ready", "F-003").waitFor();
  assert.match(readFileSync(join(dir, "BACKLOG.md"), "utf8"), /F-003 \(P2\) Ship the thing\n  It must be small\./, "priority and description are saved with the item");

  // Pipeline: a dry run goes through all five stages and waits for a person.
  await page.getByLabel("Dry run").check();
  await card("Ready", "F-001").getByRole("button", { name: "Run", exact: true }).click();
  await card("Needs you", "F-001").waitFor({ timeout: 30_000 });

  // Review: the diff is shown, and replay steps back to the first event and returns to live.
  await card("Needs you", "F-001").getByRole("button", { name: "Review changes" }).click();
  await page.locator(".udiff .ln.add", { hasText: "stub build" }).waitFor();
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await page.getByRole("button", { name: "Replay" }).click();
  await page.getByLabel("Replay position").focus();
  await page.keyboard.press("Home");
  await page.locator(".bk-replay", { hasText: "event 1 of" }).waitFor();
  assert.equal(await page.locator(".bk-activity details").count(), 0, "replay at event 1 shows no stage yet");
  await page.keyboard.press("End");
  await page.locator(".bk-replay", { hasText: "live" }).waitFor();
  await page.getByRole("tab", { name: "Summary" }).click(); // the panel can step through tabs; Esc closes it
  await page.keyboard.press("Escape");
  await page.locator(".bk-panel").waitFor({ state: "detached" });
  await card("Needs you", "F-001").getByRole("button", { name: "Review changes" }).click();

  // Approval: lands the work on main and cleans up the worktree.
  await page.getByRole("button", { name: "Approve and land" }).click();
  await card("Done", "F-001").waitFor();
  assert.equal(section("F-001"), "Done");
  assert.ok(existsSync(join(dir, "STUB_BUILD.txt")), "the task's change is merged");
  assert.ok(!existsSync(join(dir, ".worktrees/F-001")), "the worktree is removed");

  // GitHub: with a remote, approving keeps the branch and pushes nothing. The Push button pushes and opens the pull request,
  // the Merge button merges it, and the rail says where the work stands. (A fake GitHub CLI stands in for GitHub.)
  const gh = fakeGh(), bare = tmp();
  process.env.FACTORY_GH = gh.path;
  sh("git", "init", "-q", "--bare", bare); sh("git", "remote", "add", "origin", bare);
  await view("Backlog");
  await card("Ready", "F-003").getByRole("button", { name: "Run", exact: true }).click();
  await card("Needs you", "F-003").waitFor({ timeout: 30_000 });
  await card("Needs you", "F-003").getByRole("button", { name: "Review changes" }).click();
  await page.getByRole("button", { name: "Approve and land" }).click();
  await card("Done", "F-003").waitFor();
  assert.match(sh("git", "branch", "--list", "factory/F-003").out, /factory\/F-003/, "the approved branch is kept");
  assert.equal(sh("git", "-C", bare, "branch", "--list").out, "", "nothing was pushed by approving");
  await view("Overview");
  const row = page.locator(".gh-row", { hasText: "F-003" });
  await row.getByText("Only on this machine").waitFor({ timeout: 30_000 });
  await page.locator(".link.vcs", { hasText: "1 waiting for GitHub" }).waitFor();
  await row.getByRole("button", { name: "Push" }).click();
  await row.getByText("Pushed, no pull request").waitFor(); // pushed; the fake GitHub lists no pull request yet
  assert.match(sh("git", "-C", bare, "branch", "--list").out, /factory\/F-003/, "the push went through");
  assert.match(gh.calls(), /pr create --head factory\/F-003/);
  gh.prs([ghPr(7, "F-003", "SUCCESS")]); // GitHub now lists the pull request; Sync reads it
  await page.getByRole("button", { name: "Sync" }).click();
  await row.getByText("All checks have passed").waitFor();
  await row.getByRole("button", { name: "Merge" }).click();
  await row.waitFor({ state: "detached" });
  await page.locator(".link.vcs", { hasText: "In sync with GitHub" }).waitFor();
  assert.match(gh.calls(), /pr merge 7 --merge --delete-branch/);

  // Source, as a Git tool window: an unsaved file shows in Changes with its diff; the Log picks a commit and reverts a merged task from its details.
  writeFileSync(join(dir, "notes.txt"), "one\ntwo\n");
  await view("Source");
  await page.getByRole("tab", { name: /^Changes/ }).click();
  await page.getByRole("button", { name: /notes\.txt/ }).click();
  await page.locator(".udiff .ln.add", { hasText: "two" }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator(".udiff .ln.add").count(), 2, "both new lines are shown as added");
  await page.getByRole("complementary", { name: "Changed files" }).getByText("+2").waitFor();
  Bun.spawnSync(["rm", join(dir, "notes.txt")]);
  await page.getByRole("tab", { name: "Log" }).click();
  // Search: "/" focuses the box, typing narrows the graph across the whole history to the matching commits, Escape brings everything back.
  await page.locator(".g-row").first().waitFor();
  const everything = await page.locator(".g-row").count();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await page.keyboard.type("Merge F-001");
  await page.getByRole("status").filter({ hasText: "1 match" }).waitFor();
  assert.equal(await page.locator(".g-row").count(), 1, "only the merge commit matches");
  await page.locator(".g-msg mark", { hasText: "Merge F-001" }).waitFor();
  await page.getByLabel("Search commits").press("Escape");
  await page.waitForFunction((n) => document.querySelectorAll(".g-row").length === n, everything);
  await page.getByRole("button", { name: /Merge F-001: First/ }).click();
  const details = page.getByRole("region", { name: "Commit details" });
  await details.getByRole("heading", { name: "Merge F-001: First" }).waitFor();
  await details.getByRole("tree", { name: "Files in this commit" }).getByText("STUB_BUILD.txt").waitFor();
  await details.getByRole("button", { name: "Revert F-001" }).click(); // the dialog is accepted above
  await page.getByRole("complementary", { name: "Branches" }).getByText("A revert, only here").waitFor();
  assert.match(sh("git", "branch", "--list", "factory/F-001").out, /factory\/F-001/);
  assert.equal(sh("git", "rev-parse", "--abbrev-ref", "HEAD").out, "main", "the checkout did not move");
  await view("Overview");
  await page.locator(".gh-row", { hasText: "F-001" }).getByText("Revert", { exact: true }).waitFor();

  // Models: a change is validated and written to the config file.
  await view("Agents");
  await page.getByRole("button", { name: /^builder model/ }).click();
  await page.getByRole("option", { name: /^opus/ }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Saved to factory.config.json").waitFor();
  assert.equal(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")).roles.builder.model, "opus");

  // Studio: attach a skill to a role, and edit the rules file; both are commits.
  await view("Studio");
  await page.getByRole("button", { name: /Kofi/ }).click();
  await page.getByRole("button", { name: "+ tdd" }).click();
  await page.getByRole("button", { name: "Detach tdd from builder" }).waitFor();
  // Skill search (answered here, not by skills.sh): results with a count, ten at a time, an inline yes before install, and a way to clear.
  const many = Array.from({ length: 12 }, (_, i) => ({ pkg: `acme/skills@lint-${i}`, installs: "1K", url: `https://skills.sh/acme/skills/lint-${i}` }));
  await page.route("**/api/skills/search?q=*", (route) => route.fulfill({ json: many }));
  const search = page.getByRole("searchbox").or(page.getByLabel("Search skills.sh"));
  assert.equal(await page.getByRole("button", { name: "Search", exact: true }).isDisabled(), true, "needs two letters");
  await search.fill("lint");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("12 results for “lint”").waitFor();
  assert.equal(await page.locator(".results li").count(), 10);
  await page.getByRole("button", { name: /Show 2 more/ }).click();
  assert.equal(await page.locator(".results li").count(), 12);
  await page.locator(".results li").first().getByRole("button", { name: "Install" }).click();
  await page.getByRole("alert").filter({ hasText: "third-party instructions" }).waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();
  await search.press("Escape");
  await page.locator(".results").waitFor({ state: "detached" });
  assert.equal(await search.inputValue(), "");
  // Editing the rules: changes show at once, can be thrown away (asked in place), and saving takes two checks.
  await page.getByRole("button", { name: /^AGENTS\.md/ }).click();
  await page.getByLabel("Contents of AGENTS.md").fill("# Rules\n\nBe loud.\n");
  await page.getByText(/lines? changed/).waitFor();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByText(/Throw away/).waitFor();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await page.getByRole("button", { name: /Kofi/ }).click(); // leaving with changes asks first
  await page.getByText("AGENTS.md has changes that are not saved.").waitFor();
  await page.getByRole("button", { name: "Stay here" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click(); // the confirmation
  assert.equal(await page.getByLabel("Contents of AGENTS.md").inputValue(), "# Rules\n", "thrown away: back to the last commit");
  await page.getByLabel("Contents of AGENTS.md").fill("# Rules\n\nBe brief.\n");
  await page.getByRole("button", { name: "Review changes" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Review what will change").waitFor();
  assert.match(await dialog.locator(".udiff").innerText(), /Be brief/);
  await dialog.getByRole("button", { name: "Continue to commit" }).click();
  assert.equal(sh("git", "log", "-1", "--format=%s").out, "skills: attach tdd for builder", "nothing is written before the second check");
  await dialog.getByRole("textbox", { name: /Commit message/ }).fill("rules: shorter");
  await dialog.getByRole("button", { name: "Commit changes" }).click();
  await page.getByText("Committed").first().waitFor();
  assert.deepEqual(sh("git", "log", "-2", "--format=%s").out.split("\n"), ["rules: shorter", "skills: attach tdd for builder"]);
  assert.equal(sh("git", "status", "--porcelain", "--", ".claude", "AGENTS.md").out, "", "nothing left uncommitted");
  // History and restore: the old version fills the editor and goes through the same two checks.
  await page.getByRole("tab", { name: "Preview" }).click();
  assert.match(await page.getByRole("article", { name: "Preview" }).innerText(), /Be brief/);
  await page.getByRole("tab", { name: /^History/ }).click();
  await page.getByText("Viewing an older version").waitFor();
  await page.getByRole("button", { name: "Restore this version" }).click();
  await page.getByText(/lines? changed/).waitFor();
  assert.equal(await page.getByLabel("Contents of AGENTS.md").inputValue(), "# Rules\n");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();

  // Cost and Worktrees render from the same data.
  await view("Agents");
  await page.getByText("By model").waitFor();
  await view("Logs");
  await page.locator(".logs .feed li", { hasText: "Approved: " }).first().waitFor();
  // The theme switch flips the page and is remembered.
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), before);
  assert.equal(await page.evaluate(() => localStorage.getItem("factory-theme")), before === "dark" ? "light" : "dark");
  await view("Worktrees");
  await page.getByText("No task worktrees").waitFor();

  // The command palette: Ctrl+K opens it from anywhere, a check runs in it and its output is shown, and Bix is offered to explain it (no model is called here).
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.getByRole("combobox", { name: "Type a command or search" }).fill("setup");
  await page.keyboard.press("Enter");
  await page.locator(".pal .out", { hasText: "git repository" }).waitFor();
  await page.getByRole("button", { name: "Explain with Bix" }).waitFor();
  await page.keyboard.press("Escape"); // back to the list
  await page.getByRole("combobox", { name: "Type a command or search" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "detached" });
  // Health: quick free checks on Overview and a chip in the rail.
  await view("Overview");
  await page.getByRole("article", { name: "Health" }).waitFor();

  // Talk: the conversations are listed (no model is called here), and a conversation needs your first message.
  await view("Talk");
  await page.getByRole("button", { name: /Brainstorm an idea/ }).click();
  await page.getByRole("button", { name: "Start this conversation" }).waitFor();
  await page.getByRole("button", { name: /Bix.*Ask about the factory/ }).waitFor(); // the Guide is its own person, last in the list
  // Suggested replies are a per-person switch: on for the Product Partner, and saved to the config when changed.
  const suggest = page.getByRole("switch", { name: "Suggest replies" });
  assert.equal(await suggest.isChecked(), true, "on by default for the Product Partner");
  await suggest.click(); // the switch follows the saved setting, so it flips when the server has answered
  await page.waitForFunction(() => !(document.querySelector('input[role="switch"]') as HTMLInputElement | null)?.checked);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")).chat, { suggest: { "product-partner": false } });

  // Team: a change is previewed with its cost and not saved until you say so; saving commits it.
  await view("Team");
  await page.locator(".role").first().waitFor();
  assert.equal(await page.locator(".role").count(), 9, "the balanced team has nine roles");
  await page.getByRole("button", { name: /^Lean/ }).click();
  await page.locator(".draft", { hasText: "switch to the lean team" }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".role").length === 6);
  assert.equal(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")).team, undefined, "a preview writes nothing");
  await page.getByRole("button", { name: "Save to project" }).click();
  await page.locator(".draft").waitFor({ state: "detached" });
  assert.equal(JSON.parse(readFileSync(join(dir, "factory.config.json"), "utf8")).team.preset, "lean");
  assert.match(sh("git", "log", "-1", "--format=%s").out, /team use lean/);
  // A move that breaks a rule is refused with the reason, and the draft stays empty.
  await page.getByRole("button", { name: /^Hand C1 / }).click();
  await page.getByRole("option", { name: /Builder/ }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".draft").count(), 0);

  assert.equal(refusals, 1, "exactly the one expected refusal");
  assert.deepEqual(errors, [], "no browser console errors");
  console.log("e2e ok");
} finally {
  await browser.close();
  server.stop(true);
}
