import { describe, expect, it } from 'vitest'
import { importAbortAdvice, isSafetyProject } from '../src/tools/studio.ts'
import { verifyNextStep } from '../src/engine/studio-sdk.ts'

describe('safety project detection', () => {
  it('recognises a safety task or program element', () => {
    expect(isSafetyProject('<RSLogix5000Content><Controller><SafetyTask Name="SafetyTask"/></Controller></RSLogix5000Content>')).toBe(true)
    expect(isSafetyProject('<RSLogix5000Content><Controller><Programs><SafetyProgram Name="S"/></Programs></Controller></RSLogix5000Content>')).toBe(true)
  })

  it('recognises a safety signature or safety network number', () => {
    expect(isSafetyProject('<Controller SafetySignature="0x1234" Name="C"/>')).toBe(true)
    expect(isSafetyProject('<Task Type="SAFETY" Name="SafetyTask"/>')).toBe(true)
    expect(isSafetyProject('<SafetyNetworkNumber Value="1"/>')).toBe(true)
  })

  it('treats an ordinary controller as non-safety', () => {
    expect(isSafetyProject('<RSLogix5000Content><Controller Name="C"><Tasks><Task Type="CONTINUOUS" Name="MainTask"/></Tasks></Controller></RSLogix5000Content>')).toBe(false)
  })
})

describe('import abort advice', () => {
  it('explains a no-changes abort instead of leaving a retry', () => {
    const advice = importAbortAdvice('SDK_OPERATION_FAILED: XMLSrv_E_IMPORT_ABORTED_NO_CHANGES')
    expect(advice).toContain('Studio 5000')
    expect(advice).toContain('retry cannot change it')
  })

  it('stays quiet for an unrelated failure', () => {
    expect(importAbortAdvice('SDK_OPERATION_FAILED: something else')).toBeNull()
  })
})


describe('the offline verify next step', () => {
  it('points at the diff when the build passed', () => {
    const advice = verifyNextStep({ passed: true, failureStage: null, sdkError: null, diagnosticCount: 0 })
    expect(advice).toContain('engineering diff')
  })

  it('says an import failure is not the build revision', () => {
    const advice = verifyNextStep({ passed: false, failureStage: 'import', sdkError: 'XMLSrv_E_IMPORT', diagnosticCount: 2 })
    expect(advice).toContain('not the build revision')
  })

  it('does not tell a reader to read diagnostics when there are none', () => {
    // Observed against the real Studio engine: it stopped at open_source and reported nothing.
    const advice = verifyNextStep({ passed: false, failureStage: 'open_source', sdkError: null, diagnosticCount: 0 })
    expect(advice).toContain('without reporting a diagnostic line')
    expect(advice).not.toContain('Read diagnostics')
    expect(advice).toContain('37')
  })

  it('names diagnostics when there are some', () => {
    const advice = verifyNextStep({ passed: false, failureStage: 'build', sdkError: 'some error', diagnosticCount: 3 })
    expect(advice).toContain('Read diagnostics')
  })
})
