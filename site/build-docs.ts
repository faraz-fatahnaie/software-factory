// Builds the documentation pages from the plugin's own README and runbook: `bun site/build-docs.ts`.
// The pages are plain HTML and are committed, so publishing the site needs no build step. Edit the Markdown, not the pages.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const out = join(import.meta.dir, "docs");
const REPO = "https://github.com/faraz-fatahnaie/software-factory";
const pages = [
  { file: "index.html", src: "plugin/README.md", title: "Overview", blurb: "What it is, how to install it, what you can change." },
  { file: "runbook.html", src: "plugin/docs/RUNBOOK.md", title: "Runbook", blurb: "A complete course: one bakery, from the first idea to a release." },
];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

mkdirSync(out, { recursive: true });
for (const page of pages) {
  let body = Bun.markdown.html(readFileSync(join(root, page.src), "utf8"), { headings: { ids: true } });
  // Links between the two documents stay inside the site.
  body = body.replace(/href="(?:\.\.\/|docs\/)?(?:docs\/)?RUNBOOK\.md(#[^"]*)?"/g, 'href="runbook.html$1"').replace(/href="(?:\.\.\/)?README\.md(#[^"]*)?"/g, 'href="index.html$1"');
  body = body.replace(/^<h1[^>]*>.*?<\/h1>\n?/s, ""); // the page title is drawn by the template
  body = body.replace(/<(pre|table)>/g, '<$1 tabindex="0">'); // wide code and tables scroll sideways, so the keyboard must reach them
  const heading = readFileSync(join(root, page.src), "utf8").match(/^# (.+)$/m)?.[1] ?? page.title;
  const toc = [...body.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/g)].map((m) => `<a class="l${m[1]}" href="#${m[2]}">${esc(strip(m[3]!))}</a>`).join("\n");
  const nav = pages.map((p) => `<a href="${p.file}"${p === page ? ' aria-current="page"' : ""}>${p.title}</a>`).join("");
  writeFileSync(join(out, page.file), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} · Software Factory documentation</title>
<meta name="description" content="${esc(page.blurb)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="icon" href="../favicon.svg">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="docs.css">
</head>
<body>
<header class="top"><div class="wrap bar">
  <a class="brand" href="../"><span class="mark" aria-hidden="true"></span>Software Factory</a>
  <nav aria-label="Documentation">${nav}<a href="${REPO}">GitHub</a><a href="../">Home</a></nav>
  <a class="btn pri sm" href="../#install">Install</a>
</div></header>
<div class="wrap docgrid">
  <aside class="side" aria-label="On this page"><p class="eyebrow">${esc(page.title)}</p><nav>
${toc}
  </nav></aside>
  <main class="doc" id="top">
    <h1 class="h">${esc(heading)}</h1>
${body}
    <p class="fine">This page is built from <a href="${REPO}/blob/main/${page.src}">${page.src}</a>. To change it, edit that file.</p>
  </main>
</div>
</body>
</html>
`);
  console.log(`${page.file}: ${toc.split("\n").length} sections`);
}
