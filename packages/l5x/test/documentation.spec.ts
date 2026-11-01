/**
 * The documentation bundle: files, counts, filters and refusals.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fixtureBytes, harness } from './harness.ts'
import { l5x, member, module, program, rllRoutine, tag, task, userType } from './l5x-build.ts'

/** Open the fixture with the editing entry mounted. */
async function opened() {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** Paths written under one root, relative to it. */
function writtenUnder(l5x: ReturnType<typeof harness>, root: string): string[] {
  return [...l5x.written.keys()].filter(path => path.startsWith(`${root}/`)).map(path => path.slice(root.length + 1)).sort()
}

describe('document_project', () => {
  it('writes the project, I/O, tag and rung documents', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs' })
    expect(result.error).toBeUndefined()
    const files = writtenUnder(l5x, 'docs')
    expect(files).toContain('PROJECT.md')
    expect(files).toContain('io.md')
    expect(files).toContain('io.csv')
    expect(files).toContain('tags.csv')
    expect(files).toContain('tags-studio.csv')
    expect(files).toContain('rungs/MainProgram.md')
    expect(files).toContain('rungs/MotorProgram.md')
    expect(result.data?.counts).toMatchObject({ programs: 2, routines: 3, rungs: 11, comments: 11 })
  })

  it('summarises the project with its tasks and programs', async () => {
    const l5x = await opened()
    await l5x.call('document_project', { output_root: 'docs' })
    const project = l5x.written.get('docs/PROJECT.md') ?? ''
    expect(project).toContain('# SampleController project documentation')
    expect(project).toContain('| Program | Main routine | Routines | Safety | Description |')
    expect(project).toContain('MainProgram')
    expect(project).toContain('rungs: 11 (11 with comments)')
  })

  it('writes a tag CSV with one row per declared tag and the Studio import shape', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs' })
    const tags = l5x.written.get('docs/tags.csv') ?? ''
    const studio = l5x.written.get('docs/tags-studio.csv') ?? ''
    const declared = (result.data?.counts as { tags: number }).tags
    expect(tags.split('\n')[0]).toBe('scope,name,data_type,description,alias_for,dimensions,external_access,safety')
    expect(tags.trimEnd().split('\n').length).toBe(declared + 1)
    expect(studio.split('\n')[0]).toBe('Tag Name,Description')
    expect(studio.trimEnd().split('\n').length).toBe(declared + 1)
  })

  it('documents rungs with their comments and instructions', async () => {
    const l5x = await opened()
    await l5x.call('document_project', { output_root: 'docs' })
    const rungs = l5x.written.get('docs/rungs/MotorProgram.md') ?? ''
    expect(rungs).toContain('### Rung 0')
    expect(rungs).toContain('Child-element comment, the shape current Studio exports write.')
    expect(rungs).toContain('XIC(Motor_1.RunCommand) XIO(VFD_Fault) OTE(VFD_Running) ;')
    expect(rungs).toContain('Instructions: XIC, XIO, OTE.')
  })

  it('honours the include filter', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs', include: ['tags'] })
    expect(result.error).toBeUndefined()
    expect(writtenUnder(l5x, 'docs')).toEqual(['tags-studio.csv', 'tags.csv'])
  })

  it('restricts the bundle to one program', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs', programs: ['MotorProgram'] })
    expect(result.error).toBeUndefined()
    expect(result.data?.counts).toMatchObject({ programs: 1, routines: 1, rungs: 4 })
    expect([...l5x.written.keys()].some(path => path.includes('MainProgram'))).toBe(false)
  })

  it('refuses an output folder that already exists', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'sample.l5x' })
    expect(result.error?.code).toBe('OUTPUT_EXISTS')
  })

  it('refuses an unknown program with candidates', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs', programs: ['NoSuchProgram'] })
    expect(result.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(result.error?.message).toContain('NoSuchProgram')
  })
})


