/**
 * The three resource tools: read the corpus, profile the open project, review a
 * draft.
 *
 * They are deliberately thin. The corpus tool reads generated files; the profile
 * tool asks the product package that owns the parser; the review tool compares a
 * product's prepared findings with the profile and the corpus rule IDs.
 *
 * @module dsh-engineering-resources/tools
 */

import { contents, pageBody, search, corpus } from './corpus.ts'
import { profileId, validateProfile, type StyleProfile } from './profile.ts'
import { getProfile, rememberProfile } from './store.ts'

/** The failure envelope every engineering tool returns. */
function failure(error: unknown): unknown {
  const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'INTERNAL'
  const message = error instanceof Error ? error.message : String(error)
  return {
    error: {
      code,
      message,
      fix: code === 'RESOURCES_MISSING'
        ? 'Run `pnpm resources:build` before packing; the corpus index is generated.'
        : code === 'COMPONENT_NOT_FOUND'
          ? 'Call engineering_reference with no arguments for the available page ids and rule ids.'
          : 'Correct the argument and retry; the corpus is local and needs no network.',
      candidates: [],
    },
  }
}

/** Coverage carried by every reference answer. */
const REFERENCE_COVERAGE = {
  complete: false,
  unverified: [
    'whether the advice fits this machine; a profile is evidence, not authority',
    'the normative text of the standards the pages are based on',
  ],
}

/** Coverage carried by every profile answer. */
const PROFILE_COVERAGE = {
  complete: false,
  unverified: [
    'runtime behaviour of the inferred conventions',
    'conventions the parser cannot see (external HMI, undocumented practice)',
  ],
}

/** One product service that can profile its open project. */
interface ProfilingService {
  styleProfile?(id: string | undefined, exec: unknown): Promise<StyleProfile>
}

/**
 * Present a JSON result as text.
 *
 * The harness tool contract requires `output.render`; a definition without it is
 * refused outright (`tool "…" must declare output { schema, render, presentationMeta? }`).
 * 0.94.3 shipped without the callback, so both resource tools failed to register
 * inside a row that swallowed the error and every agent ran without them.
 */
