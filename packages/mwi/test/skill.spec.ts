/**
 * The skill registration contract.
 */
import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name, SKILL } from '../src/skill.ts'

interface Registration {
  readonly name: string
  readonly description: string
  readonly whenToUse: string
  readonly content: string
  readonly path: string
  readonly source: string
  readonly provider: string
  readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
}

/** A context whose skills service captures one registration. */
function harness(): { registrations: Registration[]; ctx: { get(name: string): unknown } } {
  const registrations: Registration[] = []
  return {
    registrations,
    ctx: {
      get(name: string) {
        return name === 'skills' ? { register(skill: Registration) { registrations.push(skill) } } : undefined
      },
    },
  }
}

/** Read the frontmatter fields that must match the registration constants. */
function frontmatter(raw: string): Record<string, string> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(raw)?.[1] ?? ''
  return Object.fromEntries(block.split(/\r?\n/u).map(line => {
    const [key, ...rest] = line.split(':')
    return [key?.trim() ?? '', rest.join(':').trim()]
  }))
}

describe('motionworks-iec skill', () => {
  it('registers with the redesigned identity and an invocable contract', () => {
    const { registrations, ctx } = harness()
    apply(ctx)
    expect(registrations).toHaveLength(1)
    const [skill] = registrations
    expect(skill?.name).toBe('motionworks-iec')
    expect(skill?.provider).toBe('@aryacode/dsh-engineering-mwi')
    expect(skill?.source).toBe('custom')
    expect(skill?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(skill?.path.endsWith('SKILL.md')).toBe(true)
    expect(name).toBe('mwi-skill')
    expect(inject).toEqual(['skills'])
  })

  it('keeps the guidance inside the 8k budget and free of frontmatter', () => {
    const { registrations, ctx } = harness()
    apply(ctx)
    const content = registrations[0]?.content ?? ''
    expect(content.length).toBeGreaterThan(500)
    expect(content.length).toBeLessThanOrEqual(8000)
    expect(content.startsWith('---')).toBe(false)
    for (const tool of ['mw_project_find', 'mw_project_stage', 'mw_project_open', 'mw_validate', 'mw_apply']) {
      expect(content).toContain(tool)
    }
  })

  it('keeps the registered constants in step with the frontmatter', async () => {
    const raw = await import('node:fs').then(fs => fs.readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8'))
    const fields = frontmatter(raw)
    expect(fields.name).toBe(SKILL.name)
    expect(fields.description).toBe(SKILL.description)
    expect(fields.whenToUse).toBe(SKILL.whenToUse)
  })

  it('skips registration on a host that cannot run the IDE', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    try {
      const { registrations, ctx } = harness()
      expect(() => apply(ctx)).not.toThrow()
      expect(registrations).toHaveLength(0)
    } finally {
      platform.mockRestore()
    }
  })

  it('fails loud when the skill service is missing', () => {
    expect(() => apply({ get: () => undefined })).toThrow(/skills service is unavailable/u)
  })
})