describe('documenting a routine that is not ladder', () => {
  it('writes a Structured Text routine as its source', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    await l5x.call('open_project', { path: 'sample.l5x' })
    const bundle = await l5x.call('document_project', { output_root: 'docs' })
    expect(bundle.error).toBeUndefined()
    const text = [...l5x.written].filter(([path]) => path.includes('rungs')).map(([, content]) => content).join(' | ')
    expect(text).toContain('## FaultHandler')
    // The source is the logic, so it is quoted rather than dropped.
    // The source is the logic, so it is quoted rather than dropped.
    const section = text.split('## FaultHandler')[1] ?? ''
    expect(section.split('```').length).toBeGreaterThan(2)
  })

  it('writes a function block diagram as an element table', async () => {
    const synthetic = new Uint8Array(readFileSync(new URL('./fixtures/engineering-synthetic.l5x', import.meta.url)))
    const l5x = harness(new Map([['synthetic.l5x', synthetic]]))
    await l5x.call('open_project', { path: 'synthetic.l5x' })
    expect((await l5x.call('document_project', { output_root: 'docs' })).error).toBeUndefined()
    const doc = l5x.written.get('docs/rungs/Main.md') ?? ''
    expect(doc).toContain('## Diagram')
    expect(doc).toContain('Function block diagram')
    expect(doc).toContain('| IRef | Start |')
    expect(doc).toContain('| Wire |')
  })

  it('writes a sequential function chart as an element table', async () => {
    const synthetic = new Uint8Array(readFileSync(new URL('./fixtures/engineering-synthetic.l5x', import.meta.url)))
    const l5x = harness(new Map([['synthetic.l5x', synthetic]]))
    await l5x.call('open_project', { path: 'synthetic.l5x' })
    expect((await l5x.call('document_project', { output_root: 'docs' })).error).toBeUndefined()
    const doc = l5x.written.get('docs/rungs/Main.md') ?? ''
    expect(doc).toContain('## Chart')
    expect(doc).toContain('Sequential function chart')
    expect(doc).toContain('Step')
  })
})


/** An export whose routine bodies are encrypted. */
const DOC_PROTECTED_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"DocProtected\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines>\n      <EncodedData EncodedType=\"Routine\" Name=\"R\"/>\n      <EncodedData EncodedType=\"Routine\" Name=\"S\"/>\n    </Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('documenting a source-protected export', () => {
  it('says how many bodies were encrypted rather than reporting zero routines', async () => {
    const l5x = harness(new Map([['p.l5x', new TextEncoder().encode(DOC_PROTECTED_L5X)]]), { editing: true })
    await l5x.call('open_project', { path: 'p.l5x' })
    const result = await l5x.call('document_project', { output_root: 'docs-protected' })
    expect(result.error).toBeUndefined()
    expect(String(result.summary)).toContain('2 source-protected')
    const all = [...l5x.written.values()].map(value => String(value)).join('\n')
    expect(all).toContain('Source-protected routines: 2')
    // A handover bundle names them, not just the count.
    expect(all).toContain('## Source-protected routines')
    expect(all).toMatch(/\| P \| [RS] \|/)
  })
})

/** A controller whose export remembers its project serial number and saved route. */
const DOC_ROUTE_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="DocRoute" ProcessorType="1756-L81ES" MajorRev="36" MinorRev="11" CommPath="CIM_Prep/10.211.100.100/Backplane/0" ProjectSN="16#0163_1759">
    <Tags/>
    <Programs><Program Name="P" MainRoutineName="R"><Routines><Routine Name="R" Type="RLL"><RLLContent/></Routine></Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

describe('documenting a routed project', () => {
  it('states the project serial and saved path in the overview', async () => {
    const l5x = harness(new Map([['dr.l5x', new TextEncoder().encode(DOC_ROUTE_L5X)]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'dr.l5x' })).error).toBeUndefined()
    expect((await l5x.call('document_project', { output_root: 'docs-route' })).error).toBeUndefined()
    const all = [...l5x.written.values()].map(value => String(value)).join('\n')
    expect(all).toContain('Project serial: 16#0163_1759')
    expect(all).toContain('saved path: CIM_Prep/10.211.100.100/Backplane/0')
  })
})

