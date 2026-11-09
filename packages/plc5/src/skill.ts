/**
 * The rslogix-5 skill, mounted as its own plugin.
 *
 * It tells a model to read PLC-5 projects headlessly and read-only, to
 * separate what the project records from what only an online read or the
 * physical racks can answer, and to never claim a card part number the file
 * does not carry.
 *
 * @module dsh-engineering-plc5/skill
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'engineering-plc5-skill'

/** The host must offer the skills service before this plugin activates. */
export const inject = ['skills']

/** The skill metadata. */
export const SKILL = {
  name: 'rslogix-5',
  description:
    'Read an RSLogix 5 (PLC-5) .RSP project headlessly: open it hidden through the vendor automation server with the do-not-save flag, read the ladder in neutral mnemonic text, census the I/O footprint the program references, list the configured chassis, read the data-file table, and name the processor — reporting what the project records and what only an online read or the physical racks can answer.',
  whenToUse:
    'When the work is on a PLC-5 / RSLogix 5 project — inventory, I/O footprint, program review, BOM groundwork — and every read must stay offline, hidden and read-only.',
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
    provider: '@aryacode/dsh-engineering-plc5',
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
    ctx.logger?.warn?.(`engineering-plc5: the skill did not mount: ${error instanceof Error ? error.message : String(error)}`)
  }
}
