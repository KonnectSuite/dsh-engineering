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
import { parseLadder, type LadderNode } from './logic-syntax.ts'
import { instructionByName } from './instructions.ts'
import { REPORT_STYLESHEET } from './report-styles.ts'
import { BRAND, brandFontCss, brandLockupHtml, brandMarkDataUri, brandPackageVersion } from './brand.ts'

/**
 * The sections every report contains, in order.
 *
 * A declared shape, rather than an ad-hoc assembly: a generator that loses a
 * section (an empty filter, a branch that returns early) fails here instead of
 * shipping a document that is quietly missing its tag list.
 */
export const REPORT_SECTIONS = ['glance', 'logic', 'tags', 'io'] as const

/** One named report section. */
export type ReportSectionName = typeof REPORT_SECTIONS[number]

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
  /**
   * The caller's own narrative, as Markdown, printed as a `Changes` section after
   * the cover.
   *
   * A report that only inventories the export cannot say what changed or why. The
   * writer supplies that prose; this generator supplies the structure, the ladder
   * and the citations it can prove.
   */
  readonly notes?: string
}

/** The report text and the counts a caller can compare with `project_overview`. */
export interface ReportDocument {
  readonly html: string
  /** Sections this document carries, in page order. */
  readonly sections: readonly (ReportSectionName | 'changes')[]
  readonly counts: {
    readonly programs: number
    readonly routines: number
    readonly rungs: number
    readonly tags: number
    readonly modules: number
  }
}

/** Structured Text words that are keywords at the start of a statement or clause. */
const ST_KEYWORDS = new Set([
  'IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'CASE', 'OF', 'END_CASE',
  'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT',
  'RETURN', 'EXIT', 'CONTINUE',
  'PROGRAM', 'END_PROGRAM', 'FUNCTION', 'END_FUNCTION', 'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
  'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'VAR_GLOBAL', 'END_VAR',
  'CONSTANT', 'RETAIN', 'NON_RETAIN', 'AT',
  'TRUE', 'FALSE', 'AND', 'OR', 'XOR', 'NOT', 'MOD',
])

/**
 * Highlight one Structured Text body.
 *
 * Not Prism and not a parser: a small scanner over the text that colours what a
 * reader needs to skim — comments, string literals, keywords, numbers and
 * directives — and leaves everything else as text. It runs in Node with no
 * dependency and cannot change what the document says, because every token is
 * escaped before it is wrapped in a span.
 *
 * @param code - The routine body as the export records it.
 * @returns HTML with the tokens wrapped in `st-*` spans.
 */
