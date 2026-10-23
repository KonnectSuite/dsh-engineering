/**
 * Structural checks shared by the read and editing entries.
 *
 * @module dsh-engineering-ftview/checks
 */

import type { DisplayFile, TagRow } from './model.ts'

/** One finding the check reports. */
export interface Finding {
  readonly rule: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
  readonly evidence: unknown
}

/** The application parts the checks read. */
export interface Checkable {
  readonly displays: readonly DisplayFile[]
  readonly tags: readonly TagRow[]
  readonly tagErrors: readonly string[]
  readonly diagnostics: readonly string[]
}

/**
 * Run the structural checks.
 *
 * @param app - Displays, tags and the diagnostics from scanning.
 * @returns Findings in rule order.
 */
export function findingsOf(app: Checkable): Finding[] {
  const findings: Finding[] = []
  for (const error of app.tagErrors) findings.push({ rule: 'TAG_CSV', severity: 'warning', message: error, evidence: { file: 'tag CSV' } })
  for (const diagnostic of app.diagnostics) findings.push({ rule: 'UNPARSED_FILE', severity: 'warning', message: diagnostic, evidence: { file: diagnostic.split(':')[0] } })
  const displayNames = new Set<string>()
  for (const display of app.displays) {
    if (displayNames.has(display.name)) findings.push({ rule: 'DUPLICATE_DISPLAY_NAME', severity: 'warning', message: `Two displays are named ${JSON.stringify(display.name)}.`, evidence: { display: display.name, file: display.file } })
    displayNames.add(display.name)
    const objectNames = new Set<string>()
    for (const object of display.objects) {
      if (object.name === undefined) continue
      if (objectNames.has(object.name)) findings.push({ rule: 'DUPLICATE_OBJECT_NAME', severity: 'warning', message: `Display ${JSON.stringify(display.name)} has more than one object named ${JSON.stringify(object.name)}.`, evidence: { display: display.name, object: object.name } })
      objectNames.add(object.name)
    }
  }
  const tagNames = new Set<string>()
  for (const tag of app.tags) {
    if (tagNames.has(tag.name)) findings.push({ rule: 'DUPLICATE_TAG_NAME', severity: 'error', message: `The tag CSV declares ${JSON.stringify(tag.name)} more than once.`, evidence: { tag: tag.name } })
    tagNames.add(tag.name)
  }
  return findings
}
