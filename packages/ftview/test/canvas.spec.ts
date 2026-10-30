import { describe, expect, it } from 'vitest'
import { designFindings } from '../src/design.ts'
import type { Application, DisplayFile } from '../src/model.ts'

/** One display carrying only the displaySettings child the parser keeps. */
function display(name: string, width: number, height: number, displayType = 'replace'): DisplayFile {
  return {
    file: `Displays/${name}.xml`,
    name,
    objects: [{ type: 'displaySettings', attributes: { displayType, width: String(width), height: String(height) } }],
  }
}

function app(displays: DisplayFile[]): Application {
  return {
    root: 'export',
    name: 'TestApp',
    displays,
    tags: [],
    tagFiles: [],
    tagErrors: [],
    alarmFiles: [],
    diagnostics: [],
    files: [],
  }
}

describe('canvas consistency', () => {
  it('names the display whose canvas differs from the common size', () => {
    const findings = designFindings(app([display('Main Screen', 800, 600), display('Setup', 800, 600), display('Trend', 1024, 768)]))
    const canvas = findings.filter(finding => finding.rule === 'VIEW-LAYOUT-02')
    expect(canvas).toHaveLength(1)
    expect(canvas[0]?.severity).toBe('info')
    expect(canvas[0]?.message).toContain('Trend is 1024x768')
    expect(canvas[0]?.message).toContain('800x600')
    expect(canvas[0]?.evidence).toMatchObject({ display: 'Trend', width: 1024, height: 768, common: '800x600', common_count: 2 })
  })

  it('stays quiet when every display shares one canvas', () => {
    const findings = designFindings(app([display('Main Screen', 800, 600), display('Setup', 800, 600), display('Trend', 800, 600)]))
    expect(findings.filter(finding => finding.rule === 'VIEW-LAYOUT-02')).toHaveLength(0)
  })

  it('does not compare popups against full-screen displays', () => {
    const findings = designFindings(app([
      display('Main Screen', 800, 600),
      display('Setup', 800, 600),
      display('Confirm PopUp', 395, 190, 'onTop'),
    ]))
    expect(findings.filter(finding => finding.rule === 'VIEW-LAYOUT-02')).toHaveLength(0)
  })

  it('stays quiet when no size wins or sizes are missing', () => {
    const tied = designFindings(app([display('A', 800, 600), display('B', 1024, 768)]))
    expect(tied.filter(finding => finding.rule === 'VIEW-LAYOUT-02')).toHaveLength(0)
    const missing = designFindings(app([
      { file: 'Displays/C.xml', name: 'C', objects: [] },
      { file: 'Displays/D.xml', name: 'D', objects: [] },
    ]))
    expect(missing.filter(finding => finding.rule === 'VIEW-LAYOUT-02')).toHaveLength(0)
  })
})
