// Motion for the landing page. No library: an observer for reveals, one scroll handler for the pinned "how it works" section,
// and typing for the two code-like moments. With reduced motion everything is shown at once.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x) => Math.max(0, Math.min(1, x));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Reveal on scroll
const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); seen.unobserve(e.target); } }), { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
$$(".rv").forEach((el) => (reduce ? el.classList.add("in") : seen.observe(el)));

// The hero picture is already on screen: show it right away
$$("[data-now]").forEach((e) => setTimeout(() => e.classList.add("in"), 150));

// Typing
function typeInto(el, text, speed, render = esc) {
  if (reduce) { el.innerHTML = render(text); return Promise.resolve(); }
  return new Promise((done) => {
    let i = 0;
    const tick = () => { el.innerHTML = render(text.slice(0, ++i)); i < text.length ? setTimeout(tick, speed) : done(); };
    tick();
  });
}

// Hero terminal: her sentence types itself, then the result lines appear
const term = $("[data-term]");
if (term) {
  const t = $("[data-type]", term);
  setTimeout(() => typeInto(t, t.dataset.type, +t.dataset.speed || 40).then(() => $(".caret", term)?.remove()), reduce ? 0 : 700);
  $$("[data-after]", term).forEach((el) => setTimeout(() => el.classList.add("show"), reduce ? 0 : 700 + +el.dataset.after + 900));
}

// Control: the limits, typed as settings when they come into view
const cfg = $("[data-cfg]");
if (cfg) {
  const text = 'deploy        = "only when you ask"\nmerge         = "only when you approve"\nsecrets       = "never in files"\ncode_editors  = ["builder"]';
  const hl = (s) => esc(s).replace(/^(\w+)|("[^"]*"?)/gm, (_, k, str) => (k ? `<span class="k">${k}</span>` : `<span class="s">${str}</span>`));
  const code = $("code", cfg);
  code.innerHTML = reduce ? hl(text) : "";
  if (!reduce) new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { o.disconnect(); typeInto(code, text, 22, hl); } }, { threshold: 0.6 }).observe(cfg);
}

// How it works: scroll position drives a branch graph, the step list and a log
const how = $("[data-how]");
if (how) {
  const lane = $("[data-lane]", how), merge = $("[data-merge]", how), done = $("[data-done]", how), dots = $("[data-dots]", how), log = $("code", $("[data-log]", how));
  const steps = $$(".steps li", how), NS = "http://www.w3.org/2000/svg";
  const laneLen = lane.getTotalLength(), mergeLen = merge.getTotalLength();
  lane.style.strokeDasharray = laneLen; merge.style.strokeDasharray = mergeLen;
  const spots = [0.2, 0.38, 0.56, 0.74, 0.92].map((f) => {
    const p = lane.getPointAtLength(laneLen * f), c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", 7); c.setAttribute("class", "cm"); c.style.opacity = 0; c.style.transition = "opacity .25s";
    dots.appendChild(c);
    return { f, c };
  });
  const ok = '<span class="ok">✓</span>';
  const lines = [
    '<span class="ok">$</span> Customers should pay a deposit by link.',
    `${ok} plan    tasks and checks written`,
    `${ok} spec    noor   58s`,
    `${ok} build   kofi   4m 03s`,
    `${ok} check   tests pass, no secrets`,
    `${ok} review  sade   approved`,
  ];
  let last = "";
  const draw = (p) => {
    const lp = clamp(p / 0.85), mp = clamp((p - 0.85) / 0.15), idx = p >= 0.85 ? 6 : Math.floor(lp * 6), landed = p >= 0.97;
    lane.style.strokeDashoffset = laneLen * (1 - lp); merge.style.strokeDashoffset = mergeLen * (1 - mp);
    done.classList.toggle("on", landed);
    spots.forEach((s) => (s.c.style.opacity = lp >= s.f - 0.02 ? 1 : 0));
    steps.forEach((li, i) => { li.classList.toggle("on", i <= idx); li.classList.toggle("cur", i === idx); });
    const key = `${idx}${landed}`;
    if (key !== last) {
      last = key;
      const tail = idx === 6 ? [landed ? `${ok} landed on main, <span class="gold">by you</span>` : '<span class="gold">⏸ waiting for your yes</span>'] : [];
      log.innerHTML = [...lines.slice(0, Math.min(idx + 1, 6)), ...tail].join("\n");
    }
  };
  let tick = false;
  const update = () => {
    tick = false;
    const r = how.getBoundingClientRect();
    draw(reduce ? 1 : clamp(-r.top / (r.height - innerHeight)));
  };
  const queue = () => { if (!tick) { tick = true; requestAnimationFrame(update); } };
  addEventListener("scroll", queue, { passive: true }); addEventListener("resize", queue);
  update();
}

// Reading progress
const bar = $(".progress");
const prog = () => { bar.style.transform = `scaleX(${clamp(scrollY / (document.documentElement.scrollHeight - innerHeight))})`; };
if (!reduce) { addEventListener("scroll", () => requestAnimationFrame(prog), { passive: true }); prog(); }

// Copy buttons
const live = $("[data-live]");
$$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); } catch { return; }
  const label = $("i", b), before = label ? label.textContent : b.textContent;
  if (label) { label.textContent = "copied"; b.classList.add("ok"); } else b.textContent = "Copied. Paste it in Claude Code.";
  live.textContent = "Copied to the clipboard";
  setTimeout(() => { if (label) { label.textContent = before; b.classList.remove("ok"); } else b.textContent = before; live.textContent = ""; }, 1800);
}));