/** One project with every kind of safety fact the export can declare. */
const DOC_SAFETY_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="DocSafety" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Tags/>
    <Modules>
      <Module Name="SA_DIG_IN_1" CatalogNumber="1756-IB16S/A" Vendor="1" ProductType="35" ProductCode="33" Major="1" Minor="11" ParentModule="Local" ParentModPortId="1" Inhibited="false" MajorFault="false" SafetyEnabled="true" SafetyNetwork="16#0000_4bc3"/>
    </Modules>
    <AddOnInstructionDefinitions>
      <AddOnInstructionDefinition Name="FC_SFTY_SSOV" Class="Safety" Revision="1.0" ExecutePrescan="true" ExecutePostscan="false" ExecuteEnableInFalse="true">
        <Parameters><Parameter Name="In" Usage="Input" DataType="BOOL" Required="true" Visible="true" ExternalAccess="Read/Write"/></Parameters>
      </AddOnInstructionDefinition>
    </AddOnInstructionDefinitions>
    <Programs>
      <Program Name="Guard" MainRoutineName="R" Class="Safety"><Routines><Routine Name="R" Type="RLL"><RLLContent/></Routine></Routines></Program>
    </Programs>
    <Tasks><Task Name="SafetyTask" Type="PERIODIC" Rate="20" Priority="10" Class="Safety"><ScheduledPrograms><ScheduledProgram Name="Guard"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

describe('documenting a safety project', () => {
  it('names the safety task, program, I/O module and AOI', async () => {
    const l5x = harness(new Map([['ds.l5x', new TextEncoder().encode(DOC_SAFETY_L5X)]]), { editing: true })
    await l5x.call('open_project', { path: 'ds.l5x' })
    expect((await l5x.call('document_project', { output_root: 'docs-safety' })).error).toBeUndefined()
    const all = [...l5x.written.values()].map(value => String(value)).join('\n')
    expect(all).toContain('## Safety')
    expect(all).toContain('| Safety task | SafetyTask |')
    expect(all).toContain('| Safety program | Guard |')
    expect(all).toContain('| Safety I/O module | 1: SA_DIG_IN_1 |')
    expect(all).toContain('| Safety AOI | FC_SFTY_SSOV |')
    // The bundle must list the AOI definition, not only its safety row.
    expect(all).toContain('## Add-On Instructions')
    expect(all).toContain('| FC_SFTY_SSOV | 1.0 | yes | 1 | 0 |')
  })
})

/** An AOI whose Logic routine carries a ladder rung, so the bundle has something to document. */
const DOC_AOI_LOGIC_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="DocAoiLogic" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Tags><Tag Name="A" TagType="Base" DataType="BOOL"/></Tags>
    <AddOnInstructionDefinitions>
      <AddOnInstructionDefinition Name="AOI_Step" Class="Standard" Revision="1.0" ExecutePrescan="true" ExecutePostscan="false" ExecuteEnableInFalse="false">
        <Parameters><Parameter Name="In" Usage="Input" DataType="BOOL" Required="true" Visible="true" ExternalAccess="Read/Write"/></Parameters>
        <Routines>
          <Routine Name="Logic" Type="RLL"><RLLContent><Rung Number="0" Type="N"><Comment><![CDATA[AOI logic rung]]></Comment><Text><![CDATA[XIC(A)OTE(A);]]></Text></Rung></RLLContent></Routine>
        </Routines>
      </AddOnInstructionDefinition>
    </AddOnInstructionDefinitions>
  </Controller>
