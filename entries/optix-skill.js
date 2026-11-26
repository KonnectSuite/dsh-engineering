/**
 * The FactoryTalk Optix skill, mounted by the product row.
 *
 * The skill used to ride on the `netlogic` switch. That put the product's
 * guidance behind a tool switch, and with conditional tool admission it would
 * also strand the row: the Optix tools are admitted by a skill load, so a
 * `netlogic: false` profile would have kept the 32 tools registered but hidden
 * with no way to reveal them. The row mounts this plugin itself, so the catalog
 * holds the guidance whenever Optix is on.
 *
 * @module dsh-engineering/entries/optix-skill
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'engineering-optix-skill'

/** The skill needs the skills service; a host without one mounts nothing here. */
export const inject = ['skills']

/** Registration metadata, kept here so a test can assert it without the file. */
export const SKILL = {
  name: 'factorytalk-optix',
  description: 'FactoryTalk Optix Studio engineering: inspect and author the loaded project through the Studio bridge, validate expressions, take preview screenshots, read NetLogic C# snippets from the pinned cheat-sheet snapshot, and start from a template.',
  whenToUse: 'The user asks about FactoryTalk Optix — project structure, nodes, variables, aliases, expressions, NetLogic C#, alarms, trends, recipes, OPC UA, or the emulator preview. Route FactoryTalk View ME elsewhere.',
}

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_PATHS = [
  join(HERE, '..', 'vendor', 'optix', 'SKILL.md'),
  join(HERE, '..', 'packages', 'optix', 'SKILL.md'),
]

/** The first existing path from a candidate list. */
function first(candidates) {
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return undefined
}

/**
 * Register the skill body that ships beside this entry.
 *
 * @param ctx - Plugin context with the skills service.
 */
export function apply(ctx) {
  const skills = ctx.skills ?? (typeof ctx.get === 'function' ? ctx.get('skills') : undefined)
  const skillPath = first(SKILL_PATHS)
  if (skillPath === undefined || skills === undefined || typeof skills.register !== 'function') {
    try {
      ctx.logger?.warn?.('optix-skill: the skill was not registered; the tools are still mounted.')
    } catch {
      // A logger that refuses must not turn a missing skill into a crash.
    }
    return
  }
  const raw = readFileSync(skillPath, 'utf8')
  const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  skills.register({
    ...SKILL,
    content,
    path: skillPath,
    source: 'custom',
    provider: '@aryacode/dsh-engineering',
    invocation: { modelInvocable: true, userInvocable: true },
  })
}