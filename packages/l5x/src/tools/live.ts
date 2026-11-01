/**
 * SDK-free EtherNet/IP surface: reads, identity, discovery and the two
 * approval-gated writes.
 *
 * Reads never change the controller and need no approval. Writes do: a write is
 * refused unless the row's config allows writes AND a human approves that exact
 * operation, and its result is the value read back over CIP, not an assumption.
 *
 * @module dsh-engineering-l5x/tools/live
 */

import { success, type Coverage } from '../core/result.ts'
import { integer, list, object, objectItem, scalar, string } from '../core/params.ts'
import type { PluginContext, ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import { pollingRequest, type DirectPolling } from '../engine/direct-polling.ts'
import { batchReadRequest, controllerTarget, discoverRequest, writableTagRequest } from '../engine/cip-request.ts'
import {
  decodeClockResult, decodeDiscoverResult, decodeReadResult, decodeWriteClockResult, decodeWriteResult,
  type CipTransactions,
} from '../engine/cip-transaction.ts'
import { L5xError } from '../core/errors.ts'
import { requireHumanApproval } from '../approvals.ts'
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

/** A verified write is a fact about the tag, not about the machine. */
const WRITE_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'that the written value is the intended process change',
    'that the logic reacts as expected on the next scan',
    'that the value is still in place after the next scan',
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

/** Extra capabilities the live entry mounts beside polling. */
export interface LiveExtensions {
  readonly transactions: CipTransactions
  /** Writes are refused unless the row config enables them. */
  readonly allowWrites: boolean
  /** Largest accepted batch read. */
  readonly maxBatchTags: number
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

/** The same tag parameter for the polling tools. */
const TAGS_PARAM = list(
  'Controller-scoped scalar tags or scalar members to read, 1 to 16. Each entry names the tag and optionally its program.',
  objectItem(
    'One declared scalar tag or scalar member (Timer.PRE).',
    {
      name: string('Tag name. Example: "LineSpeed".'),
      program: string('Program scope for a program-scoped tag. Omit for a controller tag.'),
    },
    ['name'],
  ),
  { minItems: 1, maxItems: 16 },
)

/** The controller address shared by every non-discovery call. */
const target = {
  ip_address: string('Controller IPv4 address the human named. Example: "192.168.1.10".'),
  slot: integer('CPU slot, 0 to 31. Default 0.', { minimum: 0, maximum: 31, default: 0 }),
}

/**
 * The live tools.
 *
 * @param session - Project handles for the calling chat.
 * @param polling - The polling engine and its configuration.
 * @param ctx - Plugin context that may provide the job and approval services.
 * @param extensions - One-shot transactions and the write switch.
 * @returns Tool definitions in registration order.
 */
export function liveTools(session: ProjectSession, polling: DirectPolling, ctx: PluginContext, extensions: LiveExtensions): readonly ToolDefinition[] {
  const { transactions } = extensions
  return [
    tool({
      name: 'poll_live_tags',
      description: 'Read declared scalar PLC tags or scalar members directly over EtherNet/IP without Studio, FactoryTalk Linx, an ACD upload or the SDK. Explicit controller IPv4 and slot required. Returns timestamped sweeps, quality and controller identity; no writes.',
      parameters: object({
        project_id: PROJECT_ID,
        ...target,
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
          `Read ${String(request.samples)} sweep(s) from ${request.ip}.`,
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
      name: 'read_live_tags',
      description: 'Read up to 64 declared scalar tags or scalar members in ONE EtherNet/IP request (CIP tag group). Faster than polling for a one-shot snapshot; no writes, no Studio, no Linx, no SDK.',
      parameters: object({
        project_id: PROJECT_ID,
        ...target,
        tags: list(
          'Declared scalar tags or scalar members to read together, 1 to 64. Each entry names the tag and optionally its program.',
          objectItem(
            'One declared scalar tag or scalar member (Timer.PRE).',
            {
              name: string('Tag name. Example: "LineSpeed".'),
              program: string('Program scope for a program-scoped tag. Omit for a controller tag.'),
            },
            ['name'],
          ),
          { minItems: 1, maxItems: 64 },
        ),
      }, ['ip_address', 'tags']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const { request, evidence } = batchReadRequest(project, {
          ip_address: requiredString(args, 'ip_address'),
          slot: optionalInteger(args, 'slot') ?? 0,
          tags_json: tagsOf(args),
        }, polling.config, extensions.maxBatchTags)
        const result = decodeReadResult(await transactions.run(request, exec.signal))
        await session.require(project.id, exec)
        return success(
          `Read ${String(result.values.length)} tag(s) from ${request.ip} in one request.`,
          {
            project_id: project.id,
            source_sha256: project.sha256,
            ip_address: request.ip,
            slot: request.slot,
            provider: 'ethernet-ip',
            request_count: result.request_count,
            controller: result.controller,
            values: result.values,
            evidence,
            live_logic_matches_export: 'unverified',
          },
          [],
          LIVE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'read_controller_clock',
      description: 'Read controller identity and, on L8x controllers, the wall clock beside the workstation clock. Reports unsupported instead of guessing on other models. No writes.',
      parameters: object({ ...target }, ['ip_address']),
      async run(args, exec) {
        const request = { op: 'clock', ...controllerTarget(args, polling.config) }
        const result = decodeClockResult(await transactions.run(request, exec.signal))
        const drift = result.supported && result.controller_time !== undefined
          ? Date.parse(result.host_time) - Date.parse(result.controller_time)
          : undefined
        return success(
          result.supported
            ? `Controller clock ${String(result.controller_time)}; workstation ${result.host_time}.`
            : `Controller identity read; wall clock is unavailable on ${result.controller.product_name}.`,
          {
            ip_address: request.ip,
            slot: request.slot,
            provider: 'ethernet-ip',
            controller: result.controller,
            clock_supported: result.supported,
            ...(result.controller_time === undefined ? {} : { controller_time: result.controller_time }),
            host_time: result.host_time,
            ...(drift === undefined ? {} : { clock_offset_ms: drift }),
            ...(result.reason === undefined ? {} : { reason: result.reason }),
          },
          [],
          LIVE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'discover_controllers',
      description: 'Discover EtherNet/IP controllers on this LAN by UDP broadcast for a bounded window: address, product, revision, serial, status. No address needed, no writes, no Studio or Linx.',
      parameters: object({
        duration_seconds: integer('How long to listen for replies, 1 to 15. Default 3.', { minimum: 1, maximum: 15, default: 3 }),
      }),
      async run(args, exec) {
        const { request } = discoverRequest({ duration_seconds: optionalInteger(args, 'duration_seconds') ?? 3 }, polling.config)
        const result = decodeDiscoverResult(await transactions.run(request, exec.signal, (request.duration as number) + 2000))
        return success(
          `Found ${String(result.devices.length)} controller(s) in ${String(result.seconds)} s.`,
          {
            provider: 'ethernet-ip',
            broadcast_seconds: result.seconds,
            devices: result.devices,
            limitation: 'Broadcast discovery only reaches devices that answer on this subnet; a routed or filtered network returns nothing.',
          },
          [],
          { complete: false, unverified: ['that a silent device is absent', 'that a listed device is reachable for tag reads'] },
        )
      },
    }),
    tool({
      name: 'write_live_tag',
      description: 'Write ONE declared scalar PLC tag over EtherNet/IP, then read it back and report the controller\'s own value. Requires the row\'s writes switch AND human approval for this exact write. Destructive: it changes a running machine.',
      parameters: object({
        project_id: PROJECT_ID,
        ...target,
        name: string('Declared scalar tag name. Example: "LineSpeed".'),
        program: string('Program scope for a program-scoped tag. Omit for a controller tag.'),
        value: scalar('Value to write: true or false for BOOL, a number for INT, DINT or REAL.'),
      }, ['ip_address', 'name', 'value']),
      async run(args, exec) {
        if (!extensions.allowWrites) {
          throw new L5xError(
            'WRITES_DISABLED',
            'Live writes are switched off for this bundle row.',
            'Turn on "allowWrites" in the L5X row configuration on the Plugins page, then request the write again.',
          )
        }
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const { request } = writableTagRequest(project, {
          ip_address: requiredString(args, 'ip_address'),
          slot: optionalInteger(args, 'slot') ?? 0,
          name: requiredString(args, 'name'),
          ...(optionalString(args, 'program') === undefined ? {} : { program: optionalString(args, 'program') }),
          value: args.value,
        }, polling.config)
        const address = (request.tag as { name: string; program?: string }).program === undefined
          ? (request.tag as { name: string }).name
          : `Program:${String((request.tag as { program: string }).program)}.${String((request.tag as { name: string }).name)}`
        await requireHumanApproval(ctx, exec, 'write_live_tag',
          `Write ${JSON.stringify(args.value)} to ${address} on controller ${request.ip} slot ${String(request.slot)}. This changes a running machine.`)
        const result = decodeWriteResult(await transactions.run(request, exec.signal))
        await session.require(project.id, exec)
        if (!result.verified) {
          throw new L5xError(
            'WRITE_NOT_VERIFIED',
            `${result.tag} was written but the readback is ${JSON.stringify(result.readback)}, not ${JSON.stringify(result.requested_value)}.`,
            'Inspect the tag in the controller before retrying; a type or scaling mismatch can reject the value.',
          )
        }
        return success(
          `Wrote ${JSON.stringify(result.requested_value)} to ${result.tag}; the controller reads back ${JSON.stringify(result.readback)}.`,
          {
            project_id: project.id,
            source_sha256: project.sha256,
            ip_address: request.ip,
            slot: request.slot,
            provider: 'ethernet-ip',
            approved: 'allowed-once',
            ...result,
            live_logic_matches_export: 'unverified',
          },
          [],
          WRITE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'write_controller_clock',
      description: 'Set the controller wall clock (L8x only), then read it back. Requires the row\'s writes switch AND human approval for this exact change.',
      parameters: object({
        ...target,
        time: string('ISO 8601 timestamp to set. Omit to use the workstation clock now. Example: "2026-10-25T09:30:00Z".'),
      }, ['ip_address']),
      async run(args, exec) {
        if (!extensions.allowWrites) {
          throw new L5xError(
            'WRITES_DISABLED',
            'Live writes are switched off for this bundle row.',
            'Turn on "allowWrites" in the L5X row configuration on the Plugins page, then request the change again.',
          )
        }
        const request = { op: 'write-clock', ...controllerTarget(args, polling.config), iso: optionalString(args, 'time') ?? new Date().toISOString() }
        await requireHumanApproval(ctx, exec, 'write_controller_clock',
          `Set the wall clock of controller ${request.ip} slot ${String(request.slot)} to ${String(request.iso)}.`)
        const result = decodeWriteClockResult(await transactions.run(request, exec.signal))
        if (!result.verified) {
          throw new L5xError(
            'WRITE_NOT_VERIFIED',
            `The clock readback ${result.readback} does not match ${result.requested_time}.`,
            'Retry once; if it still differs, the controller rejects clock changes (unsupported model or protected).',
          )
        }
        return success(`Controller clock set to ${result.readback}.`, {
          ip_address: request.ip,
          slot: request.slot,
          approved: 'allowed-once',
          ...result,
        }, [], WRITE_COVERAGE)
      },
    }),
    tool({
      name: 'start_plc_trend',
      description: 'Start a bounded, read-only PLC trend as a session-owned background job. Explicit IPv4, slot and declared scalars or scalar members required. SDK-independent EtherNet/IP; the chart follows the job without a model call per sample.',
      parameters: object({
        project_id: PROJECT_ID,
        ...target,
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
          label: `PLC trend ${request.ip} slot ${String(request.slot)}`,
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
          `Trend ${jobId} started for ${String(request.samples)} sweep(s) from ${request.ip}.`,
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
