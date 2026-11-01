import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness, type Harness } from './harness.ts'

/** Open the fixture in a fresh chat and return the harness. */
async function opened(): Promise<Harness> {
  const files = new Map<string, Uint8Array>([['sample.l5x', fixtureBytes()]])
  const l5x = harness(files, { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('draft accumulation', () => {
  it('refuses a rung whose right rail is not an output', async () => {
    const l5x = await opened()
    const result = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'replace', rung: 0, text: 'XIC(Start)XIC(Run);',
    })
    expect(result.error?.code).toBe('INVALID_LADDER')
    expect(result.error?.message).toContain('right power rail')
    expect(result.error?.fix).toContain('OTE')
  })

  it('appends one operation per call and returns a stable draft handle', async () => {
    const l5x = await opened()
    const first = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    expect(first.error).toBeUndefined()
    const id = first.data?.draft_id
    expect(id).toBeTypeOf('string')
    expect(first.data?.operation_count).toBe(1)
    const second = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'replace', rung: 0, text: 'XIC(Start)OTE(Run);',
    })
    expect(second.error).toBeUndefined()
    expect(second.data?.draft_id).toBe(id)
    expect(second.data?.operation_count).toBe(2)
  })

  it('refuses a rung operation without its required arguments', async () => {
    const l5x = await opened()
    const missing = await l5x.call('draft_rung', { program: 'MainProgram', routine: 'MainRoutine', mode: 'delete' })
    expect(missing.error?.code).toBe('INVALID_ARGUMENT')
    expect(missing.error?.fix).toContain('rung number')
  })

  it('accepts a scalar tag with no initial value', async () => {
    // Studio gives every scalar a typed default (0 / FALSE). Requiring `value`
    // rejected the ordinary "declare a REAL" operation in a live session.
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'hmi_StagedThickness', data_type: 'REAL', description: 'Staged thickness (in)' })
    const validated = await l5x.call('draft_validate', {})
    expect(validated.error).toBeUndefined()
    expect(validated.data?.operation_count).toBe(1)
  })
})

