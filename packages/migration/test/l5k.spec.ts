import { describe, expect, it } from 'vitest'
import { lintL5k, readL5k } from '../src/engine/l5k.ts'

const header = `IE_VER := 2.6;

CONTROLLER CNTRLR (
		ProcessorType := 5069-L330ER,
		Major := 31
		)
`

const clean = `${header}
	MODULE Local (Parent := "Local",
	    CatalogNumber := "5069-L330ER")
	END_MODULE

  MODULE ENETBRIDGE_1746 (Parent := "Local",
	    CatalogNumber := "1747-AENTR",
	    Slot := 0)
  END_MODULE

TAG
  Motor_Start : BOOL;
  N7 : DINT[10];
END_TAG

PROGRAM MainProgram
	ROUTINE MainRoutine ()
		N:  XIC(Motor_Start) OTE(N7[0].0);
	END_ROUTINE
END_PROGRAM
`

describe('readL5k', () => {
  it('reads the controller, modules, tags and rung census', () => {
    const facts = readL5k(clean)
    expect(facts.controllerName).toBe('CNTRLR')
    expect(facts.processorType).toBe('5069-L330ER')
    expect(facts.revision).toBe(31)
    expect(facts.modules.map(module => module.catalog)).toEqual(['5069-L330ER', '1747-AENTR'])
    expect(facts.tags).toEqual(['Motor_Start', 'N7'])
    expect(facts.routineCount).toBe(1)
    expect(facts.rungCount).toBe(1)
    expect(facts.instructions).toEqual({ XIC: 1, OTE: 1 })
  })
})

describe('lintL5k', () => {
  it('passes a well-formed file apart from the revision note', () => {
    const report = lintL5k(clean)
    expect(report.findings.filter(finding => finding.severity === 'error')).toEqual([])
    expect(report.findings.map(finding => finding.rule)).toContain('REVISION_BELOW_TARGET')
  })

  it('catches the trailing comma that aborts the whole import', () => {
    const text = `${header}
TAG
  SLOT12_1746_HSCE_Placeholder : SLOT12_UDT (Description:="WINDER #2 SPEED CMD * DA 903 * LAY-ON #1 O:12.0",
):=[[16#4008,
			16#00d2]];
END_TAG
`
    const report = lintL5k(text)
    const comma = report.findings.filter(finding => finding.rule === 'TRAILING_COMMA')
    expect(comma.length).toBeGreaterThan(0)
    expect(comma[0]?.severity).toBe('error')
    expect(comma[0]?.message).toContain('comma')
  })

  it('catches a same-line comma before the closing parenthesis', () => {
    const text = `${header}
TAG
  Flag : BOOL (Description:="x",);
END_TAG
`
    expect(lintL5k(text).findings.some(finding => finding.rule === 'TRAILING_COMMA')).toBe(true)
  })

  it('flags the placeholder a missing module leaves behind', () => {
    const text = `${header}
TAG
  SLOT12_1746_HSCE_Placeholder : SLOT12_UDT;
END_TAG
`
    const placeholder = lintL5k(text).findings.filter(finding => finding.rule === 'PLACEHOLDER_TAG')
    expect(placeholder).toHaveLength(1)
    expect(placeholder[0]?.message).toContain('1746-HSCE')
  })

  it('flags an indirect array index and reports the line', () => {
    const text = `${header}
PROGRAM MainProgram
	ROUTINE MainRoutine ()
		N:  XIC(N7[130]) MOV(N[N7_131], N7[132]);
	END_ROUTINE
END_PROGRAM
`
    const report = lintL5k(text)
    const indirect = report.findings.filter(finding => finding.rule === 'INDIRECT_ADDRESS')
    expect(indirect).toHaveLength(1)
    expect(indirect[0]?.line).toBe(10)
  })

  it('flags duplicate and over-long tag names', () => {
    const long = 'A'.repeat(41)
    const text = `${header}
TAG
  Motor : BOOL;
  motor : DINT;
  ${long} : BOOL;
END_TAG
`
    const rules = lintL5k(text).findings.map(finding => finding.rule)
    expect(rules.filter(rule => rule === 'DUPLICATE_TAG')).toHaveLength(1)
    expect(rules.filter(rule => rule === 'TAG_NAME_TOO_LONG')).toHaveLength(1)
  })

  it('flags unbalanced routine blocks', () => {
    const text = `${header}
PROGRAM MainProgram
	ROUTINE MainRoutine ()
		N:  XIC(Start) OTE(Run);
END_PROGRAM
`
    expect(lintL5k(text).findings.some(finding => finding.rule === 'ROUTINE_UNBALANCED')).toBe(true)
  })
})
