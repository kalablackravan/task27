// Builds all 33 PNGs (11 topics x 3 formats) from content/infographics.json
// using the HTML template in src/, then writes the gallery, the source list
// and build/report.json (readability and overflow measurements).
//
// Run: npm run build

import http from "node:http";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const BUILD = path.join(ROOT, "build");

const FORMATS = {
  landscape: { w: 960, h: 540 },
  portrait: { w: 540, h: 675 },
  square: { w: 540, h: 540 },
};
const SITE_URL = process.env.SITE_URL || "https://redbelly-infographics.vercel.app"; // used for link previews
const SCALE = 2; // CSS px to output px
// Width each format is checked at on a phone, in CSS px: 4:5 and 1:1 fill an upright 390 px phone;
// 16:9 (X posts and slides) is checked as opened full screen on a phone held sideways, 640 px.
const VIEW_WIDTH = { landscape: 640, portrait: 390, square: 390 };

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function launchOptions() {
  const local = "/opt/pw-browsers/chromium";
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH };
  if (fs.existsSync(local) && fs.statSync(local).isFile()) return { executablePath: local };
  return {};
}

// Runs inside the page: measures text sizes, overflow and that every string is present.
function measure({ expected, phoneWidth }) {
  const ig = document.querySelector(".ig");
  const box = ig.getBoundingClientRect();
  const factor = phoneWidth / box.width;
  let minAny = Infinity;
  let minBody = Infinity;
  const overflow = [];
  const walker = document.createTreeWalker(ig, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    const size = parseFloat(getComputedStyle(el).fontSize);
    minAny = Math.min(minAny, size);
    if (!el.closest(".meta, .tag, .tagline, dt")) minBody = Math.min(minBody, size);
  }
  for (const el of ig.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5 || r.left < box.left - 0.5 || r.top < box.top - 0.5) {
      overflow.push(`${el.className || el.tagName} outside canvas`);
    }
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible") {
      overflow.push(`${el.className || el.tagName} clipped horizontally`);
    }
  }
  // Everything drawn in the diagram panel must sit inside the panel's padding.
  const panel = ig.querySelector(".diagram");
  const pr = panel.getBoundingClientRect();
  for (const el of panel.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top < pr.top + 2 || r.bottom > pr.bottom - 2 || r.left < pr.left + 2 || r.right > pr.right - 2) {
      overflow.push(`${el.className || el.tagName} spills out of the diagram panel`);
    }
  }
  // Diagram and text blocks must not overlap each other.
  const blocks = [...ig.querySelectorAll(":scope > *")].map((el) => [el.className, el.getBoundingClientRect()]);
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const [a, ra] = blocks[i];
      const [b, rb] = blocks[j];
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 1 && oy > 1) overflow.push(`${a} overlaps ${b}`);
    }
  }
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const text = norm(ig.innerText).toLowerCase();
  const missingText = expected.filter((s) => !text.includes(norm(s).toLowerCase()));
  const logo = ig.querySelector(".footer img");
  const logoPhonePx = logo ? logo.getBoundingClientRect().height * factor : 0;
  return { viewWidth: phoneWidth, minPhonePx: minAny * factor, minBodyPhonePx: minBody * factor, logoPhonePx, overflow: [...new Set(overflow)], missingText };
}

// Mirrors viewFor() in src/render.js: the phone formats show item.phone.
function viewFor(item, fmt) {
  if (fmt === "landscape" || !item.phone) return item;
  return { ...item, lead: fmt === "square" ? "" : item.phone.lead, diagram: item.phone.diagram, note: item.phone.note || "" };
}

function authoredStrings(item) {
  const d = item.diagram;
  const out = [item.title, item.lead, item.note];
  for (const n of d.nodes || []) out.push(n.label, n.sub);
  for (const l of d.layers || []) out.push(l.label, l.sub);
  for (const s of [d.left, d.right]) if (s) out.push(s.title, ...s.items);
  for (const e of d.events || []) out.push(e.text);
  for (const r of d.rows || []) out.push(r.v);
  out.push(d.question, d.pass, d.fail, d.heading);
  return out.filter(Boolean);
}

