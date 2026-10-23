/**
 * SDK-free live reads over EtherNet/IP.
 *
 * Two tools: a bounded foreground poll, and a session-owned trend job the chart
 * can follow without a model call per sample. Both read declared scalar tags,
 * never write, and state that live logic is not the exported logic.
 *
 * @module dsh-engineering-l5x/tools/live
 */

import { success, type Coverage } from '../core/result.ts'
import { integer, list, object, objectItem, string } from '../core/params.ts'
import type { PluginContext, ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import { pollingRequest, type DirectPolling } from '../engine/direct-polling.ts'
import { L5xError } from '../core/errors.ts'
import { PROJECT_ID, optionalInteger, optionalString, requiredString, tool } from './common.ts'

/** A direct read is not a guarantee about the scan. */
const LIVE_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'live logic matching the exported logic',
    'values synchronized to the controller scan',
    'transitions between sweeps',
  ],
}

/** The subset of the job service a trend needs. */
interface JobsView {
  start(job: {
    readonly kind: string
    readonly owner: string
    readonly label: string
    run(job: { append(chunk: string): void }): { cancel(): void; done: Promise<{ status: string; result?: string; detail?: string }> }
  }): string
}

/** The tags argument, as flat objects rather than a JSON string. */
function tagsOf(args: Readonly<Record<string, unknown>>): string {
  const raw = args.tags
  if (!Array.isArray(raw)) {
    throw new L5xError('INVALID_POLL', 'tags must be an array of 1 to 16 tag objects.', 'Pass [{ "name": "LineSpeed" }], not a JSON string.')
  }
  const tags = raw.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new L5xError('INVALID_POLL', 'Each tag must be an object with a name.', 'Pass [{ "name": "LineSpeed" }].')
    }
    const row = entry as Record<string, unknown>
    const name = row.name
    if (typeof name !== 'string' || name === '') {
      throw new L5xError('INVALID_POLL', 'Each tag needs a name.', 'Pass [{ "name": "LineSpeed" }].')
    }
    const program = row.program
    return program === undefined ? { name } : { name, scope: program }
  })
  return JSON.stringify(tags)
}

/** The same tag parameter for both tools. */
const TAGS_PARAM = list(
  'Controller-scoped scalar tags to read, 1 to 16. Each entry names the tag and optionally its program.',
  objectItem(
    'One declared scalar tag.',
    {
      name: string('Tag name. Example: "LineSpeed".'),
      program: string('Program scope for a program-scoped tag. Omit for a controller tag.'),
    },
    ['name'],
  ),
  { minItems: 1, maxItems: 16 },
)

/**
 * The live tools.
 *
 * @param session - Project handles for the calling chat.
 * @param polling - The polling engine and its configuration.
 * @param ctx - Plugin context that may provide the job service.
 * @returns Tool definitions in registration order.
 */
