/**
 * The generated report: one printable document inside the bundle, its declared
 * shape, the paper palette its ladder is drawn with, and what happens when no
 * browser can turn it into a PDF.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'
import { buildReportHtml, highlightSt, REPORT_SECTIONS } from '../src/engine/report.ts'
import { loadL5x } from '../src/model/parse.ts'

/** The fixture export as text, for the pure generator. */
function fixtureText(): string {
  return new TextDecoder().decode(fixtureBytes())
}

/** Open the fixture with the editing entry mounted. */
async function opened() {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('document_project report', () => {
  it('writes one printable report that carries every declared section', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs', include: ['report'] })
    expect(result.error).toBeUndefined()
    const html = l5x.written.get('docs/report.html')
    expect(html, 'report.html was not written').toBeDefined()
    const text = String(html)
    expect(text.startsWith('<!doctype html>')).toBe(true)
    // The declared shape: a section that is missing fails the generator, and the
    // anchors it prints are the ones the table of contents links to.
    expect(REPORT_SECTIONS).toEqual(['glance', 'logic', 'tags', 'io'])
    for (const section of REPORT_SECTIONS) {
      expect(text).toContain(`id="${section}"`)
      expect(text).toContain(`href="#${section}"`)
    }
    expect(text).toContain('<nav class="toc">')
  })

  it('draws ladder in the pane\'s language rather than as coloured boxes', async () => {
    const l5x = await opened()
    await l5x.call('document_project', { output_root: 'docs', include: ['report'] })
    const text = String(l5x.written.get('docs/report.html'))
    // The pane draws contacts as two bars, coils as an oval and block cards with
    // a header; the document used to draw a second picture in coloured boxes.
    expect(text).toContain('class="ldr-rung"')
    expect(text).toContain('ldr-contact')
    expect(text).toContain('ldr-coil')
    expect(text).toContain('ldr-label')
    // No second drawing: the document carries no ladder SVG at all.
    expect(text).not.toContain('<svg')
    expect(text).not.toContain('#0B1220')
  })

  it('reports PDF unavailability instead of silently skipping the PDF', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs', include: ['report'], report_format: 'pdf' })
    expect(result.error).toBeUndefined()
    const pdf = l5x.written.get('docs/report.pdf')
    const unavailable = result.data?.report?.unavailable
    // Either a PDF exists, or the tool says why it does not — never neither.
    expect(pdf !== undefined || (typeof unavailable === 'string' && unavailable.length > 0)).toBe(true)
  })

  it('highlights Structured Text tokens without changing the text', () => {
    const code = "IF Start AND NOT Stop THEN (* note *) Speed := 12.5; END_IF;"
    const html = highlightSt(code)
    expect(html).toContain('st-keyword')
    expect(html).toContain('st-comment')
    expect(html).toContain('st-number')
    // Stripped of markup the body is unchanged: highlighting cannot rewrite logic.
    expect(html.replace(/<[^>]+>/gu, '')).toBe(code)
  })
})

describe('report notes', () => {
  it('prints the writer\'s prose as a Changes section ahead of the logic', () => {
    const report = buildReportHtml({ document: loadL5x(fixtureText()) } as never, {
      notes: '## What changed\nThe laser now faults when the beam is off target.\n\n- new tag NS_Dist_Laser_On_Target\n- debounce 2000 ms',
    })
    const html = report.html
    // The section exists, is numbered first, and is listed in the contents.
    expect(html).toContain('id="changes"')
    expect(html).toContain('<span class="num">01</span>Changes')
    expect(report.sections[0]).toBe('changes')
    // The Markdown became structure, not literal text.
    expect(html).toContain('<p>The laser now faults when the beam is off target.</p>')
    expect(html).toContain('<li>new tag NS_Dist_Laser_On_Target</li>')
    // At a glance moved to 02, and the ladder is still drawn.
    expect(html).toContain('<span class="num">02</span>At a glance')
    expect(html).toContain('class="ldr-')
  })

  it('omits the section, and the numbering, when there are no notes', () => {
    const report = buildReportHtml({ document: loadL5x(fixtureText()) } as never, {})
    expect(report.html).not.toContain('id="changes"')
    expect(report.sections).toEqual(REPORT_SECTIONS)
  })
})
