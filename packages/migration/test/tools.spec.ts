import { describe, expect, it } from 'vitest'
import { migrationTools } from '../src/tools.ts'
import type { FsService } from '../src/core/tool.ts'

/** A filesystem that serves bytes from an in-memory map, and records writes. */
function fakeFs(files: Readonly<Record<string, string | Uint8Array>>, folders: Readonly<Record<string, readonly { name: string; type: string }[]>> = {}): FsService {
  const store = new Map<string, string | Uint8Array>(Object.entries(files))
  return {
    resolve: async (path: string) => ({ targetKey: path, displayPath: path }),
    stat: async (target: { displayPath: string }) => (store.has(target.displayPath) ? { type: 'file' } : undefined),
    readBytes: async (target: { displayPath: string }) => {
      const value = store.get(target.displayPath)
      if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return typeof value === 'string' ? new TextEncoder().encode(value) : value
    },
    list: async (target: { displayPath: string }) => folders[target.displayPath] ?? [],
    writeText: async (target: { displayPath: string }, text: string) => {
      store.set(target.displayPath, text)
    },
  }
}

const tools = migrationTools(fakeFs({
  'C:\\x\\sheet.slc': [
    'START 1747-L542C % 5/04 CPU - 32K Mem. OS401 Series C FRN 3-8 %',
    '1 1746-A7',
    '2 1746-A7',
    'LADDER 2 - Total Rungs in File = 3',
    '% Rung: 0 %',
    'SOR XIC S:1/15 EOR',
    '% Rung: 1 %',
    'SOR XIC S:1/15 EOR',
    'LADDER 3 - Total Rungs in File = 1',
    '% Rung: 0 %',
    'SOR XIC S:1/15 EOR',
    'DATA B3:0',
  ].join('\r\n'),
  'C:\\x\\broken.l5k': 'CONTROLLER CNTRLR (\r\n\t\tProcessorType := 5069-L330ER,\r\n\t\tMajor := 31\r\n\t\t)\r\nTAG\r\n  Start : BOOL;\r\nEND_TAG\r\nN:  XIC(Start) OTE(Start);\r\n',
  'C:\\x\\notes.txt': 'hello',
  'C:\\x\\machine.rss': new Uint8Array([0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a]),
}))

const exec = { cwd: 'C:\\x' }
const find = (name: string) => tools.find(tool => tool.name === name)!

describe('migration_assess', () => {
  it('counts the sections of an SLC text export', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\sheet.slc' }, exec) as any
    expect(answer.summary).toContain('SLC export for 1747-L542C')
    expect(answer.summary).toContain('2 ladder file(s), 3 rung(s)')
    expect(answer.data.format).toBe('SLC')
    expect(answer.data.facts.racks).toBe(2)
    expect(answer.data.facts.data_files).toEqual(['B3'])
    expect(answer.data.checks.edits_possible_here).toBe(false)
  })

  it('lints an L5K and reports whether the import would be ready', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\broken.l5k' }, exec) as any
    expect(answer.data.format).toBe('L5K')
    expect(answer.data.import_ready).toBe(true)
    expect(answer.data.build_gate).toContain('revision 37')
  })

  it('says an RSS container has to be converted in RSLogix 500', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\machine.rss' }, exec) as any
    expect(answer.summary).toContain('RSLogix 500 container')
    expect(answer.data.checks.text_readable).toBe(false)
  })

  it('refuses a format it cannot read', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\notes.txt' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })

  it('reports a missing file as a code, not a stack trace', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\gone.l5k' }, exec) as any
    expect(answer.error.code).toBe('FILE_MISSING')
    expect(answer.error.fix).toContain('existing')
  })

  it('names the same-stem files the folder does hold', async () => {
    const listing = migrationTools(fakeFs(
      { 'C:\\x\\notes.txt': 'hello' },
      { 'C:/x': [{ name: 'fixed10.l5x', type: 'file' }, { name: 'FIXED10.slc', type: 'file' }, { name: 'notes.txt', type: 'file' }, { name: 'x.l5x', type: 'file' }] },
    ))
    const answer = await listing.find(tool => tool.name === 'migration_assess')!.execute({ path: 'C:\\x\\fixed10.l5k' }, exec) as any
    expect(answer.error.code).toBe('FILE_MISSING')
    expect(answer.error.message).toContain('the folder holds fixed10.l5x, FIXED10.slc')
    expect(answer.error.candidates).toEqual(['fixed10.l5x', 'FIXED10.slc'])
  })
})