const pngName = (item, fmt) => `${String(item.n).padStart(2, "0")}-${item.slug}-${fmt}.png`;
// URL of a PNG with a short content hash, so browsers fetch a fresh copy whenever the image changes.
const pngUrl = (item, fmt) => {
  const file = path.join(PUBLIC, "png", fmt, pngName(item, fmt));
  const v = fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 8) : "0";
  return `png/${fmt}/${pngName(item, fmt)}?v=${v}`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "content/infographics.json"), "utf8"));
  const only = process.argv[2] ? Number(process.argv[2]) : null;
  fs.mkdirSync(BUILD, { recursive: true });

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(launchOptions());
  const report = [];

  for (const [fmt, size] of Object.entries(FORMATS)) {
    fs.mkdirSync(path.join(PUBLIC, "png", fmt), { recursive: true });
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: SCALE });
    for (const item of data.items) {
      if (only && item.n !== only) continue;
      await page.goto(`${base}/src/infographic.html?n=${item.n}&f=${fmt}`);
      await page.waitForSelector("body[data-ready='1']");
      const m = await page.evaluate(measure, { expected: authoredStrings(viewFor(item, fmt)), phoneWidth: VIEW_WIDTH[fmt] });
      const file = pngName(item, fmt);
      await page.locator(".ig").screenshot({ path: path.join(PUBLIC, "png", fmt, file) });
      report.push({ file, ...m });
      const flag = m.overflow.length || m.missingText.length ? "  CHECK" : "";
      console.log(`${file.padEnd(52)} min ${m.minPhonePx.toFixed(1)}px  body ${m.minBodyPhonePx.toFixed(1)}px  logo ${m.logoPhonePx.toFixed(1)}px${flag}`);
      if (flag) console.log("   ", [...m.overflow, ...m.missingText.map((t) => `missing: ${t}`)].join("; "));
    }
    await page.close();
  }
  await browser.close();
  server.close();

  if (!only) {
    fs.writeFileSync(path.join(BUILD, "report.json"), JSON.stringify(report, null, 2));
    writeGallery(data);
    writeSources(data);
  }
}

function sourcesById() {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, "evidence/sources.json"), "utf8")).sources;
  return Object.fromEntries(s.map((x) => [x.id, x]));
}

const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Attributes that make a thumbnail open in the viewer, with all three formats available.
function zoomAttrs(item, fmt) {
  return `class="zoom" data-n="${item.n}" data-fmt="${fmt}" data-title="${esc(String(item.n).padStart(2, "0") + ". " + item.title)}" ${Object.keys(FORMATS)
    .map((f) => `data-${f}="${pngUrl(item, f)}"`)
    .join(" ")}`;
}

// Text shown beside the image in the viewer: the copy of each graphic and its sourced facts.
function viewerData() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "content/infographics.json"), "utf8"));
  const src = sourcesById();
  const items = data.items.map((i) => ({
    n: i.n,
    title: i.title,
    lead: i.lead,
    note: i.note,
    // One row per fact and source: a fact backed by two quotes from the same page shows once.
    facts: [...new Map(i.facts.map((f) => [f.claim + "|" + f.evidence, { claim: f.claim, source: src[f.evidence].title, url: src[f.evidence].url }])).values()],
  }));
  // Escape "<" so the JSON can never close the script tag early.
  return JSON.stringify({ total: data.items.length, verified: data.lastVerifiedLabel, items }).replace(/</g, "\\u003c");
}

// Sticky "On this page" menu, highlighted by site.js as sections scroll past.
function toc(data, extra = []) {
  const links = data.items
    .map((i) => `<li><a href="#${i.slug}"><span class="n">${String(i.n).padStart(2, "0")}</span>${esc(i.title)}</a></li>`)
    .concat(extra.map(([id, label]) => `<li><a href="#${id}">${esc(label)}</a></li>`))
    .join("");
  return `<nav class="toc" aria-label="On this page"><p class="toc-head">On this page</p><ol>${links}</ol></nav>`;
}

// Round button in the bottom-left corner that jumps between the two pages.
const PAGE_SWITCH = {
  toSources: { href: "sources.html", label: "Go to the source list", path: "M4.5 12H19M12.5 5.5 19 12l-6.5 6.5" },
  toGallery: { href: "index.html", label: "Back to the infographics", path: "M19.5 12H5M11.5 5.5 5 12l6.5 6.5" },
};

