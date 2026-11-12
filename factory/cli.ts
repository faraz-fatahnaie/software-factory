#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { add, move, parse, type Section } from "./backlog";
import { claudeRunner } from "./claude";
import { loadConfig } from "./config";
import { openStore } from "./events";
import { runTask, shellGate, stubRunner } from "./pipeline";
import { addSkill } from "./skills";

const cwd = process.cwd();
const backlogPath = join(cwd, "BACKLOG.md");
// Re-read before every write: a person may edit the file while a run is in flight.
const editBacklog = (fn: (text: string) => string) =>
  writeFileSync(backlogPath, fn(readFileSync(backlogPath, "utf8")));

const USAGE = `factory run [F-id] [--stub]                     run the top Ready item, or a specific one (--stub: no model calls)
factory add "<title>"                           add an item to Inbox
factory skill add <owner/repo@skill> --role <r> install a skill and attach it to a role`;

async function main([cmd, ...args]: string[]) {
  if (cmd === "add" && args[0]) {
    let id = "";
    editBacklog((t) => { const r = add(t, args.join(" ")); id = r.id; return r.text; });
    return console.log(`added ${id} to Inbox`);
  }

  if (cmd === "skill" && args[0] === "add" && args[2] === "--role") {
    addSkill(cwd, args[1]!, args[3] ?? "");
    return console.log(`attached ${args[1]} to ${args[3]}`);
  }

  if (cmd === "run") {
    const config = loadConfig(cwd);
    const id = args.find((a) => !a.startsWith("--"));
    const runner = args.includes("--stub") ? stubRunner : claudeRunner(config.gate);
    const items = parse(readFileSync(backlogPath, "utf8"));
    const item = id ? items.find((i) => i.id === id) : items.find((i) => i.section === "Ready");
    if (!item) throw new Error(id ? `no item ${id}` : "nothing under Ready");
    if (item.section === "Done" || item.section === "In progress")
      throw new Error(`${item.id} is already ${item.section.toLowerCase()}`);

    mkdirSync(join(cwd, ".factory"), { recursive: true });
    const store = openStore(join(cwd, ".factory", "events.db"));
    editBacklog((t) => move(t, item.id, "In progress"));
    console.log(`${item.id} ${item.title}`);
    const result = await runTask(item, { config, store, runner, gate: shellGate(config.gate), cwd });
    store.close();

    const to: Section = result.ok ? "Done" : "Blocked";
    editBacklog((t) => result.followUps.reduce((text, f) => add(text, f).text, move(t, item.id, to)));
    console.log(`${item.id} → ${to}${result.ok ? "" : `: ${result.error}`} (run ${result.run})`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  console.log(USAGE);
  if (cmd) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
