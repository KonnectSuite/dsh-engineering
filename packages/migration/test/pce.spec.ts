import { describe, expect, it } from 'vitest'
import { legacyCalls, logixCalls, resolvePces, stripMarkers } from '../src/engine/pce.ts'
import { readLogix } from '../src/engine/compare.ts'

/** A `.L5X` with the rungs a PLC-5 migration leaves behind. */
const LOGIX = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content>
  <Controller Name="EN049" ProcessorType="1756-L85E" MajorRev="32">
    <Programs>
      <Program Name="MainProgram">
        <Routines>
          <Routine Name="_5_FAULT" Type="RLL">
            <Rung Number="0" Type="N"><Text><![CDATA[PCE(152,PCE001);]]></Text></Rung>
          </Routine>
          <Routine Name="_16_SPLICE" Type="RLL">
            <Rung Number="0" Type="N"><Text><![CDATA[PCE(201,PCE034)XIC(I[4].15)TON(T4[3],?,?);]]></Text></Rung>
            <Rung Number="1" Type="N"><Text><![CDATA[PCE(201,PCE036)XIC(I[4].2)ONS(B3[5].8)XIC(T4[3].DN)OTL(B3[5].7);]]></Text></Rung>
            <Rung Number="2" Type="N"><Text><![CDATA[XIC(NEW_LUG)[CTU(C5[4],?,?) ,OTU(C5[4].CU) ];]]></Text></Rung>
          </Routine>
          <Routine Name="_17_PLT_DET" Type="RLL">
            <Rung Number="0" Type="N"><Text><![CDATA[SBR()[XIO(BT60_000.EN) PCE(150,PCE028) MSG(BT60_000) ,XIC(BT60_000.ER) OTU(BT60_000.ER) ];]]></Text></Rung>
            <Rung Number="1" Type="N"><Text><![CDATA[PCE(116,PCE030)FOR(LABEL_0,S24,0,2,1);]]></Text></Rung>
          </Routine>
        </Routines>
      </Program>
    </Programs>
  </Controller>
