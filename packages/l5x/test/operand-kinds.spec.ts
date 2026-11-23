/**
 * Operands that are not tag references.
 *
 * Every operand used to be resolved as a tag, so a computed expression, a routine
 * name and a label were all refused: CPT, CMP, JSR, JMP and LBL could not be
 * composed at all. These tests hold the three slot kinds that changed, and the
 * checks they still owe — a routine must exist, a label must be an identifier, an
 * expression must be balanced.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'
import { instructionByName } from '../src/engine/instructions.ts'
import { l5x, program, rllRoutine, tag, task } from './l5x-build.ts'

/** Open the fixture with the editing entry and return the harness. */
async function opened() {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
  const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** The neutral text of the first composed rung. */
function text(data: unknown): string {
  const rungs = (data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
  return rungs?.[0]?.neutral_text ?? ''
}

describe('a destination is a writable location, not a literal', () => {
  it('refuses a literal in the destination slot and states the written order', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ADD', args: ['LineSpeed', 'LineSpeed', '5'] }] }) })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('literal where ADD needs a writable destination')
    expect(result.error?.fix).toContain('Source A, Source B, Destination')
  })

  it('composes the destination-last order Studio writes', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ADD', args: ['LineSpeed', '5', 'LineSpeed'] }] }) })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('ADD(LineSpeed,5,LineSpeed);')
  })
  it('applies the same rule to MOV and CLR', async () => {
    const l5x = await opened()
    const move = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MOV', args: ['LineSpeed', '5'] }] }) })
    expect(move.error?.code).toBe('INVALID_OPERAND')
    const clear = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'CLR', args: ['5'] }] }) })
    expect(clear.error?.code).toBe('INVALID_OPERAND')
    const good = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MOV', args: ['5', 'LineSpeed'] }] }) })
    expect(good.error).toBeUndefined()
    expect(text(good.data)).toBe('MOV(5,LineSpeed);')
  })
  it('refuses a whole batch when one rung has a literal destination', async () => {
    const l5x = await opened()
    const batch = await l5x.call('l5x_compose_batch', {
      program: 'MainProgram',
      routine: 'MainRoutine',
      rung: 0,
      rungs_json: JSON.stringify([
        { spec: { series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'OTE', args: ['StopPB'] }] } },
        { spec: { series: [{ instr: 'ADD', args: ['LineSpeed', 'LineSpeed', '5'] }] } },
      ]),
    })
    expect(batch.error?.code).toBe('INVALID_OPERAND')
    // Refused before staging anything: either no draft exists yet, or it holds zero operations.
    const list = await l5x.call('l5x_draft_list')
    expect(list.error?.code === 'NO_DRAFT' || list.data?.operation_count === 0).toBe(true)
  })
})

describe('a routine name is not a tag', () => {
  it('composes a JSR and keeps the routine spelling the export uses', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'JSR', args: ['mainroutine', '0'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)JSR(MainRoutine,0);')
  })

  it('refuses a routine the export does not declare, and lists the ones it has', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JSR', args: ['NoSuchRoutine', '0'] }] }) })
    expect(result.error?.code).toBe('ROUTINE_NOT_FOUND')
    expect(result.error?.candidates).toContain('MainRoutine')
  })
})

describe('a label is not a tag', () => {
  it('composes JMP and LBL', async () => {
    const l5x = await opened()
    const jump = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JMP', args: ['StartLabel'] }] }) })
    expect(jump.error).toBeUndefined()
    expect(text(jump.data)).toBe('JMP(StartLabel);')
    const label = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'LBL', args: ['StartLabel'] }, { instr: 'XIC', args: ['StartPB'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(label.error).toBeUndefined()
    expect(text(label.data)).toBe('LBL(StartLabel)XIC(StartPB)OTE(SystemRunning);')
  })

  it('refuses a label that is not an identifier', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JMP', args: ['Start Label'] }] }) })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('label')
  })
})

describe('an expression is not a tag', () => {
  it('composes a CPT with operators in the source', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'CPT', args: ['FaultCount', 'LineSpeed + 5.0'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)CPT(FaultCount,LineSpeed + 5.0);')
  })

  it('composes a CMP comparison', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CMP', args: ['LineSpeed > 5.0'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('CMP(LineSpeed > 5.0)OTE(SystemRunning);')
  })

  it('refuses an unbalanced expression', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CPT', args: ['FaultCount', '(LineSpeed + 5.0'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('balanced')
  })

  it('refuses an expression carrying a rung terminator', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CPT', args: ['FaultCount', 'LineSpeed;5'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
  })
})

