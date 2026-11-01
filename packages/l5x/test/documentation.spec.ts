/**
 * The documentation bundle: files, counts, filters and refusals.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fixtureBytes, harness } from './harness.ts'

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
    expect(project).toContain('| Program | Main routine | Routines | Description |')
    expect(project).toContain('MainProgram')
    expect(project).toContain('rungs: 11 (11 with comments)')
  })

  it('writes a tag CSV with one row per declared tag and the Studio import shape', async () => {
    const l5x = await opened()
    const result = await l5x.call('document_project', { output_root: 'docs' })
    const tags = l5x.written.get('docs/tags.csv') ?? ''
    const studio = l5x.written.get('docs/tags-studio.csv') ?? ''
    const declared = (result.data?.counts as { tags: number }).tags
    expect(tags.split('\n')[0]).toBe('scope,name,data_type,description,alias_for,dimensions,external_access')
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
  })
})