const renderJson = (_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> => [{
  type: 'text',
  text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
}]

/** The reference tool definition. */
export const referenceTool = {
  name: 'engineering_reference',
  description: 'Read the local engineering corpus: return the contents with no arguments, ranked pages for a query, or one page in full for an id. Pages carry rule IDs (CRAFT-NAME-01, VIEW-HPM-02, …) and their basis; nothing is fetched from the network.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Topic, rule id or tag to search for, for example "state machine", "VIEW-HPM-02" or "seal-in".' },
      id: { type: 'string', description: 'Exact page id from the contents, for example "iec-state-machines".' },
      domain: { type: 'string', description: 'Optional domain filter: iec, rockwell, yaskawa, view, optix, craft, migration or hmi.' },
      limit: { type: 'integer', description: 'Most search hits to return; defaults to 8, maximum 20.', minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
    required: [],
  },
  output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
  async execute(args: Readonly<Record<string, unknown>> = {}) {
    try {
      const id = typeof args.id === 'string' && args.id.trim() !== '' ? args.id.trim() : undefined
      const loaded = corpus()
      if (id !== undefined) {
        const row = loaded.index.pages.find(page => page.id === id)
        if (row === undefined) throw Object.assign(new Error(`No resource page named "${id}".`), { code: 'COMPONENT_NOT_FOUND' })
        const markdown = pageBody(id)
        return {
          summary: `Read ${row.title} (${row.domain}, ${row.level}) — rules ${row.rules.join(', ')}.`,
          data: {
            id,
            title: row.title,
            domain: row.domain,
            level: row.level,
            basis: row.basis,
            rules: row.rules,
            words: row.words,
            corpus_digest: loaded.digest,
            markdown,
          },
          next: [{ tool: 'engineering_profile', why: 'Read the open project’s conventions before writing.' }],
          coverage: REFERENCE_COVERAGE,
        }
      }
      const query = typeof args.query === 'string' && args.query.trim() !== '' ? args.query.trim() : undefined
      if (query === undefined) {
        const listing = contents()
        return {
          summary: `${loaded.index.pages.length} engineering resource pages across ${listing.domains.length} domains.`,
          data: { corpus_digest: loaded.digest, domains: listing.domains, pages: listing.pages },
          next: [{ tool: 'engineering_reference', args: { query: 'state machine' }, why: 'Search for the topic you are about to touch.' }],
          coverage: REFERENCE_COVERAGE,
        }
      }
      const domain = typeof args.domain === 'string' && args.domain !== '' ? args.domain : undefined
      const requested = typeof args.limit === 'number' && Number.isInteger(args.limit) ? args.limit : 8
      const hits = search(query, requested, domain)
      return {
        summary: hits.length === 0 ? `No resource page matches "${query}".` : `${hits.length} resource page(s) match "${query}".`,
        data: {
          corpus_digest: loaded.digest,
          query,
          hits,
          ...(hits.length === 0 ? { suggestion: 'Call engineering_reference with no arguments for the contents.' } : {}),
        },
        next: hits.length === 0
          ? [{ tool: 'engineering_reference', why: 'List the contents and pick an id.' }]
          : [{ tool: 'engineering_reference', args: { id: hits[0]?.id }, why: 'Read the best-matching page.' }],
        coverage: REFERENCE_COVERAGE,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

/** The profile tool, bound to the product services the composition provides. */
export function profileTool(getService: (name: string) => unknown) {
  return {
    name: 'engineering_profile',
    description: 'Read the house style of the open project: naming, logic idioms, HMI palette and fonts, comment density, with the evidence and a confidence level. Call it before authoring so new code follows the plant’s own conventions.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'L5X project handle from open_project. Omit when exactly one project is open.' },
        view_id: { type: 'string', description: 'FactoryTalk View handle from ftview_open. Provide this or project_id.' },
      },
      additionalProperties: false,
      required: [],
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: renderJson },
    async execute(args: Readonly<Record<string, unknown>> = {}, exec?: unknown) {
      try {
        const projectId = typeof args.project_id === 'string' && args.project_id !== '' ? args.project_id : undefined
        const viewId = typeof args.view_id === 'string' && args.view_id !== '' ? args.view_id : undefined
        const l5x = getService('l5xProjects') as ProfilingService | undefined
        const ftview = getService('ftviewViews') as ProfilingService | undefined
        const target = viewId !== undefined
          ? { service: ftview, id: viewId, name: 'FactoryTalk View' }
          : { service: l5x, id: projectId, name: 'L5X' }
        if (target.service?.styleProfile === undefined) {
          return {
            error: {
              code: 'PROFILE_UNAVAILABLE',
              message: `No ${target.name} project service is available in this composition, so a profile cannot be read.`,
              fix: viewId !== undefined
                ? 'Open the export with ftview_open first, and make sure the ftview row is enabled.'
                : 'Open the project with open_project first, and make sure the l5x row is enabled.',
              candidates: [],
            },
          }
        }
        const profile = await target.service.styleProfile(target.id, exec)
        const check = validateProfile(profile)
        if (!check.ok) {
          return {
            error: {
              code: 'PROFILE_INVALID',
              message: `The ${target.name} package returned a profile this version cannot read: ${check.problems.join('; ')}.`,
              fix: 'Update the bundle; the profile schema is versioned.',
              candidates: [],
            },
          }
        }
        const id = profileId(profile)
        rememberProfile(id, profile)
        return {
          summary: `${profile.source.kind} profile for ${profile.source.path}: confidence ${profile.confidence}, ${profile.evidence.length} evidence item(s).`,
          data: { profile_id: id, profile },
          next: [{ tool: 'engineering_reference', query: profile.source.kind === 'ftview' ? 'hmi' : 'state machine', why: 'Read the standard that applies to the change you are about to make.' }],
          coverage: PROFILE_COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }
}

/** Every tool this package registers. */
export function resourceTools(getService: (name: string) => unknown) {
  return [referenceTool, profileTool(getService)]
}

export { getProfile }
