/**
 * The legacy-to-logix-migration skill, mounted as its own plugin.
 *
 * It tells a model to interview the engineer before proposing a migration, and
 * to treat the wizard's output as text that has to be proved, not a finished
 * result.
 *
 * @module dsh-engineering-migration/skill
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'engineering-migration-skill'

/** The host must offer the skills service before this plugin activates. */
export const inject = ['skills']

/** The skill metadata. */
export const SKILL = {
  name: 'legacy-to-logix-migration',
  description:
    'Move an RSLogix 500 (SLC 500) or RSLogix 5 (PLC-5) program into Studio 5000: interview the engineer for the target controller and I/O strategy, assess the legacy export, lint the .L5K the migration wizard writes, resolve the conversion markers, and refuse to call the result migrated while a finding or an uncovered reference remains.',
  whenToUse:
    'When a machine runs an SLC 500 or PLC-5 and the work is to bring its program into Logix, or when a migrated .L5K / .ACD has to be reviewed before commissioning.',
}

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
    provider: '@aryacode/dsh-engineering-migration',
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
 * Mount the skill when the composition already offers the skills service.
 *
 * @param ctx - plugin context.
 */
export function apply(ctx: SkillContext): void {
  try {
    const skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined
    if (skills !== undefined) registerSkill(skills as SkillRegistry)
  } catch (error) {
    ctx.logger?.warn?.(`engineering-migration: the skill did not mount: ${error instanceof Error ? error.message : String(error)}`)
  }
}
