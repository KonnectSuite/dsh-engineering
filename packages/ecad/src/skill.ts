/**
 * The `ecad-drafting` skill, mounted as its own plugin.
 *
 * It tells a model to probe, confirm the set's own conventions, read with stated
 * coverage, and draft to a new file whose write is verified.
 *
 * @module dsh-engineering-ecad/skill
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'engineering-ecad-skill'

/** The host must offer the skills service before this plugin activates. */
export const inject = ['skills'] as const

/** The skill metadata. */
export const SKILL = {
  name: 'ecad-drafting',
  description:
    'Read, review, cross-reference and redline electrical drawings in DXF and DWG: probe the engine, confirm the set profile, index the sheets, read with stated coverage, and draft to a new file whose write is verified against the staged edit.',
  whenToUse:
    'When the user works with electrical prints (DXF and DWG drawings, panel layouts, schematics, title blocks, device tags, wire numbers) and wants them read, checked, annotated, edited or turned into a review bundle.',
} as const

const HERE = dirname(fileURLToPath(import.meta.url))

/** The skill file, in the built package or the source tree. */
export function skillPath(): string | undefined {
  for (const candidate of [join(HERE, '..', 'SKILL.md'), join(HERE, '..', '..', 'SKILL.md')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** Strip the YAML frontmatter; the body is what the host injects. */
export function skillBody(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
}

/** The registration shape the skills service accepts. */
interface SkillRegistry {
  register(definition: unknown): void
}

/**
 * Register the skill with the host's skills service.
 *
 * @param skills - the skills service from the composition.
 */
export function registerSkill(skills: SkillRegistry): void {
  const path = skillPath()
  if (path === undefined) return
  const body = skillBody(readFileSync(path, 'utf8'))
  skills.register({
    ...SKILL,
    source: 'custom',
    provider: '@aryacode/dsh-engineering-ecad',
    invocation: { modelInvocable: true, userInvocable: true },
    content: body,
  })
}

/** The plugin context this row needs. */
interface SkillContext {
  get?(service: string): unknown
  logger?: { warn?(message: string): void }
}

/**
 * Mount the skill when the composition offers the skills service.
 *
 * @param ctx - plugin context.
 */
export function apply(ctx: SkillContext): void {
  try {
    const skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined
    if (skills !== undefined) registerSkill(skills as SkillRegistry)
  } catch (error) {
    ctx.logger?.warn?.(`engineering-ecad: the skill did not mount: ${error instanceof Error ? error.message : String(error)}`)
  }
}
