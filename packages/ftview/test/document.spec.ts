import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harness } from './harness.ts'
import { documentApplication, expressionTag } from '../src/document.ts'

/** One six-column tag CSV with a single HMI tag. */
const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;StartPB;Start pushbutton;False;PLC;BOOL',
  '',
].join('\n')

/** A display with a button bound to a declared tag and to an unknown one. */
const DISPLAY = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="640" height="480" backColor="#FFFFFF"/>',
  '    <text name="Title" left="10" top="10" width="200" height="20" caption="Line"/>',
  '    <momentaryButton name="Start" left="10" top="60" width="120" height="40">',
  '        <connections><connection name="Value" expression="{[Line]StartPB}"/></connections>',
  '    </momentaryButton>',
  '    <momentaryButton name="Stop" left="10" top="120" width="120" height="40">',
  '        <connections><connection name="Value" expression="{[Line]StopPB}"/></connections>',
  '    </momentaryButton>',
  '</gfx>',
  '',
].join('\n')

describe('documentation bundle', () => {
  it('reads the tag out of an expression', () => {
    expect(expressionTag('{[Line]StartPB}')).toBe('StartPB')
    expect(expressionTag('{[Line]Alarm_Word.0}')).toBe('Alarm_Word')
    expect(expressionTag('StartPB')).toBe('StartPB')
    expect(expressionTag('42')).toBeUndefined()
    expect(expressionTag('')).toBeUndefined()
  })

  it('counts displays, bindings and undeclared tags', async () => {
    const l5x = harness(new Map([
      ['app/Displays/Main.xml', DISPLAY],
      ['app/Tags/Tags.csv', CSV],
    ]), { edit: true })
    const opened = await l5x.call('ftview_open', { root: 'app' })
    const target = join(mkdtempSync(join(tmpdir(), 'ftview-counts-')), 'bundle')
    const written = await l5x.call('ftview_document', {
      view_id: opened.data?.view_id,
      output_root: target,
    })
    expect(written.error).toBeUndefined()
    expect(written.summary).toContain('1 display(s)')
    expect(written.summary).toContain('2 binding(s)')
    expect(written.summary).toContain('1 naming an undeclared tag')
    const bindings = readFileSync(join(target, 'bindings.csv'), 'utf8')
    expect(bindings).toContain('StartPB,hmi tag')
    expect(bindings).toContain('StopPB,missing')
    const tags = readFileSync(join(target, 'tags.csv'), 'utf8')
    expect(tags).toContain('StartPB')
    expect(tags).toContain('Main')
  })

  it('writes the four files into a new folder', async () => {
    const l5x = harness(new Map([
      ['app/Displays/Main.xml', DISPLAY],
      ['app/Tags/Tags.csv', CSV],
    ]), { edit: true })
    const opened = await l5x.call('ftview_open', { root: 'app' })
    const target = join(mkdtempSync(join(tmpdir(), 'ftview-doc-')), 'bundle')
    const written = await l5x.call('ftview_document', {
      view_id: opened.data?.view_id,
      output_root: target,
    })
    expect(written.error).toBeUndefined()
    expect(written.summary).toContain('1 display(s)')
    const overview = readFileSync(join(target, 'overview.md'), 'utf8')
    expect(overview).toContain('# app')
    expect(readFileSync(join(target, 'bindings.csv'), 'utf8')).toContain('StopPB')
  })

  it('refuses to write over an existing folder', async () => {
    const l5x = harness(new Map([
      ['app/Displays/Main.xml', DISPLAY],
      ['app/Tags/Tags.csv', CSV],
    ]), { edit: true })
    const opened = await l5x.call('ftview_open', { root: 'app' })
    const target = mkdtempSync(join(tmpdir(), 'ftview-doc-'))
    const written = await l5x.call('ftview_document', {
      view_id: opened.data?.view_id,
      output_root: target,
    })
    expect(written.error?.code).toBe('OUTPUT_EXISTS')
  })
  it('says nothing can be verified when the export carries no tag table', async () => {
    const l5x = harness(new Map([['app/Displays/Main.xml', DISPLAY]]), { edit: true })
    const opened = await l5x.call('ftview_open', { root: 'app' })
    const target = join(mkdtempSync(join(tmpdir(), 'ftview-no-tags-')), 'bundle')
    const written = await l5x.call('ftview_document', {
      view_id: opened.data?.view_id,
      output_root: target,
    })
    expect(written.error).toBeUndefined()
    expect(written.summary).toContain('No tag table travelled with this export')
    const bindings = readFileSync(join(target, 'bindings.csv'), 'utf8')
    expect(bindings).toContain('unverified')
    expect(bindings).not.toContain(',missing')
  })

  it('lists the jumps between screens', async () => {
    const NAV = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gfx>',
      '    <displaySettings width="640" height="480" backColor="#FFFFFF"/>',
      '    <gotoButton name="NavMain" left="10" top="10" width="100" height="40">',
      '        <caption><text>MAIN</text></caption>',
      '        <connection name="display" expression="Main"/>',
      '    </gotoButton>',
      '</gfx>',
      '',
    ].join('\n')
    const l5x = harness(new Map([['app/Displays/Main.xml', DISPLAY], ['app/Displays/Detail.xml', NAV]]), { edit: true })
    const opened = await l5x.call('ftview_open', { root: 'app' })
    const target = join(mkdtempSync(join(tmpdir(), 'ftview-nav-')), 'bundle')
    const written = await l5x.call('ftview_document', { view_id: opened.data?.view_id, output_root: target })
    expect(written.error).toBeUndefined()
    const overview = readFileSync(join(target, 'overview.md'), 'utf8')
    expect(overview).toContain('## Navigation')
    expect(overview).toContain('| Detail | NavMain | Main |')
  })

})