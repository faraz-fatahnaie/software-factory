// The health signal: a few quick, free checks of the project, as a strip on Overview and a chip in the rail. No model is called.
import { useState } from "react";
import type { HealthData } from "./data";
import { Icon } from "./icons";
import { agoShort } from "./commitgraph";

export function healthChip(h: HealthData | null): { tone: "ok" | "warn" | "bad" | "off"; text: string; title: string } {
  if (!h) return { tone: "off", text: "Checking health…", title: "Quick checks of the project" };
  const bad = h.checks.filter((c) => c.state === "bad").length, warn = h.checks.filter((c) => c.state === "warn").length;
  if (bad) return { tone: "bad", text: "Needs attention", title: h.checks.find((c) => c.state === "bad")!.title };
  if (warn) return { tone: "warn", text: warn === 1 ? "1 thing to look at" : `${warn} things to look at`, title: h.checks.find((c) => c.state === "warn")!.title };
  return { tone: "ok", text: "Healthy", title: "Setup complete, no secrets, nothing waiting too long" };
}

const MARK = { ok: "✓", warn: "!", bad: "✗" } as const;

/** Healthy folds to one line; anything else opens to say what and why. */
export function HealthStrip({ health, recheck, explain }: { health: HealthData | null; recheck: () => Promise<void>; explain: (title: string, detail: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!health) return null;
  const chip = healthChip(health), healthy = chip.tone === "ok", show = !healthy || open;
  const again = async () => { setBusy(true); await recheck(); setBusy(false); };
  return (
    <article className={`tile health ${chip.tone}`} aria-label="Health">
      <header>
        <Icon name={healthy ? "check" : "x"} size={20} />
        <div className="grow"><h2>{healthy ? "Healthy" : chip.text}</h2><span className="note">Checked {agoShort(health.checkedAt)} ago, with no model</span></div>
        {healthy && <button className="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Details"}</button>}
        <button onClick={again} disabled={busy}>{busy ? "Checking…" : "Check again"}</button>
      </header>
      {show && (
        <ul>
          {health.checks.map((c) => (
            <li key={c.id} className={c.state}>
              <span className="mark" aria-hidden="true">{MARK[c.state]}</span>
              <span className="grow"><span className="what">{c.title}</span><span className="note">{c.detail}</span></span>
              {c.state !== "ok" && <button onClick={() => explain(c.title, c.detail)}>Explain</button>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