describe('validate and apply', () => {
  it('validates the accumulated draft and returns its hash and review data', async () => {
    const l5x = await opened()
    const appended = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    const id = appended.data?.draft_id
    const validated = await l5x.call('draft_validate', { draft_id: id })
    expect(validated.error).toBeUndefined()
    expect(validated.data?.operation_count).toBe(1)
    expect(validated.data?.draft_sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(validated.data?.validation).toBeTypeOf('object')
    expect(validated.summary).toContain('prepared')
  })

  it('writes one new file, never the source, and clears the draft', async () => {
    const l5x = await opened()
    const appended = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    const id = appended.data?.draft_id
    const applied = await l5x.call('draft_apply', { draft_id: id, output_path: 'draft.l5x' })
    expect(applied.error).toBeUndefined()
    expect(applied.data?.output_path).toBe('draft.l5x')
    expect(l5x.written.get('draft.l5x')).toContain('SP_Start')
    expect(l5x.written.has('sample.l5x')).toBe(false)
    const again = await l5x.call('draft_apply', { draft_id: id, output_path: 'draft2.l5x' })
    expect(again.error?.code).toBe('UNKNOWN_DRAFT')
  })

  it('refuses to overwrite an existing output file', async () => {
    const l5x = await opened()
    const appended = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    const applied = await l5x.call('draft_apply', { draft_id: appended.data?.draft_id, output_path: 'sample.l5x' })
    expect(applied.error?.code).toBe('OUTPUT_EXISTS')
    expect(applied.error?.fix).toContain('new output_path')
  })
})

describe('rung numbering', () => {
  it('inserts at the top and renumbers the rungs below it', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 0,
      text: 'XIC(StartPB)XIO(StopPB)OTE(SystemRunning);', comment: 'Inserted first.',
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'inserted-top.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('inserted-top.L5X') ?? ''
    const reopened = harness(new Map([['inserted-top.L5X', new TextEncoder().encode(written)]]), { editing: true })
    await reopened.call('open_project', { path: 'inserted-top.L5X' })
    const routine = await reopened.call('get_component', { kind: 'routine', name: 'MainRoutine', scope: 'MainProgram' })
    const rungs = (routine.data?.component as { body: { rungs: { number: number, text: string, comment?: string }[] } }).body.rungs
    expect(rungs.map(row => row.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(rungs[0]?.text).toContain('OTE(SystemRunning)')
    expect(rungs[1]?.comment).toContain('System start/stop')
  })

  it('closes the numbering after deleting a middle rung', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'delete', rung: 1,
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'deleted-middle.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('deleted-middle.L5X') ?? ''
    const reopened = harness(new Map([['deleted-middle.L5X', new TextEncoder().encode(written)]]), { editing: true })
    await reopened.call('open_project', { path: 'deleted-middle.L5X' })
    const routine = await reopened.call('get_component', { kind: 'routine', name: 'MainRoutine', scope: 'MainProgram' })
    const rungs = (routine.data?.component as { body: { rungs: { number: number, text: string }[] } }).body.rungs
    expect(rungs.map(row => row.number)).toEqual([0, 1, 2, 3, 4, 5])
    expect(rungs[1]?.text).toContain('FaultActive')
  })

  it('refuses a position past the last rung and says where it may go', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 9,
      text: 'XIC(StartPB)OTE(SystemRunning);',
    })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', {})
    expect(validated.error?.code).toBe('INVALID_OPERATION')
    expect(validated.error?.message).toContain('0..7')
    expect(validated.error?.fix).toContain('append')
  })

  it('keeps numbering when a composed batch follows a draft_rung insert', async () => {
    const l5x = await opened()
    const first = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 0,
      text: 'XIC(StartPB)OTE(SystemRunning);', comment: 'Staged one by one.',
    })
    expect(first.error).toBeUndefined()
    const batch = await l5x.call('compose_batch', {
      rungs_json: JSON.stringify([{ spec: { series: [{ instr: 'XIC', args: ['SystemRunning'] }, { instr: 'OTE', args: ['SystemRunning'] }] } }]),
      program: 'MainProgram', routine: 'MainRoutine', rung: 1,
    })
    expect(batch.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', {})
    expect(validated.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'mixed.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('mixed.L5X') ?? ''
    const reopened = harness(new Map([['mixed.L5X', new TextEncoder().encode(written)]]), { editing: true })
    await reopened.call('open_project', { path: 'mixed.L5X' })
    const routine = await reopened.call('get_component', { kind: 'routine', name: 'MainRoutine', scope: 'MainProgram' })
    const rungs = (routine.data?.component as { body: { rungs: { number: number, text: string }[] } }).body.rungs
    expect(rungs.map(row => row.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(rungs[0]?.text).toContain('OTE(SystemRunning)')
    expect(rungs[1]?.text).toBe('XIC(SystemRunning)OTE(SystemRunning);')
    expect(rungs[2]?.comment).toContain('System start/stop')
  })
})

describe('draft handles', () => {
  it('refuses an unknown draft id and lists the chat drafts', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'x', value: 1 })
    const missing = await l5x.call('draft_validate', { draft_id: 'nope' })
    expect(missing.error?.code).toBe('UNKNOWN_DRAFT')
    expect(missing.error?.candidates.length).toBe(1)
  })

  it('refuses validation when no draft exists', async () => {
    const l5x = await opened()
    const none = await l5x.call('draft_validate', {})
    expect(none.error?.code).toBe('NO_DRAFT')
  })
})

