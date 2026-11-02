#!/usr/bin/env python3
"""Build the Engineering Workflow Handbook in three formats from one content model.

PDF: vector text, embedded PNG figures, for sharing and printing.
DOCX: editable, same sections and figures, for anyone who wants to change it.
HTML: browsable, print-friendly, for the repository.

The figures come from scripts/gen-diagrams.py; run that first.

Usage: python scripts/gen-handbook.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
DIAGRAMS = ROOT / "docs" / "diagrams"
OUT = ROOT / "docs" / "handbook"
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
TODAY = date.today().isoformat()



@dataclass
class Section:
    id: str
    title: str
    lead: str
    figure: str | None
    body: list[tuple[str, list[str]]]


SECTIONS: list[Section] = [
    Section(
        "loop", "The loop every product follows",
        "Four products, one discipline: read before writing, act in a copy, prove the result with the "
        "vendor engine, and hand off the step only a person can perform.",
        "loop",
        [("The five steps", [
            "**Point at the work** — a workspace folder holding an export or project, or an installed "
            "FactoryTalk View ME application name.",
            "**Read** — overview, structure, references and checks. The agent quotes what it read before "
            "it changes anything.",
            "**Act in a copy** — L5X and FactoryTalk View write a new file or folder; MotionWorks edits "
            "the saved project after a verified backup.",
            "**Verify** — re-read the written file, or let the vendor engine judge: an SDK build, an ME "
            "re-export, an MWI compile, an emulator preview.",
            "**Hand off** — importing displays in Studio, creating a runtime file, downloading to a "
            "controller or terminal. These are named, not implied.",
        ])],
    ),
    Section(
        "l5x", "Studio 5000 L5X",
        "An offline export is the unit of work. Logic is reviewed and changed offline; a build and a "
        "controller download are separate, supervised steps.",
        "l5x",
        [("The agent does", [
            "Opens the `.L5X` and reports programs, routines, tags, tasks and counts.",
            "Follows symbols, resolves aliases and members, maps bit and array usage, and runs the "
            "structural checks with findings and severities.",
            "Composes ladder from an instruction catalog (`list_instructions`, `compose_rung`) so an "
            "invalid rung cannot reach a draft, then validates the whole draft.",
            "Writes one new `.L5X` and leaves the source untouched; with Studio 5000 and the SDK it can "
            "build the result at project revision 37 or later.",
        ]),
         ("You do", [
            "Import the new `.L5X` into Studio 5000 if you want it in a project.",
            "Download to a controller. Any download is approval-gated and only accepts a verification "
            "id from a build in the same chat.",
        ]),
         ("What it will not claim", [
            "That online logic matches the export, that FBD/SFC semantics were exercised, or that a "
            "machine is safe. Coverage fields say so on every result.",
        ])],
    ),
    Section(
        "ftview", "FactoryTalk View ME",
        "The agent reaches the installed application itself, authors screens against the vendor schema, "
        "and proves the Studio import object by object.",
        "ftview",
        [("The agent does", [
            "Lists the ME applications on the host and exports one to a new folder through the vendor "
            "export server, with no Studio window and no project change.",
            "Authors displays and objects — geometry, captions, states and tag connections — on a "
            "source-positioned tree, so untouched objects keep their exact bytes.",
            "Validates every changed display against the installed `Gfx-ME*.xsd`; apply refuses a "
            "document the schema rejects.",
            "Writes the changed displays, `IMPORT.md` and the vendor's own `BatchImport_<app>.xml`, then "
            "re-exports after the import and compares trees to prove what landed.",
        ]),
         ("You do", [
            "Import the listed displays in FactoryTalk View Studio. Create the runtime application "
            "(`.mer`) and download it to the terminal.",
        ]),
         ("What it will not claim", [
            "That an import happened without the re-export proof, that a `.mer` was built, or that copied "
            "alarms and tags are current when they are older than the application database — the export "
            "reports that case as a warning.",
        ])],
    ),
    Section(
        "mwi", "MotionWorks IEC",
        "The IDE stays in the loop. The saved project is edited in place after a verified backup, and "
        "the vendor compiler is the verdict.",
        "mwi",
        [("The agent does", [
            "Finds workspace projects, opens one with a complete backup under `backups/motionworks/`, and "
            "attaches without reloading a project the IDE already has open.",
            "Reads POUs, declarations, tasks and block interfaces, and records the body hash that a "
            "change must match.",
            "Applies hash-guarded code and declaration edits, compiles, and reads the vendor diagnostics.",
        ]),
         ("You do", [
            "Keep MotionWorks IEC running. Confirm any close of another open project; that needs the "
            "exact path.",
        ]),
         ("What it will not claim", [
            "That a compile verdict proves runtime behaviour, or that an edit is safe because it "
            "compiled.",
        ])],
    ),
    Section(
        "optix", "FactoryTalk Optix",
        "The Studio bridge is the truth while Studio is open. Batches are validated dry first, then "
        "written, then looked at.",
        "optix",
        [("The agent does", [
            "Reads the live model — screens, widget types, variable members, CLR types — through the "
            "bridge rather than trusting disk files.",
            "Applies typed batches with `dry_run` first, and destructive or write operations only under "
            "the row's switches.",
            "Validates expressions, adds translations, reads NetLogic guidance from the pinned snapshot, "
            "and drives the emulator preview when one is configured.",
        ]),
         ("You do", [
            "Keep Studio open with the project loaded and the bridge attached. Save from Studio when the "
            "model is right.",
        ]),
         ("What it will not claim", [
            "That a model change was saved, or that a screen renders because the model accepted it.",
        ])],
    ),
]

VERIFICATION = [
    ("Studio 5000 L5X", "SDK build at revision 37+, preservation and diff checks", "Does not prove runtime behaviour"),
    ("FactoryTalk View ME", "Vendor schema validation, re-export object diff", "Studio import and `.mer` build are human"),
    ("MotionWorks IEC", "Vendor compile and diagnostics", "Compile verdict is not runtime"),
    ("FactoryTalk Optix", "Dry-run batch, expression validation, emulator preview", "Bridge state is not a saved project"),
]

REQUIREMENTS = [
    ("Studio 5000 L5X", "Node only for reads and drafts", "Studio 5000 + SDK for builds; controller for online"),
    ("FactoryTalk View ME", "Node only to read an export", "ME Studio to export an application and to import changes"),
    ("MotionWorks IEC", "Node only for saved files", "MotionWorks IEC 3 Pro running for edits and compile"),
    ("FactoryTalk Optix", "—", "Optix Studio open with the bridge attached"),
]


PRINT_CSS = ROOT / "docs" / "print.css"
PRINT_CLI = ROOT / "scripts" / "print-pdf.mts"


def html() -> Path:
    """Write the handbook HTML, styled by the same stylesheet a report uses."""
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "Engineering-Handbook.html"
    toc = [("what", "What this handbook covers")] + [(section.id, section.title) for section in SECTIONS] + [("proof", "What proves what")]
    body: list[str] = []
    body.append(f"""<section class="cover">
  <h1>AryaCode Engineering — Workflow Handbook</h1>
  <p class="sub">How the four engineering surfaces work, what the agent does, what stays with you, and what each result can and cannot prove.</p>
  <dl>
    <dt>Version</dt><dd>{VERSION}</dd>
    <dt>Generated</dt><dd>{TODAY}</dd>
    <dt>Package</dt><dd>@aryacode/dsh-engineering</dd>
    <dt>Sections</dt><dd>{len(SECTIONS)}</dd>
  </dl>
