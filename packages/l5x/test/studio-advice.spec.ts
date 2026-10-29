import { describe, expect, it } from 'vitest'
import { importAbortAdvice, isSafetyProject } from '../src/tools/studio.ts'

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