describe('the listing names the kinds', () => {
  it('reports EXPRESSION, ROUTINE and LABEL', async () => {
    const l5x = harness(fixtureBytes)
    const rows = (await l5x.call('l5x_list_instructions', { filter: 'cpt' })).data?.rows as { name: string; operands: { kind: string }[] }[]
    expect(rows.find(row => row.name === 'CPT')?.operands.map(slot => slot.kind)).toEqual(['NUMBER', 'EXPRESSION'])
    const jsr = (await l5x.call('l5x_list_instructions', { filter: 'jsr' })).data?.rows as { name: string; operands: { kind: string }[] }[]
    expect(jsr.find(row => row.name === 'JSR')?.operands[0]?.kind).toBe('ROUTINE')
    const jmp = (await l5x.call('l5x_list_instructions', { filter: 'jmp' })).data?.rows as { name: string; operands: { kind: string }[] }[]
    expect(jmp.find(row => row.name === 'JMP')?.operands[0]?.kind).toBe('LABEL')
  })
})


describe('the operand counts the vendor fields give', () => {
  it('catalogues the full operand list, not the short one the compact table had', () => {
    const expected: readonly (readonly [string, number])[] = [
      ['MVM', 3], ['GSV', 4], ['SSV', 4], ['SQO', 6], ['SQL', 5], ['BSL', 4], ['BSR', 4],
    ]
    for (const [name, count] of expected) {
      expect(instructionByName(name)?.operands.length, name).toBe(count)
    }
  })

  it('composes a masked move with its mask slot', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'MVM', args: ['LineSpeed', 'FaultCount', 'SystemClock'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)MVM(LineSpeed,FaultCount,SystemClock);')
  })

  it('composes a sequenced output with all six operands', async () => {
    const l5x = await opened()
    // The sample has no array or CONTROL tag, and Studio refused a COUNTER control and a whole
    // destination array; declare a build-shaped fixture in the same draft.
    for (const [name, dataType, dimensions] of [['SeqArr', 'DINT', '10'], ['SeqDest', 'DINT', '10'], ['SeqCtl', 'CONTROL', undefined]] as const) {
      const added = await l5x.call('l5x_draft_tag', { scope: 'controller', name, data_type: dataType, description: name, ...(dimensions === undefined ? {} : { dimensions }) })
      expect(added.error).toBeUndefined()
    }
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'SQO', args: ['SeqArr', '5', 'SeqDest[0]', 'SeqCtl', '10', '0'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('SQO(SeqArr,5,SeqDest[0],SeqCtl,10,0);')
  })

  it('refuses FAL, which is not modelled', async () => {
    // Eight shapes were tried against a real build: destination as element and as bare tag, ctl.POS in
    // the expression, ctl.LEN/ctl.POS for length and position, and mode 0/1/ALL. Every one answered
    // RxCMP_E_AUDIT_INVALIDOPKIND, or crashed the compiler. Refusing beats emitting a rung Studio
    // rejects, so the entry is marked not modelled until a real export shows the accepted form.
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'FAL', args: ['CycleCounter', '10', '0', '1', 'LineSpeed + 1.0', 'FaultCount'] }] }),
    })
    expect(result.error?.code).toBe('INSTRUCTION_NOT_MODELLED')
    expect(String(result.error?.message)).toContain('FAL')
  })
})

describe('a keyword is not a tag', () => {
  it('composes a GSV whose class, instance and attribute are keywords', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'GSV', args: ['Program', 'MainProgram', 'LastScanTime', 'SystemClock'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('GSV(Program,MainProgram,LastScanTime,SystemClock)OTE(SystemRunning);')
  })

  it('refuses a keyword that is not an identifier', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'GSV', args: ['Program Class', 'Main', 'X', 'SystemClock'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('keyword')
  })
})


describe('nine more operand counts, from the systematic audit', () => {
  it('catalogues the full operand list for the five the audit flagged', () => {
    const expected: readonly (readonly [string, number])[] = [
      ['BTD', 5], ['MEQ', 3], ['OSR', 2], ['OSF', 2], ['AVE', 6],
    ]
    for (const [name, count] of expected) {
      expect(instructionByName(name)?.operands.length, name).toBe(count)
    }
  })

  it('composes a masked compare', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'MEQ', args: ['FaultCount', '255', 'LineSpeed'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('MEQ(FaultCount,255,LineSpeed)OTE(SystemRunning);')
  })

  it('composes a one-shot with its storage and output bit', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'OSR', args: ['StartPB', 'SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)OSR(StartPB,SystemRunning);')
  })
})