describe('draft editing', () => {
  it('lists staged operations with the index each occupies', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80 })
    await l5x.call('draft_rung', { program: 'MainProgram', routine: 'MainRoutine', mode: 'replace', rung: 0, text: 'XIC(Start)OTE(Run);' })
    const list = await l5x.call('draft_list', {})
    expect(list.error).toBeUndefined()
    expect(list.data?.operation_count).toBe(2)
    const operations = list.data?.operations as readonly { index: number; operation: string; rung?: number }[]
    expect(operations.map(operation => operation.index)).toEqual([0, 1])
    expect(operations[0]?.operation).toBe('add_tag')
    expect(operations[1]?.operation).toBe('replace_rung')
  })

  it('removes exactly one operation and keeps the rest', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'first' })
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Stop', data_type: 'REAL', description: 'second' })
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Hold', data_type: 'REAL', description: 'third' })
    const removed = await l5x.call('draft_remove_op', { index: 1 })
    expect(removed.error).toBeUndefined()
    expect(removed.data?.operation_count).toBe(2)
    const names = (removed.data?.operations as readonly { name?: string }[]).map(operation => operation.name)
    expect(names).toEqual(['SP_Start', 'SP_Hold'])
  })

  it('refuses an index past the end and points at draft_list', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'only' })
    const outOfRange = await l5x.call('draft_remove_op', { index: 4 })
    expect(outOfRange.error?.code).toBe('UNKNOWN_OPERATION')
    expect(outOfRange.error?.fix).toContain('draft_list')
  })
})
describe('composition against staged tags', () => {
  const spec = '{"series":[{"instr":"XIC","args":["SP_Start"]},{"instr":"OTE","args":["SP_Latch"]}]}'

  it('refuses a staged name before the draft declares it', async () => {
    const l5x = await opened()
    const composed = await l5x.call('compose_rung', { spec_json: spec })
    expect(composed.error?.code).toBe('TAG_NOT_FOUND')
  })

  it('composes once the same draft declares the tag', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'BOOL', description: 'staged start' })
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Latch', data_type: 'BOOL', description: 'staged latch' })
    const composed = await l5x.call('compose_rung', { spec_json: spec })
    expect(composed.error).toBeUndefined()
    const rungs = composed.data?.rungs as readonly { neutral_text: string }[] | undefined
    expect(rungs?.[0]?.neutral_text).toContain('XIC(SP_Start)')
  })

  it('still type-checks the staged declaration', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'wrong type' })
    const composed = await l5x.call('compose_rung', { spec_json: spec })
    expect(composed.error?.code).toBe('INVALID_OPERAND')
    expect(composed.error?.message).toContain('BOOL')
  })
})

describe('compose_batch', () => {
  const two = [
    { spec: { series: [{ instr: 'XIC', args: ['Motor_1.Running'] }, { instr: 'OTE', args: ['Motor_1.RunCommand'] }] } },
    { spec: { series: [{ instr: 'XIO', args: ['Motor_2.Running'] }, { instr: 'OTE', args: ['Motor_2.RunCommand'] }] } },
  ]

  it('composes and stages several rungs in one call', async () => {
    const l5x = await opened()
    const staged = await l5x.call('compose_batch', { rungs_json: JSON.stringify(two), program: 'MainProgram', routine: 'MainRoutine' })
    expect(staged.error).toBeUndefined()
    const rungs = staged.data?.rungs as readonly { rung: number; neutral_text: string }[]
    expect(rungs[1]!.rung).toBe(rungs[0]!.rung + 1)
    expect(rungs[0]?.neutral_text).toContain('XIC(Motor_1.Running)')
    expect(rungs[1]?.neutral_text).toContain('OTE(Motor_2.RunCommand)')
    expect(staged.data?.operation_count).toBe(2)
    const validate = await l5x.call('draft_validate', {})
    expect(validate.error).toBeUndefined()
  })

  it('refuses the whole batch when one rung names an undeclared tag', async () => {
    const l5x = await opened()
    const staged = await l5x.call('compose_batch', {
      rungs_json: JSON.stringify([two[0], { spec: { series: [{ instr: 'XIC', args: ['NoSuchTag'] }, { instr: 'OTE', args: ['RunAlias'] }] } }]),
      program: 'MainProgram',
      routine: 'MainRoutine',
      rung: 1,
    })
    expect(staged.error?.code).toBe('TAG_NOT_FOUND')
    const list = await l5x.call('draft_list', {})
    expect(list.error?.code).toBe('NO_DRAFT')
  })

  it('refuses an entry that names neither a pattern nor a spec', async () => {
    const l5x = await opened()
    const staged = await l5x.call('compose_batch', { rungs_json: '[{}]', program: 'MainProgram', routine: 'MainRoutine', rung: 4 })
    expect(staged.error?.code).toBe('INVALID_ARGUMENT')
  })
})

