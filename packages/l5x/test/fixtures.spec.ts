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

describe('usage_map and find_references', () => {
  it('agree on how many times a tag is read and written', async () => {
    const built = l5x({
      name: 'UsageAgree',
      tags: tag('T'),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(T)XIC(T)OTE(OUT);' }]), { tags: tag('OUT') }),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['ua.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('open_project', { path: 'ua.l5x' })).error).toBeUndefined()
    const refs = await l5xTool.call('find_references', { symbol: 'T' })
    const access = refs.data?.by_access ?? {}
    const usage = await l5xTool.call('usage_map', { tag: 'T' })
    const whole = usage.data?.whole_element ?? {}
    expect(Number(whole.reads)).toBe(Number(access.read ?? 0))
    expect(Number(whole.writes)).toBe(Number(access.write ?? 0))
    expect(Number(whole.reads)).toBe(2)
  })
})

describe('safety in the rung documentation', () => {
  it('marks a safety program file and a safety instruction file', async () => {
    const built = l5x({
      name: 'SafetyDocs',
      aois: aoi('AOI_SAFE', { safety: true, parameters: [parameter('P')], routines: rllRoutine('Logic', [{ text: 'XIC(P)OTE(P);' }]) }),
      programs: program('Guard', rllRoutine('MainRoutine', [{ text: 'NOP();' }]), { safety: true }),
      tasks: task('SafetyTask', ['Guard'], { safety: true, type: 'PERIODIC', rate: '20', priority: '10' }),
    })
    const l5xTool = harness(new Map([['sd.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'sd.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('document_project', { output_root: 'docs-sd', include: ['rungs'] })).error).toBeUndefined()
    const files = [...l5xTool.written.entries()].map(([key, value]) => [String(key), String(value)] as const)
    const programFile = files.find(([key]) => key.endsWith('rungs/Guard.md'))
    expect(programFile?.[1]).toContain('SAFETY program')
    const aoiFile = files.find(([key]) => key.endsWith('AOI-AOI_SAFE.md'))
    expect(aoiFile?.[1]).toContain('SAFETY instruction')
  })
})

describe('a routine in a safety program', () => {
  it('is marked safety in the listing and the reader', async () => {
    const built = l5x({
      name: 'SafetyRoutines',
      programs: [
        program('Guard', rllRoutine('MainRoutine', [{ text: 'NOP();' }]), { safety: true }),
        program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      ].join(''),
      tasks: [
        task('SafetyTask', ['Guard'], { safety: true, type: 'PERIODIC', rate: '20', priority: '10' }),
        task('MainTask', ['Main']),
      ].join(''),
    })
    const l5xTool = harness(new Map([['sr.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('open_project', { path: 'sr.l5x' })).error).toBeUndefined()
    const guard = await l5xTool.call('list_components', { kind: 'routine', scope: 'Guard' })
    const guardRows = (guard.data?.rows ?? []) as { name: string; safety?: boolean }[]
    expect(guardRows.length).toBe(1)
    expect(guardRows[0]?.safety).toBe(true)
    const main = await l5xTool.call('list_components', { kind: 'routine', scope: 'Main' })
    expect(((main.data?.rows ?? []) as { safety?: boolean }[])[0]?.safety).toBe(false)
    const read = await l5xTool.call('get_component', { kind: 'routine', name: 'MainRoutine', scope: 'Guard' })
    expect((read.data?.component as { safety?: boolean } | undefined)?.safety).toBe(true)
  })
})

describe('a tag marked Class=Safety', () => {
  it('is safety in the listing, the reader and the CSV even in a standard program', async () => {
    const built = l5x({
      name: 'SafetyTags',
      tags: tag('CTRL_SAFE', 'BOOL', ' Class="Safety"'),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(PROG_SAFE)OTE(PLAIN);' }]), { tags: tag('PROG_SAFE', 'BOOL', ' Class="Safety"') + tag('PLAIN') }),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['st.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'st.l5x' })).error).toBeUndefined()
    const listed = await l5xTool.call('list_components', { kind: 'tag', scope: 'controller' })
    const ctrl = ((listed.data?.rows ?? []) as { name: string; safety?: boolean }[]).find(row => row.name === 'CTRL_SAFE')
    expect(ctrl?.safety).toBe(true)
    const prog = await l5xTool.call('list_components', { kind: 'tag', scope: 'Main' })
    expect(((prog.data?.rows ?? []) as { name: string; safety?: boolean }[]).find(row => row.name === 'PROG_SAFE')?.safety).toBe(true)
    expect(((prog.data?.rows ?? []) as { name: string; safety?: boolean }[]).find(row => row.name === 'PLAIN')?.safety).toBe(false)
    const record = await l5xTool.call('get_component', { kind: 'tag', name: 'CTRL_SAFE' })
    expect((record.data?.component as { safety?: boolean } | undefined)?.safety).toBe(true)
    expect((await l5xTool.call('document_project', { output_root: 'docs-st', include: ['tags'] })).error).toBeUndefined()
    const csv = String([...l5xTool.written.entries()].find(([key]) => String(key).endsWith('tags.csv'))?.[1] ?? '')
    expect(csv).toMatch(/controller,CTRL_SAFE,[^\n]*,true$/mu)
    expect(csv).toMatch(/Main,PROG_SAFE,[^\n]*,true$/mu)
    expect(csv).toMatch(/Main,PLAIN,[^\n]*,false$/mu)
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

describe('the listing and the reader', () => {
  it('agree: every listed component can be read by name', async () => {
    const built = l5x({
      name: 'ListingReader',
      tags: tag('CTRL'),
      dataTypes: userType('MY_UDT', [member('A')]),
      aois: aoi('AOI_ONE', { parameters: [parameter('P')], routines: rllRoutine('Logic', [{ text: 'XIC(P)OTE(P);' }]) }),
      modules: module('Local:1', '5069-IB16'),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(CTRL)OTE(OUT);' }]), { tags: tag('OUT') }),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['lr.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('open_project', { path: 'lr.l5x' })).error).toBeUndefined()
    const cases: [string, string | undefined][] = [
      ['program', undefined], ['task', undefined], ['udt', undefined], ['aoi', undefined],
      ['module', undefined], ['tag', 'controller'], ['routine', 'Main'], ['tag', 'Main'],
    ]
    const failures: string[] = []
    let checked = 0
    for (const [kind, scope] of cases) {
      const listed = await l5xTool.call('list_components', { kind, ...(scope === undefined ? {} : { scope }), limit: 50 })
      for (const row of (listed.data?.rows ?? [])) {
        checked += 1
        const read = await l5xTool.call('get_component', { kind, name: row.name, ...(scope === undefined ? {} : { scope }) })
        if (read.error !== undefined) failures.push(kind + ' ' + (scope ?? 'controller') + '/' + row.name + ': ' + read.error.code)
      }
    }
    expect(failures).toEqual([])
    expect(checked).toBeGreaterThan(5)
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

describe('a module with no Name', () => {
  it('gets a stable parent:slot identity and can be read by it', async () => {
    const built = l5x({
      name: 'UnnamedModule',
      modules: module('', 'RHINOBP-DRIVE-PERIPHERAL-MODULE', { parentModule: 'DRIVE_1', slot: '4' }),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['um.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('open_project', { path: 'um.l5x' })).error).toBeUndefined()
    const listed = await l5xTool.call('list_components', { kind: 'module' })
    const rows = (listed.data?.rows ?? []) as { name: string; unnamed?: boolean; slot: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.name).toBe('DRIVE_1:4')
    expect(rows[0]?.unnamed).toBe(true)
    const read = await l5xTool.call('get_component', { kind: 'module', name: 'DRIVE_1:4' })
    expect(read.error).toBeUndefined()
    expect((read.data?.component as { catalogNumber?: string } | undefined)?.catalogNumber).toBe('RHINOBP-DRIVE-PERIPHERAL-MODULE')
  })
})

describe('a safety tag written from standard logic', () => {
  it('is reported, and the same tag written from the safety program is not', async () => {
    const base = (standardRung: string) => l5x({
      name: 'SafetyWrite',
      tags: tag('SAFE_TAG', 'BOOL', ' Class="Safety"'),
      programs: [
        program('SafetyProgram', rllRoutine('MainRoutine', [{ text: 'XIC(SAFE_TAG)OTE(SAFE_TAG);' }]), { safety: true }),
        program('Main', rllRoutine('MainRoutine', [{ text: standardRung }])),
      ].join(''),
      tasks: [
        task('SafetyTask', ['SafetyProgram'], { safety: true, type: 'PERIODIC', rate: '20', priority: '10' }),
        task('MainTask', ['Main']),
      ].join(''),
    })
    const bad = harness(new Map([['sw.l5x', new TextEncoder().encode(base('XIC(SAFE_TAG)OTE(SAFE_TAG);'))]]))
    expect((await bad.call('open_project', { path: 'sw.l5x' })).error).toBeUndefined()
    const findings = await bad.call('run_checks', { rule: 'SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC' })
    const rows = (findings.data?.findings ?? []) as { message: string; fix?: string; evidence: { program?: string; tag?: string } }[]
    expect(rows.length).toBe(1)
    expect(String(rows[0]?.message)).toContain('written from standard program Main')
    expect(String(rows[0]?.fix)).toContain('safety program')
    expect(rows[0]?.evidence?.tag).toBe('SAFE_TAG')
    const good = harness(new Map([['sw.l5x', new TextEncoder().encode(base('NOP();'))]]))
    await good.call('open_project', { path: 'sw.l5x' })
    const silent = await good.call('run_checks', { rule: 'SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC' })
    expect(Number(silent.data?.total)).toBe(0)
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
    const routines = await l5xTool.call('list_components', { kind: 'routine', scope: 'VEND_AOI' })
    expect(String(routines.summary)).toContain('definition encrypted')
    expect(Number(routines.data?.total)).toBe(0)
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

describe('a FOR loop index', () => {
  it('must be a tag, while its initial, terminal and step values may be literals', async () => {
    const project = l5x({
      name: 'ForGuard',
      tags: tag('Count', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', []) + rllRoutine('Loop', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['for.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'for.l5x' })).error).toBeUndefined()
    const bad = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FOR', args: ['Loop', '5', '0', '10', '1'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('writable index')
    expect(bad.error?.fix).toContain('DINT tag')
    const good = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FOR', args: ['Loop', 'Count', '0', '10', '1'] }] }) })
    expect(good.error).toBeUndefined()
    const rungs = (good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
    expect(rungs?.[0]?.neutral_text).toBe('FOR(Loop,Count,0,10,1);')
  })
})

describe('a SIZE result', () => {
  it('must be a tag or array element, not a literal', async () => {
    const project = l5x({
      name: 'SizeGuard',
      tags: tag('Arr', 'DINT', ' Dimensions="10"'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['size.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'size.l5x' })).error).toBeUndefined()
    const bad = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['Arr', '0', '5'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('writable size')
    const good = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['Arr', '0', 'Arr[0]'] }] }) })
    expect(good.error).toBeUndefined()
    const rungs = (good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
    expect(rungs?.[0]?.neutral_text).toBe('SIZE(Arr,0,Arr[0]);')
  })
})

describe('a slot that takes a tag of any type', () => {
  it('refuses a literal, as Studio does for the STD control block', async () => {
    const project = l5x({
      name: 'StdGuard',
      tags: tag('Arr', 'REAL', ' Dimensions="10"') + tag('Dest', 'REAL') + tag('Ctrl', 'CONTROL') + tag('Count', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['std.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'std.l5x' })).error).toBeUndefined()
    // Studio refused STD(Arr,0,Dest,5,10,0) at build with RxCMP_E_AUDIT_INVALIDOPKIND while
    // STD(Arr,0,Dest,Ctrl,10,0) built 0/0.
    const bad = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'STD', args: ['Arr', '0', 'Dest', '5', '10', '0'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('needs a writable control')
    const good = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'STD', args: ['Arr', '0', 'Dest', 'Ctrl', '10', '0'] }] }) })
    expect(good.error).toBeUndefined()
    // A DINT destination fails Studio's type check (RxCMP_E_AUDIT_INVALIDOPTYPE); the composer names it.
    const wrongType = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'STD', args: ['Arr', '0', 'Count', 'Ctrl', '10', '0'] }] }) })
    expect(wrongType.error?.code).toBe('INVALID_OPERAND')
    expect(wrongType.error?.message).toContain('must be REAL')
    const rungs = (good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
    expect(rungs?.[0]?.neutral_text).toBe('STD(Arr,0,Dest,Ctrl,10,0);')
  })
})

describe('an arithmetic slot that accepts integers', () => {
  it('composes SQRT over a DINT, which Studio built with 0 warnings and 0 errors', async () => {
    // The opposite finding to STD: a build proved integer SQRT is legal, so no REAL-only
    // restriction belongs on SQR. This test keeps a future edit from adding one.
    const project = l5x({
      name: 'SqrtInteger',
      tags: tag('Count', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['sqrt.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'sqrt.l5x' })).error).toBeUndefined()
    const composed = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SQR', args: ['Count', 'Count'] }] }) })
    expect(composed.error).toBeUndefined()
    const rungs = (composed.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
    expect(rungs?.[0]?.neutral_text).toBe('SQRT(Count,Count);')
  })
})

describe('an add-on instruction call', () => {
  it('starts with the instance tag and refuses parameters without one', async () => {
    // Real calls do: AOI_Alarm(ALM_MCR_AOI, ...), where ALM_MCR_AOI is the tag whose data type is
    // the AOI. Parameters alone failed a Studio build with RxCMP_E_AUDIT_INVALIDOPTYPE.
    const project = l5x({
      name: 'AoiCallGuard',
      tags: tag('MyAoi_1', 'MyAoi') + tag('In1', 'BOOL') + tag('Out1', 'BOOL') + tag('Num', 'DINT'),
      aois: aoi('MyAoi', { parameters: [parameter('In1', { usage: 'Input', dataType: 'BOOL' }), parameter('Out1', { usage: 'Output', dataType: 'BOOL' })] }),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['aoi.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'aoi.l5x' })).error).toBeUndefined()
    const good = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1', 'Out1'] }] }) })
    expect(good.error).toBeUndefined()
    const rungs = (good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
    expect(rungs?.[0]?.neutral_text).toBe('MyAoi(MyAoi_1,In1,Out1);')
    const noInstance = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['In1', 'Out1'] }] }) })
    expect(noInstance.error?.code).toBe('INVALID_OPERAND')
    expect(noInstance.error?.message).toContain('needs an instance tag of type MyAoi')
    const literal = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['5', 'In1', 'Out1'] }] }) })
    expect(literal.error?.code).toBe('INVALID_OPERAND')
    expect(literal.error?.message).toContain('needs an instance tag')
    // Studio accepted exactly the instance plus the parameters marked Required="true" in real
    // project calls; a missing or extra parameter fails the build with INVALIDNOOFOPS.
    const missing = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1'] }] }) })
    expect(missing.error?.code).toBe('INVALID_OPERAND')
    expect(missing.error?.message).toContain('2 required parameter')
    const extra = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1', 'Out1', 'Num'] }] }) })
    expect(extra.error?.code).toBe('INVALID_OPERAND')
    expect(extra.error?.message).toContain('2 required parameter')
    const wrongType = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'Num', 'Out1'] }] }) })
    expect(wrongType.error?.code).toBe('INVALID_OPERAND')
    expect(wrongType.error?.message).toContain('BOOL')
    // The instance tag itself has to be declarable: an AOI name is a data type for draft_tag.
    const instanceDraft = await l5xTool.call('draft_tag', { scope: 'controller', name: 'MyAoi_2', data_type: 'MyAoi', description: 'second instance' })
    expect(instanceDraft.error).toBeUndefined()
    const applied = await l5xTool.call('draft_apply', { output_path: 'aoi-instance.l5x' })
    expect(applied.error).toBeUndefined()
    expect(String(l5xTool.written.get('aoi-instance.l5x'))).toContain('<Tag Name="MyAoi_2"')
    // A literal cannot stand in for an Output pin.
    const literalOutput = await l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1', '5'] }] }) })
    expect(literalOutput.error?.code).toBe('INVALID_OPERAND')
    expect(literalOutput.error?.message).toContain('BOOL tag is required')
  })
})