describe('the motion family', () => {
  it('catalogues every instruction box field, not the placeholder operand', () => {
    const expected: readonly (readonly [string, number])[] = [
      ['MAJ', 17], ['MAM', 20], ['MAPC', 14], ['MAS', 9], ['MATC', 12], ['MAH', 2],
      ['MDF', 2], ['MDW', 2], ['MGS', 3], ['MGSP', 2], ['MRP', 5], ['MSF', 2], ['MSO', 2],
    ]
    for (const [name, count] of expected) {
      expect(instructionByName(name)?.operands.length, name).toBe(count)
    }
  })

  it('names the axis and motion control operands a motion call starts with', () => {
    expect(instructionByName('MSO')?.operands.map(slot => slot.name)).toEqual(['Axis', 'MotionControl'])
    expect(instructionByName('MGS')?.operands.map(slot => slot.name)).toEqual(['Group', 'MotionControl', 'StopMode'])
  })

  it('leaves the operand type open where the catalogue cannot verify it', () => {
    // AXIS and MOTION_GROUP are datatypes this catalogue does not model; ANY is the honest slot.
    expect(instructionByName('MSO')?.operands.every(slot => slot.kind === 'ANY')).toBe(true)
  })

  it('composes a motion instruction through the ordinary operand path', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'MSO', args: ['Motor_1', 'SystemClock'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('MSO(Motor_1,SystemClock);')
  })
})


describe('a loop instruction names its routine', () => {
  it('catalogues FOR with the routine, the index, the bounds and the step', () => {
    expect(instructionByName('FOR')?.operands.map(slot => slot.name)).toEqual(['Routine', 'Index', 'Initial value', 'Terminal value', 'Step size'])
    expect(instructionByName('FOR')?.operands[0]?.kind).toBe('ROUTINE')
  })

  it('refuses a literal index and composes a tag index over a routine that exists', async () => {
    const l5x = await opened()
    // Studio refused FOR(MainRoutine,0,1,10,1) at build with RxCMP_E_AUDIT_INVALIDOPKIND.
    const bad = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'FOR', args: ['MainRoutine', '0', '1', '10', '1'] }] }),
    })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('writable index')
    const result = await l5x.call('l5x_compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'FOR', args: ['MainRoutine', 'SystemClock', '1', '10', '1'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('FOR(MainRoutine,SystemClock,1,10,1);')
  })
})

describe('a JSR carries its return parameter', () => {
  it('composes JSR(name, 0) the way a real export writes it', async () => {
    // Ground truth from a production export: JSR(A01_Inputs,0). One operand is refused by Studio
    // with RxCMP_E_AUDIT_INVALIDNOOFOPS.
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
    expect((await l5x.call('l5x_open_project', { path: 'sample.l5x' })).error).toBeUndefined()
    const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JSR', args: ['MainRoutine', '0'] }] }) })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('JSR(MainRoutine,0);')
  })

  it('refuses a third operand, because input parameters are not modelled', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
    expect((await l5x.call('l5x_open_project', { path: 'sample.l5x' })).error).toBeUndefined()
    const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JSR', args: ['MainRoutine', '0', 'StartPB'] }] }) })
    expect(result.error).toBeDefined()
  })
})

describe('a declaration in another scope', () => {
  it('names the scope that declares it instead of calling it absent', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_resolve_tag', { address: 'MainTimer' })
    // One program declares it, so the resolution adopts that scope and says so.
    expect(result.data?.resolved).toBe(true)
    expect(result.data?.adopted_from).toBe('MainProgram')
  })

  it('resolves the same name when the program scope is given', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_resolve_tag', { address: 'MainTimer', scope: 'MainProgram' })
    expect(result.data?.resolved).toBe(true)
    expect(result.data?.data_type).toBe('TIMER')
  })

  it('still reports a name no scope declares as absent', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_resolve_tag', { address: 'NoSuchTag' })
    expect(String(result.data?.reason)).toBe('Declaration is absent from the export')
    expect(result.data?.scopes).toBeUndefined()
  })
})


