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
    ctx: { get: (name: string) => name === 'skills' ? { register(skill: Registration) { registrations.push(skill) } } : undefined },
  }
}

describe('factorytalk-view skill', () => {
  it('registers the guidance with an invocable identity', () => {
    const { registrations, ctx } = harness()
    apply(ctx)
    expect(registrations).toHaveLength(1)
    const [skill] = registrations
    expect(skill?.name).toBe('factorytalk-view')
    expect(skill?.provider).toBe('@aryacode/dsh-engineering-ftview')
    expect(skill?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    expect(skill?.path.endsWith('SKILL.md')).toBe(true)
    expect(skill?.description).toBe(SKILL.description)
  })

  it('keeps the body inside budget and free of frontmatter', () => {
    const { registrations, ctx } = harness()
    apply(ctx)
    const content = registrations[0]?.content ?? ''
    expect(content.length).toBeGreaterThan(500)
    expect(content.length).toBeLessThanOrEqual(8000)
    expect(content.startsWith('---')).toBe(false)
    expect(content).toContain('ftview_open')
    expect(content).toContain('ftview_check')
  })

  it('fails loud when the skills service is missing', () => {
    expect(() => apply({ get: () => undefined })).toThrow(/skills service is unavailable/u)
  })
})
