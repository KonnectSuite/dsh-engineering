/**
 * SVG rendering of a display, and the rasteriser fallback.
 */
import { existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBrowser, renderDisplaySvg, settingsFromXml } from '../src/render-svg.ts'
import { parseDisplay } from '../src/model.ts'
import { harness } from './harness.ts'

const GFX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="800" height="600" backColor="#101820"/>',
  '    <screen name="Header" type="panel" left="0" top="0" width="800" height="80" backColor="#005A8C"/>',
  '    <screen name="Title" type="text" left="24" top="24" width="400" height="32" fontSize="28" color="#FFFFFF" caption="PILOT &amp; LINE"/>',
  '    <screen name="Start" type="momentaryButton" left="40" top="120" width="160" height="48" fontSize="18" caption="START" backColor="#FFFFFF"/>',
  '    <screen name="Lamp" type="multistateIndicator" left="240" top="120" width="40" height="40" backColor="#00C853"/>',
  '    <screen name="Hidden" type="text" left="0" top="0" caption="no geometry"/>',
  '</gfx>',
  '',
].join('\n')

describe('settingsFromXml', () => {
  it('reads the canvas and falls back to the template defaults', () => {
    expect(settingsFromXml(GFX)).toEqual({ width: 800, height: 600, backColor: '#101820' })
    expect(settingsFromXml('<gfx></gfx>')).toEqual({ width: 640, height: 480, backColor: '#C6C6C6' })
  })
})