describe('an instruction whose operands are not modelled', () => {
  it('refuses to compose it rather than claiming an arity', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SFP', args: ['MainRoutine', '2'] }] }) })
    expect(result.error?.code).toBe('INSTRUCTION_NOT_MODELLED')
    expect(result.error?.message).toContain('SFP')
    // The refusal has to leave a way forward, or a model loops on it.
    expect(result.error?.fix).toContain('l5x_draft_rung')
  })

  it('says so in the listing instead of listing zero operands', async () => {
    const l5x = harness(fixtureBytes)
    const rows = (await l5x.call('l5x_list_instructions', { filter: 'sfp' })).data?.rows as { name: string; operands_modelled?: boolean }[]
    const row = rows.find(entry => entry.name === 'SFP')
    expect(row?.operands_modelled).toBe(false)
  })

  it('still lets the rung text path carry it', async () => {
    const l5x = await opened()
    const staged = await l5x.call('l5x_draft_rung', { program: 'MainProgram', routine: 'MainRoutine', rung: 0, mode: 'replace', text: 'XIC(StartPB)SFP(MainRoutine,2);' })
    expect(staged.error).toBeUndefined()
  })
})


/** An export with the array, control and scalar tags these instructions need. */
const COMPOSER_L5X = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Composer\" ProcessorType=\"5069-L320ERMS2\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags>\n      <Tag Name=\"a1\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"a2\" TagType=\"Base\" DataType=\"BOOL\"/>\n      <Tag Name=\"d1\" TagType=\"Base\" DataType=\"DINT\"/><Tag Name=\"d2\" TagType=\"Base\" DataType=\"DINT\"/>\n      <Tag Name=\"r1\" TagType=\"Base\" DataType=\"REAL\"/><Tag Name=\"r2\" TagType=\"Base\" DataType=\"REAL\"/>\n      <Tag Name=\"r3\" TagType=\"Base\" DataType=\"REAL\"/>\n      <Tag Name=\"ctl1\" TagType=\"Base\" DataType=\"CONTROL\"/>\n      <Tag Name=\"arr1\" TagType=\"Base\" DataType=\"DINT\" Dimensions=\"10\"/>\n      <Tag Name=\"arr2\" TagType=\"Base\" DataType=\"DINT\" Dimensions=\"10\"/>\n    </Tags>\n    <Programs><Program Name=\"Main\" MainRoutineName=\"R\">\n      <Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n        <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(a1)OTE(a2);]]></Text></Rung>\n      </RLLContent></Routine></Routines>\n    </Program></Programs>\n    <Tasks><Task Name=\"MainTask\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"Main\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"].join('')

describe('instructions verified by a Studio build', () => {
  // Each rung below was accepted by Logix Designer (build passed, 0 import warnings) on
  // 2026-11-01; the composer must keep emitting exactly this text.
  const cases: readonly (readonly [string, readonly string[], boolean])[] = [
    ['FFL', ['arr1[0]', 'arr2', 'ctl1', '10', '0'], true],
    ['FFU', ['arr2', 'd1', 'ctl1', '10', '0'], true],
    ['LFL', ['arr1[0]', 'arr2', 'ctl1', '10', '0'], true],
    ['LFU', ['arr2', 'd1', 'ctl1', '10', '0'], true],
    ['DTR', ['arr1[0]', 'd2', 'arr2[0]'], false],
    ['ATAN2', ['r1', 'r2', 'r3'], true],
    ['SQI', ['arr2', 'd2', 'arr1[0]', 'ctl1', '10', '0'], false],
    ['EVENT', ['MainTask'], true],
  ]

  for (const [name, args, output] of cases) {
    it(`composes ${name} in the operand order Studio accepted`, async () => {
      const l5x = harness(new Map([['composer.l5x', new TextEncoder().encode(COMPOSER_L5X)]]), { editing: true })
      await l5x.call('l5x_open_project', { path: 'composer.l5x' })
      const series = [{ instr: 'XIC', args: ['a1'] }, { instr: name, args }, ...(output ? [] : [{ instr: 'OTE', args: ['a2'] }])]
      const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify({ series }) })
      expect(result.error).toBeUndefined()
      const expected = `XIC(a1)${name}(${args.join(',')})${output ? '' : 'OTE(a2)'};`
      expect(result.data?.rungs?.[0]?.neutral_text).toBe(expected)
    })
  }
})


