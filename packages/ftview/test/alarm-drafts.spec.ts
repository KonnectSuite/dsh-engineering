import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { addAlarm, deleteAlarm, setAlarmAttribute } from '../src/edit/operations.ts'

/** The wizard's own export shape, one bit trigger with one message. */
const ALARMS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<alarms version="1.0" product="{E44CB020-C21D-11D3-8A3F-0010A4EF3494}" id="Alarms">',
  '    <alarm history-size="500" use-alarm-identifier="false">',
  '        <triggers>',
  '            <trigger id="T1" type="bit" ack-all-value="1" use-ack-all="true" ack-tag="" exp="{[PLC]PumpPS>5}" message-tag="" message-handshake-exp="" message-notification-tag="" remote-ack-exp="" remote-ack-handshake-tag="" label="Label1" handshake-tag=""/>',
  '        </triggers>',
  '        <messages>',
  '            <message id="M1" trigger-value="1" identifier="0" trigger="#T1" backcolor="#800000" forecolor="#000000" audio="true" display="true" print="false" message-to-tag="false" text="Pump pressure high"/>',
  '        </messages>',
  '    </alarm>',
  '</alarms>',
  '',
].join('\n')

const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;PumpPS;Pump discharge pressure;False;PLC;REAL',
  '',
].join('\n')

function exportFiles(): Map<string, string> {
  return new Map([
    ['export/Main.xml', '<Display name="Main"><Object name="StartPB" Tag="{[PLC]PumpPS}"/></Display>'],
    ['export/tags.csv', CSV],
    ['export/Alarms/Alarms.xml', ALARMS],
  ])
}

async function opened() {
  const files = exportFiles()
  const l5x = harness(files, { edit: true })
  const newView = async (): Promise<string> => {
    const open = await l5x.call('ftview_open', { root: 'export' })
    expect(open.error).toBeUndefined()
    return open.data?.view_id as string
  }
  return { l5x, files, view: await newView(), newView }
}

