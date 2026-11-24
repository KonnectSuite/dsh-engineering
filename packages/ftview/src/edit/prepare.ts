/**
 * Prepare staged edits against one opened export.
 *
 * Preparation reads the source files, applies every operation to the text, and
 * re-parses the result. It writes nothing: apply is the only writer, and it
 * writes to a new folder.
 *
 * @module dsh-engineering-ftview/edit/prepare
 */

import { createHash } from 'node:crypto'
import { EngineeringError, type Coverage, type FsService } from '../core.ts'
import { findingsOf, type Finding } from '../checks.ts'
import { parseDisplay, parseTagCsv, type Application, type DisplayFile, type TagRow } from '../model.ts'
import { addObject, addAlarm, createDisplay, deleteAlarm, deleteObject, orderObject, renameDisplay, setAlarmAttribute, setAttribute, setObject, upsertTag, type EditOperation } from './operations.ts'
import { alarmReport } from '../alarm-report.ts'
import { DISPLAY_SETTING_ATTRIBUTES, setDisplaySetting } from '../display-tree.ts'
import { validateSchema, vocabulary, type SchemaValidation } from '../schema.ts'
import type { SchemaModel } from '../xsd.ts'

/** One prepared edit set. */
export interface PreparedEdit {
  /** Files whose text changed, keyed by export-relative path. */
  readonly texts: ReadonlyMap<string, string>
  /** Files the edit adds. */
  readonly added: readonly string[]
  /** Every file written by apply, including unchanged copies. */
  readonly changed: readonly string[]
  /** Findings after the edit. */
  readonly findings: readonly Finding[]
  /** Stable hash over the source hashes and the operations. */
  readonly hash: string
  /** Vendor-schema validation of the changed and added displays. */
  readonly schema: SchemaValidation
}

/** Coverage for anything derived from an export. */
export const EDIT_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'vendor XSD schema validation',
    'Studio import and runtime behavior',
    'binary export files are copied byte for byte, but a file the export does not contain cannot be invented',
    'unchanged text exports are copied verbatim',
  ],
}

/** Decode UTF-8 file bytes. */
function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

/** Read one source file as text. */
async function readText(fs: FsService, root: string, file: string, signal: AbortSignal | undefined): Promise<string> {
  return decode(await fs.readBytes(`${root}/${file}`, signal, 64 * 1024 * 1024))
}

/**
 * The `Gfx-ME<major>.xsd` version the opened export declares.
 *
 * A new display must declare the same schema release the existing displays do,
 * because Studio's Add Component Tool looks the name up in the schemas its own
 * release installed: a ME17-tagged display on a Studio 15 host (schemas through
 * ME16) imports with "schema could not be found" and every object is dropped.
 */
async function exportDisplaySchemaVersion(fs: FsService, app: Application, signal: AbortSignal | undefined): Promise<string | undefined> {
  for (const display of app.displays.slice(0, 3)) {
    const text = await readText(fs, app.root, display.file, signal)
    const version = /xsi:noNamespaceSchemaLocation="Gfx-ME(\d+)\.xsd"/u.exec(text)?.[1]
    if (version !== undefined) return version
  }
  return undefined
}

/** The tag CSV the edit targets, refusing an ambiguous export. */
function tagFileOf(app: Application): string {
  if (app.tagFiles.length === 0) {
    throw new EngineeringError('TAG_CSV_MISSING', 'This export has no tag CSV, so tags cannot be edited.', 'Export the HMI tag database as a CSV into the same folder, then reopen the export.')
  }
  if (app.tagFiles.length > 1) {
    throw new EngineeringError('AMBIGUOUS_TAG_CSV', `This export has ${app.tagFiles.length} tag CSV files, so the edit target is ambiguous.`, 'Keep one tag CSV per export folder, then reopen and retry.', app.tagFiles)
  }
  return app.tagFiles[0] as string
}

/** One rectangle read from an object's geometry attributes. */
interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Read an object's rectangle, or undefined when its geometry is incomplete. */
function rectOf(attributes: Readonly<Record<string, string>>): Rect | undefined {
  const left = Number(attributes.left)
  const top = Number(attributes.top)
  const width = Number(attributes.width)
  const height = Number(attributes.height)
  if (![left, top, width, height].every(value => Number.isFinite(value) && value >= 0)) return undefined
  if (width === 0 || height === 0) return undefined
  return { left, top, width, height }
}

