/**
 * The generated report: one printable document inside the bundle, its declared
 * shape, the paper palette its ladder is drawn with, and what happens when no
 * browser can turn it into a PDF.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'
import { highlightSt, REPORT_SECTIONS } from '../src/engine/report.ts'

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
