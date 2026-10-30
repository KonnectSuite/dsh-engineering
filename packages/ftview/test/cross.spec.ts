import { describe, expect, it } from 'vitest'
import { addressRoot, crossReference, readAlarms, readL5x, uses } from '../src/cross.ts'
import { parseTagCsv } from '../src/model.ts'
import { harness } from './harness.ts'

/** A display that references two HMI tags. */
const GFX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="800" height="600" backColor="#C6C6C6"/>',
  '    <numericDisplay name="Speed" left="20" top="40" width="120" height="30">',
  '        <connections><connection name="Value" expression="Motor_Run"/></connections>',
  '    </numericDisplay>',
  '    <text name="Note" left="20" top="90" width="200" height="20" caption="Ghost_Tag"/>',
  '</gfx>',
  '',
].join('\n')

/** Four HMI tags: one linked, one ghost, one memory tag, one data-table address. */
const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type;DevAddress',
  'A;Motor_Run;Run command;False;PLC;BOOL;::[PLC]Motor_Run',
  'A;Ghost_Tag;Only in the HMI;False;PLC;BOOL;::[PLC]Ghost_Tag',
  'A;MemTag;Scratch;False;Memory;DINT;',
  'A;OldBit;Data table bit;False;PLC;BOOL;::[df11]F260:0',
  '',
].join('\n')

/** A minimal L5X with controller tags, a program tag and two rungs. */
const L5X = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<RSLogix5000Content TargetName="Line" TargetType="Controller">',
  ' <Controller Use="Context" Name="Line">',
  '  <Tags>',
  '   <Tag Name="Motor_Run" DataType="BOOL" Radix="Decimal"/>',
  '   <Tag Name="NotUsed" DataType="DINT" Radix="Decimal"/>',
  '  </Tags>',
  '  <Programs>',
  '   <Program Use="Context" Name="MainProgram">',
  '    <Tags><Tag Name="Local_Flag" DataType="BOOL" Radix="Decimal"/></Tags>',
  '    <Routines>',
  '     <Routine Use="Context" Name="MainRoutine" Type="RLL">',
  '      <RLLContent>',
  '       <Rung Number="0" Type="N"><Text>XIC(Motor_Run)OTE(Local_Flag);</Text></Rung>',
  '       <Rung Number="1" Type="N"><Text>XIO(Motor_Run)OTE(NotUsed);</Text></Rung>',
  '      </RLLContent>',
  '     </Routine>',
  '    </Routines>',
  '   </Program>',
  '  </Programs>',
  ' </Controller>',
  '</RSLogix5000Content>',
  '',
].join('\n')

/** The export plus the L5X in one workspace. */
function files(): Map<string, string> {
  return new Map([
    ['export/Displays/Main.xml', GFX],
    ['export/Tags/tags.csv', CSV],
    ['Line.L5X', L5X],
  ])
}

/** One alarm watching an HMI tag that no display shows. */
const ALARMS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<alarms version="1.0">',
  '  <alarm history-size="128">',
  '    <triggers>',
  '      <trigger id="T1" type="value" exp="{[PLC]MemTag}" label="Alarm scrub" handshake-tag="{[PLC]Motor_Run}"/>',
  '    </triggers>',
  '  </alarm>',
  '</alarms>',
  '',
].join('\n')

/** Open the HMI export with the read entry mounted. */
async function opened() {
  const l5x = harness(files())
  const open = await l5x.call('ftview_open', { root: 'export' })
  expect(open.error).toBeUndefined()
  return { l5x, view: open.data?.view_id as string }
}

describe('readL5x', () => {
  it('reads controller and program tags with their scope', () => {
    const plc = readL5x(L5X)
    expect(plc.tags).toEqual([
      { name: 'Motor_Run', dataType: 'BOOL', scope: 'controller' },
      { name: 'NotUsed', dataType: 'DINT', scope: 'controller' },
      { name: 'Local_Flag', dataType: 'BOOL', scope: 'MainProgram' },
    ])
    expect(plc.texts).toHaveLength(2)
  })

  it('refuses a document with no controller', () => {
    expect(() => readL5x('<?xml version="1.0"?><Other/>')).toThrow(/RSLogix5000Content/u)
  })
})

describe('uses', () => {
  it('counts whole names, not prefixes of longer names', () => {
    expect(uses(['XIC(Motor_Run)OTE(Motor_RunAux)'], 'Motor_Run')).toBe(1)
    expect(uses(['XIC(Motor_Run)XIO(Motor_Run)'], 'Motor_Run')).toBe(2)
  })
})

describe('addressRoot', () => {
  it('keeps the tag path and flags data-table addresses', () => {
    expect(addressRoot('::[PLC]Motor_Run')).toEqual({ root: 'Motor_Run', unsupported: false })
    expect(addressRoot('::[PLC]Motor.Speed')).toEqual({ root: 'Motor', unsupported: false })
    expect(addressRoot('::[df11]F260:0').unsupported).toBe(true)
    expect(addressRoot('')).toEqual({ root: null, unsupported: false })
  })
})

describe('readAlarms', () => {
  it('reads the tags each trigger watches, including non-expression attributes', () => {
    const usage = readAlarms(ALARMS)
    expect(usage.triggers).toBe(1)
    expect(usage.byTag.get('memtag')).toEqual(['T1'])
    expect(usage.byTag.get('motor_run')).toEqual(['T1'])
  })
})