function pageShell(title, description, body, pageSwitch) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE_URL}/png/landscape/01-what-is-redbelly-landscape.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="brand/dao-logo-on-dark.png">
<link rel="stylesheet" href="site.css">
</head>
<body>
<header class="top">
  <a class="brand" href="index.html"><img src="brand/dao-logo-on-dark.png" alt="Redbelly DAO"></a>
  <nav><a href="index.html"${pageSwitch === PAGE_SWITCH.toSources ? ' aria-current="page"' : ""}>Infographics</a><a href="sources.html"${pageSwitch === PAGE_SWITCH.toGallery ? ' aria-current="page"' : ""}>Sources</a></nav>
</header>
<main>
${body}
</main>
<footer class="foot">Facts last verified ${esc(JSON.parse(fs.readFileSync(path.join(ROOT, "content/infographics.json"), "utf8")).lastVerifiedLabel)}. Every fact links to an official or supplied source on the Sources page.</footer>
<div class="lb" id="lb" hidden aria-modal="true" role="dialog" aria-label="Infographic viewer">
  <button class="lb-btn lb-close" type="button" aria-label="Close">${ICON_CLOSE}</button>
  <button class="lb-btn lb-prev" type="button" aria-label="Previous infographic">${ICON_PREV}</button>
  <button class="lb-btn lb-next" type="button" aria-label="Next infographic">${ICON_NEXT}</button>
  <figure class="lb-stage"><img class="lb-img" alt=""></figure>
  <aside class="lb-info" aria-live="polite">
    <p class="lb-kicker"></p>
    <h2 class="lb-h"></h2>
    <p class="lb-lead"></p>
    <p class="lb-note"></p>
    <h3 class="lb-fh">Facts and sources</h3>
    <ol class="lb-facts"></ol>
  </aside>
  <div class="lb-bar">
    <span class="lb-title"></span>
    <span class="lb-fmts"><button type="button" data-f="landscape">16:9</button><button type="button" data-f="portrait">4:5</button><button type="button" data-f="square">1:1</button></span>
    <a class="lb-dl" download>Download PNG</a>
  </div>
</div>
<a class="page-switch" href="${pageSwitch.href}" aria-label="${pageSwitch.label}" title="${pageSwitch.label}"><svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="${pageSwitch.path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg></a>
<button class="to-top" type="button" aria-label="Back to top"><svg focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 19.5V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg></button>
<script type="application/json" id="ig-data">${viewerData()}</script>
<script src="site.js" defer></script>
</body>
</html>
`;
}

function writeGallery(data) {
  const cards = data.items
    .map((item) => {
      const links = Object.keys(FORMATS)
        .map((f) => `<a href="${pngUrl(item, f)}" download="${pngName(item, f)}">${f === "landscape" ? "16:9" : f === "portrait" ? "4:5" : "1:1"} PNG</a>`)
        .join("");
      return `<article class="card" id="${item.slug}">
  <a href="${pngUrl(item, "landscape")}"><picture><source media="(max-width: 700px)" srcset="${pngUrl(item, "portrait")}" width="540" height="675"><img ${zoomAttrs(item, "landscape")} loading="lazy" src="${pngUrl(item, "landscape")}" alt="${esc(item.title)}: ${esc(item.lead)}" width="960" height="540"></picture></a>
  <div class="body">
    <p class="num">${String(item.n).padStart(2, "0")} / ${data.items.length}</p>
    <h2>${esc(item.title)}</h2>
    <p>${esc(item.lead)}</p>
    <div class="dl">${links}<a href="sources.html#${item.slug}">Sources</a></div>
  </div>
</article>`;
    })
    .join("\n");
  const body = `<section class="hero">
  <p class="kicker">Redbelly basics</p>
  <h1>11 infographics that explain Redbelly in plain language</h1>
  <p>One idea per graphic, in three sizes: 16:9 for X and slides, 4:5 for feeds, 1:1 for Discord and pins. Free to post, pin and link.</p>
  <p class="dl"><a href="downloads/redbelly-basics-png.zip" download>Download all 33 PNGs (zip)</a><a href="sources.html">Source list</a></p>