describe('alarm drafts', () => {
  it('adds a trigger with its first message, wizard-numbered and defaulted', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_alarm_add', {
      view_id: view,
      expression: '{[PLC]PumpPS>8}',
      message_text: 'Pump discharge pressure above 8 psi',
      label: 'Pump high',
    })
    expect(staged.error).toBeUndefined()
    const draftId = staged.data?.draft_id as string
    const validated = await l5x.call('ftview_validate', { draft_id: draftId })
    expect(validated.error).toBeUndefined()
    expect(validated.data?.changed_files).toEqual(['Alarms/Alarms.xml'])
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Alarms/Alarms.xml') ?? ''
    expect(written).toContain('<trigger id="T2" type="bit" ack-all-value="1" use-ack-all="true"')
    // escapeAttribute writes the comparison as &gt; inside the quoted expression; the wizard's parser decodes it back.
    expect(written).toContain('exp="{[PLC]PumpPS&gt;8}"')
    expect(written).toContain('label="Pump high"')
    expect(written).toContain('<message id="M2" trigger-value="2" identifier="0" trigger="#T2" backcolor="#800000" forecolor="#000000" audio="true" display="true" print="false" message-to-tag="false" text="Pump discharge pressure above 8 psi"/>')
    // The new rows sit inside their blocks, above the closing tags.
    expect(written.indexOf('<trigger id="T2"')).toBeLessThan(written.indexOf('</triggers>'))
    expect(written.indexOf('<message id="M2"')).toBeLessThan(written.indexOf('</messages>'))
    // The original trigger and message survive untouched.
    expect(written).toContain('label="Label1"')
    expect(written).toContain('text="Pump pressure high"')
  })

  it('writes alarm import steps into IMPORT.md, backup-first and log-as-proof', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_alarm_add', { view_id: view, expression: '{[PLC]PumpPS>9}', message_text: 'High' })
    const draftId = staged.data?.draft_id as string
    await l5x.call('ftview_validate', { draft_id: draftId })
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const steps = l5x.written.get('out/IMPORT.md') ?? ''
    expect(steps).toContain('Import alarm configuration')
    expect(steps).toContain('overwrites the entire alarm setup')
    expect(steps).toContain('import error log')
  })

  it('carries the alarm report findings into ftview_validate', async () => {
    const { l5x, view } = await opened()
    // The label stays Label1, so the placeholder finding must surface from the changed file.
    const staged = await l5x.call('ftview_draft_alarm_set', { view_id: view, trigger: 'T1', attribute: 'exp', value: '{[PLC]PumpPS>7}' })
    const draftId = staged.data?.draft_id as string
    const validated = await l5x.call('ftview_validate', { draft_id: draftId })
    expect(validated.error).toBeUndefined()
    const byRule = validated.data?.by_rule as Record<string, number>
    expect(byRule['ALARM_PLACEHOLDER_LABEL']).toBeGreaterThanOrEqual(1)
    expect(validated.data?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ALARM_PLACEHOLDER_LABEL', evidence: expect.objectContaining({ file: 'Alarms/Alarms.xml' }) }),
    ]))
  })

  it('sets one attribute on a trigger row and leaves the rest byte-identical', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_alarm_set', { view_id: view, trigger: 'T1', attribute: 'label', value: 'Pump discharge high' })
    const draftId = staged.data?.draft_id as string
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Alarms/Alarms.xml') ?? ''
    expect(written).toContain('label="Pump discharge high" handshake-tag=""')
    expect(written).toContain('exp="{[PLC]PumpPS>5}"')
    expect(written).not.toContain('Label1')
  })

  it('deletes a trigger together with every message that points at it', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_alarm_delete', { view_id: view, trigger: 'T1' })
    const draftId = staged.data?.draft_id as string
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Alarms/Alarms.xml') ?? ''
    expect(written).not.toContain('<trigger id="T1"')
    expect(written).not.toContain('<message id="M1"')
    expect(written).toContain('</triggers>')
    expect(written).toContain('</messages>')
  })

  it('refuses a row that is not there, a bad attribute, and a non-boolean flag', async () => {
    // Each case gets its own harness: ftview_open reuses the view for a root, and one draft per view accumulates operations.
    const cases: Array<[string, Record<string, string>]> = [
      ['ALARM_NOT_FOUND', { trigger: 'T9', attribute: 'label', value: 'x' }],
      ['ALARM_ATTRIBUTE', { trigger: 'T1', attribute: 'colour', value: 'red' }],
      ['INVALID_ALARM_VALUE', { message: 'M1', attribute: 'audio', value: 'loud' }],
    ]
    for (const [code, args] of cases) {
      const { l5x, view } = await opened()
      const staged = await l5x.call('ftview_draft_alarm_set', { view_id: view, ...args })
      const validated = await l5x.call('ftview_validate', { draft_id: staged.data?.draft_id as string })
      expect(validated.error?.code, JSON.stringify(args)).toBe(code)
    }
    const { l5x, view } = await opened()
    const bothRows = await l5x.call('ftview_draft_alarm_set', { view_id: view, trigger: 'T1', message: 'M1', attribute: 'label', value: 'x' })
    expect(bothRows.error?.code).toBe('INVALID_ARGUMENT')
  })

  it('says alarm changes are proven by the import log, not the display comparison', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_alarm_delete', { view_id: view, trigger: 'T1' })
    const draftId = staged.data?.draft_id as string
    const verified = await l5x.call('ftview_verify_import', { draft_id: draftId, export_root: 'export' })
    expect(verified.error?.code).toBe('NOTHING_TO_VERIFY')
    expect(verified.error?.fix).toContain('import log')
  })

  it('refuses a draft when the export has no alarm file', async () => {
    const files = new Map([['export/Main.xml', '<Display name="Main"/>']])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const staged = await l5x.call('ftview_draft_alarm_add', { view_id: open.data?.view_id as string, expression: '{[PLC]X}', message_text: 'x' })
    expect(staged.error?.code).toBe('ALARM_FILE_MISSING')
  })
})

describe('alarm transforms', () => {
  it('numbers ids from the highest used, not the count', () => {
    const sparse = ALARMS.replace('id="T1"', 'id="T12"').replace('trigger="#T1"', 'trigger="#T12"')
    const added = addAlarm(sparse, { kind: 'alarm_add', file: 'Alarms/Alarms.xml', type: 'value', exp: '{[PLC]A>1}', text: 'x', ackAll: true })
    expect(added).toContain('<trigger id="T13" type="value" ack-all-value="1" use-ack-all="false"')
    expect(added).toContain('<message id="M2" trigger-value="2"')
  })

  it('round-trips through the report parser', async () => {
    const { alarmReport } = await import('../src/alarm-report.ts')
    const added = addAlarm(ALARMS, { kind: 'alarm_add', file: 'Alarms/Alarms.xml', type: 'bit', exp: '{[PLC]A>1}', text: 'New alarm' })
    const report = alarmReport(added)
    expect(report.counts.triggers).toBe(2)
    expect(report.counts.messages).toBe(2)
    const deleted = deleteAlarm(added, { kind: 'alarm_delete', file: 'Alarms/Alarms.xml', trigger: 'T2' })
    expect(alarmReport(deleted).counts.triggers).toBe(1)
    const set = setAlarmAttribute(ALARMS, { kind: 'alarm_set', file: 'Alarms/Alarms.xml', target: 'message', id: 'M1', attribute: 'text', value: 'Reworded' })
    expect(alarmReport(set).messages[0]?.text).toBe('Reworded')
  })
})
