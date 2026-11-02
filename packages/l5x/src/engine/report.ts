/**
 * Build one self-contained HTML report for an export.
 *
 * This is the document, as opposed to `document_project`'s bundle: a cover, the identity of the
 * controller, what the export contains, the ladder drawn *inside* the page by the same renderer the
 * `l5x_routine_diagram` tool uses, the Structured Text bodies, the diagram elements as tables, the tag
 * list and the I/O modules — one file that prints to PDF from any browser.
 *
 * The renderer is reused rather than reimplemented: a document that drew ladder its own way would be a
 * second, silently diverging picture of the same logic. Every section that cannot be drawn says what it
 * could not draw, and the footer states what a generated document cannot prove.
 *
 * Pure: it returns text and writes nothing, so the tool decides where the file goes.
 *
 * @module dsh-engineering-l5x/engine/report
 */

import type { ProjectSnapshot } from '../session.ts'
import { getRoutine, listRoutines } from '../model/routines.ts'
import type { L5xDiagramNode } from '../model/types.ts'
import { renderLadderSvg } from './render-ladder.ts'

/** What a caller may narrow or title. */
export interface ReportOptions {
  /** Programs to include; defaults to all. */
  readonly programs?: readonly string[]
  /** Routine names to include; defaults to all in the selected programs. */
  readonly routines?: readonly string[]
  /** Title printed on the cover. */
  readonly title?: string
  /** Generation date for the cover, ISO `YYYY-MM-DD`; defaults to today. */
  readonly generated?: string
}

/** The report text and the counts a caller can compare with `project_overview`. */
export interface ReportDocument {
  readonly html: string
  readonly counts: {
    readonly programs: number
    readonly routines: number
    readonly rungs: number
    readonly tags: number
    readonly modules: number
  }
}