describe('composition payload', () => {
  const spec = '{"series":[{"instr":"XIC","args":["Motor_1.Running"]},{"instr":"OTE","args":["Motor_1.RunCommand"]}]}'

  it('answers with a document the host can carry when no pattern was named', async () => {
    const l5x = await opened()
    const composed = await l5x.call('compose_rung', { spec_json: spec })
    expect(composed.error).toBeUndefined()
    expect(Object.keys(composed.data as Record<string, unknown>)).toEqual(['rungs'])
    // The host serialises this document as lossless JSON; an empty member is
    // refused outright, so the round trip has to return the same document.
    expect(JSON.parse(JSON.stringify(composed))).toEqual(composed)
  })
})


describe('built-in structure tags', () => {
  it('creates the alarm and control structures Studio defaults', async () => {
    // An export that declares these with no Data block builds: ALMD/ALMA, SRT/STD and the ASCII
    // instructions were all build-verified in this cycle with exactly such tags.
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'sample.l5x' })).error).toBeUndefined()
    for (const [name, type] of [['almD', 'ALARM_DIGITAL'], ['almA', 'ALARM_ANALOG'], ['ctl', 'CONTROL'], ['spc', 'SERIAL_PORT_CONTROL']]) {
      const created = await l5x.call('draft_tag', { scope: 'controller', name, data_type: type, description: type })
      expect(created.error, name).toBeUndefined()
    }
    const applied = await l5x.call('draft_apply', { output_path: 'structures.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('structures.L5X') ?? ''
    expect(written).toContain('<Tag Name="almD" TagType="Base" DataType="ALARM_DIGITAL"')
    expect(written).toContain('<Tag Name="spc" TagType="Base" DataType="SERIAL_PORT_CONTROL"')
  })

  it('still refuses a type the project does not declare', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'sample.l5x' })).error).toBeUndefined()
    const created = await l5x.call('draft_tag', { scope: 'controller', name: 'x', data_type: 'NOT_A_TYPE', description: 'no' })
    expect(created.error).toBeUndefined()
    // The type is checked when the draft is applied, not while it is staged.
    const applied = await l5x.call('draft_apply', { output_path: 'badtype.L5X' })
    expect(String(applied.error?.message)).toContain('NOT_A_TYPE')
  })
})


/** A project whose only program runs in a safety task. */
const SAFETY_DRAFT_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"SafetyDraft\" ProcessorType=\"1756-L8\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"B\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"Safe\" MainRoutineName=\"R\"><Routines>\n      <Routine Name=\"R\" Type=\"RLL\"><RLLContent><Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung></RLLContent></Routine>\n    </Routines></Program></Programs>\n    <Tasks>\n      <Task Name=\"SafetyTask\" Type=\"PERIODIC\" Rate=\"20\" Priority=\"10\" Class=\"Safety\"><ScheduledPrograms><ScheduledProgram Name=\"Safe\"/></ScheduledPrograms></Task>\n    </Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('editing a safety-scheduled program', () => {
  it('is refused before anything is written', async () => {
    // On the real Seco export, draft_rung staged and draft_validate refused with
    // "Safety programs cannot be changed". The same contract is pinned here; whichever step owns the
    // check, the edit must never reach draft_apply.
    const l5x = harness(new Map([['s.l5x', new TextEncoder().encode(SAFETY_DRAFT_L5X)]]), { editing: true })
    expect((await l5x.call('open_project', { path: 's.l5x' })).error).toBeUndefined()
    const staged = await l5x.call('draft_rung', { program: 'Safe', routine: 'R', rung: 0, mode: 'replace', text: 'XIC(B)OTE(B);' })
    const refusal = staged.error ?? (await l5x.call('draft_validate', { draft_id: staged.data?.draft_id })).error
    expect(refusal?.code).toBe('PROTECTED_TARGET')
    expect(String(refusal?.message).toLowerCase()).toContain('safety')
  })
})
