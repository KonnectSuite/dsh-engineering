/**
 * The `rslogix-500` skill: the packaged procedure for reading an RSLogix 500
 * project, plus the boundary the host relies on (read-only, offline, no vendor
 * application writes).
 *
 * @module dsh-engineering-slc/skill
 */

import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { PluginContext } from './core/tool.ts'

/** The skill identity the host registers. */
export const SKILL = {
  name: 'rslogix-500',
  description:
    'Read an RSLogix 500 (SLC 500 and MicroLogix) project: open a text export, read ladder in neutral text, census the I/O footprint, read the documentation exports, name the processor and status words. Read-only and offline; never edits a project.',
  whenToUse:
    'Use when the operator names an RSLogix 500 project, a .SLC or .RSS project, or a .EAS/.ERP/.EIC/.ESG documentation export, or asks about SLC 500 instructions, addressing, data files, I/O slots, processor status or legacy-project conversion.',
} as const

const HERE = dirname(fileURLToPath(import.meta.url))

/** The first existing path among the candidates the packaged tree can have. */
async function readSkillBody(): Promise<string> {
  const candidates = [join(HERE, '..', 'SKILL.md'), join(HERE, '..', '..', 'SKILL.md')]
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf8')
    } catch {
      continue
    }
  }
  return ''
}

/** Strip the YAML frontmatter a markdown skill file carries. */
function stripFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/u.exec(text)
  return match === null ? text : text.slice(match[0].length)
}

/** Register the skill when the host exposes a skills service. */
export async function apply(ctx: PluginContext): Promise<void> {
  const skills = ctx.get?.('skills') as { register?: (skill: unknown) => unknown } | undefined
  if (skills?.register === undefined) return
  const body = stripFrontmatter(await readSkillBody())
  if (body.trim() === '') {
    ctx.logger?.warn('engineering-slc: SKILL.md was not found next to the mounted skill module; the row mounted without the skill.')
    return
  }
  skills.register({
    ...SKILL,
    source: 'custom',
    provider: '@aryacode/dsh-engineering-slc',
    invocation: { modelInvocable: true, userInvocable: true },
    content: body,
  })
}
