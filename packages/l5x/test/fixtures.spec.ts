/**
 * The fixture builder must produce exports the plugin actually accepts.
 *
 * Hand-written XML has repeatedly carried the wrong element name, which surfaces as a parse
 * error far from the mistake. These helpers own the names; this spec proves the result loads
 * and that the parts arrive where the readers expect them.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { aoi, l5x, member, module, parameter, program, rllRoutine, tag, task, userType } from './l5x-build.ts'

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

    // The AOI is safety, so its own logic is safety code; both surfaces must say so.
    const logicRow = ((routines.data?.rows ?? []) as { name: string; safety?: boolean }[])
      .find(entry => entry.name === 'Logic')
    expect(logicRow?.safety).toBe(true)
    const logic = await l5xTool.call('get_component', { kind: 'routine', name: 'Logic', scope: 'AOI_Step' })
    expect((logic.data?.component as { safety?: boolean } | undefined)?.safety).toBe(true)
  })
})

describe('adding a UDT member', () => {
  it('writes the description as a child element, which is the shape Studio accepts', async () => {
    const built = l5x({
      name: 'UdtShape',
      dataTypes: userType('MY_UDT', [member('A')]),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['um.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'um.l5x' })).error).toBeUndefined()
    const staged = await l5xTool.call('draft_udt_member', { udt: 'MY_UDT', name: 'B', data_type: 'DINT', description: 'second member' })
    expect(staged.error).toBeUndefined()
    expect((await l5xTool.call('draft_apply', { output_path: 'um-edited.l5x' })).error).toBeUndefined()
    const text = String(l5xTool.written.get('um-edited.l5x') ?? '')
    // Studio logs XMLSrv_W_INVALID_ATTRIBUTE and drops an attribute Description.
    expect(text).toContain('<Description><![CDATA[second member]]></Description>')
    expect(text).not.toMatch(/<Member Name="B"[^>]*Description="/u)
  })
})

describe('descriptions added to existing components', () => {
  it('are inserted first, where a real export keeps them', async () => {
    const built = l5x({
      name: 'DescOrder',
      tags: tag('T'),
      dataTypes: userType('MY_UDT', [member('A')]),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['do.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'do.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('draft_udt_description', { udt: 'MY_UDT', description: 'type description' })).error).toBeUndefined()
    expect((await l5xTool.call('draft_tag_description', { scope: 'controller', name: 'T', description: 'tag description' })).error).toBeUndefined()
    expect((await l5xTool.call('draft_apply', { output_path: 'do-edited.l5x' })).error).toBeUndefined()
    const text = String(l5xTool.written.get('do-edited.l5x') ?? '')
    const udt = text.slice(text.indexOf('<DataType Name="MY_UDT"'), text.indexOf('</DataType>'))
    expect(udt.indexOf('<Description>')).toBeLessThan(udt.indexOf('<Members>'))
    const tagAt = text.indexOf('<Tag Name="T"')
    const tagBlock = text.slice(tagAt, text.indexOf('</Tag>', tagAt))
    expect(tagBlock).toContain('<Description>tag description</Description>')
  })
})

describe('a project with no Tags element', () => {
  it('gets one when the first tag is added', async () => {
    const built = l5x({
      name: 'NoTags',
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    // The program helper always writes its own Tags; only the controller lacks one here.
    const controllerHead = built.slice(built.indexOf('<Controller'), built.indexOf('<Programs>'))
    expect(controllerHead).not.toContain('<Tags>')
    const l5xTool = harness(new Map([['nt.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'nt.l5x' })).error).toBeUndefined()
    const staged = await l5xTool.call('draft_tag', { scope: 'controller', name: 'FirstTag', data_type: 'BOOL', description: 'first', value: 0 })
    expect(staged.error).toBeUndefined()
    expect((await l5xTool.call('draft_apply', { output_path: 'nt-edited.l5x' })).error).toBeUndefined()
    const text = String(l5xTool.written.get('nt-edited.l5x') ?? '')
    expect(text).toContain('<Tags><Tag Name="FirstTag"')
    // Tags must precede Programs for Studio's element order.
    expect(text.indexOf('<Tags>')).toBeLessThan(text.indexOf('<Programs>'))
  })
})