describe('operand order confirmed by build', () => {
  it('composes SQO and SQL in the order Studio accepted', async () => {
    // Builds: XIC(a1)SQO(arr[0],mask,dest[0],ctl,10,0)OTE(a2); and
    // XIC(a1)SQL(arr[0],src[0],ctl,10,0)OTE(a2); both passed with 0 warnings and 0 errors.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="SeqOrder" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="a1" TagType="Base" DataType="BOOL"/><Tag Name="a2" TagType="Base" DataType="BOOL"/>
      <Tag Name="arr" TagType="Base" DataType="DINT" Dimensions="10"/>
      <Tag Name="src" TagType="Base" DataType="DINT" Dimensions="10"/>
      <Tag Name="dest" TagType="Base" DataType="DINT" Dimensions="10"/>
      <Tag Name="mask" TagType="Base" DataType="DINT"/>
      <Tag Name="ctl" TagType="Base" DataType="CONTROL"/>
    </Tags>
    <Programs><Program Name="Main" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent><Rung Number="0" Type="N"><Text><![CDATA[XIC(a1)OTE(a2);]]></Text></Rung></RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5x = harness(new Map([['seq.l5x', new TextEncoder().encode(xml)]]), { editing: true })
    expect((await l5x.call('l5x_open_project', { path: 'seq.l5x' })).error).toBeUndefined()
    for (const [spec, expected] of [
      [{ series: [{ instr: 'XIC', args: ['a1'] }, { instr: 'SQO', args: ['arr[0]', 'mask', 'dest[0]', 'ctl', '10', '0'] }, { instr: 'OTE', args: ['a2'] }] }, 'XIC(a1)SQO(arr[0],mask,dest[0],ctl,10,0)OTE(a2);'],
      [{ series: [{ instr: 'XIC', args: ['a1'] }, { instr: 'SQL', args: ['arr[0]', 'src[0]', 'ctl', '10', '0'] }, { instr: 'OTE', args: ['a2'] }] }, 'XIC(a1)SQL(arr[0],src[0],ctl,10,0)OTE(a2);'],
    ] as const) {
      const result = await l5x.call('l5x_compose_rung', { spec_json: JSON.stringify(spec) })
      expect(result.error).toBeUndefined()
      const rungs = result.data?.rungs as { neutral_text: string }[]
      expect(rungs[0]?.neutral_text).toBe(expected)
    }
  })
})

describe('pseudo-operands are immediate literals', () => {
  function project(): string {
    return l5x({
      name: 'ImmGuard',
      tags: tag('Start', 'BOOL') + tag('Count', 'DINT') + tag('Fifo', 'DINT', ' Dimensions="8"') + tag('Ctrl', 'CONTROL') + tag('Dest', 'DINT') + tag('Pos', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
  }

  it('refuses a tag in FFL Position and states the written order', async () => {
    const tool = harness(new Map([['imm.l5x', new TextEncoder().encode(project())]]), { editing: true })
    expect((await tool.call('l5x_open_project', { path: 'imm.l5x' })).error).toBeUndefined()
    // Studio answered "Invalid kind of operand or argument i.e. tag, literal, or expression."
    // for FFL(...,Index): Length and Position compile into the instruction word.
    const bad = await tool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FFL', args: ['Count', 'Fifo', 'Ctrl', '8', 'Pos'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('immediate literal')
    expect(bad.error?.fix).toContain('Source, FIFO, Control, Length, Position')
    // The build that proved the vendor shape: literal 0 in Position.
    const good = await tool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FFL', args: ['Count', 'Fifo', 'Ctrl', '8', '0'] }] }) })
    expect(good.error).toBeUndefined()
    expect(text(good.data)).toBe('FFL(Count,Fifo,Ctrl,8,0);')
  })

  it('refuses a scalar tag where a sequencer takes an array or element', async () => {
    const tool = harness(new Map([['seq2.l5x', new TextEncoder().encode(project())]]), { editing: true })
    expect((await tool.call('l5x_open_project', { path: 'seq2.l5x' })).error).toBeUndefined()
    const bad = await tool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SQO', args: ['Count', 'Count', 'Dest', 'Ctrl', '8', '0'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('array tag or one of its elements')
    const good = await tool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SQO', args: ['Fifo', 'Count', 'Dest', 'Ctrl', '8', '0'] }] }) })
    expect(good.error).toBeUndefined()
    expect(text(good.data)).toBe('SQO(Fifo,Count,Dest,Ctrl,8,0);')
  })
})