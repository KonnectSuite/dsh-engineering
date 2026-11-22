/**
 * The fixture builder must produce exports the plugin actually accepts.
 *
 * Hand-written XML has repeatedly carried the wrong element name, which surfaces as a parse
 * error far from the mistake. These helpers own the names; this spec proves the result loads
 * and that the parts arrive where the readers expect them.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'
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
    const opened = await l5xTool.call('l5x_open_project', { path: 'built.l5x' })
    expect(opened.error).toBeUndefined()
    expect(Number(opened.data?.counts?.aois)).toBe(1)
    expect(Number(opened.data?.counts?.modules)).toBe(2)

    const instruction = await l5xTool.call('l5x_get_component', { kind: 'aoi', name: 'AOI_Step' })
    expect(instruction.data?.component?.safety).toBe(true)
    const parameters = (instruction.data?.component?.parameters ?? []) as { name: string; aliasFor?: string }[]
    expect(parameters.find(entry => entry.name === 'P')?.aliasFor).toBe('Start')

    // The AOI's own routine is reachable by the AOI name, which rounds 120 and 129 established.
    const routines = await l5xTool.call('l5x_list_components', { kind: 'routine', scope: 'AOI_Step' })
    expect(((routines.data?.rows ?? []) as { name: string }[]).map(entry => entry.name)).toEqual(['Logic'])

    const modules = await l5xTool.call('l5x_list_components', { kind: 'module' })
    const safetyModules = ((modules.data?.rows ?? []) as { name: string; safetyEnabled?: boolean }[])
      .filter(entry => entry.safetyEnabled === true)
      .map(entry => entry.name)
    expect(safetyModules).toEqual(['SA_IN'])

    // The AOI is safety, so its own logic is safety code; both surfaces must say so.
    const logicRow = ((routines.data?.rows ?? []) as { name: string; safety?: boolean }[])
      .find(entry => entry.name === 'Logic')
    expect(logicRow?.safety).toBe(true)
    const logic = await l5xTool.call('l5x_get_component', { kind: 'routine', name: 'Logic', scope: 'AOI_Step' })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'um.l5x' })).error).toBeUndefined()
    const staged = await l5xTool.call('l5x_draft_udt_member', { udt: 'MY_UDT', name: 'B', data_type: 'DINT', description: 'second member' })
    expect(staged.error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_apply', { output_path: 'um-edited.l5x' })).error).toBeUndefined()
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
    expect((await l5xTool.call('l5x_open_project', { path: 'do.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_udt_description', { udt: 'MY_UDT', description: 'type description' })).error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_tag_description', { scope: 'controller', name: 'T', description: 'tag description' })).error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_apply', { output_path: 'do-edited.l5x' })).error).toBeUndefined()
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
    expect((await l5xTool.call('l5x_open_project', { path: 'fx.l5x' })).error).toBeUndefined()
    const checks = await l5xTool.call('l5x_run_checks', { rule: 'UNUSED_TAG' })
    const findings = (checks.data?.findings ?? []) as { rule: string; fix?: string }[]
    expect(findings.length).toBe(1)
    expect(String(findings[0]?.fix)).toContain('delete')
  })
})

describe('l5x_usage_map and l5x_find_references', () => {
  it('agree on how many times a tag is read and written', async () => {
    const built = l5x({
      name: 'UsageAgree',
      tags: tag('T'),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(T)XIC(T)OTE(OUT);' }]), { tags: tag('OUT') }),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['ua.l5x', new TextEncoder().encode(built)]]))
    expect((await l5xTool.call('l5x_open_project', { path: 'ua.l5x' })).error).toBeUndefined()
    const refs = await l5xTool.call('l5x_find_references', { symbol: 'T' })
    const access = refs.data?.by_access ?? {}
    const usage = await l5xTool.call('l5x_usage_map', { tag: 'T' })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'sd.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('l5x_document_project', { output_root: 'docs-sd', include: ['rungs'] })).error).toBeUndefined()
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
    expect((await l5xTool.call('l5x_open_project', { path: 'sr.l5x' })).error).toBeUndefined()
    const guard = await l5xTool.call('l5x_list_components', { kind: 'routine', scope: 'Guard' })
    const guardRows = (guard.data?.rows ?? []) as { name: string; safety?: boolean }[]
    expect(guardRows.length).toBe(1)
    expect(guardRows[0]?.safety).toBe(true)
    const main = await l5xTool.call('l5x_list_components', { kind: 'routine', scope: 'Main' })
    expect(((main.data?.rows ?? []) as { safety?: boolean }[])[0]?.safety).toBe(false)
    const read = await l5xTool.call('l5x_get_component', { kind: 'routine', name: 'MainRoutine', scope: 'Guard' })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'st.l5x' })).error).toBeUndefined()
    const listed = await l5xTool.call('l5x_list_components', { kind: 'tag', scope: 'controller' })
    const ctrl = ((listed.data?.rows ?? []) as { name: string; safety?: boolean }[]).find(row => row.name === 'CTRL_SAFE')
    expect(ctrl?.safety).toBe(true)
    const prog = await l5xTool.call('l5x_list_components', { kind: 'tag', scope: 'Main' })
    expect(((prog.data?.rows ?? []) as { name: string; safety?: boolean }[]).find(row => row.name === 'PROG_SAFE')?.safety).toBe(true)
    expect(((prog.data?.rows ?? []) as { name: string; safety?: boolean }[]).find(row => row.name === 'PLAIN')?.safety).toBe(false)
    const record = await l5xTool.call('l5x_get_component', { kind: 'tag', name: 'CTRL_SAFE' })
    expect((record.data?.component as { safety?: boolean } | undefined)?.safety).toBe(true)
    expect((await l5xTool.call('l5x_document_project', { output_root: 'docs-st', include: ['tags'] })).error).toBeUndefined()
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
    expect((await l5xTool.call('l5x_open_project', { path: 'rs.l5x' })).error).toBeUndefined()
    const safe = await l5xTool.call('l5x_find_references', { symbol: 'SafeTag', scope: 'Guard', detail: 'evidence' })
    const safeRows = (safe.data?.evidence ?? []) as { safety?: boolean }[]
    expect(safeRows.length).toBeGreaterThan(0)
    expect(safeRows.every(row => row.safety === true)).toBe(true)
    const plain = await l5xTool.call('l5x_find_references', { symbol: 'PlainTag', scope: 'Main', detail: 'evidence' })
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
    expect((await aoiTool.call('l5x_open_project', { path: 'rsa.l5x' })).error).toBeUndefined()
    const member = await aoiTool.call('l5x_find_references', { symbol: 'AOI_SAFE::P', detail: 'evidence' })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'lr.l5x' })).error).toBeUndefined()
    const cases: [string, string | undefined][] = [
      ['program', undefined], ['task', undefined], ['udt', undefined], ['aoi', undefined],
      ['module', undefined], ['tag', 'controller'], ['routine', 'Main'], ['tag', 'Main'],
    ]
    const failures: string[] = []
    let checked = 0
    for (const [kind, scope] of cases) {
      const listed = await l5xTool.call('l5x_list_components', { kind, ...(scope === undefined ? {} : { scope }), limit: 50 })
      for (const row of (listed.data?.rows ?? [])) {
        checked += 1
        const read = await l5xTool.call('l5x_get_component', { kind, name: row.name, ...(scope === undefined ? {} : { scope }) })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'ss.l5x' })).error).toBeUndefined()
    const safety = await l5xTool.call('l5x_search_logic', { query: 'SafeTag' })
    const safetyMatches = (safety.data?.matches ?? []) as { safety?: boolean }[]
    expect(safetyMatches.length).toBeGreaterThan(0)
    expect(safetyMatches.every(match => match.safety === true)).toBe(true)
    const plain = await l5xTool.call('l5x_search_logic', { query: 'PlainTag' })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'um.l5x' })).error).toBeUndefined()
    const listed = await l5xTool.call('l5x_list_components', { kind: 'module' })
    const rows = (listed.data?.rows ?? []) as { name: string; unnamed?: boolean; slot: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.name).toBe('DRIVE_1:4')
    expect(rows[0]?.unnamed).toBe(true)
    const read = await l5xTool.call('l5x_get_component', { kind: 'module', name: 'DRIVE_1:4' })
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
    expect((await bad.call('l5x_open_project', { path: 'sw.l5x' })).error).toBeUndefined()
    const findings = await bad.call('l5x_run_checks', { rule: 'SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC' })
    const rows = (findings.data?.findings ?? []) as { message: string; fix?: string; evidence: { program?: string; tag?: string } }[]
    expect(rows.length).toBe(1)
    expect(String(rows[0]?.message)).toContain('written from standard program Main')
    expect(String(rows[0]?.fix)).toContain('safety program')
    expect(rows[0]?.evidence?.tag).toBe('SAFE_TAG')
    const good = harness(new Map([['sw.l5x', new TextEncoder().encode(base('NOP();'))]]))
    await good.call('l5x_open_project', { path: 'sw.l5x' })
    const silent = await good.call('l5x_run_checks', { rule: 'SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC' })
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
    const opened = await l5xTool.call('l5x_open_project', { path: 'ea.l5x' })
    expect(opened.error).toBeUndefined()
    expect(Number(opened.data?.counts?.aois)).toBe(1)
    const aoi = await l5xTool.call('l5x_get_component', { kind: 'aoi', name: 'VEND_AOI' })
    expect((aoi.data?.component as { protected?: boolean } | undefined)?.protected).toBe(true)
    const overview = await l5xTool.call('l5x_project_overview')
    expect(JSON.stringify(overview.data?.limits ?? [])).toContain('encrypted (vendor)')
    const routines = await l5xTool.call('l5x_list_components', { kind: 'routine', scope: 'VEND_AOI' })
    expect(String(routines.summary)).toContain('definition encrypted')
    expect(Number(routines.data?.total)).toBe(0)
    expect((await l5xTool.call('l5x_document_project', { output_root: 'docs-enc', include: ['project'] })).error).toBeUndefined()
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
    const opened = await l5xTool.call('l5x_open_project', { path: 'uc.l5x' })
    expect(opened.error).toBeUndefined()
    // A string type is user-defined even though its family is not NoFamily.
    expect(Number(opened.data?.counts?.udts)).toBe(1)
    const listed = await l5xTool.call('l5x_list_components', { kind: 'udt' })
    const names = ((listed.data?.rows ?? []) as { name: string }[]).map(row => row.name)
    expect(names).toContain('MY_STR')
    expect(names).not.toContain('VENDOR_T')
    const type = await l5xTool.call('l5x_get_component', { kind: 'udt', name: 'MY_STR' })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'nt.l5x' })).error).toBeUndefined()
    const staged = await l5xTool.call('l5x_draft_tag', { scope: 'controller', name: 'FirstTag', data_type: 'BOOL', description: 'first', value: 0 })
    expect(staged.error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_apply', { output_path: 'nt-edited.l5x' })).error).toBeUndefined()
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
    expect((await l5xTool.call('l5x_open_project', { path: 'for.l5x' })).error).toBeUndefined()
    const bad = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FOR', args: ['Loop', '5', '0', '10', '1'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('writable index')
    expect(bad.error?.fix).toContain('DINT tag')
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FOR', args: ['Loop', 'Count', '0', '10', '1'] }] }) })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'size.l5x' })).error).toBeUndefined()
    const bad = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['Arr', '0', '5'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('writable size')
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['Arr', '0', 'Arr[0]'] }] }) })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'std.l5x' })).error).toBeUndefined()
    // Studio refused STD(Arr,0,Dest,5,10,0) at build with RxCMP_E_AUDIT_INVALIDOPKIND while
    // STD(Arr,0,Dest,Ctrl,10,0) built 0/0.
    const bad = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'STD', args: ['Arr', '0', 'Dest', '5', '10', '0'] }] }) })
    expect(bad.error?.code).toBe('INVALID_OPERAND')
    expect(bad.error?.message).toContain('needs a writable control')
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'STD', args: ['Arr', '0', 'Dest', 'Ctrl', '10', '0'] }] }) })
    expect(good.error).toBeUndefined()
    // A DINT destination fails Studio's type check (RxCMP_E_AUDIT_INVALIDOPTYPE); the composer names it.
    const wrongType = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'STD', args: ['Arr', '0', 'Count', 'Ctrl', '10', '0'] }] }) })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'sqrt.l5x' })).error).toBeUndefined()
    const composed = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SQR', args: ['Count', 'Count'] }] }) })
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
    expect((await l5xTool.call('l5x_open_project', { path: 'aoi.l5x' })).error).toBeUndefined()
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1', 'Out1'] }] }) })
    expect(good.error).toBeUndefined()
    const rungs = (good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
    expect(rungs?.[0]?.neutral_text).toBe('MyAoi(MyAoi_1,In1,Out1);')
    const noInstance = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['In1', 'Out1'] }] }) })
    expect(noInstance.error?.code).toBe('INVALID_OPERAND')
    expect(noInstance.error?.message).toContain('needs an instance tag of type MyAoi')
    const literal = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['5', 'In1', 'Out1'] }] }) })
    expect(literal.error?.code).toBe('INVALID_OPERAND')
    expect(literal.error?.message).toContain('needs an instance tag')
    // Studio accepted exactly the instance plus the parameters marked Required="true" in real
    // project calls; a missing or extra parameter fails the build with INVALIDNOOFOPS.
    const missing = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1'] }] }) })
    expect(missing.error?.code).toBe('INVALID_OPERAND')
    expect(missing.error?.message).toContain('2 required parameter')
    const extra = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1', 'Out1', 'Num'] }] }) })
    expect(extra.error?.code).toBe('INVALID_OPERAND')
    expect(extra.error?.message).toContain('2 required parameter')
    const wrongType = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'Num', 'Out1'] }] }) })
    expect(wrongType.error?.code).toBe('INVALID_OPERAND')
    expect(wrongType.error?.message).toContain('BOOL')
    // The instance tag itself has to be declarable: an AOI name is a data type for l5x_draft_tag.
    const instanceDraft = await l5xTool.call('l5x_draft_tag', { scope: 'controller', name: 'MyAoi_2', data_type: 'MyAoi', description: 'second instance' })
    expect(instanceDraft.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'aoi-instance.l5x' })
    expect(applied.error).toBeUndefined()
    expect(String(l5xTool.written.get('aoi-instance.l5x'))).toContain('<Tag Name="MyAoi_2"')
    // A literal cannot stand in for an Output pin.
    const literalOutput = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyAoi', args: ['MyAoi_1', 'In1', '5'] }] }) })
    expect(literalOutput.error?.code).toBe('INVALID_OPERAND')
    expect(literalOutput.error?.message).toContain('BOOL tag is required')
  })
})

describe('a destination slot named Dest', () => {
  it('refuses a literal and accepts a tag', async () => {
    // SWPB(5,0,5) failed Studio with RxCMP_E_AUDIT_INVALIDOPKIND; the Destination slots of these
    // instructions are named Dest, not Destination, and were missed by the first guard pass.
    const project = l5x({
      name: 'DestGuard',
      tags: tag('D', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['dest.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'dest.l5x' })).error).toBeUndefined()
    const swpbBad = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SWPB', args: ['5', '0', '5'] }] }) })
    expect(swpbBad.error?.code).toBe('INVALID_OPERAND')
    expect(swpbBad.error?.message).toContain('writable dest')
    const swpbGood = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SWPB', args: ['5', '0', 'D'] }] }) })
    expect(swpbGood.error).toBeUndefined()
    expect((swpbGood.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('SWPB(5,0,D);')
    const mvmBad = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MVM', args: ['1', '255', '5'] }] }) })
    expect(mvmBad.error?.code).toBe('INVALID_OPERAND')
    expect(mvmBad.error?.message).toContain('writable dest')
    const mvmGood = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MVM', args: ['1', '255', 'D'] }] }) })
    expect(mvmGood.error).toBeUndefined()
    expect((mvmGood.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('MVM(1,255,D);')
  })
})
describe('a mnemonic that is not in the Logix set', () => {
  it('refuses EXP, which is an SLC mnemonic the vendor index does not list', async () => {
    // Studio help lists Advanced Math as LN, LOG and EXPT; the production corpus never writes
    // EXP(. A build of EXP alone failed AUDIT_OUTPUTS and EXP followed by OTE failed INVALIDOPTYPE.
    const project = l5x({
      name: 'NotAMnemonic',
      tags: tag('R', 'REAL'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['nomnemonic.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'nomnemonic.l5x' })).error).toBeUndefined()
    const composed = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'EXP', args: ['R', 'R'] }] }) })
    expect(composed.error?.code).toBe('UNKNOWN_INSTRUCTION')
    expect(composed.error?.message).toContain('neither a catalogued instruction nor an AOI')
    const listed = await l5xTool.call('l5x_list_instructions', { filter: 'EXP' })
    const names = ((listed.data?.rows ?? []) as { name: string }[]).map(row => row.name)
    expect(names).not.toContain('EXP')
  })
})

describe('a sequencer instruction', () => {
  it('takes a whole array, one destination element and a CONTROL structure', async () => {
    // SQO(Arr,Mask,Dest,Ctrl,10,0) failed MUSTBEDISCRETE and SQO(...,Mask,...) failed INVALIDOPTYPE;
    // SQO(Arr,Mask,Dest[0],Ctrl,10,0) built 0/0.
    const project = l5x({
      name: 'SqoGuard',
      tags: tag('Arr', 'DINT', ' Dimensions="10"') + tag('Mask', 'DINT') + tag('Dest', 'DINT', ' Dimensions="10"') + tag('Ctrl', 'CONTROL') + tag('Pos', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['sqo.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'sqo.l5x' })).error).toBeUndefined()
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SQO', args: ['Arr', 'Mask', 'Dest[0]', 'Ctrl', '10', '0'] }] }) })
    expect(good.error).toBeUndefined()
    expect((good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('SQO(Arr,Mask,Dest[0],Ctrl,10,0);')
    const wholeDest = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SQO', args: ['Arr', 'Mask', 'Dest', 'Ctrl', '10', '0'] }] }) })
    expect(wholeDest.error?.code).toBe('INVALID_OPERAND')
    expect(wholeDest.error?.message).toContain('must name one element or a scalar tag')
    const wrongControl = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SQO', args: ['Arr', 'Mask', 'Dest[0]', 'Mask', '10', '0'] }] }) })
    expect(wrongControl.error?.code).toBe('INVALID_OPERAND')
    expect(wrongControl.error?.message).toContain('must be CONTROL')
  })
})

describe('an alarm instruction', () => {
  it('takes its own alarm structure type', async () => {
    // ALMA(AlarmD,...) and ALMD(AlarmA,...) each failed INVALIDOPTYPE; the matching types built 0/0.
    const project = l5x({
      name: 'AlarmGuard',
      tags: tag('AlarmA', 'ALARM_ANALOG') + tag('AlarmD', 'ALARM_DIGITAL') + tag('D', 'DINT') + tag('B1', 'BOOL') + tag('B2', 'BOOL') + tag('B3', 'BOOL') + tag('B4', 'BOOL'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['alarm.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'alarm.l5x' })).error).toBeUndefined()
    const almaWrong = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ALMA', args: ['AlarmD', 'D', 'B1', 'B2', 'B3'] }] }) })
    expect(almaWrong.error?.code).toBe('INVALID_OPERAND')
    expect(almaWrong.error?.message).toContain('must be ALARM_ANALOG')
    const almaGood = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ALMA', args: ['AlarmA', 'D', 'B1', 'B2', 'B3'] }] }) })
    expect(almaGood.error).toBeUndefined()
    expect((almaGood.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('ALMA(AlarmA,D,B1,B2,B3);')
    const almdWrong = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ALMD', args: ['AlarmA', 'B1', 'B2', 'B3', 'B4'] }] }) })
    expect(almdWrong.error?.code).toBe('INVALID_OPERAND')
    expect(almdWrong.error?.message).toContain('must be ALARM_DIGITAL')
    const almdGood = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ALMD', args: ['AlarmD', 'B1', 'B2', 'B3', 'B4'] }] }) })
    expect(almdGood.error).toBeUndefined()
    expect((almdGood.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('ALMD(AlarmD,B1,B2,B3,B4);')
  })
})

describe('a file statistic', () => {
  it('takes a CONTROL structure, not another structure', async () => {
    // SRT(Arr,0,Ctl2,10,0) and STD(Arr,0,Dest,Ctl2,10,0) with a COUNTER control both failed
    // INVALIDOPTYPE; the same rungs with a CONTROL tag built 0/0.
    const project = l5x({
      name: 'FileStatGuard',
      tags: tag('Arr', 'DINT', ' Dimensions="10"') + tag('Dest', 'REAL') + tag('Ctrl', 'CONTROL') + tag('Ctl2', 'COUNTER'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['stats.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'stats.l5x' })).error).toBeUndefined()
    const good = [
      ['SRT', ['Arr', '0', 'Ctrl', '10', '0'], 'SRT(Arr,0,Ctrl,10,0);'],
      ['STD', ['Arr', '0', 'Dest', 'Ctrl', '10', '0'], 'STD(Arr,0,Dest,Ctrl,10,0);'],
    ] as const
    for (const [instr, args, expected] of good) {
      const result = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr, args }] }) })
      expect(result.error).toBeUndefined()
      expect((result.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe(expected)
    }
    // SRT(Arr[0],0,Ctrl,10,0) built 0/0, so the array slot accepts one element as well.
    const element = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SRT', args: ['Arr[0]', '0', 'Ctrl', '10', '0'] }] }) })
    expect(element.error).toBeUndefined()
    expect((element.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('SRT(Arr[0],0,Ctrl,10,0);')
    const wrong = [
      ['SRT', ['Arr', '0', 'Ctl2', '10', '0']],
      ['STD', ['Arr', '0', 'Dest', 'Ctl2', '10', '0']],
    ] as const
    for (const [instr, args] of wrong) {
      const result = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr, args }] }) })
      expect(result.error?.code).toBe('INVALID_OPERAND')
      expect(result.error?.message).toContain('must be CONTROL')
    }
  })
})

describe('an array dimension', () => {
  it('needs an array tag and a dimension from 0 to 2', async () => {
    // SIZE(5,0,Pos) failed MUSTBEARRAY and SIZE(Arr,3,Pos) failed OUTOFRANGE; SIZE(Arr,2,Pos) builds.
    const project = l5x({
      name: 'DimensionGuard',
      tags: tag('Arr', 'DINT', ' Dimensions="10"') + tag('Pos', 'DINT') + tag('D', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['dim.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'dim.l5x' })).error).toBeUndefined()
    const literal = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['5', '0', 'Pos'] }] }) })
    expect(literal.error?.code).toBe('INVALID_OPERAND')
    expect(literal.error?.message).toContain('needs a tag for Source')
    const three = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['Arr', '3', 'Pos'] }] }) })
    expect(three.error?.code).toBe('INVALID_OPERAND')
    expect(three.error?.message).toContain('maximum 2')
    // SIZE(D,0,Pos) with a scalar tag failed MUSTBEARRAY; an element is not the whole array either.
    const scalar = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['D', '0', 'Pos'] }] }) })
    expect(scalar.error?.code).toBe('INVALID_OPERAND')
    expect(scalar.error?.message).toContain('array tag')
    const element = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['Arr[0]', '0', 'Pos'] }] }) })
    expect(element.error?.code).toBe('INVALID_OPERAND')
    expect(element.error?.message).toContain('must name a declared array tag')
    // A tag staged in the same draft carries its dimensions, so the array slot sees an array.
    const stagedTag = await l5xTool.call('l5x_draft_tag', { scope: 'controller', name: 'StagedArr', data_type: 'DINT', dimensions: '10', description: 'staged array' })
    expect(stagedTag.error).toBeUndefined()
    const staged = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['StagedArr', '0', 'Pos'] }] }) })
    expect(staged.error).toBeUndefined()
    expect((staged.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('SIZE(StagedArr,0,Pos);')
    const two = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'SIZE', args: ['Arr', '2', 'Pos'] }] }) })
    expect(two.error).toBeUndefined()
    expect((two.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('SIZE(Arr,2,Pos);')
  })
})

describe('draft tag validation', () => {
  it('names the identifier rule and a repair, and refuses unknown scope or a duplicate', async () => {
    const project = l5x({
      name: 'DraftTagGuard',
      tags: tag('Existing', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const open = async () => {
      const tool = harness(new Map([['tags.l5x', new TextEncoder().encode(project)]]), { editing: true })
      expect((await tool.call('l5x_open_project', { path: 'tags.l5x' })).error).toBeUndefined()
      return tool
    }
    const tool = await open()
    // The apply message carries the specific identifier code, and a single failed operation keeps its repair.
    const space = await tool.call('l5x_draft_tag', { scope: 'controller', name: 'Start PB', data_type: 'DINT', description: 'x' })
    expect(space.error).toBeUndefined()
    const spaceApplied = await tool.call('l5x_draft_apply', { output_path: 'space.l5x' })
    expect(spaceApplied.error?.code).toBe('INVALID_CHANGE_SET')
    expect(spaceApplied.error?.message).toContain('[NAME_INVALID_CHARACTERS]')
    expect(spaceApplied.error?.message).toContain('a space')
    const digitTool = await open()
    expect((await digitTool.call('l5x_draft_tag', { scope: 'controller', name: '1Pump', data_type: 'DINT', description: 'x' })).error).toBeUndefined()
    const digitApplied = await digitTool.call('l5x_draft_apply', { output_path: 'digit.l5x' })
    expect(digitApplied.error?.message).toContain('[NAME_STARTS_WITH_DIGIT]')
    expect(digitApplied.error?.fix).toContain('_1Pump')
    const longTool = await open()
    expect((await longTool.call('l5x_draft_tag', { scope: 'controller', name: 'A'.repeat(41), data_type: 'DINT', description: 'x' })).error).toBeUndefined()
    const longApplied = await longTool.call('l5x_draft_apply', { output_path: 'long.l5x' })
    expect(longApplied.error?.message).toContain('[NAME_TOO_LONG]')
    // Scope and duplicate checks run at apply, against the export being edited.
    const scopeTool = await open()
    const scope = await scopeTool.call('l5x_draft_tag', { scope: 'Nope', name: 'X', data_type: 'DINT', description: 'x' })
    const scopeApplied = scope.error === undefined ? await scopeTool.call('l5x_draft_apply', { output_path: 'scope.l5x' }) : scope
    expect(scopeApplied.error?.code).toBe('COMPONENT_NOT_FOUND')
    const duplicateTool = await open()
    const duplicate = await duplicateTool.call('l5x_draft_tag', { scope: 'controller', name: 'Existing', data_type: 'DINT', description: 'x' })
    const duplicateApplied = duplicate.error === undefined ? await duplicateTool.call('l5x_draft_apply', { output_path: 'duplicate.l5x' }) : duplicate
    expect(duplicateApplied.error?.code).toBe('NAME_COLLISION')
  })
})

describe('two output instructions in series', () => {
  it('is accepted, because Studio built it', async () => {
    // XIC(B)OTE(B)OTE(C); imported and built 0/0 (twooutputs-bad.L5X, ACD sha 5147a2ed...). A rule
    // forbidding a second output would be stricter than the vendor.
    const project = l5x({
      name: 'TwoOutputs',
      tags: tag('B', 'BOOL') + tag('C', 'BOOL'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['outputs.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'outputs.l5x' })).error).toBeUndefined()
    const raw = await l5xTool.call('l5x_draft_rung', { program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 0, text: 'XIC(B)OTE(B)OTE(C);' })
    expect(raw.error).toBeUndefined()
    const composed = await l5xTool.call('l5x_compose_rung', {
      program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 1,
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['B'] }, { instr: 'OTE', args: ['B'] }, { instr: 'OTE', args: ['C'] }] }),
    })
    expect(composed.error).toBeUndefined()
    expect((composed.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('XIC(B)OTE(B)OTE(C);')
  })
})

describe('comparing alarm definitions', () => {
  const baseProject = (): string => l5x({
    name: 'AlarmCompare',
    tags: tag('D', 'DINT'),
    programs: program('Main', rllRoutine('MainRoutine', [])),
    tasks: task('MainTask', ['Main']),
  })
  const withAlarm = (description: string): string => baseProject().replace('</Controller>', `<Alarms><Alarm Name="HiTemp" Description="${description}"/></Alarms></Controller>`)

  it('lists and reads one alarm definition', async () => {
    const xml = withAlarm('old alarm text')
    const l5xTool = harness(new Map([['alarms.L5X', new TextEncoder().encode(xml)]]), {})
    const opened = await l5xTool.call('l5x_open_project', { path: 'alarms.L5X' })
    expect(opened.error).toBeUndefined()
    expect((opened.data?.counts as { alarms: number }).alarms).toBe(1)
    const listed = await l5xTool.call('l5x_list_components', { kind: 'alarm', limit: 10 })
    const rows = listed.data?.rows as { name: string; kind: string; description: string }[]
    expect(rows[0]).toEqual({ name: 'HiTemp', kind: 'Alarm', description: 'old alarm text' })
    const read = await l5xTool.call('l5x_get_component', { kind: 'alarm', name: 'HiTemp' })
    expect((read.data?.component as { name: string } | undefined)?.name).toBe('HiTemp')
    const missing = await l5xTool.call('l5x_get_component', { kind: 'alarm', name: 'Nope' })
    expect(missing.error?.code).toBe('COMPONENT_NOT_FOUND')
  })

  it('documents alarm definitions in PROJECT.md', async () => {
    const l5xTool = harness(new Map([['alarm-doc.L5X', new TextEncoder().encode(withAlarm('old alarm text'))]]), {})
    expect((await l5xTool.call('l5x_open_project', { path: 'alarm-doc.L5X' })).error).toBeUndefined()
    const documented = await l5xTool.call('l5x_document_project', { output_root: 'alarm-docs' })
    expect(documented.error).toBeUndefined()
    expect(documented.data?.counts?.alarms).toBe(1)
    const project = String([...l5xTool.written.entries()].find(([path]) => String(path).endsWith('PROJECT.md'))?.[1] ?? '')
    expect(project).toContain('## Alarms')
    expect(project).toContain('| HiTemp | Alarm | old alarm text |')
    expect(project).toContain('alarms: 1')
  })

  it('reports an alarm description change and an added alarm', async () => {
    const before = withAlarm('old alarm text')
    const after = withAlarm('new alarm text')
    const l5xTool = harness(new Map([['alarm-before.L5X', new TextEncoder().encode(before)], ['alarm-after.L5X', new TextEncoder().encode(after)]]), {})
    const openedBefore = await l5xTool.call('l5x_open_project', { path: 'alarm-before.L5X' })
    const openedAfter = await l5xTool.call('l5x_open_project', { path: 'alarm-after.L5X' })
    expect(openedBefore.error).toBeUndefined()
    expect(openedAfter.error).toBeUndefined()
    expect((openedBefore.data?.counts as { alarms: number }).alarms).toBe(1)
    const compared = await l5xTool.call('l5x_compare_projects', { before_id: openedBefore.data?.project_id, after_id: openedAfter.data?.project_id })
    expect(compared.error).toBeUndefined()
    expect(compared.data?.count).toBe(1)
    const changes = compared.data?.changes as { component: string; kind: string; key?: string }[]
    expect(changes[0]?.component).toBe('alarm')
    expect(changes[0]?.key).toBe('HiTemp')
    expect(changes[0]?.kind).toBe('changed')
    // An alarm only in the later export is an addition, not a silent difference.
    const addedTool = harness(new Map([['alarm-none.L5X', new TextEncoder().encode(baseProject())], ['alarm-one.L5X', new TextEncoder().encode(withAlarm('first'))]]), {})
    const none = await addedTool.call('l5x_open_project', { path: 'alarm-none.L5X' })
    const one = await addedTool.call('l5x_open_project', { path: 'alarm-one.L5X' })
    expect(none.error).toBeUndefined()
    expect(one.error).toBeUndefined()
    const added = await addedTool.call('l5x_compare_projects', { before_id: none.data?.project_id, after_id: one.data?.project_id })
    expect(added.data?.count).toBe(1)
    expect((added.data?.changes as { component: string; kind: string }[])[0]).toMatchObject({ component: 'alarm', kind: 'added' })
  })
})

describe('comparing diagram pins', () => {
  it('reports a block visible-pins change', async () => {
    const project = (pins: string): string => {
      const fbd = '<Routine Name="Fb" Type="FBD"><FBDContent SheetSize="B - 11 x 17 in" SheetOrientation="Landscape"><Sheet Number="1">'
        + `<Block Type="ADD" ID="1" X="300" Y="20" Operand="Add1" VisiblePins="${pins}" HideDesc="false"/>`
        + '</Sheet></FBDContent></Routine>'
      return l5x({
        name: 'PinCompare',
        tags: tag('Add1', 'FBD_MATH'),
        programs: program('Main', fbd, { mainRoutine: 'Fb' }),
        tasks: task('MainTask', ['Main']),
      })
    }
    const l5xTool = harness(new Map([
      ['pins-before.L5X', new TextEncoder().encode(project('SourceA SourceB Dest'))],
      ['pins-after.L5X', new TextEncoder().encode(project('SourceA SourceB'))],
    ]), {})
    const before = await l5xTool.call('l5x_open_project', { path: 'pins-before.L5X' })
    const after = await l5xTool.call('l5x_open_project', { path: 'pins-after.L5X' })
    expect(before.error).toBeUndefined()
    expect(after.error).toBeUndefined()
    const compared = await l5xTool.call('l5x_compare_projects', { before_id: before.data?.project_id, after_id: after.data?.project_id })
    expect(compared.data?.count).toBe(1)
    expect((compared.data?.changes as { component: string; kind: string }[])[0]).toMatchObject({ component: 'diagram', kind: 'changed' })
  })
})

describe('a denied draft write', () => {
  it('reports WRITE_DENIED with the provider reason, not an internal defect', async () => {
    const project = l5x({
      name: 'DeniedWrite',
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['denied.l5x', new TextEncoder().encode(project)]]), { editing: true, denyWrite: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'denied.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_tag', { scope: 'controller', name: 'X', data_type: 'DINT', description: 'x' })).error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'denied-out.L5X' })
    expect(applied.error?.code).toBe('WRITE_DENIED')
    expect(applied.error?.message).toContain('refused to write')
    expect(applied.error?.message).toContain('denied')
    expect(applied.error?.fix).toContain('provider allows')
    expect(l5xTool.written.size).toBe(0)
  })

  it('reports a denied documentation write the same way', async () => {
    const l5xTool = harness(new Map([['docs.l5x', fixtureBytes()]]), { denyWrite: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'docs.l5x' })).error).toBeUndefined()
    const documented = await l5xTool.call('l5x_document_project', { output_root: 'denied-docs' })
    expect(documented.error?.code).toBe('WRITE_DENIED')
    expect(documented.error?.message).toContain('refused to write')
    expect(l5xTool.written.size).toBe(0)
  })
})

describe('creating a routine', () => {
  it('writes ST and RLL bodies and refuses an invalid body or duplicate name', async () => {
    const project = l5x({
      name: 'RoutineDraft',
      tags: tag('B', 'BOOL') + tag('C', 'BOOL') + tag('Counter', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const open = async () => {
      const tool = harness(new Map([['routines.l5x', new TextEncoder().encode(project)]]), { editing: true })
      expect((await tool.call('l5x_open_project', { path: 'routines.l5x' })).error).toBeUndefined()
      return tool
    }
    const tool = await open()
    expect((await tool.call('l5x_draft_routine', { program: 'Main', name: 'Calc', language: 'ST', code: 'Counter := 1;' })).error).toBeUndefined()
    expect((await tool.call('l5x_draft_routine', { program: 'Main', name: 'Sub', language: 'RLL', code: 'XIC(B)OTE(C);' })).error).toBeUndefined()
    const applied = await tool.call('l5x_draft_apply', { output_path: 'routines-out.l5x' })
    expect(applied.error).toBeUndefined()
    const written = String(tool.written.get('routines-out.l5x'))
    expect(written).toContain('<Routine Name="Calc" Type="ST"><STContent>')
    expect(written).toContain('Counter := 1;')
    expect(written).toContain('<Routine Name="Sub" Type="RLL"><RLLContent>')
    expect(written).toContain('XIC(B)OTE(C);')
    // The same guards the other draft tools use apply here too.
    const badRll = await open()
    expect((await badRll.call('l5x_draft_routine', { program: 'Main', name: 'Bad', language: 'RLL', code: 'XIC(B);' })).error).toBeUndefined()
    expect((await badRll.call('l5x_draft_apply', { output_path: 'routines-bad.l5x' })).error?.code).toBe('INVALID_LADDER')
    const badSt = await open()
    expect((await badSt.call('l5x_draft_routine', { program: 'Main', name: 'Bad', language: 'ST', code: '(* open' })).error).toBeUndefined()
    expect((await badSt.call('l5x_draft_apply', { output_path: 'routines-badst.l5x' })).error?.code).toBe('INVALID_ST')
    const duplicate = await open()
    expect((await duplicate.call('l5x_draft_routine', { program: 'Main', name: 'MainRoutine', language: 'RLL', code: 'XIC(B)OTE(C);' })).error).toBeUndefined()
    expect((await duplicate.call('l5x_draft_apply', { output_path: 'routines-dupe.l5x' })).error?.code).toBe('NAME_COLLISION')
  })
})

describe('a Structured Text draft', () => {
  it('writes only into an ST routine and refuses unterminated text', async () => {
    const st = '<Routine Name="Calc" Type="ST"><STContent><Line Number="0"><![CDATA[Counter := 0;]]></Line></STContent></Routine>'
    const project = l5x({
      name: 'StDraft',
      tags: tag('Counter', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', []) + st),
      tasks: task('MainTask', ['Main']),
    })
    const open = async () => {
      const tool = harness(new Map([['st.l5x', new TextEncoder().encode(project)]]), { editing: true })
      expect((await tool.call('l5x_open_project', { path: 'st.l5x' })).error).toBeUndefined()
      return tool
    }
    const missingTool = await open()
    expect((await missingTool.call('l5x_draft_st', { program: 'Main', routine: 'Nope', code: 'A := 1;' })).error).toBeUndefined()
    expect((await missingTool.call('l5x_draft_apply', { output_path: 'st-missing.l5x' })).error).toBeDefined()
    const wrongTool = await open()
    expect((await wrongTool.call('l5x_draft_st', { program: 'Main', routine: 'MainRoutine', code: 'A := 1;' })).error).toBeUndefined()
    const wrong = await wrongTool.call('l5x_draft_apply', { output_path: 'st-wrong.l5x' })
    expect(wrong.error?.code).toBe('UNSUPPORTED_TARGET')
    const badTool = await open()
    expect((await badTool.call('l5x_draft_st', { program: 'Main', routine: 'Calc', code: '(* open comment' })).error).toBeUndefined()
    const bad = await badTool.call('l5x_draft_apply', { output_path: 'st-bad.l5x' })
    expect(bad.error?.code).toBe('INVALID_ST')
    const goodTool = await open()
    const code = 'Counter := Counter + 1;\nIF Counter > 10 THEN Counter := 0; END_IF;'
    expect((await goodTool.call('l5x_draft_st', { program: 'Main', routine: 'Calc', code })).error).toBeUndefined()
    const good = await goodTool.call('l5x_draft_apply', { output_path: 'st-good.l5x' })
    expect(good.error).toBeUndefined()
    const written = String(goodTool.written.get('st-good.l5x'))
    expect(written).toContain('Counter := Counter + 1;')
    expect(written).toContain('IF Counter > 10 THEN Counter := 0; END_IF;')
  })
})

describe('a raw rung operand count', () => {
  it('refuses a modelled instruction with too few or too many operands', async () => {
    // TON(T,500) fails Studio with RxCMP_E_AUDIT_INVALIDNOOFOPS; the raw path now refuses it too.
    const project = l5x({
      name: 'RawArity',
      tags: tag('D', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', []), { tags: tag('B', 'BOOL') + tag('T', 'TIMER') }),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['arity.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'arity.l5x' })).error).toBeUndefined()
    const draft = (text: string) => l5xTool.call('l5x_draft_rung', { program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 0, text })
    const short = await draft('XIC(B)TON(T,500);')
    expect(short.error?.code).toBe('INVALID_OPERAND')
    expect(short.error?.message).toContain('TON takes 3 operand(s)')
    const long = await draft('XIC(B)ADD(D,1,D,2);')
    expect(long.error?.code).toBe('INVALID_OPERAND')
    expect(long.error?.message).toContain('ADD takes 3 operand(s)')
    // A tag of the wrong type is refused too: XIC(D) with a DINT failed Studio with INVALIDOPTYPE.
    const wrongType = await draft('XIC(D)OTE(B);')
    expect(wrongType.error?.code).toBe('INVALID_OPERAND')
    expect(wrongType.error?.message).toContain('needs a BOOL tag')
    const wrongTimer = await draft('XIC(B)TON(D,500,0);')
    expect(wrongTimer.error?.code).toBe('INVALID_OPERAND')
    expect(wrongTimer.error?.message).toContain('needs a timer')
    // Slot rules apply too: a literal destination fails Studio with INVALIDOPKIND.
    const literalDest = await draft('XIC(B)ADD(D,1,5);')
    expect(literalDest.error?.code).toBe('INVALID_OPERAND')
    expect(literalDest.error?.message).toContain('needs a writable destination')
    expect((await draft('XIC(B)TON(T,500,0);')).error).toBeUndefined()
    // An unmodelled instruction keeps the raw escape hatch, since its operand list is not modelled.
    expect((await draft('FAL(D,D)OTE(B);')).error).toBeUndefined()
  })
})

describe('a program scope', () => {
  it('resolves only that program local tags and controller tags', async () => {
    // A rung staged in Beta that reads Alpha's LocalA built nowhere: Studio answered
    // RxCMP_E_OPERAND_TAGNOTFOUND, although the composer had accepted it.
    const project = l5x({
      name: 'ScopeGuard',
      tags: tag('Shared', 'BOOL'),
      programs: program('Alpha', rllRoutine('MainRoutine', []), { tags: tag('LocalA', 'BOOL') })
        + program('Beta', rllRoutine('MainRoutine', []), { tags: tag('LocalB', 'BOOL') }),
      tasks: task('MainTask', ['Alpha', 'Beta']),
    })
    const l5xTool = harness(new Map([['scope.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'scope.l5x' })).error).toBeUndefined()
    const compose = (spec: unknown) => l5xTool.call('l5x_compose_rung', { program: 'Beta', routine: 'MainRoutine', mode: 'insert', rung: 0, spec_json: JSON.stringify(spec) })
    const wrong = await compose({ series: [{ instr: 'XIC', args: ['LocalA'] }, { instr: 'OTE', args: ['LocalB'] }] })
    expect(wrong.error?.code).toBe('TAG_NOT_FOUND')
    expect(wrong.error?.message).toContain('not declared in program Beta')
    expect(wrong.error?.message).toContain('Alpha')
    const local = await compose({ series: [{ instr: 'XIC', args: ['LocalB'] }, { instr: 'OTE', args: ['LocalB'] }] })
    expect(local.error).toBeUndefined()
    expect((local.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('XIC(LocalB)OTE(LocalB);')
    const shared = await compose({ series: [{ instr: 'XIC', args: ['Shared'] }, { instr: 'OTE', args: ['LocalB'] }] })
    expect(shared.error).toBeUndefined()
    // The same rule holds for a tag staged in another program in this draft.
    expect((await l5xTool.call('l5x_draft_tag', { scope: 'Alpha', name: 'StagedA', data_type: 'BOOL', description: 'a' })).error).toBeUndefined()
    const stagedWrong = await compose({ series: [{ instr: 'XIC', args: ['StagedA'] }, { instr: 'OTE', args: ['LocalB'] }] })
    expect(stagedWrong.error?.code).toBe('TAG_NOT_FOUND')
    expect((await l5xTool.call('l5x_draft_tag', { scope: 'Beta', name: 'StagedB', data_type: 'BOOL', description: 'b' })).error).toBeUndefined()
    const stagedRight = await compose({ series: [{ instr: 'XIC', args: ['StagedB'] }, { instr: 'OTE', args: ['LocalB'] }] })
    expect(stagedRight.error).toBeUndefined()
    // Raw NeutralText takes the same rule: a pasted rung from another program is refused.
    const rawWrong = await l5xTool.call('l5x_draft_rung', { program: 'Beta', routine: 'MainRoutine', mode: 'insert', rung: 0, text: 'XIC(LocalA)OTE(LocalB);' })
    expect(rawWrong.error?.code).toBe('TAG_NOT_FOUND')
    expect(rawWrong.error?.message).toContain('declared in Alpha')
    const rawStagedWrong = await l5xTool.call('l5x_draft_rung', { program: 'Beta', routine: 'MainRoutine', mode: 'insert', rung: 0, text: 'XIC(StagedA)OTE(LocalB);' })
    expect(rawStagedWrong.error?.code).toBe('TAG_NOT_FOUND')
    const rawRight = await l5xTool.call('l5x_draft_rung', { program: 'Beta', routine: 'MainRoutine', mode: 'insert', rung: 0, text: 'XIC(StagedB)OTE(LocalB);' })
    expect(rawRight.error).toBeUndefined()
  })
})

describe('a program without a Tags region', () => {
  it('gets one before Routines, and the new tags compose in the same draft', async () => {
    // The builder always writes <Tags></Tags>; Studio exports may omit it. The change set has to
    // create the region in the right position, and composition must see the staged program tags.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="ProgramTags" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Programs><Program Name="Main" MainRoutineName="MainRoutine"><Routines>
      <Routine Name="MainRoutine" Type="RLL"><RLLContent/></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5xTool = harness(new Map([['programtags.l5x', new TextEncoder().encode(xml)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'programtags.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_tag', { scope: 'Main', name: 'Local', data_type: 'BOOL', description: 'local' })).error).toBeUndefined()
    expect((await l5xTool.call('l5x_draft_tag', { scope: 'Main', name: 'Flag', data_type: 'BOOL', description: 'flag' })).error).toBeUndefined()
    const rung = await l5xTool.call('l5x_draft_rung', { program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 0, text: 'XIC(Local)OTE(Flag);' })
    expect(rung.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'programtags-out.l5x' })
    expect(applied.error).toBeUndefined()
    const output = String(l5xTool.written.get('programtags-out.l5x'))
    const program = output.slice(output.indexOf('<Program Name="Main"'), output.indexOf('</Program>'))
    expect(program.indexOf('<Tags>')).toBeGreaterThanOrEqual(0)
    expect(program.indexOf('<Tags>')).toBeLessThan(program.indexOf('<Routines>'))
    expect(program).toContain('Name="Local"')
    expect(program).toContain('Name="Flag"')
    expect(program).toContain('XIC(Local)OTE(Flag)')
    const reopened = harness(new Map([['programtags-out.l5x', new TextEncoder().encode(output)]]), { editing: false })
    expect((await reopened.call('l5x_open_project', { path: 'programtags-out.l5x' })).error).toBeUndefined()
    const tags = await reopened.call('l5x_list_components', { kind: 'tag', scope: 'Main' })
    const names = ((tags.data?.rows ?? []) as { name: string }[]).map(row => row.name)
    expect(names).toContain('Local')
    expect(names).toContain('Flag')
  })
})

describe('tag initial value bounds', () => {
  it('accepts a value that fits and refuses one that does not', async () => {
    const project = l5x({
      name: 'ValueGuard',
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const cases: readonly (readonly [string, string, number, boolean])[] = [
      ['BoolOk', 'BOOL', 1, true],
      ['BoolBad', 'BOOL', 2, false],
      ['IntOk', 'INT', 32767, true],
      ['IntHigh', 'INT', 32768, false],
      ['IntFraction', 'INT', 1.5, false],
      ['UsintOk', 'USINT', 255, true],
      ['UsintNegative', 'USINT', -1, false],
      ['UdintMax', 'UDINT', 4294967295, true],
      ['DintHigh', 'DINT', 2147483648, false],
      ['RealOk', 'REAL', 1.5, true],
      ['RealHigh', 'REAL', 1e39, false],
    ]
    for (const [name, dataType, value, fits] of cases) {
      const tool = harness(new Map([['values.l5x', new TextEncoder().encode(project)]]), { editing: true })
      expect((await tool.call('l5x_open_project', { path: 'values.l5x' })).error).toBeUndefined()
      const added = await tool.call('l5x_draft_tag', { scope: 'controller', name, data_type: dataType, value, description: name })
      const applied = added.error === undefined ? await tool.call('l5x_draft_apply', { output_path: `${name}.l5x` }) : added
      if (fits) {
        expect(applied.error, `${name}`).toBeUndefined()
      } else {
        expect(applied.error?.code, `${name}`).toBe('INVALID_CHANGE_SET')
        expect(applied.error?.message, `${name}`).toContain('does not fit')
      }
    }
  })
})

describe('tag array dimensions', () => {
  it('accepts one to three positive sizes and refuses the rest', async () => {
    const project = l5x({
      name: 'DimensionsGuard',
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['dims.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'dims.l5x' })).error).toBeUndefined()
    const valid = await l5xTool.call('l5x_draft_tag', { scope: 'controller', name: 'Grid', data_type: 'DINT', dimensions: '4 2', description: 'grid' })
    expect(valid.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'dims-out.l5x' })
    expect(applied.error).toBeUndefined()
    expect(String(l5xTool.written.get('dims-out.l5x'))).toContain('Dimensions="4 2"')
    for (const dimensions of ['0', '10 0', 'abc', '1 2 3 4', '1000001', '4000 4000']) {
      const badTool = harness(new Map([['dims.l5x', new TextEncoder().encode(project)]]), { editing: true })
      expect((await badTool.call('l5x_open_project', { path: 'dims.l5x' })).error).toBeUndefined()
      const added = await badTool.call('l5x_draft_tag', { scope: 'controller', name: 'Bad', data_type: 'DINT', dimensions, description: 'bad' })
      const appliedBad = added.error === undefined ? await badTool.call('l5x_draft_apply', { output_path: 'bad-dims.l5x' }) : added
      expect(appliedBad.error?.code, dimensions).toBe('INVALID_CHANGE_SET')
    }
    const valueTool = harness(new Map([['dims.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await valueTool.call('l5x_open_project', { path: 'dims.l5x' })).error).toBeUndefined()
    const withValue = await valueTool.call('l5x_draft_tag', { scope: 'controller', name: 'Bad', data_type: 'DINT', dimensions: '4', value: 0, description: 'bad' })
    const appliedValue = withValue.error === undefined ? await valueTool.call('l5x_draft_apply', { output_path: 'bad-value.l5x' }) : withValue
    expect(appliedValue.error?.code).toBe('INVALID_CHANGE_SET')
  })
})

describe('tag types the catalogue needs', () => {
  it('can be declared through l5x_draft_tag', async () => {
    // l5x_draft_tag answered UNKNOWN_DATA_TYPE for TIMER, COUNTER, PID, STRING and MESSAGE, although the
    // catalogue and its patterns use all five. They are built-in Logix structures, not project UDTs.
    const project = l5x({
      name: 'BuiltinTypes',
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['types.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'types.l5x' })).error).toBeUndefined()
    for (const [name, dataType] of [['T1', 'TIMER'], ['C1', 'COUNTER'], ['P1', 'PID'], ['S1', 'STRING'], ['M1', 'MESSAGE'], ['F1', 'FBD_TIMER'], ['F2', 'FBD_COUNTER'], ['F3', 'FBD_COMPARE'], ['F4', 'FBD_LOGICAL'], ['F5', 'FBD_MATH']]) {
      const added = await l5xTool.call('l5x_draft_tag', { scope: 'controller', name, data_type: dataType, description: dataType })
      expect(added.error).toBeUndefined()
    }
    // The draft-created TIMER is directly usable by the composer, not just present in the export.
    const ton = await l5xTool.call('l5x_compose_rung', { program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 0, spec_json: JSON.stringify({ series: [{ instr: 'TON', args: ['T1', '1000', '0'] }] }) })
    expect(ton.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'builtin-types.l5x' })
    expect(applied.error).toBeUndefined()
    const output = String(l5xTool.written.get('builtin-types.l5x'))
    for (const type of ['TIMER', 'COUNTER', 'PID', 'STRING', 'MESSAGE', 'FBD_TIMER', 'FBD_COUNTER', 'FBD_COMPARE', 'FBD_LOGICAL', 'FBD_MATH']) expect(output).toContain(`DataType="${type}"`)
    expect(output).toContain('TON(T1,1000,0)')
  })
})

describe('a message instruction', () => {
  it('takes a MESSAGE tag, not any tag', async () => {
    // MSG(N) with a DINT failed INVALIDOPTYPE; MSG(Msg) with a MESSAGE tag built 0/0.
    const project = l5x({
      name: 'MsgGuard',
      tags: tag('Msg', 'MESSAGE') + tag('N', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['msg.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'msg.l5x' })).error).toBeUndefined()
    const wrong = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MSG', args: ['N'] }] }) })
    expect(wrong.error?.code).toBe('INVALID_OPERAND')
    expect(wrong.error?.message).toContain('must be MESSAGE')
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MSG', args: ['Msg'] }] }) })
    expect(good.error).toBeUndefined()
    expect((good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('MSG(Msg);')
    // A MESSAGE tag has to be declarable through the tools, or MSG cannot be composed from scratch.
    const messageTag = await l5xTool.call('l5x_draft_tag', { scope: 'controller', name: 'Msg2', data_type: 'MESSAGE', description: 'second message' })
    expect(messageTag.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'msg-tag.l5x' })
    expect(applied.error).toBeUndefined()
    expect(String(l5xTool.written.get('msg-tag.l5x'))).toContain('<Tag Name="Msg2"')
  })
})

describe('a one-based start position', () => {
  it('refuses zero and accepts one', async () => {
    // FIND(Str1,Str2,0,Pos) failed RxCMP_E_AUDIT_OUTOFRANGE; FIND(...,1,...) built 0/0. The string
    // positioning instructions are 1-based for the same reason.
    const project = l5x({
      name: 'StartGuard',
      tags: tag('Str1', 'STRING') + tag('Str2', 'STRING') + tag('Pos', 'DINT'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['start.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'start.l5x' })).error).toBeUndefined()
    const findZero = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FIND', args: ['Str1', 'Str2', '0', 'Pos'] }] }) })
    expect(findZero.error?.code).toBe('INVALID_OPERAND')
    expect(findZero.error?.message).toContain('1-based')
    const findOne = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FIND', args: ['Str1', 'Str2', '1', 'Pos'] }] }) })
    expect(findOne.error).toBeUndefined()
    expect((findOne.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('FIND(Str1,Str2,1,Pos);')
    // A STRING Result failed INVALIDOPTYPE; the position is a DINT.
    const findWrong = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FIND', args: ['Str1', 'Str2', '1', 'Str2'] }] }) })
    expect(findWrong.error?.code).toBe('INVALID_OPERAND')
    expect(findWrong.error?.message).toContain('must be DINT')
    const midZero = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MID', args: ['Str1', '1', '0', 'Str2'] }] }) })
    expect(midZero.error?.code).toBe('INVALID_OPERAND')
    expect(midZero.error?.message).toContain('1-based')
    const midOne = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MID', args: ['Str1', '1', '1', 'Str2'] }] }) })
    expect(midOne.error).toBeUndefined()
    expect((midOne.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('MID(Str1,1,1,Str2);')
  })
})

describe('a bit shift', () => {
  it('loads its source bit from a BOOL tag', async () => {
    // The vendor table says Source Bit is a BOOL tag; the catalogue had NUMBER, so BSL(...,0,...)
    // failed INVALIDOPKIND. BSL(Arr,Ctrl,Bit,10) with a BOOL tag built 0/0.
    const project = l5x({
      name: 'BitShiftGuard',
      tags: tag('Arr', 'DINT', ' Dimensions="10"') + tag('Ctrl', 'CONTROL') + tag('Ctl2', 'COUNTER') + tag('Bit', 'BOOL'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['bsl.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'bsl.l5x' })).error).toBeUndefined()
    const literal = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'BSL', args: ['Arr', 'Ctrl', '0', '10'] }] }) })
    expect(literal.error?.code).toBe('INVALID_OPERAND')
    expect(literal.error?.message).toContain('BOOL tag')
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'BSL', args: ['Arr', 'Ctrl', 'Bit', '10'] }] }) })
    expect(good.error).toBeUndefined()
    expect((good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('BSL(Arr,Ctrl,Bit,10);')
    const right = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'BSR', args: ['Arr', 'Ctrl', 'Bit', '10'] }] }) })
    expect(right.error).toBeUndefined()
    expect((right.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('BSR(Arr,Ctrl,Bit,10);')
    // BSL(Arr,Ctl2,Bit,8) with a COUNTER control failed Studio with INVALIDOPTYPE.
    for (const instr of ['BSL', 'BSR']) {
      const wrong = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr, args: ['Arr', 'Ctl2', 'Bit', '10'] }] }) })
      expect(wrong.error?.code).toBe('INVALID_OPERAND')
      expect(wrong.error?.message).toContain('must be CONTROL')
    }
    // The array slot accepts one element: BSL(Arr[0],Ctrl,Bit,8) built 0/0, so no whole-array rule.
    for (const instr of ['BSL', 'BSR']) {
      const element = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr, args: ['Arr[0]', 'Ctrl', 'Bit', '10'] }] }) })
      expect(element.error).toBeUndefined()
      expect((element.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe(`${instr}(Arr[0],Ctrl,Bit,10);`)
    }
  })
})

describe('an input-type logic instruction', () => {
  it('cannot end a rung but can drive an output', async () => {
    // DTR(Src,Mask,Ref) alone failed AUDIT_OUTPUTS and DTR(...)OTE(Bit) built 0/0; AND behaves the
    // same way (AND(A,B,D)OTE(Bit) built 0/0). Both were missing from the rail rule.
    const project = l5x({
      name: 'RailGuard',
      tags: tag('A', 'DINT') + tag('B', 'DINT') + tag('D', 'DINT') + tag('Src', 'DINT') + tag('Mask', 'DINT') + tag('Ref', 'DINT') + tag('Bit', 'BOOL'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['rail.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'rail.l5x' })).error).toBeUndefined()
    const andRail = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'AND', args: ['A', 'B', 'D'] }] }) })
    expect(andRail.error?.code).toBe('INVALID_LADDER_SPEC')
    expect(andRail.error?.message).toContain('ends in AND')
    const andDriven = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'AND', args: ['A', 'B', 'D'] }, { instr: 'OTE', args: ['Bit'] }] }) })
    expect(andDriven.error).toBeUndefined()
    expect((andDriven.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('AND(A,B,D)OTE(Bit);')
    const dtrRail = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'DTR', args: ['Src', 'Mask', 'Ref'] }] }) })
    expect(dtrRail.error?.code).toBe('INVALID_LADDER_SPEC')
    expect(dtrRail.error?.message).toContain('ends in DTR')
    const dtrDriven = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'DTR', args: ['Src', 'Mask', 'Ref'] }, { instr: 'OTE', args: ['Bit'] }] }) })
    expect(dtrDriven.error).toBeUndefined()
    expect((dtrDriven.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('DTR(Src,Mask,Ref)OTE(Bit);')
  })
})

describe('an infinite or NaN check', () => {
  it('takes a REAL tag and cannot end a rung', async () => {
    // ISINF(R)OTE(B) and ISNAN(R)OTE(B) built 0/0; ISINF(D) with a DINT failed INVALIDOPTYPE.
    // Neither name is in the v36 help index, so both were probed against Studio.
    const project = l5x({
      name: 'IsCheckGuard',
      tags: tag('R', 'REAL') + tag('D', 'DINT') + tag('B', 'BOOL'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['isinf.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'isinf.l5x' })).error).toBeUndefined()
    const driven = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ISINF', args: ['R'] }, { instr: 'OTE', args: ['B'] }] }) })
    expect(driven.error).toBeUndefined()
    expect((driven.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('ISINF(R)OTE(B);')
    const rail = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ISINF', args: ['R'] }] }) })
    expect(rail.error?.code).toBe('INVALID_LADDER_SPEC')
    expect(rail.error?.message).toContain('ends in ISINF')
    const intSource = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'ISINF', args: ['D'] }, { instr: 'OTE', args: ['B'] }] }) })
    expect(intSource.error?.code).toBe('INVALID_OPERAND')
    expect(intSource.error?.message).toContain('must be REAL')
  })
})

describe('a tag-only operand slot', () => {
  it('refuses a literal for arrays, structures and copy sources', async () => {
    // COP(Arr,5,10) and NEG(5,5) were accepted before this; Studio refuses a literal in those
    // slots with RxCMP_E_AUDIT_INVALIDOPKIND. The compact instruction table's Dest is covered too.
    const project = l5x({
      name: 'TagOnlyGuard',
      tags: tag('Arr', 'DINT', ' Dimensions="10"') + tag('Arr2', 'DINT', ' Dimensions="10"'),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['tagonly.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'tagonly.l5x' })).error).toBeUndefined()
    const cpsGood = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'CPS', args: ['Arr[0]', 'Arr2[0]', '10'] }] }) })
    expect(cpsGood.error).toBeUndefined()
    expect((cpsGood.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('CPS(Arr[0],Arr2[0],10);')
    // Studio answered MUSTBEDISCRETE for CPS(Arr,Arr2,10); the element form above built 0/0.
    const cpsWhole = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'CPS', args: ['Arr', 'Arr2', '10'] }] }) })
    expect(cpsWhole.error?.code).toBe('INVALID_OPERAND')
    expect(cpsWhole.error?.message).toContain('array element')
    const cpsSource = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'CPS', args: ['5', 'Arr2', '10'] }] }) })
    expect(cpsSource.error?.code).toBe('INVALID_OPERAND')
    expect(cpsSource.error?.message).toContain('needs a tag for Source')
    const cpsDest = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'CPS', args: ['Arr[0]', '5', '10'] }] }) })
    expect(cpsDest.error?.code).toBe('INVALID_OPERAND')
    expect(cpsDest.error?.message).toContain('writable dest')
    const neg = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'NEG', args: ['5', '5'] }] }) })
    expect(neg.error?.code).toBe('INVALID_OPERAND')
    expect(neg.error?.message).toContain('writable dest')
    const copSource = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'COP', args: ['5', 'Arr2', '10'] }] }) })
    expect(copSource.error?.code).toBe('INVALID_OPERAND')
    expect(copSource.error?.message).toContain('needs a tag for Source')
    // Studio answered MUSTBEDISCRETE for COP(Arr,Arr2,10); COP(Arr[0],Arr2[0],10) built 0/0.
    const copWhole = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'COP', args: ['Arr', 'Arr2', '10'] }] }) })
    expect(copWhole.error?.code).toBe('INVALID_OPERAND')
    expect(copWhole.error?.message).toContain('array element')
    const copGood = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'COP', args: ['Arr[0]', 'Arr2[0]', '10'] }] }) })
    expect(copGood.error).toBeUndefined()
    expect((copGood.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('COP(Arr[0],Arr2[0],10);')
    // Studio answered MUSTBEDISCRETE for FLL(5,Arr,10); FLL(5,Arr[0],10) built 0/0.
    const fllWhole = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FLL', args: ['5', 'Arr', '10'] }] }) })
    expect(fllWhole.error?.code).toBe('INVALID_OPERAND')
    expect(fllWhole.error?.message).toContain('array element')
    const fllGood = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'FLL', args: ['5', 'Arr[0]', '10'] }] }) })
    expect(fllGood.error).toBeUndefined()
    expect((fllGood.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('FLL(5,Arr[0],10);')
  })
})

describe('an AOI structure parameter', () => {
  it('requires a tag of the parameter type', async () => {
    // Studio refused a BOOL tag where MAFR_Yaskawa's InOut Axis needs a Yaskawa_EIP_Servo with
    // RxCMP_E_AUDIT_INVALIDOPTYPE, while a tag of the right type built 0/0.
    const project = l5x({
      name: 'AoiStructGuard',
      dataTypes: userType('MyUdt', [member('X', 'DINT')]),
      tags: tag('MyStructAoi_1', 'MyStructAoi') + tag('Axis', 'MyUdt') + tag('NotAxis', 'BOOL'),
      aois: aoi('MyStructAoi', { parameters: [parameter('Axis', { usage: 'InOut', dataType: 'MyUdt' })] }),
      programs: program('Main', rllRoutine('MainRoutine', [])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['struct.l5x', new TextEncoder().encode(project)]]), { editing: true })
    expect((await l5xTool.call('l5x_open_project', { path: 'struct.l5x' })).error).toBeUndefined()
    const good = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyStructAoi', args: ['MyStructAoi_1', 'Axis'] }] }) })
    expect(good.error).toBeUndefined()
    expect((good.data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs?.[0]?.neutral_text).toBe('MyStructAoi(MyStructAoi_1,Axis);')
    const wrong = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyStructAoi', args: ['MyStructAoi_1', 'NotAxis'] }] }) })
    expect(wrong.error?.code).toBe('INVALID_OPERAND')
    expect(wrong.error?.message).toContain('needs MyUdt')
    const literal = await l5xTool.call('l5x_compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'MyStructAoi', args: ['MyStructAoi_1', '5'] }] }) })
    expect(literal.error?.code).toBe('INVALID_OPERAND')
    expect(literal.error?.message).toContain('needs a tag')
  })
})