const AUDIT_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="33.01">
<Controller Use="Target" Name="MIGRATED" ProcessorType="1756-L85E" MajorRev="33" MinorRev="0">
<Modules Use="Context">
<Module Name="Local:1" CatalogNumber="1756-L85E" ParentModule="Local"></Module>
<Module Name="" CatalogNumber="1746-IV8" ParentModule="Local">
<Channel Name="Ch0"><Attribute Name="Range" Value="4"/><Attribute Name="LowEngineering" Value="0"/><Attribute Name="HighEngineering" Value="100"/></Channel>
<Channel Name="Ch1"><Attribute Name="Range" Value="4"/><Attribute Name="LowEngineering" Value="0"/><Attribute Name="HighEngineering" Value="100"/></Channel>
</Module>
<Module Name="OK_Module" CatalogNumber="1756-IB16" ParentModule="Local"></Module>
</Modules>
<Programs Use="Context"><Program Use="Target" Name="MainProgram">
<Routines Use="Context"><Routine Use="Target" Name="_5_FAULT" Type="RLL">
<RLLContent Use="Target">
<RungInfo Number="0"><Text><![CDATA[XIC(Local:1:I:0.0 + S24)OTE(X);]]></Text></RungInfo>
<RungInfo Number="1"><Text><![CDATA[PCE(152,PCE001);]]></Text></RungInfo>
<RungInfo Number="2"><Text><![CDATA[XIC(B3:1/0)OTE(Y);]]></Text></RungInfo>
</RLLContent>
</Routine></Routines>
</Program></Programs>
</Controller></RSLogix5000Content>`

describe('migration_assess on an imported L5X', () => {
  const auditFs = migrationTools(fakeFs({ 'C:\\x\\imported.l5x': AUDIT_L5X }))
  const assess = (path: string) => auditFs.find(tool => tool.name === 'migration_assess')!.execute({ path }, exec) as any

  it('audits the wizard defaults and names every rule that fired', async () => {
    const answer = await assess('C:\\x\\imported.l5x')
    expect(answer.summary).toContain('imported L5X audited against wizard defaults')
    expect(answer.data.facts).toMatchObject({ modules: 3, rungs: 3, analog_channels: 2 })
    const rules = answer.data.findings.map((finding: any) => finding.rule)
    expect(rules).toEqual(expect.arrayContaining([
      'MODULE_NAME_ILLEGAL', 'LEGACY_CHASSIS_DECLARED', 'WIZARD_ANALOG_DEFAULT', 'MODULE_UNNAMED', 'WIZARD_ARTIFACT', 'RESIDUAL_MARKERS',
    ]))
    const illegal = answer.data.findings.find((finding: any) => finding.rule === 'MODULE_NAME_ILLEGAL')
    expect(illegal.severity).toBe('critical')
    expect(illegal.detail).toContain('Name="Local:1"')
    expect(answer.summary).toContain('1 blocking')
  })

  it('passes a clean export with no findings', async () => {
    const clean = AUDIT_L5X
      .replace('Name="Local:1"', 'Name="Local_1"')
      .replace('CatalogNumber="1746-IV8"', 'CatalogNumber="1756-IF8"')
      .replace('Name=""', 'Name="IO_2"')
      .replaceAll('Value="4"', 'Value="2"')
      .replaceAll('Value="100"', 'Value="32767"')
      .replace(' + S24', '')
      .replace('PCE(152,PCE001);', 'CLR(S[11]);')
    const fs = migrationTools(fakeFs({ 'C:\\x\\clean.l5x': clean }))
    const answer = await fs.find(tool => tool.name === 'migration_assess')!.execute({ path: 'C:\\x\\clean.l5x' }, exec) as any
    expect(answer.data.findings).toHaveLength(0)
    expect(answer.summary).toContain('0 finding(s)')
  })
})

describe('l5k_lint', () => {
  it('reports the trailing comma that stops the Studio import', async () => {
    const fs = fakeFs({
      'C:\\x\\comma.l5k': 'CONTROLLER CNTRLR (\r\n\t\tProcessorType := 5069-L330ER,\r\n\t\tAttribute := 1.0,\r\n\t\t)\r\n',
    })
    const lint = migrationTools(fs).find(tool => tool.name === 'l5k_lint')!
    const answer = await lint.execute({ path: 'C:\\x\\comma.l5k' }, exec) as any
    expect(answer.summary).toContain('1 error(s)')
    expect(answer.data.import_ready).toBe(false)
    expect(answer.data.findings[0].rule).toBe('TRAILING_COMMA')
    expect(answer.data.findings[0].line).toBe(3)
  })

  it('refuses a file that is not an L5K', async () => {
    const answer = await find('l5k_lint').execute({ path: 'C:\\x\\sheet.slc' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })
})

describe('migration_plan', () => {
  const planFs = () => fakeFs({ 'C:\\x\\machine.rss': new Uint8Array([0xcf, 0x11, 0xe0, 0xa1]) })
  const plan = (fs: FsService) => migrationTools(fs).find(tool => tool.name === 'migration_plan')!

  it('creates a blocked plan that records the interview questions', async () => {
    const answer = await plan(planFs()).execute({ action: 'create', source: 'C:\\x\\machine.rss', family: 'slc500' }, exec) as any
    expect(answer.summary).toContain('5 interview question(s)')
    expect(answer.data.state).toBe('blocked')
    expect(answer.data.plan.stages).toHaveLength(8)
    expect(answer.data.plan.source.family).toBe('slc500')
  })

  it('records answers, stage evidence and an exception, and reads them back', async () => {
    const fs = planFs()
    const tool = plan(fs)
    await tool.execute({ action: 'create', source: 'C:\\x\\machine.rss' }, exec)
    const answered = await tool.execute({
      action: 'answer',
      target_cpu: '5069-L330ER',
      target_revision: 37,
      io_strategy: 'Keep the 1746 chassis behind a 1747-AENTR bridge.',
      hmi_scope: 'Recorded for later.',
      acceptance: 'An offline build passes.',
    }, exec) as any
    expect(answered.data.state).toBe('active')
    const staged = await tool.execute({ action: 'stage', stage: 'assess', status: 'done', evidence: 'slc_read: 76 program files' }, exec) as any
    expect(staged.data.plan.stages[1]?.status).toBe('done')
    expect(staged.data.plan.stages[1]?.evidence).toEqual(['slc_read: 76 program files'])
    const excepted = await tool.execute({
      action: 'exception',
      id: 'indirect-N7-130',
      kind: 'indirect',
      description: 'N[N7:130] indexes a data file.',
      rationale: 'Rewrite as an indexed array.',
      exception_status: 'accepted',
    }, exec) as any
    expect(excepted.data.open_exceptions).toBe(0)
    const artifact = await tool.execute({
      action: 'exception',
      id: 'wizard-artifact-rung-16-4',
      kind: 'wizard_artifact',
      description: 'N10[N48_2 + S24] carries the wizard byte-swap token.',
      rationale: 'Rewrite as N10[N48_2], swap the stored words in the consumer.',
      exception_status: 'open',
    }, exec) as any
    expect(artifact.data.open_exceptions).toBe(1)
    const read = await tool.execute({ action: 'read' }, exec) as any
    expect(read.data.plan.decisions.target_cpu).toBe('5069-L330ER')
    expect(read.data.plan.exceptions).toHaveLength(2)
    expect(read.data.plan.exceptions[1]?.kind).toBe('wizard_artifact')
  })

  it('refuses to read a plan that was never created', async () => {
    const answer = await plan(planFs()).execute({ action: 'read' }, exec) as any
    expect(answer.error.code).toBe('PLAN_MISSING')
  })
})

describe('migration_compare', () => {
  it('refuses a source that is not an RSLogix 500 project', async () => {
    const answer = await find('migration_compare').execute({ source: 'C:\\x\\sheet.slc', logix: 'C:\\x\\a.l5x' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })

  it('refuses a Logix side that is not an L5X', async () => {
    const answer = await find('migration_compare').execute({ source: 'C:\\x\\machine.rss', logix: 'C:\\x\\sheet.l5k' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })
})
