/**
 * The engineering-standards skill, mounted as its own plugin.
 *
 * The first version registered the skill inside the resources row's `apply`,
 * which meant it ran only if the skills service already existed at that moment.
 * The resources row mounts before the Optix row, and the skill silently
 * disappeared from the catalog when the service was not up yet. Declaring
 * `inject: ['skills']` lets the host activate this plugin when the service
 * exists, exactly like the product skill plugins.
 *
 * @module dsh-engineering-resources/skill
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'engineering-resources-skill'

/** The host must offer the skills service before this plugin activates. */
export const inject = ['skills']

/** The skill metadata. */
export const SKILL = {
  name: 'engineering-standards',
  description: 'Engineering standards and house style for control code and HMI: read the local corpus for IEC 61131-3, Rockwell, Yaskawa, FactoryTalk and craft rules, profile the open project to follow its own conventions, and cite rule IDs in findings.',
  whenToUse: 'Before writing or reviewing PLC code, ladder, Structured Text, FactoryTalk View or Optix screens — especially when matching an existing project’s style, or when starting new work that should meet a professional standard.',
}

const HERE = dirname(fileURLToPath(import.meta.url))

/** The skill file, in the built package or the source tree. */
export function skillPath(): string | undefined {
  for (const candidate of [join(HERE, '..', 'SKILL.md'), join(HERE, '..', '..', 'SKILL.md')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** The skill body, with any front matter removed. */
export function skillContent(path: string): string {
  return readFileSync(path, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
}

/**
 * Register the skill in one skills service.
 *
 * @param service - The host's skills service.
 * @returns True when it was registered; false when the file is missing.
 */
export function registerSkill(service: { register?(definition: unknown): void }): boolean {
  const path = skillPath()
  if (path === undefined || service.register === undefined) return false
  service.register({
    ...SKILL,
    content: skillContent(path),
    path,
    source: 'custom',
    provider: '@aryacode/dsh-engineering',
    invocation: { modelInvocable: true, userInvocable: true },
  })
  return true
}

/**
 * Activate the skill plugin.
 *
 * @param ctx - Plugin context, with the skills service present by injection.
 */
export function apply(ctx: { get?: (name: string) => unknown; logger?: { warn?(message: string): void } }): void {
  const skills = typeof ctx.get === 'function' ? ctx.get('skills') as { register?(definition: unknown): void } | undefined : undefined
  if (skills === undefined || !registerSkill(skills)) {
    try {
      ctx.logger?.warn?.('engineering-resources: the engineering-standards skill could not be registered; the tools are available.')
    } catch {
      // Nothing left to report to.
    }
  }
}