export function liveTools(session: ProjectSession, polling: DirectPolling, ctx: PluginContext): readonly ToolDefinition[] {
  return [
    tool({
      name: 'poll_live_tags',
      description: 'Read declared scalar PLC tags directly over EtherNet/IP without Studio, FactoryTalk Linx, an ACD upload or the SDK. Explicit controller IPv4 and slot required. Returns timestamped sweeps, quality and controller identity; no writes.',
      parameters: object({
        project_id: PROJECT_ID,
        ip_address: string('Controller IPv4 address the human named. Example: "192.168.1.10".'),
        slot: integer('CPU slot, 0 to 31. Default 0.', { minimum: 0, maximum: 31, default: 0 }),
        tags: TAGS_PARAM,
        sample_count: integer('Number of sweeps to read. Default 1.', { minimum: 1, maximum: 1200, default: 1 }),
        interval_ms: integer('Requested interval between sweeps. Default 200.', { minimum: 50, maximum: 600000, default: 200 }),
      }, ['ip_address', 'tags']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const { request, evidence } = pollingRequest(project, {
          ip_address: requiredString(args, 'ip_address'),
          slot: optionalInteger(args, 'slot') ?? 0,
          sample_count: optionalInteger(args, 'sample_count') ?? 1,
          interval_ms: optionalInteger(args, 'interval_ms') ?? polling.config.defaultIntervalMs,
          tags_json: tagsOf(args),
        }, polling.config)
        const frames = await polling.start(request, () => {}, exec.signal).done
        await session.require(project.id, exec)
        return success(
          `Read ${request.samples} sweep(s) from ${request.ip}.`,
          {
            project_id: project.id,
            source_sha256: project.sha256,
            ip_address: request.ip,
            slot: request.slot,
            provider: 'ethernet-ip',
            sdk_required: false,
            controller_contacted: true,
            live_logic_matches_export: 'unverified',
            requested_interval_ms: request.interval,
            evidence,
            controller: frames.find(frame => frame.type === 'identity'),
            samples: frames.filter(frame => frame.type === 'sample'),
            limitation: 'Sequential explicit reads can miss transitions and are not synchronized to the PLC scan.',
          },
          [],
          LIVE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'start_plc_trend',
      description: 'Start a bounded, read-only PLC trend as a session-owned background job. Explicit IPv4, slot and declared scalar tags required. SDK-independent EtherNet/IP; the chart follows the job without a model call per sample.',
      parameters: object({
        project_id: PROJECT_ID,
        ip_address: string('Controller IPv4 address the human named. Example: "192.168.1.10".'),
        slot: integer('CPU slot, 0 to 31. Default 0.', { minimum: 0, maximum: 31, default: 0 }),
        tags: TAGS_PARAM,
        sample_count: integer('Number of sweeps in the trend. Default 300.', { minimum: 1, maximum: 1200, default: 300 }),
        interval_ms: integer('Requested interval between sweeps. Default 200.', { minimum: 50, maximum: 600000, default: 200 }),
      }, ['ip_address', 'tags']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const { request, evidence } = pollingRequest(project, {
          ip_address: requiredString(args, 'ip_address'),
          slot: optionalInteger(args, 'slot') ?? 0,
          sample_count: optionalInteger(args, 'sample_count') ?? 300,
          interval_ms: optionalInteger(args, 'interval_ms') ?? polling.config.defaultIntervalMs,
          tags_json: tagsOf(args),
        }, polling.config)
        const jobs = ctx.get?.('jobs') as JobsView | undefined
        const owner = exec.sessionId
        if (jobs === undefined || owner === undefined) {
          throw new L5xError(
            'TREND_JOBS_UNAVAILABLE',
            'Live trends require the session-owned job service.',
            'Use poll_live_tags for a foreground read, or run in a session with the jobs service.',
          )
        }
        const jobId = jobs.start({
          kind: 'plc-trend',
          owner,
          label: `PLC trend ${request.ip} slot ${request.slot}`,
          run(job) {
            job.append(JSON.stringify({
              type: 'source',
              project_id: project.id,
              source_sha256: project.sha256,
              ip_address: request.ip,
              slot: request.slot,
              tags: request.tags,
              evidence,
              requested_interval_ms: request.interval,
              live_logic_matches_export: 'unverified',
            }) + '\n')
            const handle = polling.start(request, frame => job.append(JSON.stringify(frame) + '\n'))
            const done = handle.done
              .then(async frames => {
                await session.require(project.id)
                return {
                  status: 'completed',
                  result: JSON.stringify({
                    project_id: project.id,
                    source_sha256: project.sha256,
                    sample_count: frames.filter(frame => frame.type === 'sample').length,
                    live_logic_matches_export: 'unverified',
                  }),
                }
              })
              .catch((error: unknown) => ({
                status: error instanceof L5xError && error.code === 'POLL_CANCELLED' ? 'killed' : 'failed',
                detail: error instanceof Error ? error.message : 'Polling failed',
              }))
            return { cancel: handle.cancel, done }
          },
        })
        return success(
          `Trend ${jobId} started for ${request.samples} sweep(s) from ${request.ip}.`,
          {
            job_id: jobId,
            owner_session_id: owner,
            project_id: project.id,
            source_sha256: project.sha256,
            provider: 'ethernet-ip',
            sample_count: request.samples,
            requested_interval_ms: request.interval,
            live_logic_matches_export: 'unverified',
            view: 'plc-trend',
            stop: 'Use the trend Stop control or stop the job.',
          },
          [],
          LIVE_COVERAGE,
        )
      },
    }),
  ]
}
