import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** A six-column tag CSV. */
const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;StartPB;Start pushbutton;False;PLC;BOOL',
  '',
].join('\n')

/** Rockwell install root the discovery searches by default. */
const ROOT = 'C:/Program Files (x86)/Rockwell Software'

/** An export pair plus a simulated Studio install. */
function files(withStudio: boolean): Map<string, string> {
  const map = new Map<string, string>([
    ['before/Main.xml', '<Display name="Main"><Object name="StartPB"/></Display>'],
    ['before/tags.csv', CSV],
    ['after/Main.xml', '<Display name="Main"><Object name="StartPB" visible="0"/></Display>'],
    ['after/tags.csv', CSV],
  ])
  if (withStudio) {
    map.set(`${ROOT}/FactoryTalk View/SEAddComponent.exe`, 'MZ fake utility')
    map.set(`${ROOT}/FactoryTalk View/Gfx-ME16.xsd`, '<schema/>')
    map.set(`${ROOT}/FactoryTalk View/ME Help.chm`, 'help')
    map.set(`${ROOT}/FactoryTalk View Studio/Studio.exe`, 'MZ studio')
  }
  return map
}

/** Open both exports with the Studio entry mounted. */
async function opened(withStudio = true) {
  const l5x = harness(files(withStudio), { studio: true })
  const before = await l5x.call('ftview_open', { root: 'before' })
  const after = await l5x.call('ftview_open', { root: 'after' })
  expect(before.error).toBeUndefined()
  expect(after.error).toBeUndefined()
  return { l5x, before: before.data?.view_id as string, after: after.data?.view_id as string }
}

describe('studio registration', () => {
  it('mounts the three studio tools after the read surface', () => {
    const { definitions } = harness(files(true), { studio: true })
    expect(definitions.map(definition => definition.name).slice(22)).toEqual([
      'ftview_studio_status', 'ftview_studio_preflight', 'ftview_studio_handoff',
    ])
  })
})

describe('discovery', () => {
  it('finds products, schemas, help and the add-component utility', async () => {
    const l5x = harness(files(true), { studio: true })
    const status = await l5x.call('ftview_studio_status')
    expect(status.error).toBeUndefined()
    expect((status.data?.utilities as unknown[]).length).toBe(1)
    expect((status.data?.schemas as unknown[]).length).toBe(1)
    expect((status.data?.help as unknown[]).length).toBe(1)
    expect((status.data?.products as unknown[]).length).toBe(2)
  })

  it('reports an absent install without failing', async () => {
    const l5x = harness(files(false), { studio: true })
    const status = await l5x.call('ftview_studio_status')
    expect(status.error).toBeUndefined()
    expect((status.data?.utilities as unknown[]).length).toBe(0)
    expect(status.summary).toContain('0 Add Component utility')
  })
})

describe('preflight', () => {
  it('reports the changed display and readiness', async () => {
    const { l5x, before, after } = await opened()
    const check = await l5x.call('ftview_studio_preflight', { before_id: before, after_id: after })
    expect(check.error).toBeUndefined()
    expect(check.data?.changed).toEqual(['Main.xml'])
    expect(check.data?.ready).toBe(true)
    expect(check.data?.utility_available).toBe(true)
  })

  it('reports the engineering gate without refusing the report', async () => {
    const { l5x, before, after } = await opened()
    const check = await l5x.call('ftview_studio_preflight', { before_id: before, after_id: after })
    expect(check.error).toBeUndefined()
    const gate = check.data?.gate as Record<string, unknown>
    expect(gate.passed).toBe(false)
    expect(gate.displays).toBe(1)
    expect(gate.themed).toBe(0)
    expect(check.summary).toContain('gate flags')
  })

  it('refuses the change set when the gate is asked to fail', async () => {
    const { l5x, before, after } = await opened()
    const check = await l5x.call('ftview_studio_preflight', { before_id: before, after_id: after, gate: 'fail' })
    expect(check.error?.code).toBe('GATE_FAILED')
    expect(check.error?.message).toContain('non-conforming display');
    expect(check.error?.fix).toContain('Main')
  })

  it('lets a themed change set through the gate', async () => {
    const themed = files(true)
    themed.set('after/Main.xml', [
      '<Display name="Main">',
      '<DisplaySettings width="640" height="480" backColor="#0E1A24"/>',
      '<Panel name="HeaderBar" left="0" top="0" width="640" height="88" backColor="#0088C8"/>',
      '<Panel name="FooterBar" left="0" top="420" width="640" height="60" backColor="#143243"/>',
      '</Display>',
    ].join(''))
    const l5x = harness(themed, { studio: true })
    const before = await l5x.call('ftview_open', { root: 'before' })
    const after = await l5x.call('ftview_open', { root: 'after' })
    const check = await l5x.call('ftview_studio_preflight', {
      before_id: before.data?.view_id as string,
      after_id: after.data?.view_id as string,
      gate: 'fail',
    })
    expect(check.error).toBeUndefined()
    expect(check.data?.gate).toMatchObject({ passed: true, themed: 1, displays: 1 })
  })

  it('blocks a display file name Studio refuses', async () => {
    const map = files(true)
    map.set('after/Bad#Name.xml', '<Display name="Bad"/>')
    const l5x = harness(map, { studio: true })
    const before = await l5x.call('ftview_open', { root: 'before' })
    const after = await l5x.call('ftview_open', { root: 'after' })
    const check = await l5x.call('ftview_studio_preflight', { before_id: before.data?.view_id, after_id: after.data?.view_id })
    expect(check.data?.ready).toBe(false)
    expect((check.data?.blockers as string[]).join(' ')).toContain('refuses')
  })
})

describe('handoff', () => {
  it('returns the ordered manual steps for the changed files', async () => {
    const { l5x, before, after } = await opened()
    const plan = await l5x.call('ftview_studio_handoff', { before_id: before, after_id: after, application: 'Line' })
    expect(plan.error).toBeUndefined()
    expect((plan.data?.steps as unknown[]).length).toBe(4)
    expect(plan.data?.application).toBe('Line')
    expect(plan.data?.changed).toEqual(['Main.xml'])
  })
})

