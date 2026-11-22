#!/usr/bin/env python3
"""Build the engineering handbook from one Markdown content model.

The source of truth is ``docs/handbook/src/*.md``. Each page opens with YAML-like
front matter::

    ---
    title: What this bundle is
    order: 10
    purpose: One line saying why the page exists.
    audience: Who should read it.
    ---

The rest of the page is a deliberately small Markdown subset: ``##``/``###``
headings, paragraphs, bullet and numbered lists, fenced code blocks and pipe
tables. Inline ``**bold**`` and `` `code` `` are supported.

Three artifacts are built into ``docs/handbook/``:

    engineering-handbook.html   (links docs/print.css)
    engineering-handbook.docx   (python-docx, fixed core properties)
    engineering-handbook.pdf    (HTML printed through scripts/print-pdf.mts)

Commands::

    python scripts/gen-handbook.py                  # build all three
    python scripts/gen-handbook.py --formats html   # build only the HTML
    python scripts/gen-handbook.py --out-dir DIR    # build somewhere else
    python scripts/gen-handbook.py --check          # fail when stale or invalid

``--check`` validates front matter and order values, requires the three built
artifacts, compares the HTML ``handbook-source-hash`` meta and the DOCX
``source-hash:`` keyword with the current sources, and fails when the PDF is
older than the newest source page. Run it from the repository root.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "handbook" / "src"
OUT = ROOT / "docs" / "handbook"
CSS = ROOT / "docs" / "print.css"
PRINT_CLI = ROOT / "scripts" / "print-pdf.mts"
VERSION_FILE = ROOT / "package.json"
ARTIFACT_STEM = "engineering-handbook"
FORMATS = ("html", "docx", "pdf")
REQUIRED_FRONT_MATTER = ("title", "order", "purpose", "audience")
# Fixed core-property timestamp so repeated DOCX builds are stable.
EPOCH = datetime.datetime(2024, 1, 1, 0, 0, 0)


@dataclass
class Page:
    path: Path
    title: str
    order: int
    purpose: str
    audience: str
    blocks: list[dict] = field(default_factory=list)


# --------------------------------------------------------------------------
# Markdown parsing
# --------------------------------------------------------------------------

def split_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        raise ValueError("missing front matter (the file must start with ---)")
    lines = text.splitlines()
    if lines[0].strip() != "---":
        raise ValueError("missing front matter (the first line must be ---)")
    meta: dict[str, str] = {}
    end = None
    for i in range(1, len(lines)):
        line = lines[i]
        if line.strip() == "---":
            end = i
            break
        if not line.strip():
            continue
        if ":" not in line:
            raise ValueError(f"front matter line without ':': {line!r}")
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    if end is None:
        raise ValueError("front matter is never closed with ---")
    return meta, "\n".join(lines[end + 1:])


def parse_blocks(text: str) -> list[dict]:
    blocks: list[dict] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("```"):
            fence = stripped[3:].strip()
            code: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            blocks.append({"type": "code", "lang": fence, "text": "\n".join(code)})
            continue
        heading = re.match(r"^(#{2,4})\s+(.*)$", stripped)
        if heading:
            blocks.append({"type": "heading", "level": len(heading.group(1)), "text": heading.group(2).strip()})
            i += 1
            continue
        if stripped.startswith("|"):
            table: list[list[str]] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                row = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
                table.append(row)
                i += 1
            if len(table) >= 2 and all(re.fullmatch(r":?-{3,}:?", cell or "-") for cell in table[1]):
                blocks.append({"type": "table", "header": table[0], "rows": table[2:]})
            else:
                blocks.append({"type": "table", "header": table[0], "rows": table[1:]})
            continue
        bullet = re.match(r"^[-*]\s+(.*)$", stripped)
        if bullet:
            items: list[str] = []
            while i < len(lines):
                current = lines[i].strip()
                if re.match(r"^[-*]\s+", current):
                    items.append(re.sub(r"^[-*]\s+", "", current))
                    i += 1
                elif current == "":
                    # A blank line ends the list unless the next non-blank is another bullet.
                    j = i + 1
                    while j < len(lines) and not lines[j].strip():
                        j += 1
                    if j < len(lines) and re.match(r"^[-*]\s+", lines[j].strip()):
                        i = j
                        continue
                    break
                else:
                    break
            blocks.append({"type": "list", "ordered": False, "items": items})
            continue
        numbered = re.match(r"^\d+[.)]\s+(.*)$", stripped)
        if numbered:
            items = []
            while i < len(lines):
                current = lines[i].strip()
                match = re.match(r"^\d+[.)]\s+(.*)$", current)
                if match:
                    items.append(match.group(1))
                    i += 1
                elif current == "":
                    j = i + 1
                    while j < len(lines) and not lines[j].strip():
                        j += 1
                    if j < len(lines) and re.match(r"^\d+[.)]\s+", lines[j].strip()):
                        i = j
                        continue
                    break
                else:
                    break
            blocks.append({"type": "list", "ordered": True, "items": items})
            continue
        # Paragraph: gather until blank or the start of another block.
        para: list[str] = []
        while i < len(lines):
            current = lines[i].strip()
            if not current:
                break
            if re.match(r"^(#{2,4}\s|[-*]\s|\d+[.)]\s|```|\|)", current):
                break
            para.append(current)
            i += 1
        if para:
            blocks.append({"type": "paragraph", "text": " ".join(para)})
        else:
            i += 1
    return blocks


def load_pages(src: Path) -> list[Page]:
    if not src.is_dir():
        raise SystemExit(f"handbook source directory not found: {src}")
    paths = sorted(src.glob("*.md"))
    if not paths:
        raise SystemExit(f"no Markdown pages under {src}")
    pages: list[Page] = []
    for path in paths:
        raw = path.read_text(encoding="utf-8")
        meta, body = split_front_matter(raw)
        missing = [key for key in REQUIRED_FRONT_MATTER if not meta.get(key)]
        if missing:
            raise SystemExit(f"{path.relative_to(ROOT)}: front matter is missing {', '.join(missing)}")
        try:
            order = int(meta["order"])
        except ValueError:
            raise SystemExit(f"{path.relative_to(ROOT)}: front matter order must be an integer")
        blocks = parse_blocks(body)
        if not blocks:
            raise SystemExit(f"{path.relative_to(ROOT)}: page body is empty")
        pages.append(Page(path, meta["title"], order, meta["purpose"], meta["audience"], blocks))
    orders = [page.order for page in pages]
    duplicates = {value for value in orders if orders.count(value) > 1}
    if duplicates:
        raise SystemExit(f"duplicate page order values: {sorted(duplicates)}")
    pages.sort(key=lambda page: page.order)
    return pages


def source_hash(pages: list[Page]) -> str:
    digest = hashlib.sha256()
    for page in pages:
        digest.update(page.path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(page.path.read_text(encoding="utf-8").encode("utf-8"))
    return digest.hexdigest()[:16]


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

def escape_html(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def inline_html(text: str) -> str:
    escaped = escape_html(text)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    return escaped


def render_html_blocks(blocks: list[dict]) -> str:
    parts: list[str] = []
    for block in blocks:
        kind = block["type"]
        if kind == "heading":
            level = max(2, min(4, block["level"]))
            parts.append(f"<h{level}>{inline_html(block['text'])}</h{level}>")
        elif kind == "paragraph":
            parts.append(f"<p>{inline_html(block['text'])}</p>")
        elif kind == "list":
            tag = "ol" if block["ordered"] else "ul"
            items = "".join(f"<li>{inline_html(item)}</li>" for item in block["items"])
            parts.append(f"<{tag}>{items}</{tag}>")
        elif kind == "code":
            language = f' class="language-{escape_html(block["lang"])}"' if block["lang"] else ""
            parts.append(f"<pre><code{language}>{escape_html(block['text'])}</code></pre>")
        elif kind == "table":
            head = "".join(f"<th>{inline_html(cell)}</th>" for cell in block["header"])
            rows = "".join(
                "<tr>" + "".join(f"<td>{inline_html(cell)}</td>" for cell in row) + "</tr>"
                for row in block["rows"]
            )
            parts.append(f"<table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table>")
    return "\n".join(parts)


def build_html(pages: list[Page], digest: str) -> str:
    version = json.loads(VERSION_FILE.read_text(encoding="utf-8"))["version"]
    today = datetime.date.today().isoformat()
    nav = "\n".join(
        f'<li><a href="#page-{page.order}">{inline_html(page.title)}</a></li>' for page in pages
    )
    sections = []
    for page in pages:
        sections.append(
            "\n".join(
                [
                    f'<section class="page" id="page-{page.order}">',
                    f"<h1>{inline_html(page.title)}</h1>",
                    f'<p class="purpose">{inline_html(page.purpose)}</p>',
                    f'<p class="audience">Audience: {inline_html(page.audience)}</p>',
                    render_html_blocks(page.blocks),
                    "</section>",
                ]
            )
        )
    return "\n".join(
        [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            f'<meta name="handbook-source-hash" content="{digest}">',
            f"<title>Engineering handbook - {version}</title>",
            '<link rel="stylesheet" href="../print.css">',
            "</head>",
            "<body>",
            '<header class="cover">',
            f"<h1>Engineering handbook</h1>",
            f'<p class="subtitle">@aryacode/dsh-engineering {version}</p>',
            f'<p>Generated {today} from docs/handbook/src/ - source hash {digest}.</p>',
            "</header>",
            '<nav class="toc"><h2>Contents</h2><ol>',
            nav,
            "</ol></nav>",
            "\n".join(sections),
            '<footer class="colophon"><p>One install, many surfaces. Every component is beta; '
            "the known gaps chapter lists what is not proved.</p>",
            f"<p>Source hash {digest} - generated {today}.</p></footer>",
            "</body>",
            "</html>",
            "",
        ]
    )


# --------------------------------------------------------------------------
# DOCX
# --------------------------------------------------------------------------

def inline_docx(paragraph, text: str) -> None:
    from docx.shared import Pt

    for piece in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not piece:
            continue
        if piece.startswith("**") and piece.endswith("**"):
            run = paragraph.add_run(piece[2:-2])
            run.bold = True
        elif piece.startswith("`") and piece.endswith("`"):
            run = paragraph.add_run(piece[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(9.5)
        else:
            paragraph.add_run(piece)


def render_docx_blocks(document: Document, blocks: list[dict]) -> None:
    from docx.shared import Pt

    for block in blocks:
        kind = block["type"]
        if kind == "heading":
            level = max(1, min(3, block["level"] - 1))
            document.add_heading(block["text"], level=level)
        elif kind == "paragraph":
            paragraph = document.add_paragraph()
            inline_docx(paragraph, block["text"])
            paragraph.paragraph_format.space_after = Pt(6)
        elif kind == "list":
            style = "List Number" if block["ordered"] else "List Bullet"
            for item in block["items"]:
                paragraph = document.add_paragraph(style=style)
                inline_docx(paragraph, item)
        elif kind == "code":
            for line in block["text"].splitlines() or [""]:
                paragraph = document.add_paragraph()
                run = paragraph.add_run(line if line else " ")
                run.font.name = "Consolas"
                run.font.size = Pt(9)
                paragraph.paragraph_format.space_after = Pt(0)
        elif kind == "table":
            table = document.add_table(rows=1, cols=len(block["header"]))
            table.style = "Table Grid"
            for index, cell in enumerate(block["header"]):
                table.rows[0].cells[index].text = cell
            for row in block["rows"]:
                cells = table.add_row().cells
                for index, value in enumerate(row[: len(block["header"])]):
                    cells[index].text = value


def build_docx(pages: list[Page], digest: str, out_path: Path) -> None:
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Pt, RGBColor
    except ImportError as exc:  # noqa: BLE001 - say which dependency is missing
        raise SystemExit(
            "DOCX build needs python-docx (pip install python-docx); "
            f"building only --formats html still works ({exc})"
        )
    version = json.loads(VERSION_FILE.read_text(encoding="utf-8"))["version"]
    document = Document()
    normal = document.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    document.core_properties.title = "Engineering handbook"
    document.core_properties.author = "dsh-engineering"
    document.core_properties.subject = f"@aryacode/dsh-engineering {version}"
    document.core_properties.keywords = f"source-hash:{digest}"
    document.core_properties.created = EPOCH
    document.core_properties.modified = EPOCH
    document.core_properties.last_modified_by = "dsh-engineering"
    document.core_properties.revision = 1

    cover = document.add_paragraph()
    cover.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = cover.add_run("Engineering handbook")
    run.bold = True
    run.font.size = Pt(26)
    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.add_run(f"@aryacode/dsh-engineering {version}")
    note = document.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    note.add_run(
        f"Generated {datetime.date.today().isoformat()} from docs/handbook/src/ "
        f"- source hash {digest}."
    )
    document.add_page_break()

    for number, page in enumerate(pages, start=1):
        heading = document.add_heading(page.title, level=0)
        heading.alignment = WD_ALIGN_PARAGRAPH.LEFT
        purpose = document.add_paragraph()
        run = purpose.add_run(page.purpose)
        run.italic = True
        audience = document.add_paragraph()
        run = audience.add_run(f"Audience: {page.audience}")
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
        render_docx_blocks(document, page.blocks)
        if number != len(pages):
            document.add_page_break()
    document.save(out_path)


# --------------------------------------------------------------------------
# Build + check
# --------------------------------------------------------------------------

def build(pages: list[Page], out_dir: Path, formats: tuple[str, ...]) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    digest = source_hash(pages)
    html_path = out_dir / f"{ARTIFACT_STEM}.html"
    docx_path = out_dir / f"{ARTIFACT_STEM}.docx"
    pdf_path = out_dir / f"{ARTIFACT_STEM}.pdf"
    built: dict[str, Path] = {}
    if "html" in formats:
        html_path.write_text(build_html(pages, digest), encoding="utf-8")
        built["html"] = html_path
    if "docx" in formats:
        build_docx(pages, digest, docx_path)
        built["docx"] = docx_path
    if "pdf" in formats:
        if not html_path.is_file():
            html_path.write_text(build_html(pages, digest), encoding="utf-8")
        print(f"rendering {html_path.relative_to(ROOT) if out_dir == OUT else html_path} ...")
        result = subprocess.run(
            ["node", "--import", "tsx", str(PRINT_CLI), str(html_path), str(pdf_path)],
            cwd=ROOT,
        )
        if result.returncode != 0 or not pdf_path.is_file():
            raise SystemExit(
                "PDF rendering failed: scripts/print-pdf.mts could not run a browser "
                "(no Chrome or Edge on PATH, or the browser cannot start here). "
                "The HTML and DOCX were still built; print the HTML from a normal "
                "desktop browser, or run the generator where Chrome/Edge can start."
            )
        built["pdf"] = pdf_path
    for path in built.values():
        size = path.stat().st_size
        print(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path} - {max(1, round(size / 1024))} KB")
    print(f"handbook source hash {digest} ({len(pages)} pages)")
    return built


def read_docx_keywords(path: Path) -> str:
    try:
        from docx import Document
    except ImportError as exc:  # noqa: BLE001 - the check cannot run without python-docx
        raise SystemExit(f"{path.name}: python-docx is needed to read the DOCX core properties ({exc})")
    try:
        document = Document(str(path))
        return document.core_properties.keywords or ""
    except Exception as exc:  # noqa: BLE001 - report the shape failure, do not crash
        raise SystemExit(f"{path.name}: cannot read DOCX core properties ({exc})")


def check(pages: list[Page]) -> None:
    digest = source_hash(pages)
    html_path = OUT / f"{ARTIFACT_STEM}.html"
    docx_path = OUT / f"{ARTIFACT_STEM}.docx"
    pdf_path = OUT / f"{ARTIFACT_STEM}.pdf"
    failures: list[str] = []
    for path in (html_path, docx_path, pdf_path):
        if not path.is_file():
            failures.append(f"missing built artifact {path.relative_to(ROOT)}")
        elif path.stat().st_size == 0:
            failures.append(f"empty built artifact {path.relative_to(ROOT)}")
    if html_path.is_file() and html_path.stat().st_size:
        match = re.search(r'name="handbook-source-hash" content="([0-9a-f]+)"', html_path.read_text(encoding="utf-8"))
        if not match:
            failures.append("HTML has no handbook-source-hash meta tag")
        elif match.group(1) != digest:
            failures.append("HTML is stale: source hash differs from docs/handbook/src")
    if docx_path.is_file() and docx_path.stat().st_size:
        keywords = read_docx_keywords(docx_path)
        if f"source-hash:{digest}" not in keywords:
            failures.append("DOCX is stale: its source-hash keyword differs from docs/handbook/src")
    if pdf_path.is_file() and pdf_path.stat().st_size:
        newest = max(page.path.stat().st_mtime for page in pages)
        if pdf_path.stat().st_mtime < newest:
            failures.append("PDF is older than the newest source page")
    if failures:
        for failure in failures:
            print(f"handbook check: {failure}", file=sys.stderr)
        raise SystemExit(1)
    print(f"handbook check: ok ({len(pages)} pages, source hash {digest})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the engineering handbook from Markdown.")
    parser.add_argument("--check", action="store_true", help="fail when sources or artifacts are stale")
    parser.add_argument("--out-dir", type=Path, default=OUT, help="directory for the built artifacts")
    parser.add_argument(
        "--formats",
        default=",".join(FORMATS),
        help="comma-separated subset of html,docx,pdf (default: all three)",
    )
    args = parser.parse_args(argv)
    formats = tuple(part.strip() for part in args.formats.split(",") if part.strip())
    unknown = [name for name in formats if name not in FORMATS]
    if unknown:
        raise SystemExit(f"unknown format(s): {', '.join(unknown)}")
    pages = load_pages(SRC)
    if args.check:
        check(pages)
        return 0
    out_dir = args.out_dir if args.out_dir.is_absolute() else ROOT / args.out_dir
    build(pages, out_dir, formats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
