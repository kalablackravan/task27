# Redbelly basics: educational infographic series

Live site: https://redbelly-infographics.vercel.app

These are 11 infographics in one style, and each one explains one core Redbelly idea in plain language. Each infographic comes in three formats, so there are 33 PNG files in total.

| # | Topic | Diagram |
|---|---|---|
| 01 | What is Redbelly Network? | Issuers to Redbelly to verified investors |
| 02 | Why tokenise real world assets? | Without tokens and with tokens, side by side |
| 03 | DBFT consensus | Competing blocks and one combined superblock |
| 04 | Receptor | Issuer, holder, verifier |
| 05 | Verifiable credentials | A credential card |
| 06 | Zero knowledge proofs | One question answered two ways |
| 07 | Tokeniser | Issue, reach, settle stack |
| 08 | Compliance aware assets | Transfer, checks, pass or fail |
| 09 | Identity and accountability | People layer and node layer |
| 10 | Governance | Propose, vote, count, result |
| 11 | Project Acacia | Timeline |

## What is in this repository

| Path | What it is |
|---|---|
| `public/png/landscape/` | 16:9, 1920x1080 PNG, for X posts and slides |
| `public/png/portrait/` | 4:5, 1080x1350 PNG, for phone feeds |
| `public/png/square/` | 1:1, 1080x1080 PNG, for Discord, pins and the Start Here hub |
| `content/infographics.json` | **Single source** for every word on every graphic, plus the fact list behind each one |
| `src/` | Editable design source: the HTML template, the CSS and the diagram renderer |
| `SOURCES.md` and `public/sources.html` | The source list. It gives every fact with its official link and the exact text to search for |
| `evidence/` | A text snapshot of every source page as it read on 13 Oct 2026, with SHA-256 hashes in `evidence/sources.json`. These are verbatim copies of third-party pages and are never edited, so they keep the source's own punctuation and names |
| `scripts/build.mjs` | Renders all 33 PNGs with Playwright and writes the gallery, the source list and a readability report |
| `scripts/check.py` | The quality gate (see below) |
| `licenses/` | Font licences (SIL Open Font License 1.1) |

All three formats are rendered from the same file, so their wording cannot drift apart.

## Phone versions and readability

The Task Board brand kit asks for body text of at least 16 px on a phone and a logo at least 28 px tall. To meet that without shrinking anything:

- The 16:9 version keeps the full text. It is measured on a 640 px wide phone held sideways.
- The 4:5 and 1:1 versions use a short phone version of each graphic (`phone` in `content/infographics.json`): a shorter lead line and diagram, with the same facts. The 1:1 version drops the lead line. Their footer points to the full source list instead of naming every source. Both are measured shown full width on a 390 px wide phone.

On the current build the smallest text on any of the 33 PNGs is 16.3 px and the smallest logo is 28.9 px. Each file's numbers are in `build/report.json`.

## How to edit

1. Change the words in `content/infographics.json`. If you add a fact, add its source and an exact quote under `facts`.
2. Change the look in `src/style.css`. Change the diagram shapes in `src/render.js`.
3. Rebuild and check:

```bash
npm install            # installs Playwright (Chromium needs to be available)
npm run build          # renders 33 PNGs, gallery, source list and zips
npm run check          # must print two OK lines
```

The last build's measurements are committed in `build/report.json`, so `python3 scripts/check.py --outputs` also runs on a fresh clone without rebuilding.

To preview one graphic in a browser, run `npm run preview` and open `http://localhost:8080/src/infographic.html?n=10&f=square`. Set `n` to a number from 1 to 11 and `f` to landscape, portrait or square.

## What the check enforces

`python3 scripts/check.py --outputs` fails the build if any of these is true:

- A topic from the brief is missing, or the 11 are out of order.
- A quoted fact is not found word for word in its saved source snapshot, or a snapshot was edited after capture (SHA-256 mismatch). 93 quotes are checked.
- Any text contains an en dash, an em dash or an emoji.
- Any text contains a "made by" line, or a personal name or handle listed in a local `.credit-names` file (git-ignored, so the names never enter the repository).
- Any graphic contains price talk, return or yield language, or filler words.
- Governance cites no DAO voting platform source, or describes Snapshot as the current process.
- Any of the 33 PNGs is missing or not at the exact required size.
- Any text spills out of its panel or off the canvas, or any line of copy is missing from a render.
- Text is too small to read on a phone. The build measures every text element, footer and source line included, at the size it shows on a phone: 390 px wide for 4:5 and 1:1, 640 px wide (held sideways) for 16:9. Every piece of text must be at least 16 px.
- The logo is under 28 px tall on that same phone screen.
- An item has no short phone version.

## Governance note

Constitution v1.2 is out of date. The governance graphic follows the DAO voting platform (redbelly-governance.vercel.app) for how voting works today. It uses the TASK-23 changelog, which is sourced to 1 August 2026, only for decisions that are in force. Nothing on it comes from Snapshot or Constitution v1.2.

## Deploy

This is a static site with no build step on the server. On Vercel, import the repository. `vercel.json` sets the output directory to `public`. Then add the custom domain under Project Settings, Domains. Fonts, the logo, the PNGs and the zip are all served from the same domain.

## Brand and licences

- Colours, type and logo follow the Task Board brand kit (taskboard.redbellydao.network/brand). The only accent is #EF5350, on a #0c1317 base. Text uses Be Vietnam Pro, and machine values (numbers, dates) use JetBrains Mono. The logo is the official light ink DAO logo with no plate.
- Fonts: Be Vietnam Pro and JetBrains Mono, both under the SIL Open Font License 1.1 (see `licenses/`), self-hosted from `public/fonts/`.
- Icons and diagrams are drawn in code in `src/`. There are no third-party icons or images.
- Each graphic shows its sources and a "Last verified" date.
