#!/usr/bin/env python3
"""Generate the engineering workflow diagrams.

No diagramming library is installed on this host, so this script owns a tiny
layout model (boxes, arrows, swimlane bands) and renders it twice: SVG as the
scalable master, PNG for renderers that do not take SVG. Keeping both from one
layout means the two can never disagree.

Usage: python scripts/gen-diagrams.py
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs" / "diagrams"
SCALE = 2

INK = "#1f2933"
MUTED = "#52606d"
LINE = "#9aa5b1"
AUTO_FILL = "#eef4fb"
AUTO_LINE = "#2f6fb3"
HUMAN_FILL = "#fff6e6"
HUMAN_LINE = "#b7791f"
VERIFY_FILL = "#e9f6ee"
VERIFY_LINE = "#2f855a"
BAND_FILL = "#f8fafc"
BAND_LINE = "#d9e2ec"

PRODUCT = {
    "l5x": ("#1f6feb", "#eaf2fe"),
    "ftview": ("#0f766e", "#e6f4f1"),
    "mwi": ("#6b46c1", "#f1ecfb"),
    "optix": ("#b45309", "#fdf1e3"),
}

FONT_DIR = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    try:
        return ImageFont.truetype(str(FONT_DIR / name), size)
    except OSError:
        return ImageFont.load_default()


@dataclass
class Box:
    id: str
    x: int
    y: int
    w: int
    h: int
    title: str
    detail: str = ""
    kind: str = "auto"  # auto | human | verify
    product: str | None = None


@dataclass
class Arrow:
    src: str
    dst: str
    label: str = ""
    dashed: bool = False


@dataclass
class Diagram:
    slug: str
    title: str
    subtitle: str
    width: int
    height: int
    boxes: list[Box] = field(default_factory=list)
    arrows: list[Arrow] = field(default_factory=list)
    notes: list[tuple[int, int, str]] = field(default_factory=list)
    legend: bool = True


def box(d: Diagram, id: str, x: int, y: int, w: int, h: int, title: str, detail: str = "", kind: str = "auto", product: str | None = None) -> None:
    d.boxes.append(Box(id, x, y, w, h, title, detail, kind, product))


def arrow(d: Diagram, src: str, dst: str, label: str = "", dashed: bool = False) -> None:
    d.arrows.append(Arrow(src, dst, label, dashed))


def wrap(text: str, limit: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= limit:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def palette(node: Box) -> tuple[str, str]:
    if node.kind == "human":
        return HUMAN_FILL, HUMAN_LINE
    if node.kind == "verify":
        return VERIFY_FILL, VERIFY_LINE
    if node.product:
        return PRODUCT[node.product][1], PRODUCT[node.product][0]
    return AUTO_FILL, AUTO_LINE


def center_anchor(node: Box, side: str) -> tuple[int, int]:
    if side == "right":
        return node.x + node.w, node.y + node.h // 2
    if side == "left":
        return node.x, node.y + node.h // 2
    if side == "top":
        return node.x + node.w // 2, node.y
    return node.x + node.w // 2, node.y + node.h


def edge_points(a: Box, b: Box) -> tuple[tuple[int, int], tuple[int, int], str]:
    """Pick the shortest sane side pair, preferring horizontal flow."""
    if abs((a.x + a.w // 2) - (b.x + b.w // 2)) > abs((a.y + a.h // 2) - (b.y + b.h // 2)):
        if b.x > a.x:
            return center_anchor(a, "right"), center_anchor(b, "left"), "h"
        return center_anchor(a, "left"), center_anchor(b, "right"), "h"
    if b.y > a.y:
        return center_anchor(a, "bottom"), center_anchor(b, "top"), "v"
    return center_anchor(a, "top"), center_anchor(b, "bottom"), "v"


def svg(d: Diagram) -> str:
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{d.width}" height="{d.height}" viewBox="0 0 {d.width} {d.height}" font-family="Segoe UI, Arial, sans-serif">',
        f'<rect width="{d.width}" height="{d.height}" fill="#ffffff"/>',
        f'<text x="48" y="58" font-size="26" font-weight="600" fill="{INK}">{d.title}</text>',
        f'<text x="48" y="88" font-size="15" fill="{MUTED}">{d.subtitle}</text>',
    ]
    for node in d.boxes:
        fill, stroke = palette(node)
        parts.append(f'<rect x="{node.x}" y="{node.y}" width="{node.w}" height="{node.h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
        lines = wrap(node.title, 26)
        detail = wrap(node.detail, 34) if node.detail else []
        block = len(lines) * 22 + (len(detail) * 18 if detail else 0)
        cursor = node.y + (node.h - block) // 2 + 17
        for line in lines:
            parts.append(f'<text x="{node.x + node.w // 2}" y="{cursor}" text-anchor="middle" font-size="17" font-weight="600" fill="{INK}">{line}</text>')
            cursor += 22
        for line in detail:
            parts.append(f'<text x="{node.x + node.w // 2}" y="{cursor}" text-anchor="middle" font-size="13" fill="{MUTED}">{line}</text>')
            cursor += 18
    for a in d.arrows:
        src = next(n for n in d.boxes if n.id == a.src)
        dst = next(n for n in d.boxes if n.id == a.dst)
        (x1, y1), (x2, y2), axis = edge_points(src, dst)
        dash = ' stroke-dasharray="8 6"' if a.dashed else ""
        parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{LINE}" stroke-width="2"{dash} marker-end="url(#arrow)"/>')
        if a.label:
            mx, my = (x1 + x2) // 2, (y1 + y2) // 2
            if axis == "v":
                mx += 90
            else:
                my -= 12
            parts.append(f'<text x="{mx}" y="{my}" text-anchor="middle" font-size="12" fill="{MUTED}">{a.label}</text>')
    for x, y, text in d.notes:
        parts.append(f'<text x="{x}" y="{y}" font-size="12" fill="{MUTED}">{text}</text>')
    if d.legend:
        base = d.height - 34
        parts.append(f'<rect x="48" y="{base - 16}" width="16" height="16" rx="4" fill="{AUTO_FILL}" stroke="{AUTO_LINE}" stroke-width="2"/><text x="72" y="{base - 3}" font-size="13" fill="{MUTED}">agent step, no UI</text>')
        parts.append(f'<rect x="248" y="{base - 16}" width="16" height="16" rx="4" fill="{HUMAN_FILL}" stroke="{HUMAN_LINE}" stroke-width="2"/><text x="272" y="{base - 3}" font-size="13" fill="{MUTED}">human step in vendor software</text>')
        parts.append(f'<rect x="552" y="{base - 16}" width="16" height="16" rx="4" fill="{VERIFY_FILL}" stroke="{VERIFY_LINE}" stroke-width="2"/><text x="576" y="{base - 3}" font-size="13" fill="{MUTED}">proof step: re-read or vendor engine</text>')
    parts.append('<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa5b1"/></marker></defs>')
    parts.append("</svg>")
    return "\n".join(parts)


def png(d: Diagram, path: Path) -> None:
    image = Image.new("RGB", (d.width * SCALE, d.height * SCALE), "#ffffff")
    draw = ImageDraw.Draw(image)
    title_font = font(26 * SCALE, True)
    sub_font = font(15 * SCALE)
    body_font = font(17 * SCALE, True)
    detail_font = font(13 * SCALE)
    small_font = font(12 * SCALE)
    legend_font = font(13 * SCALE)
    draw.text((48 * SCALE, 32 * SCALE), d.title, font=title_font, fill=INK)
    draw.text((48 * SCALE, 72 * SCALE), d.subtitle, font=sub_font, fill=MUTED)
    for node in d.boxes:
        fill, stroke = palette(node)
        draw.rounded_rectangle(
            [node.x * SCALE, node.y * SCALE, (node.x + node.w) * SCALE, (node.y + node.h) * SCALE],
            radius=12 * SCALE, fill=fill, outline=stroke, width=2 * SCALE,
        )
        lines = wrap(node.title, 26)
        detail = wrap(node.detail, 34) if node.detail else []
        block = len(lines) * 22 + (len(detail) * 18 if detail else 0)
        cursor = node.y + (node.h - block) // 2 + 4
        for line in lines:
            w = draw.textlength(line, font=body_font)
            draw.text(((node.x + node.w // 2) * SCALE - w / 2, cursor * SCALE), line, font=body_font, fill=INK)
            cursor += 22
        for line in detail:
            w = draw.textlength(line, font=detail_font)
            draw.text(((node.x + node.w // 2) * SCALE - w / 2, cursor * SCALE), line, font=detail_font, fill=MUTED)
            cursor += 18
    for a in d.arrows:
        src = next(n for n in d.boxes if n.id == a.src)
        dst = next(n for n in d.boxes if n.id == a.dst)
        (x1, y1), (x2, y2), axis = edge_points(src, dst)
        if a.dashed:
            total = max(abs(x2 - x1), abs(y2 - y1))
            steps = max(1, total // 14)
            for i in range(steps):
                if i % 2:
                    continue
                t1, t2 = i / steps, min(1, (i + 1) / steps)
                draw.line(
                    [((x1 + (x2 - x1) * t1) * SCALE, (y1 + (y2 - y1) * t1) * SCALE), ((x1 + (x2 - x1) * t2) * SCALE, (y1 + (y2 - y1) * t2) * SCALE)],
                    fill=LINE, width=2 * SCALE,
                )
        else:
            draw.line([(x1 * SCALE, y1 * SCALE), (x2 * SCALE, y2 * SCALE)], fill=LINE, width=2 * SCALE)
        angle = 0 if axis == "h" else 90
        tip = (x2 * SCALE, y2 * SCALE)
        size = 8 * SCALE
        if axis == "h":
            direction = 1 if x2 > x1 else -1
            points = [tip, (tip[0] - direction * size, tip[1] - size * 0.6), (tip[0] - direction * size, tip[1] + size * 0.6)]
        else:
            direction = 1 if y2 > y1 else -1
            points = [tip, (tip[0] - size * 0.6, tip[1] - direction * size), (tip[0] + size * 0.6, tip[1] - direction * size)]
        draw.polygon(points, fill=LINE)
        del angle
        if a.label:
            mx, my = (x1 + x2) // 2, (y1 + y2) // 2
            if axis == "v":
                mx += 90
            else:
                my -= 12
            w = draw.textlength(a.label, font=small_font)
            draw.text((mx * SCALE - w / 2, my * SCALE - 12), a.label, font=small_font, fill=MUTED)
    for x, y, text in d.notes:
        draw.text((x * SCALE, y * SCALE), text, font=small_font, fill=MUTED)
    if d.legend:
        base = d.height - 34
        for offset, (fill, stroke, label) in enumerate([
            (AUTO_FILL, AUTO_LINE, "agent step, no UI"),
            (HUMAN_FILL, HUMAN_LINE, "human step in vendor software"),
            (VERIFY_FILL, VERIFY_LINE, "proof step: re-read or vendor engine"),
        ]):
            x = [48, 248, 552][offset]
            draw.rounded_rectangle([x * SCALE, (base - 16) * SCALE, (x + 16) * SCALE, base * SCALE], radius=4 * SCALE, fill=fill, outline=stroke, width=2 * SCALE)
            draw.text(((x + 24) * SCALE, (base - 15) * SCALE), label, font=legend_font, fill=MUTED)
    image.save(path, "PNG")


def build() -> list[Diagram]:
    diagrams: list[Diagram] = []

    loop = Diagram("loop", "The loop every product follows", "Read first, act in a copy, prove it with the vendor engine, then hand off the step only a person can do.", 1240, 320)
    box(loop, "point", 40, 120, 200, 100, "1. Point at the work", "export, project or application", kind="human")
    box(loop, "read", 280, 120, 200, 100, "2. Read", "overview, references, checks")
    box(loop, "act", 520, 120, 200, 100, "3. Act in a copy", "draft, validate, apply new")
    box(loop, "verify", 760, 120, 200, 100, "4. Verify", "re-read or vendor engine", kind="verify")
    box(loop, "hand", 1000, 120, 200, 100, "5. Hand off", "import, build, download", kind="human")
    arrow(loop, "point", "read")
    arrow(loop, "read", "act")
    arrow(loop, "act", "verify")
    arrow(loop, "verify", "hand")
    loop.legend = True
    diagrams.append(loop)

    l5x = Diagram("l5x", "Studio 5000 L5X", "Offline export in, reviewed change out. A build and a controller download are separate, supervised steps.", 1300, 460)
    box(l5x, "open", 40, 140, 210, 100, "Open", "open_project, overview", product="l5x")
    box(l5x, "read", 290, 140, 210, 100, "Read and check", "references, usage, run_checks", product="l5x")
    box(l5x, "compose", 540, 140, 210, 100, "Compose a rung", "list_instructions, compose_rung", product="l5x")
    box(l5x, "draft", 790, 140, 210, 100, "Draft and validate", "draft_*, draft_validate", product="l5x")
    box(l5x, "apply", 1040, 140, 210, 100, "Apply", "one NEW .L5X", kind="verify")
    box(l5x, "build", 1040, 300, 210, 100, "Build", "SDK verify, rev 37+", kind="human")
    arrow(l5x, "open", "read")
    arrow(l5x, "read", "compose")
    arrow(l5x, "compose", "draft")
    arrow(l5x, "draft", "apply")
    arrow(l5x, "apply", "build", "compile", dashed=True)
    diagrams.append(l5x)

    ftview = Diagram("ftview", "FactoryTalk View ME", "The agent exports the installed application, authors schema-validated screens, and proves the Studio import.", 1240, 450)
    box(ftview, "apps", 40, 150, 200, 100, "List applications", "ftview_apps", product="ftview")
    box(ftview, "export", 270, 150, 200, 100, "Export", "vendor export server", product="ftview")
    box(ftview, "author", 500, 150, 200, 100, "Author", "displays and objects", product="ftview")
    box(ftview, "schema", 730, 150, 200, 100, "Schema validate", "Gfx-ME*.xsd", kind="verify")
    box(ftview, "package", 960, 150, 200, 100, "Apply package", "BatchImport + IMPORT.md", product="ftview")
    box(ftview, "studio", 960, 280, 200, 70, "Import in Studio", "human, two clicks", kind="human")
    box(ftview, "verify", 730, 280, 200, 70, "Verify import", "object-by-object diff", kind="verify")
    arrow(ftview, "apps", "export")
    arrow(ftview, "export", "author")
    arrow(ftview, "author", "schema")
    arrow(ftview, "schema", "package")
    arrow(ftview, "package", "studio", "hand off", dashed=True)
    arrow(ftview, "studio", "verify", "re-export")
    diagrams.append(ftview)

    mwi = Diagram("mwi", "MotionWorks IEC", "The IDE stays in the loop: the project is edited in place after a verified backup, and the vendor compiler is the verdict.", 1240, 340)
    box(mwi, "find", 40, 130, 200, 100, "Find and open", "backup first", product="mwi")
    box(mwi, "read", 270, 130, 200, 100, "Read", "POUs, variables, hash", product="mwi")
    box(mwi, "edit", 500, 130, 200, 100, "Edit", "hash-guarded change", product="mwi")
    box(mwi, "compile", 730, 130, 200, 100, "Compile", "vendor engine", kind="verify")
    box(mwi, "diag", 960, 130, 200, 100, "Diagnostics", "errors and warnings", kind="verify")
    arrow(mwi, "find", "read")
    arrow(mwi, "read", "edit")
    arrow(mwi, "edit", "compile")
    arrow(mwi, "compile", "diag")
    diagrams.append(mwi)

    optix = Diagram("optix", "FactoryTalk Optix", "The Studio bridge is the truth while Studio is open. Batches are validated dry first, then written, then looked at.", 1240, 340)
    box(optix, "status", 40, 130, 200, 100, "Bridge status", "optix_status", product="optix")
    box(optix, "map", 270, 130, 200, 100, "Read the model", "map, schemas", product="optix")
    box(optix, "dry", 500, 130, 200, 100, "Dry run", "validate the batch", kind="verify")
    box(optix, "write", 730, 130, 200, 100, "Write", "allowWrites", product="optix")
    box(optix, "preview", 960, 130, 200, 100, "Preview", "emulator screenshot", kind="verify")
    arrow(optix, "status", "map")
    arrow(optix, "map", "dry")
    arrow(optix, "dry", "write")
    arrow(optix, "write", "preview", "render", dashed=True)
    diagrams.append(optix)

    return diagrams


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for diagram in build():
        (OUT / f"{diagram.slug}.svg").write_text(svg(diagram), encoding="utf-8")
        png(diagram, OUT / f"{diagram.slug}.png")
        # The handbook supplies its own heading, so it takes a titleless copy:
        # two titles stacked read as a mistake.
        bare = Diagram(
            f"{diagram.slug}-figure", "", "", diagram.width, diagram.height,
            boxes=diagram.boxes, arrows=diagram.arrows, notes=diagram.notes, legend=diagram.legend,
        )
        (OUT / f"{bare.slug}.svg").write_text(svg(bare), encoding="utf-8")
        png(bare, OUT / f"{bare.slug}.png")
        print(f"{diagram.slug}: {len(diagram.boxes)} nodes, {len(diagram.arrows)} arrows")


if __name__ == "__main__":
    main()
