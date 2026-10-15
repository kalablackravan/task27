#!/usr/bin/env python3
"""Packs the outputs.

public/downloads/redbelly-basics-png.zip   all 33 PNGs plus SOURCES.md, linked from the gallery
build/redbelly-basics-submission.zip      PNGs, editable source, source list and evidence, for the Task Board upload
"""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def add(z, path, arc=None):
    z.write(path, arc or path.relative_to(ROOT).as_posix())


def main():
    pngs = sorted((ROOT / "public" / "png").rglob("*.png"))
    out = ROOT / "public" / "downloads" / "redbelly-basics-png.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for p in pngs:
            add(z, p, p.relative_to(ROOT / "public" / "png").as_posix())
        add(z, ROOT / "SOURCES.md", "SOURCES.md")

    sub = ROOT / "build" / "redbelly-basics-submission.zip"
    sub.parent.mkdir(parents=True, exist_ok=True)
    files = pngs + [ROOT / "SOURCES.md", ROOT / "README.md", ROOT / "package.json"]
    for folder in ("content", "src", "scripts", "evidence", "licenses"):
        files += [p for p in sorted((ROOT / folder).rglob("*")) if p.is_file()]
    files += sorted((ROOT / "public" / "fonts").glob("*")) + [ROOT / "public" / "brand" / "dao-logo-on-dark.png"]
    with zipfile.ZipFile(sub, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            if p.exists() and "__pycache__" not in p.parts:
                add(z, p)
    for f in (out, sub):
        print(f"{f.relative_to(ROOT)}: {f.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
