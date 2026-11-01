/**
 * Checks and comparison: what is wrong with this export, and what changed
 * between two exports.
 *
 * Both tools report evidence and limits rather than verdicts. A check finding is
 * a candidate for engineering review, and a comparison covers parsed engineering
 * content only — never timestamps or XML formatting.
 *
 * @module dsh-engineering-l5x/tools/checks
 */

import { changedFields, runChecks, compareProjects } from '../engine/review.ts'
import { success, type Coverage } from '../core/result.ts'
import { choice, integer, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import { COVERAGE, PROJECT_ID, integerArg, optionalString, requiredString, tool } from './common.ts'

/** One engineering check finding. */
interface Finding {
  readonly rule: string
  readonly severity: 'info' | 'warning' | 'critical'
  readonly message: string
  readonly evidence: unknown
  readonly confidence: string
}

/** The checks engine's answer. */
interface ChecksResult {
  readonly findings: readonly Finding[]
  /** Readings that could not be trusted on this export, with the reason. */
  readonly skipped_readings?: readonly { readonly rule: string; readonly reason: string }[]
  readonly count: number
  readonly summary: { readonly byRule: Readonly<Record<string, number>>; readonly bySeverity: Readonly<Record<string, number>> }
  readonly note: string
}

/** One engineering change between two exports. */
interface Change {
  readonly kind: 'added' | 'removed' | 'changed'
  readonly component: string
  readonly key: string
  readonly before?: unknown
  readonly after?: unknown
}

/** The comparison engine's answer. */
interface CompareResult {
  readonly before: string
  readonly after: string
  readonly changes: readonly Change[]
  readonly count: number
  readonly coverage: unknown
}

/** Findings are candidates for review, not proof of safety. */
const CHECK_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'findings are heuristics and require engineering review',
    'external HMI, produced/consumed and driver consumers are not visible',
    'absence of findings does not prove controller safety',
  ],
}

/**
 * The checks and comparison tools, bound to one chat's project store.
 *
 * @param session - Project handles for the calling chat.
 * @returns Tool definitions in registration order.
 */