</RSLogix5000Content>`

describe('documenting an AOI routine', () => {
  it('writes the AOI logic to its own rung file', async () => {
    const l5x = harness(new Map([['dl.l5x', new TextEncoder().encode(DOC_AOI_LOGIC_L5X)]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'dl.l5x' })).error).toBeUndefined()
    const documented = await l5x.call('document_project', { output_root: 'docs-aoi', include: ['rungs'] })
    expect(documented.error).toBeUndefined()
    // The count must include what the bundle writes; "1 routine" alone hid the AOI's logic.
    expect(documented.data?.counts?.aoiRoutines).toBe(1)
    expect(String(documented.summary)).toContain('1 AOI routine(s)')
    const entry = [...l5x.written.entries()].find(([key]) => String(key).endsWith('AOI-AOI_Step.md'))
    expect(entry).toBeDefined()
    const doc = String(entry?.[1] ?? '')
    expect(doc).toContain('## Logic')
    expect(doc).toContain('### Rung 0')
    expect(doc).toContain('AOI logic rung')
  })
})

describe('the data type table', () => {
  it('lists each user type with its member count', async () => {
    const built = l5x({
      name: 'UdtDocs',
      dataTypes: userType('MY_UDT', [member('A'), member('B')]),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['ud.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'ud.l5x' })).error).toBeUndefined()
    const documented = await l5xTool.call('document_project', { output_root: 'docs-udt', include: ['project'] })
    expect(documented.error).toBeUndefined()
    expect(Number(documented.data?.counts?.udts)).toBe(1)
    const project = String([...l5xTool.written.entries()].find(([key]) => String(key).endsWith('PROJECT.md'))?.[1] ?? '')
    expect(project).toContain('## Data Types')
    expect(project).toContain('| MY_UDT | 2 |')
    expect(project).toContain('data types: 1')
  })
})

describe('the I/O list', () => {
  it('marks safety modules and their network', async () => {
    const built = l5x({
      name: 'IoList',
      modules: [
        module('SA_IN', '1756-IB16S/A', { safety: true, safetyNetwork: '16#0000_4bc3' }),
        module('Local:3', '5069-IB16'),
      ].join(''),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['io.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'io.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('document_project', { output_root: 'docs-io', include: ['io'] })).error).toBeUndefined()
    const all = [...l5xTool.written.values()].map(value => String(value)).join('\n')
    expect(all).toContain('| Safety | Safety network |')
    expect(all).toMatch(/\| SA_IN \| 1756-IB16S\/A \|[^|]*\|[^|]*\| false \| true \| 16#0000_4bc3 \|/)
    expect(all).toContain(',true,16#0000_4bc3,')
  })
})

describe('the review summary', () => {
  it('reports the check findings in the project summary', async () => {
    const built = l5x({
      name: 'WithFindings',
      tags: tag('Orphan'),
      programs: program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }])),
      tasks: task('MainTask', ['Main']),
    })
    const l5xTool = harness(new Map([['rf.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'rf.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('document_project', { output_root: 'docs-findings', include: ['project'] })).error).toBeUndefined()
    const project = String([...l5xTool.written.entries()].find(([key]) => String(key).endsWith('PROJECT.md'))?.[1] ?? '')
    expect(project).toContain('## Review findings')
    expect(project).toContain('UNUSED_TAG')
    expect(project).toContain('absence of findings does not prove controller safety')
    // A reviewer reading only the bundle must be able to act on the most common rule.
    expect(project).toContain('Most common rule, UNUSED_TAG:')
    expect(project).toContain('HMI-only')
  })
})

describe('the tag CSV safety column', () => {
  it('marks a tag declared in a safety program and not one in standard logic', async () => {
    const built = l5x({
      name: 'TagSafety',
      programs: [
        program('Guard', rllRoutine('MainRoutine', [{ text: 'NOP();' }]), { safety: true, tags: tag('SafeTag') }),
        program('Main', rllRoutine('MainRoutine', [{ text: 'NOP();' }]), { tags: tag('PlainTag') }),
      ].join(''),
      tasks: [task('MainTask', ['Main']), task('SafetyTask', ['Guard'], { safety: true, type: 'PERIODIC', rate: '20', priority: '10' })].join(''),
    })
    const l5xTool = harness(new Map([['ts.l5x', new TextEncoder().encode(built)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'ts.l5x' })).error).toBeUndefined()
    expect((await l5xTool.call('document_project', { output_root: 'docs-tags', include: ['tags'] })).error).toBeUndefined()
    const csv = String([...l5xTool.written.entries()].find(([key]) => String(key).endsWith('tags.csv'))?.[1] ?? '')
    expect(csv.split('\n')[0]).toContain(',safety')
    expect(csv).toContain('Guard,SafeTag,')
    expect(csv).toMatch(/Guard,SafeTag,[^\n]*,true$/mu)
    expect(csv).toMatch(/Main,PlainTag,[^\n]*,false$/mu)
    // The listing and the reader must agree with the CSV.
    const listed = await l5xTool.call('list_components', { kind: 'tag', limit: 20 })
    const rows = (listed.data?.rows ?? []) as { name: string; scope: string; safety?: boolean }[]
    expect(rows.find(row => row.name === 'SafeTag' && row.scope === 'Guard')?.safety).toBe(true)
    expect(rows.find(row => row.name === 'PlainTag' && row.scope === 'Main')?.safety).toBe(false)
    const safe = await l5xTool.call('get_component', { kind: 'tag', name: 'SafeTag', scope: 'Guard' })
    expect(safe.data?.component?.safety).toBe(true)
    const plain = await l5xTool.call('get_component', { kind: 'tag', name: 'PlainTag', scope: 'Main' })
    expect(plain.data?.component?.safety).toBeUndefined()
  })
})
