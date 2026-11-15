// Draws what gui/mdparse.ts parsed. Elements only, so a reply can never inject markup.
import { useState } from "react";
import { Icon } from "./icons";
import { type Block, type Inline, parseBlocks } from "./mdparse";

function Inlines({ c }: { c: Inline[] }) {
  return <>{c.map((n, i) => {
    switch (n.t) {
      case "text": return n.v;
      case "br": return <br key={i} />;
      case "code": return <code key={i}>{n.v}</code>;
      case "b": return <strong key={i}><Inlines c={n.c} /></strong>;
      case "i": return <em key={i}><Inlines c={n.c} /></em>;
      case "del": return <del key={i}><Inlines c={n.c} /></del>;
      case "a": return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer"><Inlines c={n.c} /></a>;
    }
  })}</>;
}

/** The code block with its language and a copy button, like the one in the Claude app. */
function Code({ lang, v }: { lang: string; v: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(v); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* the browser refused: nothing to do */ }
  };
  return (
    <figure className="md-code">
      <figcaption><span>{lang || "text"}</span><button type="button" className="quiet" onClick={copy} aria-label={done ? "Copied" : "Copy the code"}><Icon name={done ? "tick" : "copy"} size={14} />{done ? "Copied" : "Copy"}</button></figcaption>
      <pre tabIndex={0}><code>{v}</code></pre>
    </figure>
  );
}

function Blocks({ c }: { c: Block[] }) {
  return <>{c.map((b, i) => {
    switch (b.t) {
      case "p": return <p key={i}><Inlines c={b.c} /></p>;
      case "h": { const H = `h${Math.min(6, b.level + 2)}` as "h3"; return <H key={i}><Inlines c={b.c} /></H>; }
      case "hr": return <hr key={i} />;
      case "code": return <Code key={i} lang={b.lang} v={b.v} />;
      case "quote": return <blockquote key={i}><Blocks c={b.c} /></blockquote>;
      case "list": {
        const L = b.ordered ? "ol" : "ul";
        return <L key={i} start={b.ordered && b.start !== 1 ? b.start : undefined}>{b.items.map((it, j) => (
          <li key={j} className={it.task ? "task" : undefined}>
            {it.task && <input type="checkbox" checked={it.done} disabled aria-label={it.done ? "done" : "not done"} />}
            <div><Blocks c={it.c} /></div>
          </li>
        ))}</L>;
      }
      case "table": return (
        <div key={i} className="md-table" tabIndex={0} role="region" aria-label="Table">
          <table>
            <thead><tr>{b.head.map((h, j) => <th key={j} style={{ textAlign: b.align[j] }}><Inlines c={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{b.head.map((_, k) => <td key={k} style={{ textAlign: b.align[k] }}><Inlines c={r[k] ?? []} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
  })}</>;
}

export function Markdown({ text }: { text: string }) {
  return <div className="chat-md"><Blocks c={parseBlocks(text)} /></div>;
}
