/**
 * The engineering resources row: a local standards corpus, a house-style profile
 * and the `engineering-standards` skill that tells a model to read both before
 * authoring.
 *
 * The corpus is generated data (`index.json`, `SOURCE.json`) over authored
 * Markdown; the profile is produced by whichever product package has a project
 * open. This entry only wires them to the tool registry and, when the host offers
 * it, to the skills service.
 *
 * @module dsh-engineering-resources
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resourceTools } from './tools.ts'
import { getProfile } from './store.ts'
import type { StyleProfile } from './profile.ts'

/** Plugin name in a composition. */
export const name = 'engineering-resources'

/** The tools need the registry; the skill is registered when the host offers it. */
export const inject = ['tools']

/** The service name a generation tool can inject to read a profile by handle. */
export const PROFILES_SERVICE = 'engineeringProfiles'

/** The skill metadata, kept here so a test can assert it without the file. */
export const SKILL = {
  name: 'engineering-standards',
  description: 'Engineering standards and house style for control code and HMI: read the local corpus for IEC 61131-3, Rockwell, Yaskawa, FactoryTalk and craft rules, profile the open project to follow its own conventions, and cite rule IDs in findings.',
  whenToUse: 'Before writing or reviewing PLC code, ladder, Structured Text, FactoryTalk View or Optix screens — especially when matching an existing project’s style, or when starting new work that should meet a professional standard.',
}

/** Configuration for the row. */
export interface Config {
  /** Whether the reference and profile tools are registered. Defaults to true. */
  reference?: boolean
}

const HERE = dirname(fileURLToPath(import.meta.url))

/** The skill file, in the built package or the source tree. */
function skillPath(): string | undefined {
  for (const candidate of [join(HERE, '..', 'SKILL.md'), join(HERE, '..', '..', 'SKILL.md')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** The service exposed to other rows. */
export interface ProfilesService {
  /** The profile for one handle, when it is still in memory. */
  get(id: string): StyleProfile | undefined
}

/**
 * Register the resource tools and the standards skill.
 *
 * @param ctx - Plugin context with the tool registry and optional services.
 * @param config - Row configuration.
 */
export function apply(ctx: { tools: { register(definition: unknown): void }; get?: (name: string) => unknown; provide?: (name: string, value: unknown) => void; logger?: { warn?(message: string): void } }, config: Config = {}): void {
  const getService = (service: string): unknown => (typeof ctx.get === 'function' ? ctx.get(service) : undefined)
  if (config.reference !== false) {
    for (const definition of resourceTools(getService)) ctx.tools.register(definition)
  }
  ctx.provide?.(PROFILES_SERVICE, { get: getProfile } satisfies ProfilesService)
  const path = skillPath()
  const skills = getService('skills') as { register?(definition: unknown): void } | undefined
  if (path === undefined || skills?.register === undefined) {
    try {
      ctx.logger?.warn?.('engineering-resources: the engineering-standards skill was not registered; the tools are available.')
    } catch {
      // A logger that refuses must not turn a missing skill into a crash.
    }
    return
  }
  const content = readFileSync(path, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  skills.register({
    ...SKILL,
    content,
    path,
    source: 'custom',
    provider: '@aryacode/dsh-engineering',
    invocation: { modelInvocable: true, userInvocable: true },
  })
}

export { getProfile } from './store.ts'
export { validateProfile, profileId } from './profile.ts'
export type { StyleProfile } from './profile.ts'
export { resourceTools, referenceTool, profileTool } from './tools.ts'
