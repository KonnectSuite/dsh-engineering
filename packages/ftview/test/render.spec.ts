/**
 * SVG rendering of a display, and the rasteriser fallback.
 */
import { existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBrowser, renderDisplaySvg, settingsFromXml } from '../src/render-svg.ts'
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

  it('labels widgets it cannot render instead of dropping them', () => {
    const result = renderDisplaySvg('Overview', [{ type: 'trend', name: 'Trend1', attributes: { left: '10', top: '10', width: '100', height: '50' } }], settings)
    expect(result.svg).toContain('>Trend1</text>')
  })
})

describe('ftview_render', () => {
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

  it('refuses a display that is not in the export', async () => {
    const files = new Map([['export/Displays/Overview.xml', GFX]])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const result = await l5x.call('ftview_render', { view_id: open.data?.view_id as string, display: 'Nope' })
    expect(result.error?.code).toBe('NOT_FOUND')
  })
})
