/**
 * The supervised controller lifecycle: upload, connect, mode change, download.
 *
 * Only three actions change a machine - capture, mode change and download  - 
 * and each one asks for per-call human approval of the exact controller, route
 * and target before it sends anything. Reading is unapproved and read-only.
 *
 * @module dsh-engineering-l5x/tools/controller
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { choice, object, string } from '../core/params.ts'
import type { PluginContext, ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import type { StudioState } from '../studio-state.ts'
import { approvalStatus, ensureApprovalReady, requireHumanApproval } from '../approvals.ts'
import {
  captureControllerSnapshot,
  changeControllerMode,
  controllerActionPreflight,
  controllerUploadPreflight,
  downloadProject,
  goOnline,
  readControllerMode,
  readControllerModeForAction,
  readLiveTag,
  rememberControllerRoute,
  resolveControllerRoute,
} from '../engine/studio-sdk.ts'
import { PROJECT_ID, optionalString, requiredString, tool } from './common.ts'

/** A controller answer is not proof of the exported or edited logic. */
const CONTROLLER_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'whether the controller is running the exported logic',
    'physical machine behavior',
    'values change between reads',
  ],
}

/**
 * The controller tools.
 *
 * @param session - Project handles for the calling chat.
 * @param state - Verified builds and exports for the calling chat.
 * @param ctx - Plugin context that may provide the approval service.
 * @returns Tool definitions in registration order.
 */
