// Renders one infographic from content/infographics.json.
// URL: infographic.html?n=1&f=landscape   (f: landscape | portrait | square)

const ARROW_RIGHT = '<svg viewBox="0 0 18 24" aria-hidden="true"><path d="M5 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 24 18" aria-hidden="true"><path d="M5 5l7 8 7-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Self-drawn diagrams for the DBFT comparison.
const VISUALS = {
  compete: `<svg viewBox="0 0 120 64" aria-hidden="true">
      <g fill="#8fa1ad">
        <circle cx="12" cy="10" r="6"/><circle cx="12" cy="54" r="6"/><circle cx="40" cy="10" r="6"/><circle cx="40" cy="54" r="6"/>
      </g>
      <g stroke="#34444f" stroke-width="2.5" fill="none">
        <path d="M18 10h52M18 54h52M46 10l24 18M46 54l24-18"/>
      </g>
      <rect x="76" y="20" width="30" height="24" rx="3" fill="#8fa1ad"/>
      <g stroke="#34444f" stroke-width="2.5"><path d="M108 4l10 10M118 4l-10 10M108 50l10 10M118 50l-10 10"/></g>
    </svg>`,
  combine: `<svg viewBox="0 0 120 64" aria-hidden="true">
      <g fill="#ffb3ae">
        <circle cx="12" cy="10" r="6"/><circle cx="12" cy="54" r="6"/><circle cx="40" cy="10" r="6"/><circle cx="40" cy="54" r="6"/>
      </g>
      <g stroke="#EF5350" stroke-width="2.5" fill="none">
        <path d="M18 10q40 2 54 14M18 54q40-2 54-14M46 10l26 18M46 54l26-18"/>
      </g>
      <g fill="#EF5350">
        <rect x="76" y="12" width="17" height="19" rx="2"/><rect x="95" y="12" width="17" height="19" rx="2"/>
        <rect x="76" y="33" width="17" height="19" rx="2"/><rect x="95" y="33" width="17" height="19" rx="2"/>
      </g>
    </svg>`,
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Keep short labels such as "TASK-07" on one line in the footer.
const keepTogether = (s) => s.replace(/TASK-\d+/g, (m) => `<span class="nowrap">${m}</span>`);

function node(n, extra = "") {
  return `<div class="node${n.accent ? " accent" : ""}">${extra}<div class="label">${esc(n.label)}</div>${n.sub ? `<div class="sub">${esc(n.sub)}</div>` : ""}</div>`;
}

function arrow(fmt, vertical) {
  const down = vertical || fmt === "landscape";
  return `<div class="arrow">${down ? ARROW_DOWN : ARROW_RIGHT}</div>`;
}

const DIAGRAMS = {
  flow(d, fmt) {
    return `<div class="flow">${d.nodes.map((n) => node(n)).join(arrow(fmt))}</div>`;
  },
  steps(d) {
    return `<div class="steps">${d.nodes.map((n, i) => node(n, `<div class="idx">${i + 1}</div>`)).join("")}</div>`;
  },
  stack(d) {
    return `<div class="stack">${d.layers
      .map((l) => `<div class="node${l.accent ? " accent" : ""}"><div class="tag">${esc(l.tag)}</div><div class="label">${esc(l.label)}</div><div class="sub">${esc(l.sub)}</div></div>`)
      .join("")}</div>`;
  },
  compare(d) {
    const side = (s, cls) => `<div class="node side ${cls}">
        ${s.tag ? `<div class="tagline">${esc(s.tag)}</div>` : ""}
        <div class="head">${esc(s.title)}</div>
        ${s.visual ? `<div class="visual">${VISUALS[s.visual]}</div>` : ""}
        <ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </div>`;
    return `<div class="compare">${d.question ? `<div class="q">${esc(d.question)}</div>` : ""}
      <div class="cols">${side(d.left, "left")}${side(d.right, "right")}</div></div>`;
  },
  card(d) {
    return `<div class="card"><div class="chead"><span class="seal"></span>${esc(d.heading)}</div>
      <dl>${d.rows.map((r) => `<dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd>`).join("")}</dl></div>`;
  },
  branch(d, fmt) {
    return `<div class="branch">
      <div class="row">${d.nodes.map((n) => node(n)).join(arrow(fmt))}</div>
      <div class="arrow down">${ARROW_DOWN}</div>
      <div class="outcomes">
        <div class="node out pass"><span class="dot"></span><span>${esc(d.pass)}</span></div>
        <div class="node out fail"><span class="dot"></span><span>${esc(d.fail)}</span></div>
      </div></div>`;
  },
  timeline(d) {
    return `<ol class="timeline">${d.events
      .map((e) => `<li class="${e.accent ? "accent" : ""}"><span class="dot"></span><span class="when">${esc(e.when)}</span><span class="text">${esc(e.text)}</span></li>`)
      .join("")}</ol>`;
  },
};

// 4:5 and 1:1 are phone formats: they use the shorter copy in item.phone so every word stays at
// least 16 px on a 390 px phone (the brand kit's mobile minimum). 16:9 keeps the full text.
export function viewFor(data, item, fmt) {
  if (fmt === "landscape" || !item.phone) return { ...item, footerLine: `Sources: ${item.footer}` };
  // 1:1 has the least room, so it drops the lead line; the title and diagram carry the idea.
  const lead = fmt === "square" ? "" : item.phone.lead;
  return { ...item, lead, diagram: item.phone.diagram, note: item.phone.note || "", footerLine: data.phoneFooter };
}

export function renderInfographic(data, rawItem, fmt) {
  const item = viewFor(data, rawItem, fmt);
  const total = data.items.length;
  const num = `${String(item.n).padStart(2, "0")} / ${total}`;
  return `<article class="ig f-${fmt}" data-slug="${item.slug}" data-format="${fmt}">
    <div class="kicker meta"><span class="bar"></span><span>${esc(data.series)}</span><span class="num">${num}</span><span class="verified">Last verified ${esc(data.lastVerifiedLabel)}</span></div>
    <h1 class="title">${esc(item.title)}</h1>
    ${item.lead ? `<p class="lead">${esc(item.lead)}</p>` : ""}
    <section class="diagram diagram-${item.diagram.type}">${DIAGRAMS[item.diagram.type](item.diagram, fmt)}</section>
    ${item.note ? `<p class="note">${esc(item.note)}</p>` : ""}
    <footer class="footer meta">
      <img src="../public/brand/dao-logo-on-dark.png" alt="Redbelly DAO">
      <div class="meta"><span class="src">${keepTogether(esc(item.footerLine))}</span></div>
    </footer>
  </article>`;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const fmt = params.get("f") || "landscape";
  const n = Number(params.get("n") || 1);
  const data = await (await fetch("../content/infographics.json")).json();
  const item = data.items.find((i) => i.n === n);
  document.title = `${item.title} (${fmt})`;
  document.getElementById("root").innerHTML = renderInfographic(data, item, fmt);
  await document.fonts.ready;
  const img = document.querySelector(".footer img");
  if (!img.complete) await new Promise((r) => (img.onload = img.onerror = r));
  document.body.dataset.ready = "1";
}

main();