/** Area two rectangles share, or 0 when they do not overlap. */
function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

/** True when one rectangle fully contains the other, which is normal layering. */
function contains(outer: Rect, inner: Rect): boolean {
  return outer.left <= inner.left && outer.top <= inner.top
    && outer.left + outer.width >= inner.left + inner.width
    && outer.top + outer.height >= inner.top + inner.height
}

/**
 * Report objects this draft places partially over a neighbour.
 *
 * Whole-display backdrops, panels that contain their controls and identical
 * rectangles are layering, not mistakes, so they stay quiet. Only a partial
 * intersection is reported: that is the case where a later object hides part of
 * an earlier one and the screen looks broken after import.
 *
 * @param operations - Staged operations.
 * @param displays - Displays after the edit.
 * @returns One finding per overlapping pair the draft created.
 */
export function draftLayoutFindings(operations: readonly EditOperation[], displays: readonly DisplayFile[]): Finding[] {
  const touched = new Map<string, Set<string>>()
  for (const operation of operations) {
    if (operation.kind !== 'object_add' && operation.kind !== 'object_set') continue
    const names = touched.get(operation.file) ?? new Set<string>()
    names.add(operation.kind === 'object_add' ? operation.name : operation.object)
    touched.set(operation.file, names)
  }
  const findings: Finding[] = []
  for (const [file, names] of touched) {
    const display = displays.find(candidate => candidate.file === file)
    if (display === undefined) continue
    const rects = display.objects
      .map(object => ({ name: object.name, rect: rectOf(object.attributes) }))
      .filter((entry): entry is { name: string; rect: Rect } => entry.name !== undefined && entry.rect !== undefined)
    const canvasWidth = Math.max(...rects.map(entry => entry.rect.left + entry.rect.width))
    const canvasHeight = Math.max(...rects.map(entry => entry.rect.top + entry.rect.height))
    const canvas = canvasWidth * canvasHeight
    for (const name of names) {
      const mine = rects.find(entry => entry.name === name)
      if (mine === undefined) continue
      for (const other of rects) {
        if (other.name === name) continue
        const area = overlapArea(mine.rect, other.rect)
        if (area === 0) continue
        if (contains(mine.rect, other.rect) || contains(other.rect, mine.rect)) continue
        if (canvas > 0 && mine.rect.width * mine.rect.height >= canvas * 0.8) continue
        const smaller = Math.min(mine.rect.width * mine.rect.height, other.rect.width * other.rect.height)
        findings.push({
          rule: 'DRAFT_OVERLAP',
          severity: 'warning',
          message: `${name} partially covers ${other.name} in display ${JSON.stringify(display.name)}: ${area} px, ${Math.round((area / smaller) * 100)}% of the smaller object.`,
          evidence: { display: display.name, object: name, overlaps: other.name, area, rect: mine.rect, other: other.rect },
        })
      }
    }
  }
  return findings
}

/**
 * Apply every operation to text and re-parse the result.
 *
 * @param fs - Filesystem provider.
 * @param app - The opened export.
 * @param operations - Staged operations.
 * @param signal - Cancellation.
 * @returns Prepared texts, findings and a hash.
 */
