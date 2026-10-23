/**
 * The guidance half of the FTView port.
 *
 * Registers the `factorytalk-view` skill from SKILL.md. It is a separate loader
 * entry, so a profile can run the tools without the guidance or the guidance
 * without the tools.
 *
 * @module dsh-engineering-ftview/skill
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'ftview-read-skill'

/** Services this plugin cannot register without. */
export const inject = ['skills'] as const

/** The subset of the skill registry this plugin uses. */
interface SkillRegistry {
  register(skill: {
    readonly name: string
    readonly description: string
    readonly whenToUse: string
    readonly content: string
    readonly path: string
    readonly source: 'custom'
    readonly provider: string
    readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  }): void
}

/** The plugin context this module needs. */
export interface SkillContext {
  get(name: string): unknown
}

/** Registration metadata, kept here so a test can assert it without the file. */
export const SKILL = {
  name: 'factorytalk-view',
  description: 'Design and support FactoryTalk View ME and PanelView Plus applications from documented text exports: displays, HMI tags, structural checks and export comparison.',
  whenToUse: 'Use when the user asks about FactoryTalk View ME, PanelView Plus, ME display exports, HMI tags, or comparing ME exports. Route FactoryTalk View SE and Optix to their own surfaces.',
} as const

/**
 * Register the FactoryTalk View skill.
 *
 * @param ctx - Plugin context whose skill registry receives the registration.
 */
export function apply(ctx: SkillContext): void {
  const skills = ctx.get('skills') as SkillRegistry | undefined
  if (skills === undefined || typeof skills.register !== 'function') {
    throw new Error('ftview-read-skill: the skills service is unavailable, so the factorytalk-view guidance cannot register')
  }
  const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url))
  const raw = readFileSync(skillPath, 'utf8')
  const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  skills.register({
    ...SKILL,
    content,
    path: skillPath,
    source: 'custom',
    provider: 'dsh-engineering-ftview',
    invocation: { modelInvocable: true, userInvocable: true },
  })
}