export function checkTools(session: ProjectSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'run_checks',
      description: 'Run evidence-backed engineering checks on the open project: unused tags, unresolved references, unscheduled programs and undocumented logic, plus the standards rules a latch that nothing resets (LATCH_WITHOUT_RESET) and one output driven from two rungs (DUPLICATE_OUTPUT), and a rung written in an instruction spelling from the other revision (MNEMONIC_VERSION_MISMATCH), and the structure of every function block diagram (FBD_DANGLING_WIRE, OREF_DUPLICATE_DESTINATION, ICON_NO_MATCHING_OCON, FBD_FEEDBACK_CYCLE), the rungs Studio refuses (RUNG_NO_OUTPUT, SBR_NOT_FIRST, JSR_WITHOUT_RETURN), a JSR naming a routine the program does not declare (JSR_ROUTINE_MISSING), and a serial-port instruction on a processor family that has no serial port (SERIAL_PORT_INSTRUCTION_UNSUPPORTED). Pass baseline_id to add I/O change checks against an earlier export.',
      parameters: object({
        baseline_id: string('Optional second open project id to compare against, enabling I/O module change checks.'),
        rule: string('Only return findings with this exact rule name. Example: "UNUSED_TAG".'),
        severity: choice('Only return findings with this severity.', ['info', 'warning', 'critical']),
        offset: integer('Zero-based index of the first finding to return.', { minimum: 0, default: 0 }),
        limit: integer('Maximum findings to return.', { minimum: 1, maximum: 100, default: 20 }),
        project_id: PROJECT_ID,
      }, []),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const baselineId = optionalString(args, 'baseline_id')
        const baseline = baselineId === undefined ? undefined : await session.require(baselineId, exec)
        const result = runChecks(project, baseline) as ChecksResult
        const rule = optionalString(args, 'rule')
        const severity = optionalString(args, 'severity')
        const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 }
        // A production export returned 701 findings, and the unfiltered page showed 100 unused-tag rows
        // before anything critical: page order has to put the findings that stop a build first.
        const filtered = result.findings
          .filter(finding =>
            (rule === undefined || finding.rule === rule) && (severity === undefined || finding.severity === severity))
          .map((finding, index) => ({ finding, index }))
          .sort((left, right) =>
            (rank[left.finding.severity] ?? 3) - (rank[right.finding.severity] ?? 3) || left.index - right.index)
          .map(entry => entry.finding)
        const offset = integerArg(args, 'offset', 0)
        const limit = Math.min(Math.max(integerArg(args, 'limit', 20), 1), 100)
        const page = filtered.slice(offset, offset + limit)
        const bySeverity = countBy(filtered, finding => finding.severity)
        const byRule = countBy(filtered, finding => finding.rule)
        const symbol = firstSymbol(page)
        return success(
          `${filtered.length} ${filtered.length === 1 ? 'finding' : 'findings'}${rule === undefined ? '' : ` for rule ${rule}`} in ${project.document.controller.name} (${bySeverity.critical ?? 0} critical, ${bySeverity.warning ?? 0} warning, ${bySeverity.info ?? 0} info), ordered by severity.${result.skipped_readings === undefined ? '' : ' ' + result.skipped_readings.length + ' reading(s) skipped.'}`,
          {
            total: result.count,
            filtered_total: filtered.length,
            offset,
            limit,
            truncated: offset + limit < filtered.length,
            by_severity: bySeverity,
            by_rule: byRule,
            findings: page,
            note: result.note,
            ...(result.skipped_readings === undefined ? {} : { skipped_readings: result.skipped_readings }),
          },
          [
            ...(symbol === undefined
              ? []
              : [{ tool: 'find_references', args: { symbol }, why: 'Inspect the evidence behind the first finding.' }]),
            { tool: 'list_components', args: { kind: 'tag' }, why: 'Review declared tags before changing anything.' },
          ],
          CHECK_COVERAGE,
        )
      },
    }),
    tool({
      name: 'compare_projects',
      description: 'Compare two open exports by engineering component: the controller (processor, saved route, project serial), programs, tasks, tags, UDTs, AOIs, modules, alarms, routines, rungs, ST bodies and diagrams. Export timestamps and XML formatting are ignored.',
      parameters: object({
        before_id: string('Project id of the earlier export. Open both exports first with open_project.'),
        after_id: string('Project id of the later export.'),
        offset: integer('Zero-based index of the first change to return.', { minimum: 0, default: 0 }),
        limit: integer('Maximum changes to return.', { minimum: 1, maximum: 100, default: 20 }),
      }, ['before_id', 'after_id']),
      async run(args, exec) {
        const before = await session.require(requiredString(args, 'before_id'), exec)
        const after = await session.require(requiredString(args, 'after_id'), exec)
        const result = compareProjects(before, after) as CompareResult
        const offset = integerArg(args, 'offset', 0)
        const limit = Math.min(Math.max(integerArg(args, 'limit', 20), 1), 100)
        // A module that "changed" sent a reader to diff XML by hand; name the fields instead.
        const page = result.changes.slice(offset, offset + limit).map(change => {
          const fields = changedFields(change)
          return fields.length === 0 ? change : { ...change, changed_fields: fields }
        })
        const byComponent = countBy(result.changes, change => change.component)
        const byKind = countBy(result.changes, change => change.kind)
        return success(
          `${result.count} ${result.count === 1 ? 'change' : 'changes'} between ${before.requestedPath} and ${after.requestedPath}.`,
          {
            before: result.before,
            after: result.after,
            count: result.count,
            offset,
            limit,
            truncated: offset + limit < result.count,
            by_component: byComponent,
            by_kind: byKind,
            changes: page,
          },
          [
            { tool: 'run_checks', args: { baseline_id: before.id }, why: 'Check I/O module changes against the earlier export.' },
            { tool: 'get_component', args: { kind: 'program', name: before.document.programs[0]?.name ?? '' }, why: 'Open a changed program in the later export.' },
          ],
          {
            complete: false,
            unverified: [
              'binary or encoded content equivalence',
              'timestamps and XML formatting are ignored by design',
              ...COVERAGE.unverified,
            ],
          },
        )
      },
    }),
  ]
}

/** Count values by a key function. */
function countBy<T>(values: readonly T[], key: (value: T) => string): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const value of values) {
    const name = key(value)
    counts[name] = (counts[name] ?? 0) + 1
  }
  return counts
}

/** The first symbol named in a finding's evidence, when there is one. */
function firstSymbol(findings: readonly Finding[]): string | undefined {
  for (const finding of findings) {
    const evidence = finding.evidence
    if (evidence === null || typeof evidence !== 'object') continue
    const record = evidence as { tag?: unknown; symbol?: unknown }
    if (typeof record.tag === 'string' && record.tag !== '') return record.tag
    if (typeof record.symbol === 'string' && record.symbol !== '') return record.symbol
  }
  return undefined
}
