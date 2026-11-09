import { describe, expect, it } from 'vitest'
import { coverageAgainst, scanIoFootprint } from '../src/engine/census.ts'
import type { Plc5Chassis } from '../src/engine/rslogix5.ts'

const rung = (text: string, file = 'F6:2', number = 0) => ({ file, rung: number, text })

describe('the I/O footprint census', () => {
  it('reduces references to rack/slot cells with counts and highest bit', () => {
    const census = scanIoFootprint([
      rung('XIC O:012/15 EN'),
      rung('XIC O:012/15.14 AND XIC I:012/3 EN'),
      rung('XIC I:153/1 EN'),
    ])
    expect(census.references).toBe(4)
    expect(census.cells).toHaveLength(3)
    const out = census.cells.find(cell => cell.type === 'O' && cell.rack === 12 && cell.slot === 15)!
    expect(out.refs).toBe(2)
    expect(out.maxBit).toBe(14)
    expect(census.racks).toEqual([12, 153])
    expect(census.inputCells).toBe(2)
    expect(census.outputCells).toBe(1)
  })

  it('ignores addresses that are not I/O references', () => {
    const census = scanIoFootprint([rung('MOV 1000 N7:100 D10'), rung('XIC B3:0/7 EN'), rung('S I:2.05 EN')])
    expect(census.references).toBe(0)
    expect(census.cells).toHaveLength(0)
  })

  it('splits configured racks from program-only racks', () => {
    const census = scanIoFootprint([rung('XIC I:4/12 EN'), rung('XIC I:153/1 EN')])
    const chassis: Plc5Chassis[] = [{ name: 'Chassis_1', part: '1771-A4B', slots: 16, startingRack: 0, endingRack: 5, startingGroup: 0, endingGroup: 5, adapter: 18, channel: 'CH A' }]
    const coverage = coverageAgainst(census, chassis)
    expect(coverage.configuredRacks).toEqual([4])
    expect(coverage.programOnlyRacks).toEqual([153])
  })

  it('reports no coverage gap when the program stays inside the configuration', () => {
    const census = scanIoFootprint([rung('XIC I:4/12 EN')])
    const chassis: Plc5Chassis[] = [{ name: 'Chassis_1', part: '1771-A4B', slots: 16, startingRack: 0, endingRack: 5, startingGroup: 0, endingGroup: 5, adapter: 18, channel: 'CH A' }]
    expect(coverageAgainst(census, chassis).programOnlyRacks).toEqual([])
  })
})