export function highlightSt(code: string): string {
  const parts: string[] = []
  let index = 0
  while (index < code.length) {
    const rest = code.slice(index)
    // Block comment, line comment, string literal, number, word, anything else.
    const match = /^(\(\*[\s\S]*?\*\))|^(\/\/[^\n]*)|^('(?:[^'$]|\$(?:"|'))*')|^(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|^([A-Za-z_][A-Za-z0-9_]*)|^([\s\S])/u.exec(rest)
    if (match === null) break
    const [token] = match
    const isComment = match[1] !== undefined || match[2] !== undefined
    const isString = match[3] !== undefined
    const isNumber = match[4] !== undefined
    const isWord = match[5] !== undefined
    const kind = isComment ? 'comment'
      : isString ? 'string'
        : isNumber ? 'number'
          : isWord && ST_KEYWORDS.has(token.toUpperCase()) ? 'keyword'
            : undefined
    parts.push(kind === undefined ? escapeHtml(token) : `<span class="st-${kind}">${escapeHtml(token)}</span>`)
    index += token.length
  }
  return parts.join('')
}


/** The text of one operand, as the export wrote it. */
function operandText(tokens: readonly { readonly text: string }[]): string {
  return tokens.map(token => token.text).join('')
}

/**
 * One ladder element in the pane's own language.
 *
 * A contact is two bars with an optional negation slash, a coil is an oval, and
 * everything else is a block card with the mnemonic as its header. The tag the
 * element operates on sits underneath it, which is how the app's pane draws a
 * rung — the document used to draw a coloured box with `XIC(Start)` inside it,
 * a picture that read as a different component from the one the app shows.
 */
function elementHtml(node: Extract<LadderNode, { kind: 'instruction' }>): string {
  const name = node.name.toUpperCase()
  // The label sits above the symbol and is wider than it, so the element reserves
  // the label's own width. Without this, two adjacent contacts printed their tags
  // into each other: `Stop` and `Run` overlapped on the wire.
  const width = (label: string, symbol: number): string => `min-width:${Math.max(symbol, label.length * 6 + 12)}px`
  if (name === 'XIC' || name === 'XIO') {
    const negated = name === 'XIO' ? ' neg' : ''
    const text = operandText(node.operands[0] ?? [])
    return `<span class="ldr-el" style="${width(text, 26)}"><i class="ldr-contact${negated}"></i><b class="ldr-label">${escapeHtml(text)}</b></span>`
  }
  if (name === 'OTE' || name === 'OTL' || name === 'OTU') {
    const text = operandText(node.operands[0] ?? [])
    return `<span class="ldr-el" style="${width(text, 30)}"><i class="ldr-coil"></i><b class="ldr-label">${escapeHtml(text)}</b></span>`
  }
  // What a block writes goes on the right, what it reads on the left, the way the
  // programming manual draws it. The catalog marks the written slots (`writable`),
  // so a destination is placed by data rather than by guessing from position.
  const info = instructionByName(node.name)
  const inputs: string[] = []
  const outputs: string[] = []
  node.operands.forEach((operand, index) => {
    const value = operandText(operand)
    if (value === '') return
    if (info?.operands[index]?.writable === true) outputs.push(value)
    else inputs.push(value)
  })
  const rows = Math.max(inputs.length, outputs.length)
  const pins = Array.from({ length: rows }, (_, row) => `<span class="ldr-in">${escapeHtml(inputs[row] ?? '')}</span><span class="ldr-out">${escapeHtml(outputs[row] ?? '')}</span>`).join('')
  return `<span class="ldr-el"><span class="ldr-block"><strong>${escapeHtml(node.name)}</strong><span class="ldr-pins">${pins}</span></span></span>`
}

/**
 * A sequence of elements joined by wire.
 *
 * A rung reads left to right and ends at its output: the last element is pushed to
 * the right rail and the wire before it takes the slack, which is how the pane and
 * Studio draw it. Without the spread, a coil sat just after the last contact with
 * empty wire to its right, so the output read as another input.
 * @param nodes - The sequence, already parsed.
 * @param spread - True for a rung's own flow; false inside a branch path, where
 *   elements stay adjacent to the rail that closes them.
 */
function flowHtml(nodes: readonly LadderNode[], spread = false): string {
  const parts = nodes.map(node => node.kind === 'branch' ? branchHtml(node) : elementHtml(node))
  const tail = '<span class="ldr-wire ldr-tail"></span>'
  if (!spread || parts.length < 2) return `${parts.join('<span class="ldr-wire"></span>')}${tail}`
  const head = parts.slice(0, -1).join('<span class="ldr-wire"></span>')
  return `${head}<span class="ldr-wire ldr-grow"></span>${parts[parts.length - 1]!}${tail}`
}

/** Parallel paths as a bordered column, the way the pane draws a branch. */
function branchHtml(node: Extract<LadderNode, { kind: 'branch' }>): string {
  const paths = node.paths.map(path => `<span class="ldr-path">${flowHtml(path)}</span>`).join('')
  return `<span class="ldr-branch">${paths}</span>`
}

/** Every rung of one routine, drawn from its parsed NeutralText. */
function ladderHtml(rungs: readonly { readonly number: number; readonly text: string; readonly comment?: string }[]): string {
  const rows = rungs.map(rung => {
    const parsed = parseLadder(rung.text)
    const comment = rung.comment === undefined || rung.comment === ''
      ? ''
      : `<div class="ldr-comment">${escapeHtml(rung.comment)}</div>`
    const flow = parsed.nodes.length === 0
      ? '<span class="ldr-empty">This rung did not parse into a sequence.</span>'
      : flowHtml(parsed.nodes, true)
    return `<div class="ldr-rung"><div class="ldr-num">${rung.number}</div><div class="ldr-body">${comment}<div class="ldr-flow">${flow}</div></div></div>`
  })
  return `<div class="ldr">${rows.join('')}</div>`
}

/**
 * Render a small Markdown subset as report HTML.
 *
 * Wrapped source lines belong to the same paragraph or list item — a hard line
 * break inside a bullet is the writer's margin, not a new block. Blocks end at a
 * blank line, a heading, a fence or a new list marker.
 * @param markdown - The caller's narrative.
 * @returns HTML for the Changes section.
 */
function markdownHtml(markdown: string): string {
  const inline = (line: string): string => escapeHtml(line)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let paragraph: string[] = []
  let item: string[] | null = null
  let code = false
  const flushItem = (): void => {
    if (item !== null) { out.push(`<li>${inline(item.join(' '))}</li>`); item = null }
  }
  const closeList = (): void => {
    flushItem()
    if (list !== null) { out.push(`</${list}>`); list = null }
  }
  const flushParagraph = (): void => {
    if (paragraph.length > 0) { out.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = [] }
  }
  for (const raw of markdown.split(/\r?\n/u)) {
    const line = raw.trimEnd()
    if (/^```/u.test(line)) {
      flushParagraph()
      closeList()
      if (code) { out.push('</code></pre>'); code = false } else { out.push('<pre><code>'); code = true }
      continue
    }
    if (code) { out.push(escapeHtml(raw)); continue }
    if (line.trim() === '') { flushParagraph(); closeList(); continue }
    const heading = /^(#{1,4})\s+(.*)$/u.exec(line)
    if (heading !== null) {
      flushParagraph()
      closeList()
      const level = Math.min(6, heading[1]!.length + 1)
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`)
      continue
    }
    const bullet = /^[-*]\s+(.*)$/u.exec(line)
    if (bullet !== null) {
      if (list !== 'ul') { flushParagraph(); closeList(); out.push('<ul>'); list = 'ul' }
      flushItem()
      item = [bullet[1]!]
      continue
    }
    const numbered = /^\d+[.)]\s+(.*)$/u.exec(line)
    if (numbered !== null) {
      if (list !== 'ol') { flushParagraph(); closeList(); out.push('<ol>'); list = 'ol' }
      flushItem()
      item = [numbered[1]!]
      continue
    }
    if (item !== null) { item.push(line.trim()); continue }
    paragraph.push(line.trim())
  }
  flushParagraph()
  closeList()
  if (code) out.push('</code></pre>')
  return out.join('\n')
}

