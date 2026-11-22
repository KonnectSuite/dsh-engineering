import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the studio entry mounted over the read entry. */
function studioHarness(approval?: { policy: 'ask' | 'never'; outcome?: string }) {
  return harness(fixtureBytes, { studio: true, ...(approval === undefined ? {} : { approval }) })
}

describe('studio registration', () => {
  it('mounts the offline SDK tools and the controller tools after the read surface', () => {
    const { definitions } = studioHarness()
    const names = definitions.map(definition => definition.name)
    expect(names.slice(13)).toEqual([
      'l5x_rung_preview',
      'l5x_compose_logic',
      'l5x_routine_diagram',
  'l5x_diagram',
      'l5x_studio_sdk_status',
      'l5x_studio_capabilities',
      'l5x_export_acd_to_l5x',
      'l5x_verify_offline_l5x',
      'l5x_build_acd_from_draft',
      'l5x_studio_review_evidence',
      'l5x_controller_approval_status',
      'l5x_capture_controller_snapshot',
      'l5x_go_online',
      'l5x_read_controller_mode',
      'l5x_read_live_tag',
      'l5x_change_controller_mode',
      'l5x_download_project',
    ])
  })
})

describe('studio preflight', () => {
  it('reports SDK availability and never throws without a project', async () => {
    const l5x = studioHarness()
    const status = await l5x.call('l5x_studio_sdk_status')
    expect(status.error).toBeUndefined()
    expect(typeof status.data?.available).toBe('boolean')
    expect(status.summary).toContain('Studio 5000 SDK')
  })

  it('reports capabilities for the machine', async () => {
    const l5x = studioHarness()
    const capabilities = await l5x.call('l5x_studio_capabilities')
    expect(capabilities.error).toBeUndefined()
    expect(capabilities.data).toBeTypeOf('object')
  })
})

describe('approval gate', () => {
  it('reports that no approval can be requested without the service', async () => {
    const l5x = studioHarness()
    const status = await l5x.call('l5x_controller_approval_status')
    expect(status.error).toBeUndefined()
    expect(status.data?.approved_controller_actions_requestable).toBe(false)
  })

  it('reports that approval can be requested when the policy is ask and an agent is present', async () => {
    const l5x = studioHarness({ policy: 'ask' })
    const status = await l5x.call('l5x_controller_approval_status', {}, { agent: { session: {} } })
    expect(status.data?.approved_controller_actions_requestable).toBe(true)
  })

  it('refuses a mode change before contacting anything when approval cannot be asked', async () => {
    const l5x = studioHarness({ policy: 'never' })
    const changed = await l5x.call('l5x_change_controller_mode', {
      snapshot_path: 'x.ACD',
      ip_address: '192.168.1.10',
      target_mode: 'Program',
    }, { agent: { session: {} } })
    expect(changed.error?.code).toBe('APPROVAL_UNAVAILABLE')
  })

  it('refuses a download without a verification id from this chat', async () => {
    const l5x = studioHarness({ policy: 'ask' })
    const downloaded = await l5x.call('l5x_download_project', {
      verification_id: 'nope',
      ip_address: '192.168.1.10',
    }, { agent: { session: {} } })
    expect(downloaded.error?.code).toBe('UNVERIFIED_ACD')
  })
})

describe('build provenance', () => {
  it('refuses to build when the selected routine is unchanged', async () => {
    const l5x = studioHarness()
    const opened = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    expect(opened.error).toBeUndefined()
    const id = opened.data?.project_id
    expect(id).toBeTypeOf('string')
    const acd = join(mkdtempSync(join(tmpdir(), 'l5x-acd-')), 'source.ACD')
    writeFileSync(acd, 'not a real acd')
    const build = await l5x.call('l5x_build_acd_from_draft', {
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
