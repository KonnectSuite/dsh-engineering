# How PLC Copilot generates documentation, and what we adopt

Reverse-engineered from the installed application (`C:\Users\KNPhu\AppData\Local\Programs\PLC Copilot`) through the
extraction in `plc-copilot-re\extract\dist-src`. Every claim below names the file it comes from; the renderer bundles are
minified, so the evidence is the module layout, the HTML surface, the stylesheets and the strings — not a clean source
read.

## What they actually built

**One renderer, used twice.** The PDF path is not a second documentation pipeline. `renderer/document-print.html` says so
in its own header comment:

> Keep embed-related scripts in sync with IdeViewer doc preview (markdown + Prism/StView + Ladder* + Mermaid + Referral
> mounts). Do not invent a second markdown pipeline.

The print page loads exactly the chat/preview stack — `marked`, `mermaid`, `prism-core` + `prism-iecst`, and the
`ladder.css` / `referral.css` styles the in-app viewer uses — then `renderer/bundle.print.js` renders into
`#printRoot`.

**A hidden window, not a library.** `main/services/documentPdf.service` + `documentPdfHelpers` (+ `main/ipc/documents.ipc`)
put that page in a hidden window and print it. No PDF library in the renderer, no headless Chromium of their own: Electron
already is one.

**A cover and a print stylesheet.** `renderer/styles/document-print.css` carries a cover block (`#printCover`, 9.6 in,
`page-break-after: always`, a serif title at 2.2 rem) and re-themes the body to paper — white background, `#1c1917` text,
0.75 rem body size. The screen theme is not reused as-is; the document has its own typography.

**Ladder inside the document.** `bundle.print.js` contains a `_wrapChatLadder` path — the doc renderer wraps ladder the
same way the chat does. A document does not show a screenshot of logic; it shows the logic.

**Reports are data, not prose.** `engine/ap-xx/validation/report-shape` suggests the validation report has a declared
shape rather than being assembled ad hoc at the edge.

## What ours does today, honestly

| | PLC Copilot | This bundle |
|---|---|---|
| Figures | rendered by the product, printed through the same renderer | **screenshots of the shipped pane** in headless Chrome (`pnpm docs:figures`) — real, but raster |
| Ladder in prose | a live ladder widget inside the markdown | a PNG reference, or a separate `l5x_routine_diagram` image |
| Code blocks | Prism with IEC Structured Text | plain fences, no ST grammar |
| Print/PDF | hidden window + print CSS + cover | a separately built handbook (DOCX/PDF/HTML) |
| Reference | generated (shape-declared) | generated from the registry (`docs:check` gates it) |

Our figure pipeline is honest and reproducible, and the `docs:check` gate is stronger than anything visible on their side.
The gap is that our documents are **raster and text**, where theirs are **rendered and print-styled**.

## What we adopt, in order

1. **Inline SVG instead of PNG where the code is pure.** The FBD and SFC drawings already come from a pure function
   (`packages/viewer/src/client/diagram.ts` → `diagramSvg`) that runs in Node. Those figures become vector, generated
   from the same code the pane runs, with no browser in the loop. Ladder keeps the browser, because its geometry is the
   DOM's.
2. **One print path for the handbook.** **Done.** The stylesheet lives once, in
   `packages/l5x/src/engine/report-styles.ts`; `pnpm docs:print-css` writes `docs/print.css` from it and `docs:check`
   fails when the file drifts. The handbook no longer has a layout of its own: `scripts/gen-handbook.py` emits the same
   cover, table of contents, section and table markup a report uses, links that stylesheet, and its PDF is printed by
   `scripts/print-pdf.mts` — the same Chrome path, with the same `--no-pdf-header-footer` — instead of reportlab. The
   DOCX output stays, because it is the editable copy and has no print path to share.
3. **Structured Text highlighting.** Adopt the `iecst` grammar for ST fences (Prism ships it, as their bundle shows), so
   an ST example reads as IEC 61131-3 rather than as generic text.
4. **A declared shape for our reports.** `migration_report` already produces DOCX/Markdown; give its payload the same
   treatment their `report-shape` implies — a shape the generator validates, so a report cannot silently lose a section.

**Where the report stands.** It draws in the pane's *language*, not with the pane: contacts, coils, block cards and
rails are emitted as HTML and styled from the same stylesheet, because the pane is a React client that needs the app
shell and a standalone document cannot mount it. A preview tool still draws with `renderLadderSvg`, which runs in Node
with no browser — that difference is deliberate, and the report is the surface that gets the pane's look.

What we do **not** adopt: a second renderer, or embedding the whole application in a document. Item 1 is the one that
matters — the user asked for our own ladder viewer to be the illustration engine, and it already is for screenshots; this
makes it so for diagrams.

## Evidence index

| Path in the extraction | What it establishes |
|---|---|
| `renderer/document-print.html` | the print surface and the "do not invent a second markdown pipeline" rule |
| `renderer/styles/document-print.css` | cover page, paper theme, print typography |
| `renderer/bundle.print.js` | the print bundle, including `_wrapChatLadder` |
| `main/services/documentPdf.service`, `documentPdfHelpers` | the hidden-window PDF path |
| `main/ipc/documents.ipc` | the IPC surface that drives it |
| `engine/ap-xx/validation/report-shape` | reports with a declared shape |
