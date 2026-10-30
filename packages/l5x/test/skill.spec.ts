import { describe, expect, it } from 'vitest'
import { apply, SKILL } from '../src/skill.ts'

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

describe('rockwell-l5x skill', () => {
  it('registers the skill with the guidance body and an invocable identity', () => {
    const { registrations, ctx } = harness()
    apply(ctx)
    expect(registrations).toHaveLength(1)
    const [skill] = registrations
    expect(skill?.name).toBe('rockwell-l5x')
    expect(skill?.provider).toBe('@aryacode/dsh-engineering-l5x')
    expect(skill?.source).toBe('custom')
    expect(skill?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(skill?.path.endsWith('SKILL.md')).toBe(true)
    expect(skill?.description).toBe(SKILL.description)
  })

  it('registers the guidance body free of frontmatter', () => {
    const { registrations, ctx } = harness()
    apply(ctx)
    const content = registrations[0]?.content ?? ''
    expect(content.length).toBeGreaterThan(500)
    // The numeric budget is a component policy: test/components.spec.mjs owns it.
    expect(content.startsWith('---')).toBe(false)
    expect(content).toContain('open_project')
    expect(content).toContain('find_references')
    expect(content).toContain('trace_dependencies')
    expect(content).toContain('AOI_Name::Member')
  })

  it('fails loud when the skills service is missing', () => {
    expect(() => apply({ get: () => undefined })).toThrow(/skills service is unavailable/u)
  })
})
