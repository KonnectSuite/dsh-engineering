import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the studio entry mounted over the read entry. */
function studioHarness() {
  return harness(fixtureBytes, { studio: true })
}

describe('studio registration', () => {
  it('mounts the offline SDK tools after the read surface', () => {
    const { definitions } = studioHarness()
    const names = definitions.map(definition => definition.name)
    expect(names.slice(11)).toEqual([
      'studio_sdk_status',
      'studio_capabilities',
      'export_acd_to_l5x',
      'verify_offline_l5x',
      'build_acd_from_draft',
      'studio_review_evidence',
    ])
  })
})

describe('studio preflight', () => {
  it('reports SDK availability and never throws without a project', async () => {
    const l5x = studioHarness()
    const status = await l5x.call('studio_sdk_status')
    expect(status.error).toBeUndefined()
    expect(typeof status.data?.available).toBe('boolean')
    expect(status.summary).toContain('Studio 5000 SDK')
  })

  it('reports capabilities for the machine', async () => {
    const l5x = studioHarness()
    const capabilities = await l5x.call('studio_capabilities')
    expect(capabilities.error).toBeUndefined()
    expect(capabilities.data).toBeTypeOf('object')
  })
})

describe('build provenance', () => {
  it('refuses to build when the selected routine is unchanged', async () => {
    const l5x = studioHarness()
    const opened = await l5x.call('open_project', { path: 'sample.l5x' })
    expect(opened.error).toBeUndefined()
    const id = opened.data?.project_id
    expect(id).toBeTypeOf('string')
    const acd = join(mkdtempSync(join(tmpdir(), 'l5x-acd-')), 'source.ACD')
    writeFileSync(acd, 'not a real acd')
    const build = await l5x.call('build_acd_from_draft', {
      acd_path: acd,
      baseline_id: id,
      project_id: id,
      program: 'MainProgram',
      routine: 'MainRoutine',
      output_path: 'out.ACD',
      result_export_path: 'out.L5X',
    })
    expect(build.error?.code).toBe('EDIT_BLOCKED')
  })
})