describe('renderDisplaySvg', () => {
  const settings = settingsFromXml(GFX)
  const objects = [
    { type: 'panel', name: 'Header', attributes: { left: '0', top: '0', width: '800', height: '80', backColor: '#005A8C' } },
    { type: 'text', name: 'Title', attributes: { left: '24', top: '24', width: '400', height: '32', fontSize: '28', color: '#FFFFFF', caption: 'PILOT & LINE' } },
    { type: 'momentaryButton', name: 'Start', attributes: { left: '40', top: '120', width: '160', height: '48', fontSize: '18', caption: 'START', backColor: '#FFFFFF' } },
    { type: 'multistateIndicator', name: 'Lamp', attributes: { left: '240', top: '120', width: '40', height: '40', backColor: '#00C853' } },
    { type: 'text', name: 'Hidden', attributes: {} },
  ]

  it('draws the canvas and the geometry of each object', () => {
    const result = renderDisplaySvg('Overview', objects, settings)
    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
    expect(result.drawn).toBe(4)
    expect(result.skipped).toEqual(['Hidden'])
    expect(result.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"')
    expect(result.svg).toContain('fill="#101820"')
    expect(result.svg).toContain('<rect x="0" y="0" width="800" height="80" fill="#005A8C"/>')
  })

  it('escapes text and centres button captions', () => {
    const result = renderDisplaySvg('Overview', objects, settings)
    expect(result.svg).toContain('PILOT &amp; LINE')
    expect(result.svg).toContain('text-anchor="middle"')
    expect(result.svg).toContain('>START</text>')
  })

  it('draws indicators as circles', () => {
    const result = renderDisplaySvg('Overview', objects, settings)
    expect(result.svg).toContain('<circle cx="260" cy="140" r="20" fill="#00C853"/>')
  })

  it('inlines a raster the display references', () => {
    const images = new Map([['Carpenter', { mime: 'image/png', base64: 'AAAA' }]])
    const result = renderDisplaySvg('Overview', [{ type: 'image', name: 'Logo', attributes: { left: '10', top: '10', width: '100', height: '40', imageName: 'Carpenter' } }], settings, images)
    expect(result.svg).toContain('href="data:image/png;base64,AAAA"')
  })

  it('labels an image whose file was not found', () => {
    const result = renderDisplaySvg('Overview', [{ type: 'image', name: 'Logo', attributes: { left: '10', top: '10', width: '100', height: '40', imageName: 'Missing' } }], settings)
    expect(result.svg).toContain('>Logo</text>')
  })
  it('labels widgets it cannot render instead of dropping them', () => {
    const result = renderDisplaySvg('Overview', [{ type: 'vendorWidget', name: 'Trend1', attributes: { left: '10', top: '10', width: '100', height: '50' } }], settings)
    expect(result.svg).toContain('>Trend1</text>')
  })
})

describe('ftview_render', { timeout: 30_000 }, () => {
  it('writes the SVG next to the export and reports the browser', async () => {
    const files = new Map([['export/Displays/Overview.xml', GFX]])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const output = join(mkdtempSync(join(tmpdir(), 'ftview-render-')), 'renders')
    const result = await l5x.call('ftview_render', { view_id: open.data?.view_id as string, display: 'Overview', output })
    expect(result.error).toBeUndefined()
    const svg = result.data?.svg as string
    expect(existsSync(svg)).toBe(true)
    expect(readFileSync(svg, 'utf8')).toContain('<svg')
    expect(result.data?.browser).toBe(findBrowser() ?? null)
  })

  it('renders the staged draft before it is applied', async () => {
    const files = new Map([['export/Displays/Overview.xml', GFX]])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string
    const staged = await l5x.call('ftview_draft_object_add', { view_id: view, display: 'Overview', type: 'text', name: 'DraftNote', attributes_json: '{"left":"40","top":"220","width":"320","height":"24","caption":"DRAFT ONLY"}' })
    expect(staged.error).toBeUndefined()
    const output = join(mkdtempSync(join(tmpdir(), 'ftview-draft-')), 'renders')
    const result = await l5x.call('ftview_render', { view_id: view, display: 'Overview', source: 'draft', output })
    expect(result.error).toBeUndefined()
    expect(result.data?.source).toBe('draft')
    expect(readFileSync(result.data?.svg as string, 'utf8')).toContain('>DRAFT ONLY</tspan>')
  })

  it('says so when the draft does not touch the display', async () => {
    const files = new Map([['export/Displays/Overview.xml', GFX], ['export/Displays/Other.xml', GFX.replace('Overview', 'Other')]])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string
    await l5x.call('ftview_draft_object_add', { view_id: view, display: 'Overview', type: 'text', name: 'DraftNote', attributes_json: '{"left":"10","top":"10","width":"100","height":"20","caption":"X"}' })
    const result = await l5x.call('ftview_render', { view_id: view, display: 'Other', source: 'draft' })
    expect(result.error?.code).toBe('NOT_FOUND')
  })
  it('inlines artwork from the export Images folder', async () => {
    const withImage = GFX.replace(
      '    <screen name="Hidden"',
      '    <screen name="Logo" type="image" left="0" top="0" width="40" height="40" imageName="Mark"/>',
    )
    const files = new Map([['export/Displays/Overview.xml', withImage], ['export/Images/Mark.png', 'png-bytes']])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const output = join(mkdtempSync(join(tmpdir(), 'ftview-image-')), 'renders')
    const result = await l5x.call('ftview_render', { view_id: open.data?.view_id as string, display: 'Overview', output })
    expect(result.error).toBeUndefined()
    expect(readFileSync(result.data?.svg as string, 'utf8')).toContain('data:image/png;base64,')
  })
  it('refuses a display that is not in the export', async () => {
    const files = new Map([['export/Displays/Overview.xml', GFX]])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const result = await l5x.call('ftview_render', { view_id: open.data?.view_id as string, display: 'Nope' })
    expect(result.error?.code).toBe('NOT_FOUND')
  })
  it('draws a vendor polyline, not a diagonal between its corners', () => {
    const display = settingsFromXml(GFX)
    const svg = renderDisplaySvg('Lines', [
      { type: 'line', name: 'Rule', attributes: { left: '10', top: '20', width: '100', height: '4', line: '12 24 80 24 80 60', lineWidth: '3', foreColor: '#112233', lineStyle: 'dash' } },
    ], display).svg
    expect(svg).toContain('points="12,24 80,24 80,60"')
    expect(svg).toContain('stroke-dasharray="6 4"')
    expect(svg).toContain('stroke-width="3"')
  })

  it('draws a trend and a bar graph as gridded tracks', () => {
    const display = settingsFromXml(GFX)
    const svg = renderDisplaySvg('Charts', [
      { type: 'barGraph', name: 'Speed', attributes: { left: '20', top: '40', width: '120', height: '40', backColor: '#001C38', borderColor: '#94A3B8', borderWidth: '1' } },
      { type: 'trend', name: 'History', attributes: { left: '20', top: '120', width: '160', height: '80', borderColor: '#94A3B8', borderWidth: '1' } },
    ], display).svg
    const lines = svg.split('<line ').length - 1
    expect(lines).toBeGreaterThanOrEqual(4)
    expect(svg).toContain('stroke-opacity="0.5"')
  })

  it('draws the caption a state face carries, not the object name', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
      '<displaySettings width="200" height="100" backColor="#C6C6C6"/>',
      '<screen>',
      '<momentaryButton name="PB1" left="10" top="10" width="80" height="30" backColor="#0088C8">',
      '<states><state stateId="Error"><caption caption="Error"/></state><state stateId="0"><caption caption="START"/></state></states>',
      '</momentaryButton>',
      '<text name="Title" left="10" top="60" width="180" height="20" caption="LINE ONE&#xA;LINE TWO" fontSize="12"/>',
      '</screen>',
      '</gfx>',
    ].join('\n')
    const parsed = parseDisplay('Faces.xml', xml)
    const svg = renderDisplaySvg('Faces', parsed.objects, settingsFromXml(xml)).svg
    expect(svg).toContain('>START</text>')
    expect(svg).not.toContain('>PB1</text>')
    expect(svg).toContain('>LINE ONE</tspan>')
    expect(svg).toContain('>LINE TWO</tspan>')
  })

})
