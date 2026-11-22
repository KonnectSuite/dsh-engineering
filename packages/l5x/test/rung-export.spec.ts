/**
 * The rung-target export Studio's Import Rungs accepts.
 *
 * Studio refuses a routine-target file from Import Rungs with error 5078-0 ("The specified L5X
 * file does not contain a Rung export"). These checks pin the shape that does import: a Rung root
 * target with a count, context owners, and `Use="Target"` on the rung elements.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the fixtures mounted. */
function reader() {
  return harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
}

/** Open the sample export and return its project handle. */
async function sample(): Promise<string> {
  const l5x = reader()
  const opened = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
  expect(opened.error).toBeUndefined()
  return opened.data!.project_id!
}

describe('l5x_export_rungs', () => {
  it('writes a Rung-target export with the chosen rungs renumbered from zero', async () => {
    const l5x = reader()
    const opened = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    const result = await l5x.call('l5x_export_rungs', {
      project_id: opened.data!.project_id!,
      program: 'MainProgram',
      routine: 'MainRoutine',
      rungs: [0, 2],
      output_path: 'MainProgram-MainRoutine-rungs.L5X',
    })
    expect(result.error).toBeUndefined()
    expect(result.data?.program).toBe('MainProgram')
    expect(result.data?.routine).toBe('MainRoutine')
    expect(result.data?.rung_numbers).toEqual([0, 2])
    expect(result.data?.import_route).toContain('Import Rungs')
    expect(result.data?.paste_text).toHaveLength(2)
    expect(result.data?.paste_text?.[1]).toContain('XIC')
    expect(result.data?.paste_text?.[1]).toContain('OTE')
    expect(result.data?.paste_text_note).toContain('Ctrl+V')
    expect(result.data?.validation).toEqual({ xml: 'passed', studio_import: 'not_run' })

    const document = l5x.written.get('MainProgram-MainRoutine-rungs.L5X') ?? ''
    expect(document.startsWith('<?xml version="1.0" encoding="UTF-8"')).toBe(true)
    expect(document).toContain('TargetType="Rung"')
    expect(document).toContain('TargetCount="2"')
    expect(document).toContain('ContainsContext="true"')
    expect(document).toContain('ExportOptions="')
    expect(document).toContain('RoutineLabels')
    expect(document).toContain('<Controller Use="Context"')
    expect(document).toContain('<Programs Use="Context">')
    expect(document).toContain('<Routine Use="Context" Name="MainRoutine">')
    expect(document).toContain('<RLLContent Use="Context">')
    expect(document).toMatch(/<Rung [^>]*Use="Target"[^>]*Number="0"[^>]*Comment="System start\/stop - start seals in through SystemRunning, stop or E-stop breaks circuit"/u)
    expect(document).toMatch(/<Rung [^>]*Use="Target"[^>]*Number="1"/u)
    expect(document).not.toContain('TargetName=')
    expect(document).not.toContain('TargetSubType=')
  })

  it('exports every rung and no other routine when the names are omitted', async () => {
    const l5x = reader()
    const opened = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    const ambiguous = await l5x.call('l5x_export_rungs', {
      project_id: opened.data!.project_id!,
      output_path: 'all-rungs.L5X',
    })
    expect(ambiguous.error?.code).toBe('AMBIGUOUS_TARGET')

    const result = await l5x.call('l5x_export_rungs', {
      project_id: opened.data!.project_id!,
      program: 'MotorProgram',
      routine: 'MotorControl',
      output_path: 'motor-rungs.L5X',
    })
    expect(result.error).toBeUndefined()
    expect(result.data?.rung_numbers).toEqual([0, 1, 2, 3])
    const document = l5x.written.get('motor-rungs.L5X') ?? ''
    expect(document).toContain('TargetCount="4"')
    expect(document).toContain('<Program Use="Context" Name="MotorProgram"')
    expect(document).toContain('<Routine Use="Context" Name="MotorControl">')
    expect(document).not.toContain('<Routine Use="Context" Name="MainRoutine"')
  })

  it('refuses a rung that is not in the routine and a non-ladder routine', async () => {
    const l5x = reader()
    const opened = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    const missing = await l5x.call('l5x_export_rungs', {
      project_id: opened.data!.project_id!,
      program: 'MainProgram',
      routine: 'MainRoutine',
      rungs: [99],
      output_path: 'missing.L5X',
    })
    expect(missing.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(missing.error?.fix).toContain('0, 1, 2, 3, 4')

    const st = await l5x.call('l5x_export_rungs', {
      project_id: opened.data!.project_id!,
      program: 'MainProgram',
      routine: 'FaultHandler',
      output_path: 'st-rungs.L5X',
    })
    expect(st.error?.code).toBe('UNSUPPORTED_ROUTINE')
    expect(st.error?.fix).toContain('Import Routine')
    expect(l5x.written.has('missing.L5X')).toBe(false)
    expect(l5x.written.has('st-rungs.L5X')).toBe(false)
  })
})
