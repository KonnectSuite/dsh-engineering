/**
 * The fixture builder must produce exports the plugin actually accepts.
 *
 * Hand-written XML has repeatedly carried the wrong element name, which surfaces as a parse
 * error far from the mistake. These helpers own the names; this spec proves the result loads
 * and that the parts arrive where the readers expect them.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { aoi, l5x, module, parameter, program, rllRoutine, tag, task } from './l5x-build.ts'

const built = l5x({
  name: 'BuiltFixture',
  tags: [tag('Start'), tag('Run')].join(''),
  modules: [
    module('SA_IN', '1756-IB16S/A', { safety: true, safetyNetwork: '16#0000_4bc3' }),
    module('Local:3', '5069-IB16'),
  ].join(''),
  aois: aoi('AOI_Step', {
    safety: true,
    parameters: [parameter('P', { aliasFor: 'Start' })],
    routines: rllRoutine('Logic', [{ text: 'XIC(P)OTE(P);', comment: 'AOI logic' }]),
  }),
  programs: program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(Start)OTE(Run);' }])),
  tasks: task('MainTask', ['Main']),
})

describe('the fixture builder', () => {
  it('produces an export that opens and exposes every part', async () => {
    const l5xTool = harness(new Map([['built.l5x', new TextEncoder().encode(built)]]))
    const opened = await l5xTool.call('open_project', { path: 'built.l5x' })
    expect(opened.error).toBeUndefined()
    expect(Number(opened.data?.counts?.aois)).toBe(1)
    expect(Number(opened.data?.counts?.modules)).toBe(2)

    const instruction = await l5xTool.call('get_component', { kind: 'aoi', name: 'AOI_Step' })
    expect(instruction.data?.component?.safety).toBe(true)
    const parameters = (instruction.data?.component?.parameters ?? []) as { name: string; aliasFor?: string }[]
    expect(parameters.find(entry => entry.name === 'P')?.aliasFor).toBe('Start')

    // The AOI's own routine is reachable by the AOI name, which rounds 120 and 129 established.
    const routines = await l5xTool.call('list_components', { kind: 'routine', scope: 'AOI_Step' })
    expect(((routines.data?.rows ?? []) as { name: string }[]).map(entry => entry.name)).toEqual(['Logic'])

    const modules = await l5xTool.call('list_components', { kind: 'module' })
    const safetyModules = ((modules.data?.rows ?? []) as { name: string; safetyEnabled?: boolean }[])
      .filter(entry => entry.safetyEnabled === true)
      .map(entry => entry.name)
    expect(safetyModules).toEqual(['SA_IN'])
  })
})
