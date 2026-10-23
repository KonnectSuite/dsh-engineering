/**
 * Preflight and handoff for a manual FactoryTalk View Studio import.
 *
 * This entry never runs a vendor utility. Preflight reports what a Studio
 * import would touch and which prerequisites are missing; handoff returns the
 * ordered manual steps. Automation through `SEAddComponent.exe` is deliberately
 * absent until it can be validated in a licensed environment.
 *
 * @module dsh-engineering-ftview/studio/preflight
 */

import type { Application } from '../model.ts'
import type { StudioDiscovery } from './discover.ts'

/** The result of checking one change set for Studio. */
export interface StudioCheck {
  readonly changed: readonly string[]
  readonly blockers: readonly string[]
  readonly warnings: readonly string[]
  readonly ready: boolean
  readonly utility_available: boolean
}

/** One manual step. */
export interface HandoffStep {
  readonly step: number
  readonly action: string
  readonly files?: readonly string[]
}

/** The manual plan. */
export interface HandoffPlan {
  readonly application: string
  readonly changed: readonly string[]
  readonly steps: readonly HandoffStep[]
  readonly utility_available: boolean
}

/** File names the Add Component utility refuses (vendor restriction). */
const UNSAFE_NAME = /[%.":?*<>#{}\[\]\\/;=&+\-\u2019]/u

/**
 * Compare two exports and check whether the changed displays can be imported.
 *
 * @param before - The earlier export.
 * @param after - The edited export.
 * @param discovery - Studio tooling that was found.
 * @returns Changed files, blockers, warnings and readiness.
 */
export function studioPreflight(before: Application, after: Application, discovery: StudioDiscovery): StudioCheck {
  const beforeHashes = new Map(before.files.map(file => [file.file, file.sha256]))
  const changed = after.files.filter(file => beforeHashes.get(file.file) !== file.sha256).map(file => file.file)
  const blockers: string[] = []
  const warnings: string[] = []
  if (changed.length === 0) blockers.push('No file differs between the two exports, so there is nothing to import.')
  for (const display of after.displays) {
    if (!changed.includes(display.file)) continue
    const stem = display.file.replace(/\\/gu, '/').split('/').pop()?.replace(/\.xml$/iu, '') ?? display.file
    if (UNSAFE_NAME.test(stem)) blockers.push(`Display file ${JSON.stringify(display.file)} has a name Studio's import refuses; rename it in Studio first.`)
    if (display.parseError !== undefined) blockers.push(`Display ${JSON.stringify(display.name)} does not parse: ${display.parseError}`)
  }
  if (discovery.utilities.length === 0) warnings.push('No SEAddComponent utility was discovered: only the manual Studio import is available.')
  if (discovery.schemas.length === 0) warnings.push('No ME XSD was discovered: schema validation is unavailable.')
  return { changed, blockers, warnings, ready: blockers.length === 0, utility_available: discovery.utilities.length > 0 }
}

/**
 * Produce the ordered manual import plan.
 *
 * @param before - The earlier export.
 * @param after - The edited export.
 * @param discovery - Studio tooling that was found.
 * @returns The plan.
 */
export function handoffPlan(before: Application, after: Application, discovery: StudioDiscovery): HandoffPlan {
  const changed = studioPreflight(before, after, discovery).changed
  return {
    application: after.name,
    changed,
    utility_available: discovery.utilities.length > 0,
    steps: [
      { step: 1, action: `Open the ME application for ${after.name} in FactoryTalk View Studio.` },
      { step: 2, action: 'Import only the changed display components listed here, using the Graphics editor or Add Component.', files: changed },
      { step: 3, action: 'Save the application and export a fresh full export folder.' },
      { step: 4, action: 'Reopen both exports with ftview_open and run ftview_compare to confirm only the intended files changed.' },
    ],
  }
}