describe('crossReference', () => {
  it('classifies every HMI tag and counts display and logic usage', async () => {
    const { l5x, view } = await opened()
    const result = await l5x.call('ftview_cross_reference', { view_id: view, l5x_path: 'Line.L5X' })
    expect(result.error).toBeUndefined()
    const data = result.data as {
      counts: Record<string, number>
      rows: readonly { hmiTag: string; status: string; plcUses: number; displays: number; plcTag: string | null }[]
      findings: readonly { code: string; subject: string }[]
    }
    expect(data.counts).toEqual({ hmiTags: 4, linked: 1, memory: 1, unlinked: 1, unsupported: 1, plcTags: 3, plcUnreferencedByHmi: 0, alarmTriggers: 0, alarmOnly: [], alarmUnresolved: [] })
    const motor = data.rows.find(row => row.hmiTag === 'Motor_Run')
    expect(motor).toMatchObject({ status: 'linked', plcTag: 'Motor_Run', plcUses: 2, displays: 1 })
    expect(data.findings.map(finding => finding.code)).toEqual(expect.arrayContaining(['HMI_TAG_NOT_IN_PLC', 'ADDRESS_UNSUPPORTED', 'PLC_TAG_NOT_IN_HMI']))
    expect(result.coverage?.complete).toBe(false)
    expect(result.coverage?.unverified.join(' ')).toMatch(/direction/u)
  })

  it('joins alarm usage and names the tags only an alarm watches', async () => {
    const map = files()
    map.set('export/Alarms/Alarms.xml', ALARMS)
    const l5x = harness(map)
    const open = await l5x.call('ftview_open', { root: 'export' })
    const result = await l5x.call('ftview_cross_reference', { view_id: open.data?.view_id as string, l5x_path: 'Line.L5X' })
    const data = result.data as {
      counts: { alarmTriggers: number; alarmOnly: readonly string[] }
      rows: readonly { hmiTag: string; alarms: number }[]
    }
    expect(data.counts.alarmTriggers).toBe(1)
    expect(data.counts.alarmOnly).toEqual(['MemTag'])
    expect(data.rows.find(row => row.hmiTag === 'Ghost_Tag')?.alarms).toBe(0)
    expect(result.summary).toContain('1 alarm trigger')
  })

  it('hides memory tags unless asked, and slices to the limit', async () => {
    const { l5x, view } = await opened()
    const quiet = await l5x.call('ftview_cross_reference', { view_id: view, l5x_path: 'Line.L5X', limit: 2 })
    expect((quiet.data as { rows: readonly unknown[] }).rows).toHaveLength(2)
    const loud = await l5x.call('ftview_cross_reference', { view_id: view, l5x_path: 'Line.L5X', include_memory: 'yes' })
    const rows = (loud.data as { rows: readonly { hmiTag: string }[] }).rows
    expect(rows.map(row => row.hmiTag)).toContain('MemTag')
  })

  it('reports an unreadable L5X as a repairable failure', async () => {
    const { l5x, view } = await opened()
    const result = await l5x.call('ftview_cross_reference', { view_id: view, l5x_path: 'missing.L5X' })
    expect(result.error?.code).toBe('FILE_UNREADABLE')
    expect(result.error?.fix).toMatch(/L5X/u)
  })

  it('runs directly on a parsed application and its tags', async () => {
    const plc = readL5x(L5X)
    const app = { root: 'export', name: 'App', displays: [], tags: parseTagCsv(CSV).rows, tagFiles: [], tagErrors: [], alarmFiles: [], manifestFiles: [], diagnostics: [], files: [] }
    const direct = crossReference(app, plc)
    expect(direct.counts.hmiTags).toBe(4)
    expect(direct.rows.map(row => row.status)).toEqual(['linked', 'unlinked', 'unsupported'])
  })
})

describe('alarm expressions that name no HMI tag', () => {
  it('reports the tag and its trigger ids', () => {
    const app = { root: 'export', name: 'App', displays: [], tags: parseTagCsv(CSV).rows, tagFiles: [], tagErrors: [], alarmFiles: [], manifestFiles: [], diagnostics: [], files: [] }
    const report = crossReference(app, readL5x(L5X), {
      alarms: '<alarms><triggers><trigger id="T7" exp="{[Line]Ghost_Word.3}"/><trigger id="T8" exp="{[Line]Motor_Run.0}"/></triggers></alarms>',
    })
    expect(report.counts.alarmUnresolved).toEqual(['ghost_word'])
    const finding = report.findings.find(item => item.code === 'ALARM_TAG_NOT_IN_HMI')
    expect(finding?.subject).toBe('ghost_word')
    expect(finding?.detail).toContain('T7')
  })

  it('stays quiet when every alarm expression resolves', () => {
    const app = { root: 'export', name: 'App', displays: [], tags: parseTagCsv(CSV).rows, tagFiles: [], tagErrors: [], alarmFiles: [], manifestFiles: [], diagnostics: [], files: [] }
    const report = crossReference(app, readL5x(L5X), {
      alarms: '<alarms><triggers><trigger id="T1" exp="{[Line]Motor_Run.0}"/></triggers></alarms>',
    })
    expect(report.counts.alarmUnresolved).toEqual([])
    expect(report.findings.some(item => item.code === 'ALARM_TAG_NOT_IN_HMI')).toBe(false)
  })
})
