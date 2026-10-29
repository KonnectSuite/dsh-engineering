import type { Application, DisplayFile, DisplayObject } from '../model.ts'
import type { EditDraft } from './drafts.ts'
import type { EditOperation } from './operations.ts'

/** One staged value that the landed export disagrees with. */
export interface DriftRow {
  readonly field: string
  readonly staged: string
  readonly landed: string
}

/** One display the draft touched, compared with what the export now holds. */
export interface DisplayVerdict {
  readonly display: string
  readonly present: boolean
  readonly matched: number
  readonly missing: readonly string[]
  readonly changed: readonly { readonly object: string; readonly drift: readonly DriftRow[] }[]
  readonly extra: readonly string[]
  readonly landed: boolean
}

/** Whole-draft verdict. */
export interface ImportVerdict {
  readonly displays: readonly DisplayVerdict[]
  readonly landed: boolean
  readonly matched: number
  readonly missing: number
  readonly changed: number
}

/** Fields compared for every staged object: geometry first, then face and wiring. */
const GEOMETRY = ['left', 'top', 'width', 'height'] as const
const FACE = ['backColor', 'color', 'borderColor', 'captionBackColor', 'captionColor'] as const

function byName(display: DisplayFile): Map<string, DisplayObject> {
  const index = new Map<string, DisplayObject>()
  for (const object of display.objects) {
    if (object.name !== undefined) index.set(object.name, object)
  }
  return index
}

/** Compare the attributes a draft set against what the export declares. */
function driftOf(staged: Readonly<Record<string, string>>, landed: DisplayObject, caption: string | undefined): DriftRow[] {
  const rows: DriftRow[] = []
  for (const field of [...GEOMETRY, ...FACE]) {
    const value = staged[field]
    if (value === undefined) continue
    const landedValue = landed.attributes[field] ?? ''
    if (landedValue.toLowerCase() !== value.toLowerCase()) rows.push({ field, staged: value, landed: landedValue })
  }
  if (caption !== undefined) {
    const landedCaption = landed.attributes.caption ?? ''
    if (landedCaption !== caption) rows.push({ field: 'caption', staged: caption, landed: landedCaption })
  }
  return rows
}

/** Displays one operation writes to. */
function fileOf(operation: EditOperation): string | undefined {
  return 'file' in operation && typeof operation.file === 'string' ? operation.file : undefined
}

/**
 * Prove a draft landed by comparing it with an export read back after the import.
 *
 * Objects are matched by name, which is how Studio keeps them; a renamed or
 * dropped object therefore shows up as one missing and no extra. Geometry, face
 * colours, the caption and connection targets are compared; anything the draft
 * did not set is ignored so an import is not blamed for unrelated existing values.
 *
 * @param draft - The staged draft that was applied and imported.
 * @param app - The export read back after the import.
 * @returns Per-display verdicts plus headline counts.
 */
export function verifyDraft(draft: EditDraft, app: Application): ImportVerdict {
  const touched = new Map<string, EditOperation[]>()
  for (const operation of draft.operations) {
    const file = fileOf(operation)
    if (file === undefined) continue
    const list = touched.get(file) ?? []
    list.push(operation)
    touched.set(file, list)
  }

  const displays: DisplayVerdict[] = []
  for (const [file, operations] of touched) {
    const display = app.displays.find(candidate => candidate.file === file || candidate.file.endsWith(`/${file.split('/').pop() ?? file}`))
    const created = operations.find((operation): operation is Extract<EditOperation, { kind: 'display_create' }> => operation.kind === 'display_create')
    if (display === undefined) {
      displays.push({
        display: created?.name ?? file,
        present: false,
        matched: 0,
        missing: operations.filter(operation => operation.kind === 'object_add').map(operation => (operation as { name: string }).name),
        changed: [],
        extra: [],
        landed: false,
      })
      continue
    }
    const index = byName(display)
    const stagedNames = new Set<string>()
    let matched = 0
    const missing: string[] = []
    const changed: { object: string; drift: DriftRow[] }[] = []
    for (const operation of operations) {
      if (operation.kind === 'object_add') {
        stagedNames.add(operation.name)
        const landed = index.get(operation.name)
        if (landed === undefined) {
          missing.push(operation.name)
          continue
        }
        matched += 1
        const drift = driftOf(operation.attributes, landed, operation.caption)
        if (drift.length > 0) changed.push({ object: operation.name, drift })
        continue
      }
      if (operation.kind === 'object_set') {
        stagedNames.add(operation.object)
        const landed = index.get(operation.object)
        if (landed === undefined) {
          missing.push(operation.object)
          continue
        }
        matched += 1
        const drift = driftOf(operation.attributes, landed, operation.caption)
        if (drift.length > 0) changed.push({ object: operation.object, drift })
      }
    }
    const extra = [...index.keys()].filter(name => !stagedNames.has(name))
    displays.push({
      display: display.name,
      present: true,
      matched,
      missing,
      changed,
      extra,
      landed: missing.length === 0 && changed.length === 0,
    })
  }

  const matched = displays.reduce((total, display) => total + display.matched, 0)
  const missing = displays.reduce((total, display) => total + display.missing.length, 0)
  const changed = displays.reduce((total, display) => total + display.changed.length, 0)
  return { displays, landed: displays.every(display => display.landed), matched, missing, changed }
}
