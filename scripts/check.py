#!/usr/bin/env python3
"""Quality gate for the Redbelly basics infographic series.

Run: python3 scripts/check.py            (content and evidence checks)
     python3 scripts/check.py --outputs  (also checks the 33 PNGs and the readability report)

Exits non-zero on the first category that fails, after printing every problem found.
"""
import hashlib
import json
import os
import re
import struct
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "infographics.json"
SOURCES = ROOT / "evidence" / "sources.json"
PUBLIC = ROOT / "public"

FORMATS = {
    "landscape": (1920, 1080),
    "portrait": (1080, 1350),
    "square": (1080, 1080),
}

# Task Board brand kit: body text at least 16 px on a phone, logo at least 28 px tall.
# The 4:5 and 1:1 versions are measured shown full width on a 390 px wide phone.
# The 16:9 version is measured on a 640 px wide phone held sideways, the way a
# wide image is viewed on a phone.
MIN_PHONE_PX = {
    "landscape": {"any": 16.0, "body": 16.0},
    "portrait": {"any": 16.0, "body": 16.0},
    "square": {"any": 16.0, "body": 16.0},
}
MIN_LOGO_PX = 28.0

DASHES = re.compile("[\u2012\u2013\u2014\u2015\u2212]")
EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\u2600-\u27bf\u2b00-\u2bff\ufe0f\u200d]"
)
# Personal credit: the contributor's handle and name must never appear in the deliverable.
# The names and handles to block are kept out of the repository on purpose:
# list them (one per line) in a local .credit-names file, which is git-ignored,
# or in the CREDIT_NAMES environment variable, separated by commas.
def _credit_names():
    names = [n for n in os.environ.get("CREDIT_NAMES", "").split(",") if n.strip()]
    local = ROOT / ".credit-names"
    if local.exists():
        names += [n for n in local.read_text().splitlines() if n.strip()]
    return [re.escape(n.strip()) for n in names]


_NAMES = _credit_names()
HANDLE = re.compile("|".join(_NAMES) if _NAMES else r"(?!x)x", re.I)
CREDIT = re.compile("|".join(_NAMES + [r"made by", r"designed by", r"created by"]), re.I)
# Price talk, investment advice or promises of returns.
PRICE = re.compile(
    r"\b(price|prices|priced|returns?|profit\w*|apy|apr|yield\w*|buy|sell now|"
    r"guarantee\w*|moon|pump|gains?|roi|invest now|financial advice)\b",
    re.I,
)
# Task Board voice rules: no filler verbs.
FILLER = re.compile(r"\b(elevate\w*|seamless\w*|unleash\w*|revolutioni\w*)\b", re.I)

problems = []


def fail(msg):
    problems.append(msg)


def norm(text):
    text = unicodedata.normalize("NFKC", text)
    text = (
        text.replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("\u00ad", "")
    )
    return re.sub(r"\s+", " ", text).strip()


def authored_strings(item):
    """Every string that is printed on the infographic itself."""
    out = [item["title"], item["lead"], item["note"], item["footer"]]
    d = item["diagram"]
    for node in d.get("nodes", []):
        out += [node["label"], node.get("sub", "")]
    for layer in d.get("layers", []):
        out += [layer["tag"], layer["label"], layer.get("sub", "")]
    for side in ("left", "right"):
        if side in d:
            out += [d[side]["title"], d[side].get("tag", "")] + d[side]["items"]
    for ev in d.get("events", []):
        out += [ev["when"], ev["text"]]
    for row in d.get("rows", []):
        out += [row["k"], row["v"]]
    out += [d.get("heading", ""), d.get("question", ""), d.get("pass", ""), d.get("fail", "")]
    # The short phone version printed on the 4:5 and 1:1 images.
    if "phone" in item:
        phone = {"title": item["title"], "lead": item["phone"].get("lead", ""),
                 "note": item["phone"].get("note", ""), "footer": "",
                 "diagram": item["phone"]["diagram"]}
        out += authored_strings(phone)
    return [s for s in out if s]


def check_text(label, text, *, price=True, filler=True, quote=False):
    if DASHES.search(text):
        fail(f"{label}: en or em dash found: {text[:80]!r}")
    if EMOJI.search(text):
        fail(f"{label}: emoji found")
    credit = HANDLE if quote else CREDIT
    if credit.search(text):
        fail(f"{label}: personal credit found: {credit.search(text).group(0)!r}")
    if price and PRICE.search(text):
        fail(f"{label}: price or return language: {PRICE.search(text).group(0)!r}")
    if filler and FILLER.search(text):
        fail(f"{label}: filler word: {FILLER.search(text).group(0)!r}")