</section>""")
    body.append('<nav class="toc"><h2>Contents</h2><ol>')
    for anchor, title in toc:
        body.append(f'<li><a href="#{anchor}">{title}</a></li>')
    body.append("</ol></nav>")
    body.append('<h2 id="what">What this handbook covers</h2>')
    body.append("<p>One install adds four products to AryaCode: Studio 5000 L5X, FactoryTalk View ME, "
                "MotionWorks IEC and FactoryTalk Optix. Each is a row you can switch off, and each registers "
                "a skill and tools. You never call a tool by name: you say what you want, and the agent "
                "selects the surface.</p>")
    body.append("<table><thead><tr><th>Product</th><th>Without vendor software</th><th>Needs for the rest</th></tr></thead><tbody>")
    for row in REQUIREMENTS:
        body.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>")
    body.append("</tbody></table>")
    for section in SECTIONS:
        body.append(f'<h2 class="section" id="{section.id}">{section.title}</h2>')
        body.append(f'<p>{section.lead}</p>')
        if section.figure:
            body.append(f'<figure><img src="../diagrams/{section.figure}-figure.svg" alt="{section.title} workflow">'
                        f'<figcaption>Figure — {section.title}</figcaption></figure>')
        for heading, bullets in section.body:
            body.append(f"<h3>{heading}</h3><ul>")
            for bullet in bullets:
                body.append(f"<li>{re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', bullet)}</li>")
            body.append("</ul>")
    body.append('<h2 class="section" id="proof">What proves what</h2>')
    body.append('<p>A release claim is only as good as the step that checked it.</p>')
    body.append("<table><thead><tr><th>Product</th><th>Proof the agent can produce</th><th>Still yours</th></tr></thead><tbody>")
    for row in VERIFICATION:
        body.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>")
    body.append("</tbody></table>")
    body.append("<h3>Where to look next</h3><ul>"
                "<li>docs/getting-started.md — the first session, with a paste-ready prompt per product.</li>"
                "<li>docs/examples.md — end-to-end sessions with call shapes and results.</li>"
                "<li>docs/reference/tools.md — every tool, parameter and description (generated).</li>"
                "<li>docs/architecture.md — rows, services, client faces and packaging.</li></ul>")
    body.append('<footer><p>Generated from this repository by <code>scripts/gen-handbook.py</code>. This page and a '
                'generated report are printed with one stylesheet (<code>docs/print.css</code>) and one printer '
                '(<code>scripts/print-pdf.mts</code>), so the two documents cannot drift apart in typography.</p></footer>')
    path.write_text(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>AryaCode Engineering — Workflow Handbook</title><link rel="stylesheet" href="../print.css"></head>'
        f"<body>{''.join(body)}</body></html>", encoding="utf-8")
    return path


def pdf() -> Path:
    """Print that HTML with the same browser path a generated report uses."""
    OUT.mkdir(parents=True, exist_ok=True)
    source = html()
    path = OUT / "Engineering-Handbook.pdf"
    result = subprocess.run(
        ["node", "--import", "tsx", str(PRINT_CLI), str(source), str(path)],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stdout + result.stderr)
        raise SystemExit("gen-handbook: the PDF was not printed; the HTML is the printable copy")
    return path


def docx() -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "Engineering-Handbook.docx"
    document = Document()
    normal = document.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)

    cover = document.add_paragraph()
    cover.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = cover.add_run("AryaCode Engineering\nWorkflow Handbook")
    run.bold = True
    run.font.size = Pt(30)
    run.font.color.rgb = RGBColor(0x1F, 0x29, 0x33)
    document.add_paragraph(f"How the four engineering surfaces work, what the agent does, what stays with you, and what each result can and cannot prove.")
    document.add_paragraph(f"Version {VERSION} · {TODAY} · @aryacode/dsh-engineering")
    document.add_page_break()

    document.add_heading("What this handbook covers", level=1)
    document.add_paragraph(
        "One install adds four products to AryaCode: Studio 5000 L5X, FactoryTalk View ME, MotionWorks IEC "
        "and FactoryTalk Optix. Each is a row you can switch off, and each registers a skill and tools. You "
        "never call a tool by name: you say what you want, and the agent selects the surface.")
    table = document.add_table(rows=1, cols=3)
    table.style = "Light Grid Accent 1"
    header = table.rows[0].cells
    header[0].text, header[1].text, header[2].text = "Product", "Without vendor software", "Needs for the rest"
    for row in REQUIREMENTS:
        cells = table.add_row().cells
        cells[0].text, cells[1].text, cells[2].text = row
    document.add_page_break()

    for section in SECTIONS:
        document.add_heading(section.title, level=1)
        document.add_paragraph(section.lead).italic = True
        image = DIAGRAMS / f"{section.figure}-figure.png" if section.figure else None
        if image is not None and image.exists():
            document.add_picture(str(image), width=Inches(6.4))
            caption = document.add_paragraph(f"Figure — {section.title}")
            caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for heading, bullets in section.body:
            document.add_heading(heading, level=2)
            for bullet in bullets:
                document.add_paragraph(bullet.replace("**", ""), style="List Bullet")
        document.add_page_break()

    document.add_heading("What proves what", level=1)
    document.add_paragraph("A release claim is only as good as the step that checked it.")
    table = document.add_table(rows=1, cols=3)
    table.style = "Light Grid Accent 1"
    header = table.rows[0].cells
    header[0].text, header[1].text, header[2].text = "Product", "Proof the agent can produce", "Still yours"
    for row in VERIFICATION:
        cells = table.add_row().cells
        cells[0].text, cells[1].text, cells[2].text = row
    document.add_heading("Where to look next", level=2)
    for line in [
        "docs/getting-started.md — the first session, with a paste-ready prompt per product.",
        "docs/examples.md — end-to-end sessions with call shapes and results.",
        "docs/reference/tools.md — every tool, parameter and description (generated).",
        "docs/architecture.md — rows, services, client faces and packaging.",
    ]:
        document.add_paragraph(line, style="List Bullet")
    document.save(str(path))
    return path


def main() -> None:
    for path in (html(), pdf(), docx()):
        print(f"{path.relative_to(ROOT)} — {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