/** The heading each declared section prints. */
const SECTION_TITLES: Record<ReportSectionName | 'changes', string> = {
  changes: 'Changes',
  glance: 'At a glance',
  logic: 'Logic',
  tags: 'Tags',
  io: 'I/O',
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
        // The pane's own language: contacts, coils and block cards, not a second
        // drawing of the logic in coloured boxes.
        const drawing = routine.body.rungs.length === 0
          ? '<p class="empty">This routine has no rungs.</p>'
          : `<figure>${ladderHtml(routine.body.rungs)}<figcaption>${escapeHtml(`${program.name} / ${info.name}`)} — drawn from the parsed NeutralText; the text itself is listed below.</figcaption></figure>`
        const rungs = routine.body.rungs.map(rung => row([
          String(rung.number),
          escapeHtml(rung.comment ?? ''),
          `<code>${escapeHtml(rung.text)}</code>`,
        ]))
        body.push(`<h3>${escapeHtml(info.name)} <span class="tag">RLL</span></h3><p>${description}</p>${drawing}${table(['Rung', 'Comment', 'NeutralText'], rungs, 'This routine has no rungs.')}`)
      } else if (routine.body.type === 'ST') {
        body.push(`<h3>${escapeHtml(info.name)} <span class="tag">ST</span></h3><p>${description}</p><pre><code>${highlightSt(routine.body.code)}</code></pre>`)
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

  // The declared shape, filled here and checked before the page is assembled: a
  // section that came out empty is a generator defect, not an empty project.
  // The declared shape plus, when the caller supplied prose, the Changes section.
  const ordered = (options.notes === undefined ? REPORT_SECTIONS : ['changes', ...REPORT_SECTIONS]) as readonly (ReportSectionName | 'changes')[]
  const rendered: Record<string, string> = {
    ...(options.notes === undefined ? {} : { changes: markdownHtml(options.notes) }),
    glance,
    logic: sections.join('\n') || '<p class="empty">No programs were selected.</p>',
    tags: table(['Scope', 'Name', 'Type', 'Description'], tagRows, 'The export declares no tags.'),
    io: table(['Module', 'Catalog', 'Parent', 'Description'], moduleRows, 'The export declares no I/O modules.'),
  }
  const missing = ordered.filter(name => (rendered[name] ?? '').trim() === '')
  if (missing.length > 0) throw new Error(`report is missing section(s): ${missing.join(', ')}`)
  const sectionNumber = (name: ReportSectionName | 'changes'): string => String(ordered.indexOf(name) + 1).padStart(2, '0')
  const toc = `<nav class="toc"><h2>Contents</h2><ol>${ordered.map(name => `<li><a href="#${name}"><span class="num">${sectionNumber(name)}</span>${SECTION_TITLES[name]}</a></li>`).join('')}</ol></nav>`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${brandFontCss()}${REPORT_STYLESHEET}</style>
</head>
<body>
<section class="cover">
  <div class="brandbar"></div>
  ${brandLockupHtml()}
  <p class="eyebrow">Engineering report</p>
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

${toc}

${options.notes === undefined ? '' : `<h2 class="section" id="changes"><span class="num">${sectionNumber('changes')}</span>Changes</h2>\n${rendered.changes}`}
<h2 id="glance"><span class="num">${sectionNumber('glance')}</span>At a glance</h2>
${rendered.glance}

<h2 class="section" id="logic"><span class="num">${sectionNumber('logic')}</span>Logic</h2>
${rendered.logic}

<h2 class="section" id="tags"><span class="num">${sectionNumber('tags')}</span>Tags</h2>
${rendered.tags}

<h2 class="section" id="io"><span class="num">${sectionNumber('io')}</span>I/O</h2>
${rendered.io}

<footer>
  <div class="footer-rule"></div>
  <p>${brandMarkDataUri() === undefined ? '' : `<img class="mark-small" src="${brandMarkDataUri()}" alt="">`}<strong>${BRAND.name} Engineering</strong> · @aryacode/dsh-engineering${brandPackageVersion() === undefined ? '' : ` ${brandPackageVersion()}`} · generated ${escapeHtml(generated)}</p>
  <p>Generated from the export only. This document does not prove that the logic is correct, that a preset suits the
  process, that a module is wired as drawn, or anything about runtime behaviour — the ladder is a drawing of the parsed
  rungs, and the coordinates of a chart are what the export recorded, not a verification of it.</p>
</footer>
</body>
</html>
`
  return { html, sections: ordered, counts }
}
