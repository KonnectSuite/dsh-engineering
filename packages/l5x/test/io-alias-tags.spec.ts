import { describe, expect, it } from 'vitest'
import { harness, type Harness } from './harness.ts'
import { aliasTag, l5x, member, module, program, rllRoutine, tag, tagDefinition, task, userType } from './l5x-build.ts'

/**
 * An alias to an I/O point is what a real export carries, and it is the shape the reader used to
 * refuse. A module contributes its tags through `TagDefinition`, and the image type that names the
 * member is never declared as a `DataType` in the export, so `Local:1:I.Pt12.Data` could not be
 * checked and every edit of a rung touching `DI_Gate_Fault` was blocked on a file that imports and
 * builds in Studio without complaint.
 */
async function opened(): Promise<Harness> {
  const source = l5x({
    name: 'IoAlias',
    dataTypes: userType('Motor', [member('Running'), member('Speed', { dataType: 'REAL' })]),
    tags: [
      tag('Start'),
      tag('Gate_Run'),
      tag('Motor_1', 'Motor'),
      aliasTag('DI_Gate_Fault', 'Local:1:I.Pt12.Data'),
      aliasTag('DI_NotExported', 'Local:9:O.Pt3.Data'),
    ].join(''),
    modules: module('Local:1', '1756-IB16', { slot: '1', tagDefinitions: tagDefinition('Local:1:I', '1756-IB16/Data', 'DI') }),
    programs: program('MainProgram', rllRoutine('MainRoutine', [{ text: 'XIC(Start)OTE(Gate_Run);' }])),
    tasks: task('MainTask', ['MainProgram']),
  })
  const l5xTool = harness(new Map([['io.l5x', new TextEncoder().encode(source)]]), { editing: true })
  const open = await l5xTool.call('l5x_open_project', { path: 'io.l5x' })
  expect(open.error).toBeUndefined()
  return l5xTool
}

describe('aliases to module tags', () => {
  it('resolves an alias through the tag definition its module contributes', async () => {
    const l5xTool = await opened()
    const resolved = await l5xTool.call('l5x_resolve_tag', { address: 'DI_Gate_Fault' })
    expect(resolved.error).toBeUndefined()
    const data = resolved.data as Record<string, unknown>
    expect(data.resolved).toBe(true)
    expect(data.canonical).toBe('controller::Local:1:I.Pt12.Data')
    // The point resolves; only the member is unverifiable, and the answer says so.
    expect(data.type_unverified).toBe(true)
    expect(String(data.reason)).toContain('Pt12')
    expect(String(data.reason)).toContain('1756-IB16/Data is not declared in this export')
    expect(resolved.summary).toContain('resolves to controller::Local:1:I.Pt12.Data')
    expect(resolved.summary).toContain('not declared in this export')
    expect(resolved.coverage?.complete).toBe(false)
    expect(resolved.coverage?.unverified[0]).toContain('Member Pt12 cannot be checked')
  })

  it('resolves an alias whose target the export does not carry, and names the gap', async () => {
    const l5xTool = await opened()
    const resolved = await l5xTool.call('l5x_resolve_tag', { address: 'DI_NotExported' })
    expect(resolved.error).toBeUndefined()
    const data = resolved.data as Record<string, unknown>
    expect(data.resolved).toBe(true)
    expect(String(data.reason)).toBe('Alias target Local:9:O.Pt3.Data is absent from the export')
    expect(resolved.summary).toContain('absent from the export')
  })

  it('accepts a rung operand that walks an alias into an I/O image', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'XIC(DI_Gate_Fault)XIO(Start)OTE(Gate_Run);',
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'alias-rung.l5x' })
    expect(applied.error).toBeUndefined()
    expect(l5xTool.written.get('alias-rung.l5x')).toContain('<Text><![CDATA[XIC(DI_Gate_Fault)XIO(Start)OTE(Gate_Run);]]></Text>')
  })

  it('still refuses a member absent from a type the export does declare', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'XIC(Motor_1.Bogus)OTE(Gate_Run);',
    })
    expect(staged.error?.code).toBe('TAG_NOT_FOUND')
    expect(staged.error?.message).toContain('Member Bogus is absent from Motor')
  })
})