export function controllerTools(session: ProjectSession, state: StudioState, ctx: PluginContext): readonly ToolDefinition[] {
  return [
    tool({
      name: 'controller_approval_status',
      description: 'Read this session\'s permission preset and human-approval policy before upload, mode change or download. Full access normally cannot ask for approval. No SDK, file search or controller access.',
      parameters: object({}),
      async run(_args, exec) {
        const status = approvalStatus(ctx, exec)
        return success(
          (status.approved_controller_actions_requestable as boolean)
            ? 'This session can request per-call approval for controller actions.'
            : 'This session cannot request approval for controller actions.',
          status,
          [],
          CONTROLLER_COVERAGE,
        )
      },
    }),
    tool({
      name: 'capture_controller_snapshot',
      description: 'Upload from the supplied controller IP to a new local ACD. Resolve the exact FactoryTalk Linx route from a named ACD or L5X; requires per-call human approval.',
      parameters: object({
        ip_address: string('Controller IPv4 address the human named. Example: "192.168.1.10".'),
        route_project_path: string('ACD or L5X whose saved communications path names the controller route. Example: "C:/Projects/Line/Line.ACD".'),
        output_path: string('New .ACD path for the upload. It must not exist.'),
      }, ['ip_address', 'route_project_path', 'output_path']),
      async run(args, exec) {
        ensureApprovalReady(ctx, exec)
        const ip = requiredString(args, 'ip_address')
        const routePath = await session.resolvePath(requiredString(args, 'route_project_path'), exec)
        const outputPath = await session.resolvePath(requiredString(args, 'output_path'), exec)
        const commPath = await resolveControllerRoute(ip, routePath, exec.signal)
        const output = await controllerUploadPreflight(commPath, outputPath)
        await requireHumanApproval(ctx, exec, 'capture_controller_snapshot', `Upload controller at user-supplied IP ${ip} using verified FactoryTalk Linx route ${commPath} into new local ACD ${output}`)
        const result = await captureControllerSnapshot(commPath, output, exec.signal) as { readonly output_path: string; readonly sha256: string }
        await rememberControllerRoute(ip, result.output_path, commPath)
        return success(`Uploaded controller at ${ip} to ${result.output_path}.`, { ip_address: ip, ...result }, [], CONTROLLER_COVERAGE)
      },
    }),
    tool({
      name: 'go_online',
      description: 'Connect a matching ACD to a controller for read-only diagnostics. Does not change mode or controller data.',
      parameters: object({
        snapshot_path: string('ACD uploaded from that controller. Example: "C:/Projects/Line/Upload.ACD".'),
        ip_address: string('Controller IPv4 address. Example: "192.168.1.10".'),
      }, ['snapshot_path', 'ip_address']),
      async run(args, exec) {
        const ip = requiredString(args, 'ip_address')
        const snapshot = await session.resolvePath(requiredString(args, 'snapshot_path'), exec)
        return success(`Connected ${snapshot} to ${ip}.`, { ip_address: ip, ...await goOnline(snapshot, await resolveControllerRoute(ip, snapshot, exec.signal), exec.signal) }, [], CONTROLLER_COVERAGE)
      },
    }),
    tool({
      name: 'read_controller_mode',
      description: 'Read controller mode for the explicitly supplied controller IP. Supply the matching snapshot ACD to avoid reimporting an L5X. Read-only.',
      parameters: object({
        project_id: PROJECT_ID,
        ip_address: string('Controller IPv4 address. Example: "192.168.1.10".'),
        snapshot_path: string('Optional matching ACD upload. Omit to use the open project\u2019s path for the route.'),
      }, ['ip_address']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const ip = requiredString(args, 'ip_address')
        const snapshotArg = optionalString(args, 'snapshot_path')
        const snapshot = snapshotArg === undefined ? undefined : await session.resolvePath(snapshotArg, exec)
        return success(
          `Read mode from ${ip}.`,
          { ip_address: ip, ...await readControllerMode(project, await resolveControllerRoute(ip, snapshot ?? project.path, exec.signal), exec.signal, snapshot) },
          [],
          CONTROLLER_COVERAGE,
        )
      },
    }),
    tool({
      name: 'read_live_tag',
      description: 'Read one controller-scoped scalar BOOL, INT, DINT or REAL from a matching uploaded ACD. Supply the declared data type; read-only.',
      parameters: object({
        snapshot_path: string('ACD uploaded from that controller.'),
        ip_address: string('Controller IPv4 address.'),
        tag: string('Controller-scoped tag name. Example: "LineSpeed".'),
        data_type: choice('Declared scalar type.', ['BOOL', 'INT', 'DINT', 'REAL']),
      }, ['snapshot_path', 'ip_address', 'tag', 'data_type']),
      async run(args, exec) {
        const ip = requiredString(args, 'ip_address')
        const snapshot = await session.resolvePath(requiredString(args, 'snapshot_path'), exec)
        const dataType = requiredString(args, 'data_type') as 'BOOL' | 'INT' | 'DINT' | 'REAL'
        return success(
          `Read ${requiredString(args, 'tag')} from ${ip}.`,
          { ip_address: ip, ...await readLiveTag(snapshot, await resolveControllerRoute(ip, snapshot, exec.signal), requiredString(args, 'tag'), dataType, exec.signal) },
          [],
          CONTROLLER_COVERAGE,
        )
      },
    }),
    tool({
      name: 'change_controller_mode',
      description: 'Change controller mode to Program, Run or Test. Requires per-call human approval for the exact controller and target mode.',
      parameters: object({
        snapshot_path: string('Matching ACD for the controller.'),
        ip_address: string('Controller IPv4 address.'),
        target_mode: choice('Mode the human approved.', ['Program', 'Run', 'Test']),
      }, ['snapshot_path', 'ip_address', 'target_mode']),
      async run(args, exec) {
        ensureApprovalReady(ctx, exec)
        const ip = requiredString(args, 'ip_address')
        const snapshot = await session.resolvePath(requiredString(args, 'snapshot_path'), exec)
        const mode = requiredString(args, 'target_mode')
        if (!['Program', 'Run', 'Test'].includes(mode)) {
          throw new L5xError('INVALID_MODE', 'target_mode must be Program, Run or Test.', 'Pass one of: Program, Run, Test.')
        }
        const commPath = await resolveControllerRoute(ip, snapshot, exec.signal)
        const preflight = await controllerActionPreflight(snapshot, commPath)
        const currentMode = await readControllerModeForAction(preflight, commPath, exec.signal)
        if (currentMode === mode) {
          throw new L5xError('MODE_ALREADY_SET', `The controller is already in ${mode} mode.`, 'Read the mode and report it; no change is needed.')
        }
        await requireHumanApproval(
          ctx,
          exec,
          'change_controller_mode',
          `Change controller at user-supplied IP ${ip} via ${commPath} from ${currentMode} to ${mode} mode using ${preflight.path} (SHA-256 ${preflight.sha256})`,
        )
        return success(
          `Changed controller at ${ip} from ${currentMode} to ${mode} mode.`,
          { ip_address: ip, ...await changeControllerMode(preflight, commPath, mode, currentMode, exec.signal) },
          [],
          CONTROLLER_COVERAGE,
        )
      },
    }),
    tool({
      name: 'download_project',
      description: 'Download only an ACD built and reviewed by verify_offline_l5x or build_acd_from_draft in this chat, using its verification_id. Requires per-call human approval; never changes mode automatically.',
      parameters: object({
        verification_id: string('Verification id returned by a passed offline build. Example: "b1f2...".'),
        ip_address: string('Controller IPv4 address the human named.'),
      }, ['verification_id', 'ip_address']),
      async run(args, exec) {
        ensureApprovalReady(ctx, exec)
        const id = requiredString(args, 'verification_id')
        const ip = requiredString(args, 'ip_address')
        const verified = state.verified(exec, id)
        if (verified === undefined) {
          throw new L5xError(
            'UNVERIFIED_ACD',
            'No successful SDK build and baseline review exists for this verification_id in this chat.',
            'Run verify_offline_l5x or build_acd_from_draft until it returns download_ready true, then use that verification_id.',
          )
        }
        const commPath = await resolveControllerRoute(ip, verified.baselinePath, exec.signal)
        const baselineHash = createHash('sha256').update(await readFile(verified.baselinePath)).digest('hex')
        const sourceHash = createHash('sha256').update(await readFile(verified.sourcePath)).digest('hex')
        if (baselineHash !== verified.review.baseline_sha256 || sourceHash !== verified.review.source_sha256) {
          throw new L5xError('STALE_EXPORT', 'The baseline or edited L5X changed after SDK verification.', 'Build again, then download that new verification id.')
        }
        const preflight = await controllerActionPreflight(verified.path, commPath)
        if (preflight.sha256 !== verified.sha256) {
          throw new L5xError('ACD_CHANGED', 'The built ACD changed after SDK verification.', 'Build again, then download that new verification id.')
        }
        await requireHumanApproval(
          ctx,
          exec,
          'download_project',
          `Download ACD ${verified.path} (SHA-256 ${verified.sha256}) to controller at user-supplied IP ${ip} via ${commPath}; mode is not changed`,
        )
        return success(
          `Downloaded the verified build to ${ip}.`,
          { ip_address: ip, verification_id: id, ...await downloadProject(preflight, commPath, exec.signal) },
          [],
          CONTROLLER_COVERAGE,
        )
      },
    }),
  ]
}

