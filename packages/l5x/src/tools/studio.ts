/**
 * The online-supervised entry's offline half: SDK status, ACD export, L5X
 * verification, routine build into a new ACD, and review-evidence checking.
 *
 * No tool here contacts a controller. Upload, mode change and download belong
 * to the controller tools, which require per-call human approval and are not
 * part of this entry yet.
 *
 * @module dsh-engineering-l5x/tools/studio
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import type { StudioState } from '../studio-state.ts'
import {
  editOfflineAcd,
  exportAcdToL5x,
  studioSdkStatus,
  verifyOfflineL5x,
} from '../engine/studio-sdk.ts'
import { engineeringCapabilities } from '../engine/capabilities.ts'
import { routineEditPlan } from '../engine/acd-edit.ts'
import { reviewDownloadSource } from '../engine/download-review.ts'
import { verifyReviewEvidence } from '../engine/review-evidence.ts'
import { PROJECT_ID, optionalString, requiredString, tool } from './common.ts'

/** Build verdicts come from Studio, not from this plugin. */
const STUDIO_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'the build verdict is Studio 5000\'s; this plugin reports it',
    'runtime behavior',
    'controller state and online logic',
  ],
}

/**
 * The studio tools, bound to one chat's projects and export provenance.
 *
 * @param session - Project handles for the calling chat.
 * @param state - ACD export records for the calling chat.
 * @returns Tool definitions in registration order.
 */