</section>
<div class="layout">
${toc(data)}
<section class="grid">
${cards}
</section>
</div>`;
  fs.writeFileSync(path.join(PUBLIC, "index.html"), pageShell("Redbelly basics", "11 infographics that explain Redbelly Network's core ideas in plain language, with a source for every fact.", body, PAGE_SWITCH.toSources));
}

function writeSources(data) {
  const src = sourcesById();
  const md = [`# Source list\n`, `Every fact in the 11 infographics, with the official or supplied source it comes from and the exact text to search for on that page. Facts last verified ${data.lastVerifiedLabel}.\n`, `Governance follows the DAO voting platform first and the TASK-23 changelog (sourced to 1 August 2026) second, as the brief requires. Nothing in it is taken from Constitution v1.2 or Snapshot.\n`];
  let html = `<section class="hero"><p class="kicker">Source list</p><h1>Where every fact comes from</h1>
<p>Each row is one fact on a graphic, the page it comes from, and the exact text to search for on that page (Ctrl+F). A copy of every page as it read on ${esc(data.lastVerifiedLabel)} is kept in the repository under evidence/snapshots, with its SHA-256 in evidence/sources.json.</p>
<p>Governance follows the DAO voting platform first and the TASK-23 changelog (sourced to 1 August 2026) second. Nothing in it is taken from Constitution v1.2 or Snapshot.</p></section>
<div class="layout">${toc(data, [["evidence", "Evidence snapshots"]])}<div class="content">`;
  for (const item of data.items) {
    const used = [...new Set(item.facts.map((f) => f.evidence))];
    md.push(`\n## ${String(item.n).padStart(2, "0")}. ${item.title}\n`);
    md.push(`Sources: ${used.map((id) => `[${src[id].title}](${src[id].url})`).join("; ")}\n`);
    md.push(`| Fact on the graphic | Source | Text to search for |\n|---|---|---|`);
    html += `<section class="src" id="${item.slug}"><h2>${String(item.n).padStart(2, "0")}. ${esc(item.title)}</h2>
<p><a href="${pngUrl(item, "square")}"><img ${zoomAttrs(item, "square")} src="${pngUrl(item, "square")}" alt="${esc(item.title)} infographic" width="160" height="160" loading="lazy"></a></p>
<table><thead><tr><th>Fact on the graphic</th><th>Source</th><th>Text to search for</th></tr></thead><tbody>`;
    for (const f of item.facts) {
      const s = src[f.evidence];
      md.push(`| ${f.claim} | [${s.title}](${s.url}) | "${f.quote.replace(/\|/g, "\\|")}" |`);
      html += `<tr><td>${esc(f.claim)}</td><td><a href="${esc(s.url)}">${esc(s.title)}</a></td><td><q>${esc(f.quote)}</q></td></tr>`;
    }
    html += `</tbody></table></section>`;
  }
  html += `<section class="src" id="evidence"><h2>Evidence snapshots</h2>
<p>Each source page as it read on ${esc(data.lastVerifiedLabel)}, saved in the repository under evidence/snapshots. The SHA-256 lets anyone confirm a snapshot has not been edited.</p>
<table><thead><tr><th>Source</th><th>Retrieved</th><th>SHA-256</th></tr></thead><tbody>${Object.values(src)
    .map((s) => `<tr><td><a href="${esc(s.url)}">${esc(s.title)}</a></td><td class="mono">${s.retrieved}</td><td class="mono hash">${s.sha256}</td></tr>`)
    .join("")}</tbody></table></section></div></div>`;
  md.push(`\n## Evidence snapshots\n`);
  md.push(`| Source | URL | Retrieved | SHA-256 |\n|---|---|---|---|`);
  for (const s of Object.values(src)) md.push(`| ${s.title} | ${s.url} | ${s.retrieved} | \`${s.sha256}\` |`);
  fs.writeFileSync(path.join(ROOT, "SOURCES.md"), md.join("\n") + "\n");
  fs.writeFileSync(path.join(PUBLIC, "sources.html"), pageShell("Redbelly basics: sources", "The official or supplied source for every fact in the Redbelly basics infographic series.", html, PAGE_SWITCH.toGallery));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