/** Escape text for HTML content and attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}

/** One table row from already-safe cells. */
function row(cells: readonly string[]): string {
  return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`
}

/** One table with a header row, or a paragraph when there is nothing to show. */
function table(headers: readonly string[], rows: readonly string[], empty: string): string {
  if (rows.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`
  return `<table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
}

/** The element table for an FBD sheet or an SFC chart. */
function diagramTable(nodes: readonly L5xDiagramNode[]): string {
  const rows = nodes.map(node => row([
    escapeHtml(node.kind),
    escapeHtml(node.operand ?? node.name ?? node.text ?? ''),
    escapeHtml(node.pins ?? ''),
    escapeHtml(node.fromId ?? ''), escapeHtml(node.fromParam ?? ''),
    escapeHtml(node.toId ?? ''), escapeHtml(node.toParam ?? ''),
  ]))
  return table(['Element', 'Reference', 'Pins', 'From', 'From pin', 'To', 'To pin'], rows, 'The export records no elements for this routine.')
}

/** The stylesheet: paper first, with a cover that always starts a page. */
const STYLE = `
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
`

/**
 * Build the report.
 *
 * @param project - Open project snapshot.
 * @param options - Title, date and the program/routine filters.
 * @returns The HTML and its counts.
 */
export function buildReportHtml(project: ProjectSnapshot, options: ReportOptions = {}): ReportDocument {
  const document = project.document
  const controller = document.controller
  const generated = options.generated ?? new Date().toISOString().slice(0, 10)
  const title = options.title ?? `${controller.name || 'Controller'} — engineering report`
  const programs = document.programs.filter(program => options.programs === undefined || options.programs.includes(program.name))
  const allRoutines = programs.flatMap(program => listRoutines(document, program.name))
  const rungs = programs.reduce((total, program) => total + listRoutines(document, program.name).length, 0)
  let routineCount = 0
  let rungCount = 0
  const sections: string[] = []

  for (const program of programs) {
    const body: string[] = []
    for (const info of listRoutines(document, program.name)) {
      if (options.routines !== undefined && !options.routines.includes(info.name)) continue
      const routine = getRoutine(document, program.name, info.name)
      if (routine === undefined) continue
      routineCount += 1
      const description = info.description === '' ? 'No routine description.' : escapeHtml(info.description)
      if (routine.body.type === 'RLL') {
        rungCount += routine.body.rungs.length
        // The same renderer the diagram tool uses: one picture of the logic, not a second one.
        const drawing = routine.body.rungs.length === 0
          ? '<p class="empty">This routine has no rungs.</p>'
          : `<figure>${renderLadderSvg(routine.body.rungs, `${program.name} / ${info.name}`).svg}<figcaption>${escapeHtml(`${program.name} / ${info.name}`)} — drawn by this bundle's ladder renderer; the NeutralText is listed below.</figcaption></figure>`
        const rungs = routine.body.rungs.map(rung => row([
          String(rung.number),
          escapeHtml(rung.comment ?? ''),
          `<code>${escapeHtml(rung.text)}</code>`,
        ]))
        body.push(`<h3>${escapeHtml(info.name)} <span class="tag">RLL</span></h3><p>${description}</p>${drawing}${table(['Rung', 'Comment', 'NeutralText'], rungs, 'This routine has no rungs.')}`)
      } else if (routine.body.type === 'ST') {
        body.push(`<h3>${escapeHtml(info.name)} <span class="tag">ST</span></h3><p>${description}</p><pre><code>${escapeHtml(routine.body.code)}</code></pre>`)
      } else if (routine.body.type === 'FBD' || routine.body.type === 'SFC') {
        const language = routine.body.type === 'FBD' ? 'Function block diagram' : 'Sequential function chart'
        body.push(`<h3>${escapeHtml(info.name)} <span class="tag">${routine.body.type}</span></h3><p>${description}</p><p>${language}; ${routine.body.nodes.length} element(s). Execution semantics are not verified.</p>${diagramTable(routine.body.nodes)}`)
      } else {
        body.push(`<h3>${escapeHtml(info.name)} <span class="tag">other</span></h3><p>${description}</p><p class="empty">Not decomposed: ${escapeHtml(routine.body.note)}.</p>`)
      }
    }
    sections.push(`<h2 class="section">${escapeHtml(program.name)}${program.safety ? ' <span class="tag">SAFETY</span>' : ''}</h2><p>${escapeHtml(program.description === '' ? 'No program description.' : program.description)}</p><p>Main routine: <code>${escapeHtml(program.mainRoutine || 'not declared')}</code></p>${body.join('')}`)
  }

  const tagRows = document.tags.map(tag => row([
    escapeHtml(tag.scope),
    escapeHtml(tag.name),
    escapeHtml(tag.dataType),
    escapeHtml(tag.description ?? ''),
  ]))
  const moduleRows = document.modules.map(module => row([
    escapeHtml(module.name),
    escapeHtml(module.catalogNumber),
    escapeHtml(module.parentModule),
    escapeHtml(module.description ?? ''),
  ]))
  const counts = {
    programs: programs.length,
    routines: routineCount,
    rungs: rungCount,
    tags: document.tags.length,
    modules: document.modules.length,
  }
  const glance = table(
    ['Measure', 'Count'],
    [
      row(['Programs', String(counts.programs)]),
      row(['Routines', String(counts.routines)]),
      row(['Ladder rungs', String(counts.rungs)]),
      row(['Tags', String(counts.tags)]),
      row(['I/O modules', String(counts.modules)]),
      row(['Add-on instructions', String(document.aois.length)]),
      row(['User-defined types', String(document.udts.length)]),
    ],
    'The export is empty.',
  )

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<section class="cover">
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">Generated from an offline L5X export. Nothing in this document was read from a running controller.</p>
  <dl>
    <dt>Controller</dt><dd>${escapeHtml(controller.name || 'not named')}</dd>
    <dt>Controller type</dt><dd>${escapeHtml(controller.processorType || 'not declared')}</dd>
    <dt>Revision</dt><dd>${escapeHtml(`${controller.majorRev}.${controller.minorRev}`)}</dd>
    <dt>Programs</dt><dd>${counts.programs}</dd>
    <dt>Routines</dt><dd>${counts.routines}</dd>
    <dt>Generated</dt><dd>${escapeHtml(generated)}</dd>
  </dl>
  <p class="sub">${escapeHtml(`${allRoutines.length} routine(s) listed in ${programs.length} program(s).`)}</p>
</section>

<h2>At a glance</h2>
${glance}

<h2 class="section">Logic</h2>
${sections.join('\n') || '<p class="empty">No programs were selected.</p>'}

<h2 class="section">Tags</h2>
${table(['Scope', 'Name', 'Type', 'Description'], tagRows, 'The export declares no tags.')}

<h2 class="section">I/O</h2>
${table(['Module', 'Catalog', 'Parent', 'Description'], moduleRows, 'The export declares no I/O modules.')}

<footer>
  <p>Generated from the export only. This document does not prove that the logic is correct, that a preset suits the
  process, that a module is wired as drawn, or anything about runtime behaviour — the ladder is a drawing of the parsed
  rungs, and the coordinates of a chart are what the export recorded, not a verification of it.</p>
</footer>
</body>
</html>
`
  return { html, counts }
}