export function studioTools(session: ProjectSession, state: StudioState): readonly ToolDefinition[] {
  return [
    tool({
      name: 'studio_sdk_status',
      description: 'Preflight the Logix Designer SDK service, FactoryTalk Linx services, SDK package, .NET and installed Studio versions. Call before any SDK tool; no project or controller operation.',
      parameters: object({}),
      async run(_args, _exec) {
        const status = await studioSdkStatus()
        return success(
          status.available ? 'The Studio 5000 SDK is available for offline work.' : `The Studio 5000 SDK is unavailable: ${status.reason}`,
          status,
          status.available ? [{ tool: 'studio_capabilities', why: 'See what this SDK release can do for the open project.' }] : [],
          STUDIO_COVERAGE,
        )
      },
    }),
    tool({
      name: 'studio_capabilities',
      description: 'Report offline, SDK, revision-specific build, reference and live-read capabilities with next steps. Optional project_id checks the selected revision; no controller contact.',
      parameters: object({ project_id: PROJECT_ID }, []),
      async run(args, exec) {
        const status = await studioSdkStatus()
        const projectArg = optionalString(args, 'project_id')
        const project = projectArg === undefined ? undefined : await session.require(projectArg, exec)
        return success(
          `Studio capabilities for ${project?.document.controller.name ?? 'this machine'}.`,
          engineeringCapabilities(status, project),
          [{ tool: 'studio_sdk_status', why: 'Inspect the SDK services in detail.' }],
          STUDIO_COVERAGE,
        )
      },
    }),
    tool({
      name: 'export_acd_to_l5x',
      description: 'Export one existing offline ACD to a new full L5X with the running Logix Designer SDK service. No controller connection or upload; refuses to overwrite.',
      parameters: object({
        acd_path: string('Existing offline ACD. Example: "C:/Projects/Line/Line.ACD".'),
        output_path: string('New .L5X path to write. It must not exist.'),
      }, ['acd_path', 'output_path']),
      async run(args, exec) {
        const acdPath = await session.resolvePath(requiredString(args, 'acd_path'), exec)
        const outputPath = await session.resolvePath(requiredString(args, 'output_path'), exec)
        const result = await exportAcdToL5x(acdPath, outputPath, exec.signal) as {
          readonly source_acd: string
          readonly source_sha256: string
          readonly output_path: string
          readonly output_sha256: string
        }
        state.record(exec, {
          acdPath: result.source_acd,
          l5xPath: result.output_path,
          acdSha256: result.source_sha256,
          l5xSha256: result.output_sha256,
        })
        return success(
          `Exported ${result.source_acd} to ${result.output_path}.`,
          result,
          [{ tool: 'open_project', args: { path: result.output_path }, why: 'Open the exported L5X to read it.' }],
          STUDIO_COVERAGE,
        )
      },
    }),
    tool({
      name: 'verify_offline_l5x',
      description: 'Import a full L5X into a new offline ACD and build it with the Studio SDK. Build needs project revision 37+; probe=true attempts a lower revision and reports the SDK error. No controller operation.',
      parameters: object({
        project_id: PROJECT_ID,
        baseline_id: string('Project handle of the unchanged baseline export this draft came from. Example: "3f2c...".'),
        output_path: string('New .ACD path to write. It must not exist.'),
        probe: { type: 'boolean', default: false, description: 'Attempt the build on a revision below 37 and report the SDK error instead of refusing early.' },
      }, ['baseline_id', 'output_path']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const baseline = await session.require(requiredString(args, 'baseline_id'), exec)
        const review = reviewDownloadSource(baseline, project)
        const captured = state.forL5x(exec, baseline.path)
        const baselineVerified = captured?.l5xSha256 === baseline.sha256
        const outputPath = await session.resolvePath(requiredString(args, 'output_path'), exec)
        const build = await verifyOfflineL5x(project, outputPath, exec.signal, { probeBuild: args.probe === true }) as {
          readonly offline_build: string
          readonly output_path: string | null
          readonly output_sha256: string | null
        }
        const blockers = [
          ...review.blockers,
          ...(baselineVerified ? [] : ['Baseline is not an L5X exported from an ACD in this chat']),
        ]
        const eligible = build.offline_build === 'passed' && blockers.length === 0 && build.output_path !== null && build.output_sha256 !== null
        return success(
          `Offline build ${build.offline_build}; ${blockers.length} blocker(s).`,
          {
            ...build,
            baseline_sha256: baseline.sha256,
            baseline_acd_sha256: captured?.acdSha256 ?? null,
            change_count: review.change_count,
            change_summary: review.changes.slice(0, 30).map(change => ({ kind: change.kind, component: change.component, key: change.key })),
            safety_changed: review.safety_changed,
            blockers,
            download_ready: eligible,
          },
          [],
          STUDIO_COVERAGE,
        )
      },
    }),
    tool({
      name: 'build_acd_from_draft',
      description: 'Import one changed existing RLL or ST routine into a NEW offline ACD copy, build it, export it, and check preservation. No controller connection; requires the original ACD and a baseline exported in this chat.',
      parameters: object({
        acd_path: string('Original offline ACD the baseline was exported from.'),
        baseline_id: string('Project handle of the unchanged baseline export.'),
        project_id: PROJECT_ID,
        program: string('Program that owns the changed routine. Example: "MainProgram".'),
        routine: string('Routine whose edited logic is imported. Example: "MainRoutine".'),
        output_path: string('New .ACD path to write. It must not exist.'),
        result_export_path: string('New .L5X path for the built ACD export. It must not exist.'),
      }, ['acd_path', 'baseline_id', 'program', 'routine', 'output_path', 'result_export_path']),
      async run(args, exec) {
        const baseline = await session.require(requiredString(args, 'baseline_id'), exec)
        const draft = await session.require(optionalString(args, 'project_id'), exec)
        const program = requiredString(args, 'program')
        const routine = requiredString(args, 'routine')
        routineEditPlan(baseline, draft, program, routine)
        const acdPath = await session.resolvePath(requiredString(args, 'acd_path'), exec)
        const acdSha256 = createHash('sha256').update(await readFile(acdPath)).digest('hex')
        const captured = state.forL5x(exec, baseline.path)
        if (captured?.acdSha256 !== acdSha256 || captured.l5xSha256 !== baseline.sha256) {
          throw new L5xError(
            'BASELINE_MISMATCH',
            'The baseline was not exported from this ACD in this chat, or either file has changed since.',
            'Export the source ACD with export_acd_to_l5x, open that exact L5X, and keep both files unchanged.',
          )
        }
        const outputPath = await session.resolvePath(requiredString(args, 'output_path'), exec)
        const exportPath = await session.resolvePath(requiredString(args, 'result_export_path'), exec)
        const build = await editOfflineAcd(acdPath, draft, program, routine, outputPath, exportPath, exec.signal)
        return success(
          `Offline ACD build ${build.offline_build}${build.failure_stage === null ? '' : ` at ${build.failure_stage}`}.`,
          {
            ...build,
            download_ready: false,
            controller_operation: 'none',
            next_step: build.offline_build === 'passed' && build.result_export_path !== null
              ? 'Open the result export to review it; download tools are not part of this entry yet.'
              : 'Read the build log; the source ACD was preserved and a failed output is not verified.',
          },
          [],
          STUDIO_COVERAGE,
        )
      },
    }),
    tool({
      name: 'studio_review_evidence',
      description: 'Before reporting Studio findings, verify exact program, routine and rung or ST line names with verbatim quotes. Does not verify interpretation or runtime behavior.',
      parameters: object({
        project_id: PROJECT_ID,
        citations: string('Citations to verify, one per line or as JSON. Example: "MainProgram/MainRoutine rung 4: XIC(Start)OTE(Run);"'),
      }, ['citations']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        return success(
          'Review evidence checked against the export.',
          verifyReviewEvidence(project, requiredString(args, 'citations')),
          [],
          STUDIO_COVERAGE,
        )
      },
    }),
  ]
}
