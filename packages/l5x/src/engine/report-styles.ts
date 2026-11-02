/**
 * The print stylesheet, in one place.
 *
 * A generated report and the handbook are the same kind of document: a cover,
 * a table of contents, sections that start on their own page, tables, figures
 * and a footer. They were rendered by two different engines with two different
 * layouts (reportlab for the handbook, this page for the report), so the same
 * repository shipped two typographies. This constant is the single definition;
 * `scripts/gen-print-css.mts` writes `docs/print.css` from it for the handbook,
 * and `report.ts` inlines it for a generated document.
 *
 * @module dsh-engineering-l5x/engine/report-styles
 */

/** The print stylesheet shared by generated documents and the handbook. */
export const REPORT_STYLESHEET = `
@page { size: letter; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1c1917; background: #fff; font: 12px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
.cover { min-height: 92vh; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
.cover h1 { font: 700 30px/1.2 Georgia, 'Times New Roman', serif; margin: 0 0 6px; letter-spacing: -0.01em; }
.cover .sub { font-size: 14px; color: #57534e; margin-bottom: 28px; }
.cover dl { display: grid; grid-template-columns: 150px 1fr; gap: 4px 12px; margin: 0 0 28px; font-size: 12px; }
.cover dt { color: #78716c; }
.cover dd { margin: 0; }
h2 { font: 600 17px/1.3 Georgia, 'Times New Roman', serif; margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d6d3d1; page-break-after: avoid; }
h2.section { page-break-before: always; }
h3 { font-size: 13px; margin: 18px 0 6px; page-break-after: avoid; }
p { margin: 6px 0; }
.empty { color: #78716c; font-style: italic; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 11px; }
th, td { text-align: left; vertical-align: top; padding: 3px 6px; border-bottom: 1px solid #e7e5e4; }
th { background: #f5f5f4; font-weight: 600; }
figure { margin: 10px 0 16px; }
figure svg { width: 100%; height: auto; border: 1px solid #e7e5e4; border-radius: 4px; }
figcaption { font-size: 10px; color: #78716c; margin-top: 4px; }
pre { background: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 4px; padding: 10px; overflow-x: auto; font-size: 11px; }
code { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #d6d3d1; font-size: 10px; color: #78716c; }
.tag { font: 600 9px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .06em; color: #57534e; border: 1px solid #d6d3d1; border-radius: 3px; padding: 2px 4px; vertical-align: 2px; }
.toc { margin: 0 0 18px; }
.toc ol { margin: 4px 0 0; padding-left: 20px; font-size: 12px; }
.toc li { margin: 2px 0; }
.toc a { color: #1c1917; text-decoration: none; border-bottom: 1px dotted #a8a29e; }
.st-keyword { color: #7c3aed; font-weight: 600; }
.st-comment { color: #78716c; font-style: italic; }
.st-string { color: #15803d; }
.st-number { color: #b45309; }

/* The ladder, in the same language the app's pane uses: contacts are two bars,
   coils an oval, blocks a card with a header and pin rows, the rails are two
   thick rules at the ends of the rung, and every symbol carries its tag
   underneath. Colours are the paper palette, not the pane's dark theme. */
.ldr { margin: 10px 0 2px; }
.ldr-rung { display: grid; grid-template-columns: 34px minmax(0, 1fr); border-bottom: 1px solid #e7e5e4; }
.ldr-num { color: #78716c; font: 10px/1 ui-monospace, Consolas, monospace; padding: 10px 4px 0 0; text-align: right; }
.ldr-body { border-left: 2px solid #44403c; border-right: 2px solid #44403c; padding: 10px 12px 10px 22px; }
.ldr-comment { color: #57534e; font-size: 10px; margin: 0 0 8px; }
.ldr-flow { display: flex; align-items: center; min-height: 46px; }
.ldr-flow:first-child { padding-top: 2px; }
.ldr-flow + .ldr-path { border-top: 1px solid #d6d3d1; }
.ldr-el { position: relative; display: inline-flex; align-items: center; justify-content: center; height: 16px; flex: 0 0 auto; }
.ldr-contact { display: block; width: 15px; height: 15px; border-left: 2px solid #17703a; border-right: 2px solid #17703a; }
.ldr-contact.neg { position: relative; }
.ldr-contact.neg::after { content: ''; position: absolute; left: -4px; top: 6px; width: 19px; height: 1.5px; transform: rotate(-35deg); background: #17703a; }
.ldr-coil { display: block; width: 20px; height: 16px; border: 2px solid #17703a; border-radius: 50%; }
.ldr-label { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); font: 10px/1.1 ui-monospace, Consolas, monospace; color: #1c1917; white-space: nowrap; }
.ldr-wire { flex: 0 0 14px; height: 2px; background: #44403c; }
.ldr-tail { flex: 1 1 auto; }
.ldr-branch { display: inline-flex; flex-direction: column; border-left: 2px solid #44403c; border-right: 2px solid #44403c; flex: 0 0 auto; min-width: 48px; margin: 0 3px; }
.ldr-path { display: flex; align-items: center; min-height: 30px; padding: 0 10px; }
.ldr-path + .ldr-path { border-top: 1px solid #d6d3d1; }
.ldr-block { display: inline-flex; flex-direction: column; min-width: 64px; border: 1px solid #44403c; background: #fff; }
.ldr-block > strong { display: block; padding: 2px 5px; background: #f5f5f4; border-bottom: 1px solid #e7e5e4; font: 600 9px/1.3 ui-monospace, Consolas, monospace; }
.ldr-block > span { display: block; padding: 1px 5px; font: 9px/1.35 ui-monospace, Consolas, monospace; color: #57534e; }
.ldr-empty { color: #78716c; font-style: italic; }
`
