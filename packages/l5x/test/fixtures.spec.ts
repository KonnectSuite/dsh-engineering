/**
 * The fixture builder must produce exports the plugin actually accepts.
 *
 * Hand-written XML has repeatedly carried the wrong element name, which surfaces as a parse
 * error far from the mistake. These helpers own the names; this spec proves the result loads
 * and that the parts arrive where the readers expect them.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { aoi, encodedAoi, l5x, member, module, parameter, program, rllRoutine, tag, task, userType } from './l5x-build.ts'

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

describe('a finding remedy', () => {
  it('is attached to an actionable rule', async () => {
    const built = l5x({
      name: 'FixProof',
      tags: tag('Orphan'),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['fx.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('open_project', { path: 'fx.l5x' })).error).toBeUndefined()
    const checks = await l5xTool.call('run_checks', { rule: 'UNUSED_TAG' })
    const findings = (checks.data?.findings ?? []) as { rule: string; fix?: string }[]
    expect(findings.length).toBe(1)
    expect(String(findings[0]?.fix)).toContain('delete')
  })
})

describe('reference rows', () => {
  it('say when the reference is safety code', async () => {
    const built = l5x({
      name: 'RefSafety',
      programs: [
        program('Guard', rllRoutine('MainRoutine', [{ text: 'XIC(SafeTag)OTE(SafeTag2);' }]), { safety: true, tags: tag('SafeTag') + tag('SafeTag2') }),
        program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(PlainTag)OTE(PlainTag2);' }]), { tags: tag('PlainTag') + tag('PlainTag2') }),
      ].join(''),
      tasks: [
        task('SafetyTask', ['Guard'], { safety: true, type: 'PERIODIC', rate: '20', priority: '10' }),
        task('MainTask', ['Main']),
      ].join(''),
    })
    const l5xTool = harness(new Map([['rs.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('open_project', { path: 'rs.l5x' })).error).toBeUndefined()
    const safe = await l5xTool.call('find_references', { symbol: 'SafeTag', scope: 'Guard', detail: 'evidence' })
    const safeRows = (safe.data?.evidence ?? []) as { safety?: boolean }[]
    expect(safeRows.length).toBeGreaterThan(0)
    expect(safeRows.every(row => row.safety === true)).toBe(true)
    const plain = await l5xTool.call('find_references', { symbol: 'PlainTag', scope: 'Main', detail: 'evidence' })
    const plainRows = (plain.data?.evidence ?? []) as { safety?: boolean }[]
    expect(plainRows.length).toBeGreaterThan(0)
    expect(plainRows.every(row => row.safety === undefined)).toBe(true)
    // A reference scan reports an AOI by its plain name, not "AOI::Name".
    const aoiBuilt = l5x({
      name: 'RefSafetyAoi',
      aois: aoi('AOI_SAFE', { safety: true, parameters: [parameter('P')], routines: rllRoutine('Logic', [{ text: 'XIC(P)OTE(P);' }]) }),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const aoiTool = harness(new Map([['rsa.l5x', new TextEncoder().encode(aoiBuilt)]]))
    expect((await aoiTool.call('open_project', { path: 'rsa.l5x' })).error).toBeUndefined()
    const member = await aoiTool.call('find_references', { symbol: 'AOI_SAFE::P', detail: 'evidence' })
    const memberRows = (member.data?.evidence ?? []) as { scope: string; safety?: boolean }[]
    expect(memberRows.length).toBeGreaterThan(0)
    expect(memberRows.every(row => row.scope === 'AOI_SAFE')).toBe(true)
    expect(memberRows.every(row => row.safety === true)).toBe(true)
  })
})

describe('searching safety logic', () => {
  it('marks a match inside a safety program and not one in standard logic', async () => {
    const built = l5x({
      name: 'SearchSafety',
      programs: [
        program('Guard', rllRoutine('MainRoutine', [{ text: 'XIC(SafeTag)OTE(SafeTag);' }]), { safety: true, tags: tag('SafeTag') }),
        program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(PlainTag)OTE(PlainTag);' }]), { tags: tag('PlainTag') }),
      ].join(''),
      tasks: [
        task('SafetyTask', ['Guard'], { safety: true, type: 'PERIODIC', rate: '20', priority: '10' }),
        task('MainTask', ['Main']),
      ].join(''),
    })
    const l5xTool = harness(new Map([['ss.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('open_project', { path: 'ss.l5x' })).error).toBeUndefined()
    const safety = await l5xTool.call('search_logic', { query: 'SafeTag' })
    const safetyMatches = (safety.data?.matches ?? []) as { safety?: boolean }[]
    expect(safetyMatches.length).toBeGreaterThan(0)
    expect(safetyMatches.every(match => match.safety === true)).toBe(true)
    const plain = await l5xTool.call('search_logic', { query: 'PlainTag' })
    const plainMatches = (plain.data?.matches ?? []) as { safety?: boolean }[]
    expect(plainMatches.length).toBeGreaterThan(0)
    expect(plainMatches.every(match => match.safety === undefined)).toBe(true)
  })
})

describe('an encrypted add-on instruction', () => {
  it('is marked protected, counted in the limits and not shown as zero routines', async () => {
    const built = l5x({
      name: 'EncAoi',
      aois: encodedAoi('VEND_AOI', { vendor: 'Acme', description: 'vendor instruction' }),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['ea.l5x', new TextEncoder().encode(built)]]), { editing: true })
    const opened = await l5xTool.call('open_project', { path: 'ea.l5x' })
    expect(opened.error).toBeUndefined()
    expect(Number(opened.data?.counts?.aois)).toBe(1)
    const aoi = await l5xTool.call('get_component', { kind: 'aoi', name: 'VEND_AOI' })
    expect((aoi.data?.component as { protected?: boolean } | undefined)?.protected).toBe(true)
    const overview = await l5xTool.call('project_overview')
    expect(JSON.stringify(overview.data?.limits ?? [])).toContain('encrypted (vendor)')
    expect((await l5xTool.call('document_project', { output_root: 'docs-enc', include: ['project'] })).error).toBeUndefined()
    const project = String([...l5xTool.written.entries()].find(([key]) => String(key).endsWith('PROJECT.md'))?.[1] ?? '')
    expect(project).toMatch(/\| VEND_AOI \|[^\n]*\| encrypted \|/u)
  })
})

describe('data type classes', () => {
  it('reads a string-family user type, and hides a vendor type', async () => {
    const built = l5x({
      name: 'UdtClasses',
      dataTypes: userType('MY_STR', [member('LEN', { dataType: 'DINT' }), member('DATA', { dataType: 'SINT', dimensions: '50' })], 'StringFamily')
        + '<DataType Name="VENDOR_T" Family="Vendor" Class="Vendor"><Members><Member Name="X" DataType="DINT" Dimension="0"/></Members></DataType>',
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['uc.l5x', new TextEncoder().encode(built)]]))
    const opened = await l5xTool.call('open_project', { path: 'uc.l5x' })
    expect(opened.error).toBeUndefined()
    // A string type is user-defined even though its family is not NoFamily.
    expect(Number(opened.data?.counts?.udts)).toBe(1)
    const listed = await l5xTool.call('list_components', { kind: 'udt' })
    const names = ((listed.data?.rows ?? []) as { name: string }[]).map(row => row.name)
    expect(names).toContain('MY_STR')
    expect(names).not.toContain('VENDOR_T')
    const type = await l5xTool.call('get_component', { kind: 'udt', name: 'MY_STR' })
    const members = (type.data?.component?.members ?? []) as { name: string; dimension?: number }[]
    expect(members.map(entry => entry.name)).toEqual(['LEN', 'DATA'])
    expect(members.find(entry => entry.name === 'DATA')?.dimension).toBe(50)
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