</RSLogix5000Content>
`

/** The legacy rungs the export was made from, as the headless reader reports them. */
const LEGACY = [
  { file: 'FAULT', rung: 0, text: 'CLR{ S:11 } ;' },
  { file: 'SPLICE', rung: 0, text: 'XIC{ I:004/17 } TON{ T4:3, 0.01, 50, 50 } ;' },
  { file: 'SPLICE', rung: 1, text: 'XIC{ I:004/2 } ONS{ B3/88 } XIC{ T4:3/DN } OTL{ B3/87 } ;' },
  { file: 'SPLICE', rung: 2, text: 'XIC{ B3/176 } [ CTU{ C5:4, 15, 0 } , OTU{ C5:4/CU } ] ;' },
  { file: 'PLT_DET', rung: 0, text: 'SBR{ } [ XIO{ BT60:0/EN } BTR{ 000, 7, 0, BT60:0, N61:1, 7, No } , XIC{ BT60:0/ER } OTU{ BT60:0/ER } ] ;' },
  { file: 'PLT_DET', rung: 1, text: 'FOR{ 0, S:24, 0, 2, 1 } ;' },
]

describe('legacyCalls and logixCalls', () => {
  it('reads legacy instructions with their operand lists', () => {
    const calls = legacyCalls('XIC{ I:004/17 } TON{ T4:3, 0.01, 50, 50 } ;')
    expect(calls.map(call => call.name)).toEqual(['XIC', 'TON'])
    expect(calls[1]?.operands).toEqual(['T4:3', '0.01', '50', '50'])
  })

  it('reads a Logix rung through nested parentheses and subscripts', () => {
    const calls = logixCalls('PCE(201,PCE034)XIC(I[4].15)TON(T4[3],?,?);')
    expect(calls.map(call => call.name)).toEqual(['PCE', 'XIC', 'TON'])
    expect(calls[2]?.args).toEqual(['T4[3]', '?', '?'])
  })

  it('strips every marker and collapses the gap it leaves', () => {
    expect(stripMarkers('<![CDATA[PCE(201,PCE002)XIC(I[3].3)ONS(B20[1].0);]]>')).toBe('XIC(I[3].3)ONS(B20[1].0);')
  })
})

describe('resolvePces', () => {
  const report = resolvePces(LEGACY, readLogix(LOGIX).routines)

  it('pairs every marked rung with the legacy rung it came from', () => {
    expect(report.markers.map(marker => `${marker.routine}#${marker.rung}`)).toEqual([
      '_5_FAULT#0',
      '_16_SPLICE#0',
      '_16_SPLICE#1',
      '_17_PLT_DET#0',
      '_17_PLT_DET#1',
    ])
  })

  it('deletes a marker whose rung already carries the legacy instructions', () => {
    const marker = report.markers.find(entry => entry.rung === 1 && entry.routine === '_16_SPLICE')
    expect(marker?.resolution.kind).toBe('delete-marker')
    expect(marker?.resolution.work).toBe('mechanical')
    expect(marker?.resolution.proposed).toBe('XIC(I[4].2)ONS(B3[5].8)XIC(T4[3].DN)OTL(B3[5].7);')
  })

  it('folds a legacy timer operand list into the timer structure', () => {
    const operand = report.operands.find(entry => entry.instruction === 'TON')
    expect(operand?.resolution.kind).toBe('timer-operands')
    expect(operand?.resolution.work).toBe('mechanical')
    expect(operand?.resolution.proposed).toBe('TON(T4[3])')
    expect(operand?.resolution.advice).toContain('T4[3].PRE := 0.5 s')
  })

  it('folds a legacy counter operand list into the counter structure', () => {
    const operand = report.operands.find(entry => entry.instruction === 'CTU')
    expect(operand?.resolution.kind).toBe('counter-operands')
    expect(operand?.resolution.proposed).toBe('CTU(C5[4])')
    expect(operand?.resolution.advice).toContain('C5[4].PRE := 15')
  })

  it('offers the whole rung when every unknown operand on it is answerable', () => {
    const operand = report.operands.find(entry => entry.instruction === 'CTU')
    expect(operand?.rungText).toBe('XIC(NEW_LUG)[CTU(C5[4]) ,OTU(C5[4].CU) ];')
    const timer = report.operands.find(entry => entry.instruction === 'TON')
    expect(timer?.rungText).toBeUndefined()
  })

  it('answers a marker on a rung whose only gap is the timer operand list', () => {
    const marker = report.markers.find(entry => entry.rung === 0 && entry.routine === '_16_SPLICE')
    expect(marker?.resolution.kind).toBe('delete-marker')
    expect(marker?.resolution.work).toBe('mechanical')
    expect(marker?.resolution.proposed).toBe('XIC(I[4].15)TON(T4[3]);')
  })

  it('names the DINT tag a FOR loop needs, from the status word it used', () => {
    const marker = report.markers.find(entry => entry.code === 116)
    expect(marker?.resolution.kind).toBe('loop-index')
    expect(marker?.resolution.work).toBe('review')
    expect(marker?.resolution.proposed).toBeUndefined()
    expect(marker?.resolution.advice).toContain('S24')
    expect(marker?.resolution.advice).toContain('DINT tag')
  })

  it('sends a block transfer that became MSG to review, with its operands', () => {
    const marker = report.markers.find(entry => entry.code === 150)
    expect(marker?.resolution.kind).toBe('message-config')
    expect(marker?.resolution.work).toBe('review')
    expect(marker?.resolution.advice).toContain('PLC-5 Typed Read')
    expect(marker?.resolution.advice).toContain('rack 000 group 7 slot 0')
    expect(marker?.resolution.advice).toContain('N61:1')
  })

  it('sends a rung that only cleared a status word to review, and names the build audit', () => {
    const marker = report.markers.find(entry => entry.code === 152)
    expect(marker?.resolution.kind).toBe('status-word')
    expect(marker?.resolution.work).toBe('review')
    expect(marker?.resolution.advice).toContain('S:11')
    expect(marker?.resolution.advice).toContain('RxCMP_E_AUDIT_OUTPUTS')
  })

  it('counts what is mechanical and what needs a decision', () => {
    expect(report.counts.markers).toBe(5)
    expect(report.counts.operands).toBe(2)
    expect(report.counts.mechanical).toBe(4)
    expect(report.counts.review).toBe(3)
    expect(Object.fromEntries(report.counts.byCode.map(entry => [entry.code, entry.count]))).toEqual({ 116: 1, 150: 1, 152: 1, 201: 2 })
  })

  it('records the legacy instruction a marker stands for', () => {
    expect(report.translated).toEqual([
      { routine: '_17_PLT_DET', rung: 0, legacy: 'BTR { 000, 7, 0, BT60:0, N61:1, 7, No }', logix: 'MSG' },
    ])
  })

  it('reports a legacy file that matched no routine instead of guessing', () => {
    const unpaired = resolvePces([{ file: 'NOT_A_FILE', rung: 0, text: 'CLR{ S:11 } ;' }], readLogix(LOGIX).routines)
    expect(unpaired.markers).toHaveLength(0)
    expect(unpaired.unmatchedRungs).toEqual(['NOT_A_FILE'])
  })

  it('reviews a rung whose instructions no longer line up', () => {
    const logix = readLogix(`<RSLogix5000Content><Controller Name="X" ProcessorType="1756-L85E" MajorRev="32">
      <Programs><Program Name="P"><Routines><Routine Name="_9_ODD" Type="RLL">
      <Rung Number="0" Type="N"><Text><![CDATA[PCE(201,PCE001)XIC(A)OTE(B);]]></Text></Rung>
      </Routine></Routines></Program></Programs></Controller></RSLogix5000Content>`)
    const mismatched = resolvePces([{ file: 'ODD', rung: 0, text: 'XIC{ A } XIO{ C } OTE{ B } ;' }], logix.routines)
    expect(mismatched.markers[0]?.resolution.kind).toBe('review')
    expect(mismatched.markers[0]?.resolution.advice).toContain('missing XIO')
  })
})
