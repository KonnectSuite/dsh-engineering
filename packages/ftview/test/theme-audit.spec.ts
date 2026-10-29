import { describe, expect, it } from 'vitest'
import { themeAudit } from '../src/theme-audit.ts'
import { SCAFFOLD_THEME } from '../src/edit/scaffold.ts'
import type { Application, DisplayFile, DisplayObject } from '../src/model.ts'

/** One object with attributes. */
function object(type: string, name: string, attributes: Record<string, string>): DisplayObject {
  return { type, name, attributes }
}

/** One display file. */
function display(name: string, objects: readonly DisplayObject[]): DisplayFile {
  return { file: `Displays/${name}.xml`, name, objects }
}

/** The minimum application the audit reads. */
function appWith(displays: readonly DisplayFile[]): Application {
  return { root: 'C:/export', name: 'App', displays, tags: [], tagFiles: [], tagErrors: [], diagnostics: [], files: [] }
}

/** A display with the given backdrop and optional bands. */
function shell(name: string, backdrop: string, bands: { header?: boolean; footer?: boolean }): DisplayFile {
  const objects: DisplayObject[] = [
    object('displaySettings', 'displaySettings', { width: '640', height: '480', backColor: backdrop }),
  ]
  if (bands.header === true) {
    objects.push(object('panel', 'HeaderBar', { left: '0', top: '0', width: '640', height: '88', backColor: SCAFFOLD_THEME.header }))
  }
  if (bands.footer === true) {
    objects.push(object('panel', 'FooterBar', { left: '0', top: '420', width: '640', height: '60', backColor: SCAFFOLD_THEME.footer }))
  }
  return display(name, objects)
}

describe('the theme audit', () => {
  it('counts a scaffolded display as conforming', () => {
    const audit = themeAudit(appWith([shell('Overview', SCAFFOLD_THEME.backdrop, { header: true, footer: true })]))
    expect(audit.total).toBe(1)
    expect(audit.conforming).toBe(1)
    expect(audit.findings).toHaveLength(0)
    expect(audit.rows[0]).toMatchObject({ display: 'Overview', backdropMatch: true, header: true, footer: true, conforming: true })
  })

  it('flags a display that starts with the backdrop but no bands', () => {
    const audit = themeAudit(appWith([shell('Settings', SCAFFOLD_THEME.backdrop, {})]))
    expect(audit.conforming).toBe(0)
    expect(audit.rows[0]).toMatchObject({ header: false, footer: false, paletteShare: 1 })
    const finding = audit.findings[0]
    expect(finding?.rule).toBe('VIEW-THEME-01')
    expect(finding?.severity).toBe('info')
    expect(finding?.message).toContain('Settings')
    expect(finding?.message).toContain('header band missing')
    expect(finding?.evidence).toMatchObject({ header: false, footer: false })
  })

  it('reports a partial palette share for a half-restyled screen', () => {
    const audit = themeAudit(appWith([display('Half', [
      object('displaySettings', 'displaySettings', { width: '640', height: '480', backColor: SCAFFOLD_THEME.backdrop }),
      object('panel', 'HeaderBar', { left: '0', top: '0', width: '640', height: '88', backColor: SCAFFOLD_THEME.header }),
      object('panel', 'LegacyPanel', { left: '20', top: '200', width: '200', height: '80', backColor: '#800000' }),
    ])]))
    expect(audit.rows[0]?.paletteShare).toBe(0.67)
    expect(audit.conforming).toBe(0)
  })

  it('audits against a custom palette when overrides are given', () => {
    const audit = themeAudit(appWith([shell('Main', '#0088C8', { header: true, footer: true })]), {
      ...SCAFFOLD_THEME,
      backdrop: '#0088C8',
    })
    expect(audit.conforming).toBe(1)
  })

  it('leaves an unthemed legacy display as a single finding', () => {
    const audit = themeAudit(appWith([
      shell('Main', '#C6C6C6', {}),
      shell('Popup', '#C6C6C6', {}),
      shell('Overview', SCAFFOLD_THEME.backdrop, { header: true, footer: true }),
    ]))
    expect(audit.total).toBe(3)
    expect(audit.conforming).toBe(1)
    expect(audit.findings.map(finding => finding.evidence?.display)).toEqual(['Main', 'Popup'])
  })
})
