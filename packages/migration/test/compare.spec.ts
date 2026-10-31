import { describe, expect, it } from 'vitest'
import { compareSides, readLogix } from '../src/engine/compare.ts'
import type { LegacySide } from '../src/engine/compare.ts'

/** A minimal `.L5X` export with one matched routine, one tag and a module. */
const LOGIX = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content>
  <Controller Name="SLITTER8" ProcessorType="5069-L330ER" MajorRev="31">
    <Programs>
      <Program Name="MainProgram">
        <Routines>
          <Routine Name="_2_JSRS" Type="RLL">
            <Rung Number="0" Type="N"><Text><![CDATA[XIC(S:FS)OTE(Move_TopHeatRolls_InPosition);]]></Text></Rung>
          </Routine>
        </Routines>
      </Program>
    </Programs>
    <Tags>
      <Tag Name="Move_TopHeatRolls_InPosition" DataType="BOOL"/>
      <Tag Name="N7_130" DataType="DINT"/>
    </Tags>
    <Modules><Module Name="ENETBRIDGE_1746"/></Modules>
  </Controller>
</RSLogix5000Content>
`

/** The legacy side, as `slc_read` would report it. */
function legacy(): LegacySide {
  return {
    project: 'SLITTER8',
    controller: '1747-L542C',
    files: [{ name: 'JSRS', rungs: 1 }],
    totalRungs: 1,
    symbols: [{ address: 'B43:12/0', symbol: 'MOTOR', description: '', scope: '' }],
    symbolCount: 1,
    dataFiles: [{ number: 7, type: 'N', name: 'INTEGER', elements: 1 }],
    dataFileCount: 1,
  }
}

describe('readLogix', () => {
  it('reads the controller, routines, tags and modules from an export', () => {
    const logix = readLogix(LOGIX)
    expect(logix.controller).toBe('SLITTER8')
    expect(logix.processor).toBe('5069-L330ER')
    expect(logix.revision).toBe(31)
    expect(logix.routines).toHaveLength(1)
    expect(logix.routines[0]?.name).toBe('_2_JSRS')
    expect(logix.routines[0]?.rungs).toBe(1)
    expect(logix.tags).toContain('N7_130')
    expect(logix.moduleCount).toBe(1)
    expect(logix.rungCount).toBe(1)
  })
})

describe('compareSides', () => {
  it('matches a ladder file to the routine whose name carries it', () => {
    const comparison = compareSides(legacy(), readLogix(LOGIX))
    expect(comparison.matched).toHaveLength(1)
    expect(comparison.matched[0]?.routine).toBe('_2_JSRS')
    expect(comparison.missingInLogix).toEqual([])
    expect(comparison.rungTotals.legacy).toBe(1)
    expect(comparison.rungTotals.matchedLegacy).toBe(1)
  })

  it('maps the data file to the migrated tag and reports the unmapped symbol', () => {
    const comparison = compareSides(legacy(), readLogix(LOGIX))
    expect(comparison.dataFiles.mapped).toBe(1)
    expect(comparison.dataFiles.missing).toEqual([])
    expect(comparison.symbols.mapped).toBe(0)
    expect(comparison.symbols.missing).toContain('MOTOR')
    expect(comparison.differences.map(entry => entry.rule)).toContain('SYMBOL_MISSING')
    expect(comparison.differences.find(entry => entry.rule === 'SYMBOL_MISSING')?.kind).toBe('real')
  })

  it('calls a ladder file with no routine a real difference', () => {
    const orphaned = legacy()
    const comparison = compareSides({ ...orphaned, files: [...orphaned.files, { name: 'PUSHBUTONS', rungs: 45 }] }, readLogix(LOGIX))
    expect(comparison.missingInLogix).toEqual(['PUSHBUTONS'])
    const missing = comparison.differences.find(entry => entry.rule === 'ROUTINE_MISSING')
    expect(missing?.kind).toBe('real')
    expect(missing?.count).toBe(1)
  })
})
