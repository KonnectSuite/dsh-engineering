/**
 * The migration report: the declarations it reads, the corrections it finds, the
 * model it builds and the Word package it writes.
 *
 * The fixtures are the smallest exports that still carry every shape a real
 * conversion produces — a marker alone on a rung, a marker in front of a timer
 * with an unknown operand list, a placeholder tag, an alias and an array indexed
 * by a tag.
 */
import { describe, expect, it } from 'vitest'

import { inlineRuns, renderDocx, zipStore } from '../src/engine/docx.ts'
import {
  buildMigrationReport,
  changeWindow,
  correctionsBetween,
  indirectSites,
  readModules,
  readTags,
  renderMarkdown,
  type ReportInput,
} from '../src/engine/report.ts'

const PRE = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="31.02">
<Controller Use="Target" Name="SL_10" ProcessorType="1756-L85E" MajorRev="31" MinorRev="11">
<Modules Use="Context">
<Module Name="Local" CatalogNumber="1756-L85E" ParentModule="Local" Major="31" Minor="11"/>
<Module Name="MigratedIO_SLOT1" CatalogNumber="1746-NI4" ParentModule="Local"/>
</Modules>
<Tags Use="Context">
<Tag Name="SLOT12_1747_SDN_Placeholder" TagType="Base" DataType="SLOT12_UDT" ExternalAccess="Read/Write"/>
<Tag Name="N48_2" TagType="Alias" Radix="Decimal" AliasFor="N48[2]" ExternalAccess="Read/Write"/>
<Tag Name="N48" TagType="Base" DataType="DINT" Dimensions="9"/>
<Tag Name="N10" TagType="Base" DataType="DINT" Dimensions="53"/>
</Tags>
<Programs Use="Context"><Program Use="Target" Name="MainProgram" TestEdits="false" DisableProjectUpdates="false">
<Routines Use="Context">
<Routine Use="Target" Name="_5_FAULT" Type="RLL">
<RLLContent Use="Target">
<Rung Number="0" Type="N"><Text><![CDATA[PCE(152,PCE001);]]></Text></Rung>
</RLLContent>
</Routine>
<Routine Use="Target" Name="_16_SPLICE" Type="RLL">
<RLLContent Use="Target">
<Rung Number="0" Type="N"><Text><![CDATA[XIC(S[4].2)ONS(B3[25].13)XIC(T4[3].DN)OTL(B3[25].7);]]></Text></Rung>
<Rung Number="1" Type="N"><Text><![CDATA[PCE(201,PCE034)XIC(I[4].15)TON(T4[3],?,?);]]></Text></Rung>
<Rung Number="2" Type="N"><Text><![CDATA[XIO(N10[N48_2].3)OTE(O[2].6);]]></Text></Rung>
</RLLContent>
</Routine>
</Routines>
</Program></Programs>
</Controller></RSLogix5000Content>`

const POST = PRE
  .replace('PCE(152,PCE001);', 'CLR(S[11]);')
  .replace('PCE(201,PCE034)XIC(I[4].15)TON(T4[3],?,?);', 'XIC(I[4].15)TON(T4[3]);')

const legacy = {
  project: 'SLITTER10',
  controller: '',
  files: [{ name: 'MAIN', rungs: 3 }, { name: '_5_FAULT', rungs: 1 }],
  totalRungs: 4,
  symbols: [{ address: 'N10:0', symbol: 'N10', description: 'counts' }],
  symbolCount: 1,
  dataFiles: [
    { number: 10, type: 'N', name: 'INTEGER', elements: 53 },
    { number: 48, type: 'N', name: 'INTEGER', elements: 9 },
  ],
  dataFileCount: 2,
}

const legacyRungs = [
  { file: '_16_SPLICE', rung: 0, text: 'XIC{ S:4/2 } ONS{ B3:25/13 } XIC{ T4:3/DN } OTL{ B3:25/7 }' },
  { file: '_16_SPLICE', rung: 1, text: 'XIC{ I:4/15 } TON{ T4:3, 0.01, 50, 50 }' },
  { file: '_5_FAULT', rung: 0, text: 'CLR{ S:11 }' },
]

const input: ReportInput = {
  sourceFile: 'C:/RSS/SLITTER10.RSS',
  legacy,
  legacyRungs,
  legacyProduct: 'RSLogix 500',
  legacyRevision: '748',
  legacyRungsRead: legacyRungs.length,
  legacyTruncated: false,
  pre: { file: 'C:/out/wizard.L5X', bytes: PRE.length, text: PRE },
  post: { file: 'C:/out/corrected.L5X', bytes: POST.length, text: POST },
  generatedAt: '2026-10-31T02:00:00.000Z',
  limit: 20,
}

describe('reading the export', () => {
  it('reads modules with their catalog and parent', () => {
    const modules = readModules(PRE)
    expect(modules.map(module => module.name)).toEqual(['Local', 'MigratedIO_SLOT1'])
    expect(modules[0]?.catalog).toBe('1756-L85E')
    expect(modules[1]?.parent).toBe('Local')
  })

  it('reads a placeholder tag and an alias target', () => {
    const tags = readTags(PRE)
    expect(tags.some(tag => tag.name === 'SLOT12_1747_SDN_Placeholder')).toBe(true)
    expect(tags.find(tag => tag.name === 'N48_2')?.aliasFor).toBe('N48[2]')
  })

  it('classifies an array indexed by an alias', () => {
    const sites = indirectSites(PRE, readTags(PRE))
    expect(sites).toHaveLength(1)
    expect(sites[0]?.expression).toBe('N10[N48_2]')
    expect(sites[0]?.kind).toBe('alias')
    expect(sites[0]?.indexTarget).toBe('N48[2]')
  })
})

describe('corrections', () => {
  it('reports a marker removed and the rung that carries the change', () => {
    const corrections = correctionsBetween(PRE, POST)
    expect(corrections).toHaveLength(2)
    expect(corrections.every(entry => entry.change === 'marker removed')).toBe(true)
    const splice = corrections.find(entry => entry.routine === '_16_SPLICE')
    expect(splice?.before).toContain('PCE(201,PCE034)')
    expect(splice?.after).not.toContain('PCE')
  })

  it('shows only the text around a change in a long rung', () => {
    const before = `${'XIC(B3[19].4)'.repeat(12)}TON(T4[4],?,?);`
    const after = `${'XIC(B3[19].4)'.repeat(12)}TON(T4[4]);`
    const window = changeWindow(before, after)
    expect(window.before.startsWith('…')).toBe(true)
    expect(window.before).toContain('TON(T4[4],?,?)')
    expect(window.after).toContain('TON(T4[4])')
    expect(window.after.length).toBeLessThan(before.length / 2)
  })

  it('names a removed rung instead of showing an empty cell', () => {
    expect(changeWindow('XIC(A)B', '').after).toBe('(rung removed)')
  })
})

describe('the report', () => {
  it('carries every section and the counts a reader signs off from', () => {
    const report = buildMigrationReport(input)
    const titles = report.model.sections.map(section => section.title)
    expect(titles).toContain('At a glance')
    expect(titles).toContain('What the conversion could not translate')
    expect(titles).toContain('What was corrected afterwards')
    expect(titles).toContain('Open items that need a decision')
    expect(report.facts.markers).toBe(2)
    expect(report.facts.markersAfter).toBe(0)
    expect(report.facts.placeholders).toEqual(['SLOT12_1747_SDN_Placeholder'])
  })

  it('renders the same sections as markdown', () => {
    const report = buildMigrationReport(input)
    const markdown = renderMarkdown(report.model)
    expect(markdown).toContain('# Migration report')
    for (const section of report.model.sections) expect(markdown).toContain(section.title)
    expect(markdown).toContain('SLOT12_1747_SDN_Placeholder')
  })
})

describe('the Word document', () => {
  it('splits bold and code runs', () => {
    expect(inlineRuns('a **b** c `d`').map(run => [run.text, run.bold, run.code])).toEqual([
      ['a ', false, false],
      ['b', true, false],
      [' c ', false, false],
      ['d', false, true],
    ])
  })

  it('writes a zip package carrying the six parts', () => {
    const report = buildMigrationReport(input)
    const bytes = renderDocx(report.model, new Date('2026-10-31T02:00:00Z'))
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const text = new TextDecoder('utf-8').decode(bytes)
    for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/footer1.xml', 'docProps/core.xml']) {
      expect(text).toContain(part)
    }
    expect(text).toContain('Migration report')
    expect(text).not.toContain('undefined')
  })

  it('zips with the store method so the parts stay readable', () => {
    expect(zipStore([{ name: 'a.txt', bytes: new TextEncoder().encode('hello') }])[0]).toBe(0x50)
  })
})
