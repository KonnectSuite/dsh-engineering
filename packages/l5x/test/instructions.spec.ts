/**
 * The instruction catalog: shape, aliases, coverage and the listing tool.
 */
import { describe, expect, it } from 'vitest'
import { INSTRUCTIONS, instructionByName, nearestInstructions, canonicalInstruction, NUMERIC_TYPES, TIMER_TYPES } from '../src/engine/instructions.ts'
import { fixtureBytes, harness } from './harness.ts'

/** Instructions the committed fixture rungs actually use. */
const FIXTURE_INSTRUCTIONS = ['XIC', 'XIO', 'OTE', 'TON', 'CTU', 'MOV']

describe('catalog', () => {
  it('gives every instruction a name, category, summary and typed operands', () => {
    expect(INSTRUCTIONS.length).toBeGreaterThan(40)
    for (const instruction of INSTRUCTIONS) {
      expect(instruction.name).toMatch(/^[A-Z][A-Z0-9]*$/u)
      expect(instruction.category.length).toBeGreaterThan(0)
      expect(instruction.summary.length).toBeGreaterThan(5)
      for (const slot of instruction.operands) {
        expect(slot.name.length).toBeGreaterThan(0)
        expect(['BOOL', 'NUMBER', 'ANY', 'TIMER', 'COUNTER', 'STRING', 'EXPRESSION', 'ROUTINE', 'LABEL', 'KEYWORD']).toContain(slot.kind)
      }
    }
  })

  it('has no duplicate mnemonics', () => {
    const names = INSTRUCTIONS.map(instruction => instruction.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('covers every instruction the fixture uses', () => {
    for (const name of FIXTURE_INSTRUCTIONS) expect(instructionByName(name), name).toBeDefined()
  })

  it('resolves the shorter spellings Studio also accepts', () => {
    expect(instructionByName('EQ')?.name).toBe('EQU')
    expect(instructionByName('GE')?.name).toBe('GEQ')
    expect(instructionByName('MOVE')?.name).toBe('MOV')
    expect(canonicalInstruction('lt')).toBe('LES')
  })

  it('declares the numeric and timer type families it validates against', () => {
    expect([...NUMERIC_TYPES]).toEqual(expect.arrayContaining(['INT', 'DINT', 'REAL']))
    expect([...TIMER_TYPES]).toEqual(expect.arrayContaining(['TIMER', 'TON']))
  })

  it('suggests close names for a typo', () => {
    expect(nearestInstructions('XICX')).toContain('XIC')
    expect(nearestInstructions('TONN')).toContain('TON')
  })
})

describe('list_instructions', () => {
  it('lists the catalog with operand kinds', async () => {
    const l5x = harness(fixtureBytes)
    const result = await l5x.call('list_instructions', {})
    expect(result.error).toBeUndefined()
    const rows = result.data?.rows as { name: string; operands: { name: string; kind: string; required: boolean }[] }[]
    const ton = rows.find(row => row.name === 'TON')
    expect(ton?.operands).toEqual([{ name: 'Timer', kind: 'TIMER', required: true }, { name: 'Preset', kind: 'NUMBER', required: true }])
  })

  it('filters by name and by category', async () => {
    const l5x = harness(fixtureBytes)
    const byName = await l5x.call('list_instructions', { filter: 'ton' })
    expect((byName.data?.rows as { name: string }[]).some(row => row.name === 'TON')).toBe(true)
    const byCategory = await l5x.call('list_instructions', { category: 'Comparison' })
    const names = (byCategory.data?.rows as { name: string }[]).map(row => row.name)
    expect(names).toContain('EQU')
    expect(names).not.toContain('TON')
  })
})

describe('list_instructions names the other spelling', () => {
  it('carries the alternate published spelling of a renamed instruction', async () => {
    const l5x = harness(fixtureBytes)
    const rows = (await l5x.call('list_instructions', { filter: 'sqr' })).data?.rows as { name: string; also_published_as?: string }[]
    expect(rows.find(row => row.name === 'SQR')?.also_published_as).toBe('SQRT')
    expect(rows.find(row => row.name === 'SQR')?.name).toBe('SQR')
  })

  it('omits the field for an instruction that was never renamed', async () => {
    const l5x = harness(fixtureBytes)
    const rows = (await l5x.call('list_instructions', { filter: 'ton' })).data?.rows as { name: string }[]
    expect(rows.find(row => row.name === 'TON')).not.toHaveProperty('also_published_as')
  })
})


describe('newly catalogued instructions', () => {
  it('carries the operand order the vendor metadata uses', () => {
    const expected: readonly (readonly [string, number])[] = [
      ['CONCAT', 3], ['MID', 4], ['FIND', 4], ['INSERT', 4], ['DELETE', 4],
      ['LOWER', 2], ['UPPER', 2], ['RTOS', 2], ['FLL', 3], ['SBR', 0],
    ]
    for (const [name, count] of expected) {
      expect(instructionByName(name), name).toBeDefined()
      expect(instructionByName(name)?.operands.length, name).toBe(count)
    }
  })

  it('names the string and file slots a reader has to fill', () => {
    expect(instructionByName('MID')?.operands.map(slot => slot.name)).toEqual(['Source', 'Qty', 'Start', 'Dest'])
    expect(instructionByName('FLL')?.operands.map(slot => slot.name)).toEqual(['Source', 'Dest', 'Length'])
    expect(instructionByName('INSERT')?.operands.map(slot => slot.name)).toEqual(['Source A', 'Source B', 'Start', 'Dest'])
  })
})

describe('composing with a newly catalogued instruction', () => {
  it('composes a file fill rung', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'sample.l5x' })).error).toBeUndefined()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'FLL', args: ['LineSpeed', 'FaultCount', '5'] }] }),
    })
    expect(result.error).toBeUndefined()
    const rungs = result.data?.rungs as { neutral_text: string }[]
    expect(rungs[0]?.neutral_text).toBe('XIC(StartPB)FLL(LineSpeed,FaultCount,5);')
  })

  it('composes a subroutine label with no operands', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'sample.l5x' })).error).toBeUndefined()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SBR' }] }) })
    expect(result.error).toBeUndefined()
    const rungs = result.data?.rungs as { neutral_text: string }[]
    expect(rungs[0]?.neutral_text).toBe('SBR();')
  })
})