export async function prepareEdit(fs: FsService, app: Application, operations: readonly EditOperation[], signal: AbortSignal | undefined): Promise<PreparedEdit> {
  const texts = new Map<string, string>()
  const added: string[] = []
  const displayByFile = new Map(app.displays.map(display => [display.file, display]))
  const displayNames = new Set(app.displays.map(display => display.name))
  const missingTargets: Finding[] = []
  const addedObjects = new Map<string, Set<string>>()
  const displaySchemaVersion = await exportDisplaySchemaVersion(fs, app, signal)
  // The vocabulary is resolved once per edit, against the schema the export's
  // own displays declare, so the writer never hand-keeps an element family.
  let draftModel: SchemaModel | undefined
  const modelFor = (): SchemaModel => {
    draftModel ??= vocabulary(displaySchemaVersion === undefined ? undefined : Number.parseInt(displaySchemaVersion, 10)).model
    return draftModel
  }
  for (const operation of operations) {
    if (operation.kind === 'display_set') {
      if (!displayByFile.has(operation.file) && !added.includes(operation.file)) {
        throw new EngineeringError('COMPONENT_NOT_FOUND', `The draft targets ${operation.file}, which this export no longer contains.`, 'Reopen the export and stage the edit again.')
      }
      const current = texts.get(operation.file) ?? await readText(fs, app.root, operation.file, signal)
      const routed = operation.object === undefined && DISPLAY_SETTING_ATTRIBUTES.has(operation.attribute)
        ? setDisplaySetting(current, operation.attribute, operation.value)
        : setAttribute(current, operation.object, operation.attribute, operation.value)
      texts.set(operation.file, routed)
      continue
    }
    if (operation.kind === 'display_create') {
      if (displayNames.has(operation.name) || added.includes(operation.file)) {
        throw new EngineeringError('COMPONENT_EXISTS', `A display named ${JSON.stringify(operation.name)} already exists in this export or draft.`, 'Pass a new display name.')
      }
      if (app.files.some(file => file.file.toLowerCase() === operation.file.toLowerCase())) {
        throw new EngineeringError('COMPONENT_EXISTS', `The export already has a file ${operation.file}.`, 'Pass a different file path.')
      }
      texts.set(operation.file, createDisplay(operation, displaySchemaVersion))
      added.push(operation.file)
      displayNames.add(operation.name)
      continue
    }
    if (operation.kind === 'object_add' || operation.kind === 'object_set' || operation.kind === 'object_delete' || operation.kind === 'object_order') {
      const known = displayByFile.has(operation.file) || added.includes(operation.file)
      if (!known) {
        throw new EngineeringError('COMPONENT_NOT_FOUND', `The draft targets ${operation.file}, which this export no longer contains.`, 'Reopen the export and stage the edit again.')
      }
      const current = texts.get(operation.file) ?? await readText(fs, app.root, operation.file, signal)
      if (operation.kind === 'object_add') {
        const names = addedObjects.get(operation.file) ?? new Set<string>()
        names.add(operation.name)
        addedObjects.set(operation.file, names)
      } else {
        const parsed = parseDisplay(operation.file, current)
        const present = new Set(parsed.objects.map(object => object.name).filter((name): name is string => name !== undefined && name !== ''))
        for (const name of addedObjects.get(operation.file) ?? []) present.add(name)
        if (!present.has(operation.object)) {
          missingTargets.push({
            rule: 'DRAFT_TARGET_MISSING',
            severity: 'error',
            message: `The draft ${operation.kind === 'object_delete' ? 'deletes' : 'changes'} ${JSON.stringify(operation.object)} in ${JSON.stringify(parsed.name)}, but that object is not in the display.` ,
            evidence: { file: operation.file, display: parsed.name, object: operation.object, operation: operation.kind },
          })
          continue
        }
      }
      const next = operation.kind === 'object_add' ? addObject(current, operation, modelFor())
        : operation.kind === 'object_set' ? setObject(current, operation, modelFor())
          : operation.kind === 'object_delete' ? deleteObject(current, operation)
            : orderObject(current, operation)
      texts.set(operation.file, next)
      continue
    }
    if (operation.kind === 'display_add') {
      const source = app.displays.find(display => display.name === operation.copyFrom)
      if (source === undefined) {
        throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(operation.copyFrom)} to copy.`, 'Call ftview_list with kind "display" to see the display names.', [...displayNames].slice(0, 5))
      }
      if (displayNames.has(operation.name) || added.includes(operation.name)) {
        throw new EngineeringError('COMPONENT_EXISTS', `A display named ${JSON.stringify(operation.name)} already exists in this export or draft.`, 'Pass a new display name, for example "LineOverview2".')
      }
      const text = renameDisplay(await readText(fs, app.root, source.file, signal), operation.name)
      const directory = source.file.includes('/') ? source.file.slice(0, source.file.lastIndexOf('/') + 1) : ''
      const target = `${directory}${operation.name}.xml`
      if (app.files.some(file => file.file.toLowerCase() === target.toLowerCase())) {
        throw new EngineeringError('COMPONENT_EXISTS', `The export already has a file ${target}.`, 'Pass a different new display name.')
      }
      texts.set(target, text)
      added.push(target)
      displayNames.add(operation.name)
      continue
    }
    if (operation.kind === 'alarm_add' || operation.kind === 'alarm_set' || operation.kind === 'alarm_delete') {
      if (!app.files.some(file => file.file === operation.file) && !texts.has(operation.file)) {
        throw new EngineeringError('COMPONENT_NOT_FOUND', `The draft targets ${operation.file}, which this export no longer contains.`, 'Reopen the export and stage the edit again.')
      }
      const current = texts.get(operation.file) ?? await readText(fs, app.root, operation.file, signal)
      const next = operation.kind === 'alarm_add' ? addAlarm(current, operation)
        : operation.kind === 'alarm_set' ? setAlarmAttribute(current, operation)
          : deleteAlarm(current, operation)
      texts.set(operation.file, next)
      continue
    }
    const tagFile = tagFileOf(app)
    const current = texts.get(tagFile) ?? await readText(fs, app.root, tagFile, signal)
    texts.set(tagFile, upsertTag(current, operation))
  }
  const displays: DisplayFile[] = []
  for (const display of app.displays) {
    const text = texts.get(display.file)
    if (text === undefined) {
      displays.push(display)
      continue
    }
    const parsed = parseDisplay(display.file, text)
    if (parsed.parseError !== undefined) {
      throw new EngineeringError('INVALID_DISPLAY', `The edited ${display.file} no longer parses: ${parsed.parseError}`, 'Undo the last operation and check the display file, then stage it again.')
    }
    displays.push(parsed)
  }
  for (const file of added) {
    const text = texts.get(file) as string
    const parsed = parseDisplay(file, text)
    if (parsed.parseError !== undefined) {
      throw new EngineeringError('INVALID_DISPLAY', `The added ${file} does not parse: ${parsed.parseError}`, 'Copy a different display or pass another name.')
    }
    displays.push(parsed)
  }
  let tags: readonly TagRow[] = app.tags
  let tagErrors: readonly string[] = app.tagErrors
  for (const [file, text] of texts) {
    if (!app.tagFiles.includes(file)) continue
    const parsed = parseTagCsv(text)
    tags = parsed.rows
    tagErrors = parsed.errors
  }
  const changedFiles = new Set([...texts.keys()])
  const diagnostics = app.diagnostics.filter(diagnostic => {
    const file = diagnostic.split(':')[0] ?? ''
    return !changedFiles.has(file)
  })
  // The alarm review runs on the edited document, so a draft that adds a
  // trigger with no message, or deletes one with messages left behind, is
  // reported before apply writes the package.
  const alarmFindings: Finding[] = []
  for (const [file, text] of texts) {
    if (!/alarms\//iu.test(file) || !/\.xml$/iu.test(file)) continue
    for (const finding of alarmReport(text).findings) {
      alarmFindings.push({ rule: finding.rule, severity: finding.severity, message: `${finding.subject}: ${finding.detail}`, evidence: { file, alarm: finding.subject } })
    }
  }
  const findings = [...findingsOf({ displays, tags, tagErrors, diagnostics }), ...draftLayoutFindings(operations, displays), ...missingTargets, ...alarmFindings]
  // Validate only the documents this draft writes: the unchanged ones were
  // already read by the session, and re-validating 18 displays per call would
  // make every edit pay for the whole export.
  const changedDisplays = [...texts]
    .filter(([file]) => /\.xml$/iu.test(file) && !/batchimport/iu.test(file))
    .map(([file, text]) => ({ file, xml: text }))
  const schema = await validateSchema(changedDisplays)
  const hashInput = app.files.map(file => `${file.file}:${file.sha256}`).join('\n') + '\n' + JSON.stringify(operations)
  return {
    texts,
    added,
    changed: [...app.files.map(file => file.file), ...added],
    findings,
    schema,
    hash: createHash('sha256').update(hashInput).digest('hex'),
  }
}
