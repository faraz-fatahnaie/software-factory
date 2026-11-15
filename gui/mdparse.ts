// A small Markdown reader for what the team writes in a conversation: headings, lists (nested, with tasks), tables, quotes,
// fenced code, rules, and the usual inline marks. It builds a tree, never HTML, so nothing a reply contains can run as markup.
// Line breaks inside a paragraph are kept (chat style). Links are limited to http, https and mailto.

export type Inline =
  | { t: "text"; v: string } | { t: "code"; v: string } | { t: "br" }
  | { t: "b" | "i" | "del"; c: Inline[] } | { t: "a"; href: string; c: Inline[] };
export type Block =
  | { t: "p"; c: Inline[] } | { t: "h"; level: number; c: Inline[] } | { t: "hr" }
  | { t: "code"; lang: string; v: string } | { t: "quote"; c: Block[] }
  | { t: "list"; ordered: boolean; start: number; items: { task?: boolean; done?: boolean; c: Block[] }[] }
  | { t: "table"; head: Inline[][]; align: ("left" | "center" | "right" | undefined)[]; rows: Inline[][][] };

const SAFE = /^(https?:\/\/|mailto:)/i;
// One pass over the text: escapes, code, links, <autolinks>, bare links, bold, strike, italic.
const MARKS = /\\([\\`*_{}[\]()#+\-.!|~>])|(`+)(?!`)([\s\S]*?[^`])\2(?!`)|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])|\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__|~~(?=\S)([\s\S]*?\S)~~|\*(?=[^\s*])([\s\S]*?[^\s*])\*|(?<!\w)_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)|\n/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  const text = (v: string) => { if (v) out.push({ t: "text", v }); };
  for (const m of s.matchAll(MARKS)) {
    text(s.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1]) text(m[1]);
    else if (m[3] !== undefined) out.push({ t: "code", v: m[3]!.replace(/^ (.*) $/, "$1") });
    else if (m[4] !== undefined) out.push(SAFE.test(m[5]!) ? { t: "a", href: m[5]!, c: parseInline(m[4]) } : { t: "text", v: m[0] });
    else if (m[6] || m[7]) out.push({ t: "a", href: (m[6] ?? m[7])!, c: [{ t: "text", v: (m[6] ?? m[7])! }] });
    else if (m[8] ?? m[9]) out.push({ t: "b", c: parseInline((m[8] ?? m[9])!) });
    else if (m[10]) out.push({ t: "del", c: parseInline(m[10]) });
    else if (m[11] ?? m[12]) out.push({ t: "i", c: parseInline((m[11] ?? m[12])!) });
    else out.push({ t: "br" });
  }
  text(s.slice(at));
  return out;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const RULE = /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/;
const SEPARATOR = /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const startsBlock = (l: string) => FENCE.test(l) || /^ {0,3}#{1,6}\s/.test(l) || /^ {0,3}>/.test(l) || RULE.test(l) || ITEM.test(l);

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n"), out: Block[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }

    const f = FENCE.exec(line);
    if (f) {
      const body: string[] = [];
      for (i++; i < lines.length && !new RegExp(`^ {0,3}${f[1]![0]}{${f[1]!.length},}\\s*$`).test(lines[i]!); i++) body.push(lines[i]!);
      i++; // the closing fence; a reply cut off before it still shows its code
      out.push({ t: "code", lang: f[2] ?? "", v: body.join("\n") });
      continue;
    }
    const h = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { out.push({ t: "h", level: h[1]!.length, c: parseInline(h[2]!) }); i++; continue; }
    if (RULE.test(line)) { out.push({ t: "hr" }); i++; continue; }

    if (/^ {0,3}>/.test(line)) {
      const body: string[] = [];
      for (; i < lines.length && /^ {0,3}>/.test(lines[i]!); i++) body.push(lines[i]!.replace(/^ {0,3}> ?/, ""));
      out.push({ t: "quote", c: parseBlocks(body.join("\n")) });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && SEPARATOR.test(lines[i + 1]!) && lines[i + 1]!.includes("-") && cells(line).length === cells(lines[i + 1]!).length) {
      const align = cells(lines[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : undefined));
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i]!.trim() && lines[i]!.includes("|"); i++) rows.push(cells(lines[i]!).map(parseInline));
      out.push({ t: "table", head: cells(line).map(parseInline), align, rows });
      continue;
    }
    const li = ITEM.exec(line);
    if (li && !RULE.test(line)) {
      const ordered = /\d/.test(li[2]!), base = li[1]!.length, items: { task?: boolean; done?: boolean; c: Block[] }[] = [];
      const start = ordered ? parseInt(li[2]!, 10) : 1;
      while (i < lines.length) {
        const m = ITEM.exec(lines[i]!);
        if (!m || m[1]!.length > base + 1 || /\d/.test(m[2]!) !== ordered || RULE.test(lines[i]!)) break;
        const inner = m[1]!.length + m[2]!.length + 1, body = [m[3]!];
        for (i++; i < lines.length; i++) {
          const l = lines[i]!;
          if (!l.trim()) { // a blank line stays inside the item only when what follows is indented under it
            const next = lines.slice(i + 1).find((x) => x.trim());
            if (next && /^ */.exec(next)![0].length > base + 1) { body.push(""); continue; }
            break;
          }
          const indent = /^ */.exec(l)![0].length;
          if (indent > base + 1 || (indent > base && !ITEM.test(l))) body.push(l.slice(Math.min(indent, inner)));
          else if (!startsBlock(l) && indent > base) body.push(l.trim());
          else break;
        }
        const task = /^\[([ xX])\][ \t]+/.exec(body[0]!);
        if (task) body[0] = body[0]!.slice(task[0].length);
        items.push({ ...(task && { task: true, done: task[1] !== " " }), c: parseBlocks(body.join("\n")) });
      }
      out.push({ t: "list", ordered, start, items });
      continue;
    }
    // A paragraph runs until a blank line or the start of another block.
    const para = [line];
    for (i++; i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!) && !(lines[i]!.includes("|") && SEPARATOR.test(lines[i + 1] ?? "")); i++) para.push(lines[i]!);
    out.push({ t: "p", c: parseInline(para.map((l) => l.trim()).join("\n")) });
  }
  return out;
}