/** One export carrying STRING tags, so the string slots can be type-checked. */
const STRING_EXPORT = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="36.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="StringController" ProcessorType="1756-L8" MajorRev="36" MinorRev="0">
    <Tags>
      <Tag Name="TextA" TagType="Base" DataType="STRING"/>
      <Tag Name="TextB" TagType="Base" DataType="STRING"/>
      <Tag Name="TextOut" TagType="Base" DataType="STRING"/>
      <Tag Name="Count" TagType="Base" DataType="DINT"/>
      <Tag Name="Start" TagType="Base" DataType="BOOL"/>
    </Tags>
    <Programs>
      <Program Name="Main" MainRoutineName="Ladder">
        <Routines>
          <Routine Name="Ladder" Type="RLL"><RLLContent>
            <Rung Number="0" Type="N"><Text><![CDATA[XIC(Start)OTE(Start);]]></Text></Rung>
          </RLLContent></Routine>
        </Routines>
      </Program>
    </Programs>
  </Controller>
</RSLogix5000Content>`

/** Open the STRING export and return the harness. */
async function openedStrings() {
  const l5x = harness(new Map([['strings.l5x', new TextEncoder().encode(STRING_EXPORT)]]), { editing: true })
  const open = await l5x.call('open_project', { path: 'strings.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('string operands are typed', () => {
  it('reports the string slots as STRING in the listing', async () => {
    const l5x = harness(fixtureBytes)
    const rows = (await l5x.call('list_instructions', { filter: 'concat' })).data?.rows as { name: string; operands: { name: string; kind: string }[] }[]
    expect(rows.find(row => row.name === 'CONCAT')?.operands.map(slot => slot.kind)).toEqual(['STRING', 'STRING', 'STRING'])
  })

  it('composes a string instruction when the tags are strings', async () => {
    const l5x = await openedStrings()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CONCAT', args: ['TextA', 'TextB', 'TextOut'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect((result.data?.rungs as { neutral_text: string }[])[0]?.neutral_text).toBe('CONCAT(TextA,TextB,TextOut);')
  })

  it('refuses a BOOL tag in a string slot, and names the type it needs', async () => {
    const l5x = await openedStrings()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CONCAT', args: ['Start', 'TextB', 'TextOut'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('STRING')
  })

  it('refuses a number in a string slot', async () => {
    const l5x = await openedStrings()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CONCAT', args: ['5', 'TextB', 'TextOut'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('STRING')
  })

  it('still accepts a number in the count slot next to a string slot', async () => {
    const l5x = await openedStrings()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'MID', args: ['TextA', 'Count', 'Count', 'TextOut'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect((result.data?.rungs as { neutral_text: string }[])[0]?.neutral_text).toBe('MID(TextA,Count,Count,TextOut);')
  })
})
