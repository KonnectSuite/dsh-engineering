/**
 * The guidance half of the MotionWorks IEC redesign.
 *
 * The tools land in the row entries; this module registers the
 * `motionworks-iec` skill that tells a model how to use them. It is a separate
 * loader entry, so a profile can run the tools without the guidance or the
 * guidance without the tools.
 *
 * @module dsh-engineering-mwi/skill
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'mwi-skill'

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
  logger?: { info?(message: string): void }
}

/** Registration metadata, kept here so a test can assert it without the file. */
export const SKILL = {
  name: 'motionworks-iec',
  description: 'Operate a running Yaskawa MotionWorks IEC 3 Pro IDE through staged projects — find and stage a workspace project, read the live object model and POU code, edit declarations and code, compile, read diagnostics, and verify a staged change.',
  whenToUse: 'The user has MotionWorks IEC 3 Pro open or asks for work in it — a build or compile verdict, the live project model, reading or changing POU code, variable declarations, tasks, or the IDE error list. Also use when a MotionWorks project is mentioned: find which project is in the workspace before answering. For a question about a project outside the workspace, say it cannot be staged.',
} as const

/**
 * Register the MotionWorks IEC skill.
 *
 * The IDE is a Windows application, so a host elsewhere skips registration
 * instead of offering guidance no tool can follow.
 *
 * @param ctx - Plugin context whose skill registry receives the registration.
 */
export function apply(ctx: SkillContext): void {
  if (process.platform !== 'win32') {
    try {
      ctx.logger?.info?.(`mwi-skill: skipped because this host is ${process.platform}; MotionWorks IEC requires Windows.`)
    } catch {
      // A logger that refuses must not turn an unsupported host into a crash.
    }
    return
  }
  const skills = ctx.get('skills') as SkillRegistry | undefined
  if (skills === undefined || typeof skills.register !== 'function') {
    throw new Error('mwi-skill: the skills service is unavailable, so the motionworks-iec guidance cannot register')
  }
  const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url))
  const raw = readFileSync(skillPath, 'utf8')
  const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  skills.register({
    ...SKILL,
    content,
    path: skillPath,
    source: 'custom',
    provider: 'dsh-engineering-mwi',
    invocation: { modelInvocable: true, userInvocable: true },
  })
}
