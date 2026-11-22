/**
 * Safety detection: what makes an offline build pointless.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { safetyEvidence, isSafetyProject } from '../src/tools/studio.ts'
import { fixtureBytes, harness, type Envelope } from './harness.ts'

/** The fixture with one program marked as safety, the way Studio 5000 writes it. */
function safetyBytes(): Uint8Array {
  const text = new TextDecoder().decode(fixtureBytes())
  const marked = text.replace('<Program Name="MainProgram"', '<Program Name="MainProgram" Class="Safety"')
  if (marked === text) throw new Error('fixture program anchor missing')
  return new TextEncoder().encode(marked)
}

describe('safety detection', () => {
  it('recognises the element form', () => {
    expect(isSafetyProject('<SafetyProgram Name="S">')).toBe(true)
    expect(safetyEvidence('<SafetyTask Name="S">')[0]).toContain('SafetyTask')
  })

  it('recognises the attribute form newer exports write', () => {
    const xml = '<Program Name="SafetyProgram" Class="Safety" TestEdits="false"/>'
    expect(safetyEvidence(xml)).toContain('a program with Class="Safety"')
    expect(isSafetyProject(xml)).toBe(true)
  })

  it('recognises safety network ports and a locked controller', () => {
    expect(isSafetyProject('<Port Id="1" SafetyNetwork="16#0000_4e1a_0357_fe21"/>')).toBe(true)
    expect(safetyEvidence('<Controller SafetyLocked="true"/>')).toContain('a safety-locked controller')
  // Observed in a real GuardLogix export: the element is present, the attribute is false.
  expect(safetyEvidence('<SafetyInfo SafetyLocked="false" SignatureRunModeProtect="false" SafetyLevel="SIL2/PLd"/>')).toEqual([])
  })

  it('stays quiet on a standard controller', () => {
    const xml = '<Controller Name="Line" ProcessorType="5069-L320ERMS2"><Program Name="Main"/></Controller>'
    expect(safetyEvidence(xml)).toEqual([])
    expect(isSafetyProject(xml)).toBe(false)
  })
})

describe('l5x_verify_offline_l5x on a safety controller', () => {
  it('refuses before the SDK imports it and names the evidence', async () => {
    const l5x = harness(new Map([
      ['base.l5x', fixtureBytes()],
      ['safety.l5x', safetyBytes()],
    ]), { studio: true })
    const base = await l5x.call('l5x_open_project', { path: 'base.l5x' })
    const safety = await l5x.call('l5x_open_project', { path: 'safety.l5x' })
    expect(safety.error).toBeUndefined()
    const output = join(mkdtempSync(join(tmpdir(), 'l5x-safety-')), 'Built.ACD')
    const result: Envelope = await l5x.call('l5x_verify_offline_l5x', {
      project_id: safety.data?.project_id as string,
      baseline_id: base.data?.project_id as string,
      output_path: output,
    })
    expect(result.error?.code).toBe('SAFETY_PROJECT_OFFLINE_VERIFY')
    expect(result.error?.message).toContain('Class="Safety"')
    expect(result.error?.fix).toContain('Studio 5000')
  })
})