def check_content():
    data = json.loads(CONTENT.read_text())
    sources = {s["id"]: s for s in json.loads(SOURCES.read_text())["sources"]}
    items = data["items"]

    if [i["n"] for i in items] != list(range(1, 12)):
        fail("content: expected exactly 11 infographics numbered 1 to 11")
    required_topics = [
        "what-is-redbelly", "why-tokenise", "dbft-consensus", "receptor",
        "verifiable-credentials", "zk-proofs", "tokeniser", "compliance-aware-assets",
        "identity-and-accountability", "governance", "project-acacia",
    ]
    if [i["slug"] for i in items] != required_topics:
        fail("content: topic list does not match the brief")

    # Snapshot integrity.
    for sid, s in sources.items():
        path = ROOT / s["snapshot"]
        if not path.exists():
            fail(f"evidence {sid}: snapshot missing")
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != s["sha256"]:
            fail(f"evidence {sid}: SHA-256 mismatch, snapshot was edited")
        if not s["url"].startswith("https://"):
            fail(f"evidence {sid}: URL must be https")

    snap_cache = {}
    quote_count = 0
    for item in items:
        tag = f"#{item['n']:02d} {item['slug']}"
        for s in authored_strings(item):
            check_text(tag, s)
        if len(item["lead"]) > 120:
            fail(f"{tag}: lead is {len(item['lead'])} chars, keep it under 120")
        if len(item["note"]) > 120:
            fail(f"{tag}: note is {len(item['note'])} chars, keep it under 120")
        d = item["diagram"]
        for part in d.get("nodes", []) + d.get("layers", []):
            if len(part.get("sub", "")) > 40:
                fail(f"{tag}: diagram text over 40 chars: {part['sub']!r}")
        if not item.get("phone"):
            fail(f"{tag}: no short phone version")
        elif len(item["phone"].get("lead", "")) > 100:
            fail(f"{tag}: phone lead is over 100 chars")
        if not item.get("facts"):
            fail(f"{tag}: no sourced facts")
        for fact in item.get("facts", []):
            sid = fact["evidence"]
            if sid not in sources:
                fail(f"{tag}: unknown evidence id {sid}")
                continue
            if sid not in snap_cache:
                raw = norm((ROOT / sources[sid]["snapshot"]).read_text())
                # Join words that the PDF text extraction split across lines ("accred- ited").
                snap_cache[sid] = re.sub(r"(\w)- (\w)", r"\1\2", raw)
            check_text(f"{tag} quote", fact["quote"], price=False, filler=False, quote=True)
            if norm(fact["quote"]) not in snap_cache[sid]:
                fail(f"{tag}: quote not found in {sid}: {fact['quote'][:70]!r}")
            quote_count += 1

    # Governance must not lean on Snapshot or Constitution v1.2 as its source of rules.
    gov = next(i for i in items if i["slug"] == "governance")
    gov_sources = {f["evidence"] for f in gov["facts"]}
    if not any(s.startswith("governance-") for s in gov_sources):
        fail("governance: must cite the DAO voting platform")
    for s in authored_strings(gov):
        if re.search(r"snapshot", s, re.I) and not s.startswith("redbelly-governance"):
            fail(f"governance: Snapshot mentioned as a current process: {s!r}")

    return data, quote_count


def check_authored_files():
    files = [ROOT / "README.md", ROOT / "SOURCES.md"]
    files += list((ROOT / "src").glob("*"))
    files += [p for p in PUBLIC.glob("*.html")]
    for f in files:
        if not f.exists() or f.suffix not in {".md", ".html", ".css", ".js"}:
            continue
        text = f.read_text()
        label = str(f.relative_to(ROOT))
        # Source pages quote official text, so only the hard rules apply to them.
        lenient = f.name in {"sources.html", "SOURCES.md", "README.md"}
        check_text(label, text, price=not lenient and f.suffix != ".js", filler=not lenient, quote=lenient)


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    return struct.unpack(">II", head[16:24])


def check_outputs(data):
    count = 0
    for item in data["items"]:
        for fmt, (w, h) in FORMATS.items():
            path = PUBLIC / "png" / fmt / f"{item['n']:02d}-{item['slug']}-{fmt}.png"
            if not path.exists():
                fail(f"missing output {path.relative_to(ROOT)}")
                continue
            pw, ph = png_size(path)
            if (pw, ph) != (w, h):
                fail(f"{path.name}: {pw}x{ph}, expected {w}x{h}")
            if path.stat().st_size > 8 * 1024 * 1024:
                fail(f"{path.name}: larger than 8 MB")
            count += 1

    report_path = ROOT / "build" / "report.json"
    if not report_path.exists():
        fail("build/report.json missing, run npm run build")
        return count
    report = json.loads(report_path.read_text())
    for entry in report:
        tag = f"{entry['file']}"
        if entry["overflow"]:
            fail(f"{tag}: content overflows the canvas: {entry['overflow']}")
        floor = MIN_PHONE_PX[entry["file"].rsplit("-", 1)[1].removesuffix(".png")]
        if entry["minPhonePx"] < floor["any"]:
            fail(f"{tag}: smallest text is {entry['minPhonePx']:.1f}px on a phone, needs {floor['any']}")
        if entry.get("logoPhonePx", 0) < MIN_LOGO_PX:
            fail(f"{tag}: logo is {entry.get('logoPhonePx', 0):.1f}px tall on a phone, needs {MIN_LOGO_PX}")
        if entry["minBodyPhonePx"] < floor["body"]:
            fail(f"{tag}: body text is {entry['minBodyPhonePx']:.1f}px on a phone, needs {floor['body']}")
        for word in entry.get("missingText", []):
            fail(f"{tag}: copy missing from render: {word!r}")
    return count


def main():
    data, quotes = check_content()
    check_authored_files()
    pngs = None
    if "--outputs" in sys.argv:
        pngs = check_outputs(data)
    if problems:
        print(f"FAIL: {len(problems)} problem(s)")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print(f"OK: 11 infographics, {quotes} quotes matched to evidence snapshots")
    if pngs is not None:
        print(f"OK: {pngs} PNG files at the required sizes, readability and overflow checks passed")


if __name__ == "__main__":
    main()
