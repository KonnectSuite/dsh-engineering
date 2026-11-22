/**
 * The FTView editing tools: stage, validate, apply.
 *
 * One operation per call, accumulated per chat and export, validated against a
 * re-parsed copy, then written to a new export folder. The source is never
 * modified.
 *
 * @module dsh-engineering-ftview/edit/tools
 */

import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EngineeringError, targetPath, choice, integer, object, optionalInteger, optionalString, requiredString, string, success, tool, type Coverage, type ExecContext, type FsService, type NextStep, type ToolDefinition, type SandboxPolicyResolver } from '../core.ts'
import type { ViewSession } from '../session.ts'
import type { EditDraft, EditDrafts } from './drafts.ts'
import { EDIT_COVERAGE, prepareEdit } from './prepare.ts'
import type { DisplayAddOperation, DisplayCreateOperation, EditOperation, ObjectAnimations, ObjectState } from './operations.ts'
import { verifyDraft } from './verify-draft.ts'
import { exportApplication } from '../vendor.ts'
import { allMatched, verifyDisplays } from '../handoff.ts'
import { ELEMENT_TYPES } from '../catalog.ts'
import { scaffoldLayout, SCAFFOLD_THEME, type ScaffoldTheme } from './scaffold.ts'
import { contrastRatio } from '../design.ts'
import { restyleDisplay, type RestyleTheme } from './restyle.ts'
import { selectBulk } from './bulk.ts'
import type { BulkMatch } from './bulk.ts'
import { screenLayout, type ScreenCard, type ScreenNav, type ScreenSpec } from './screen.ts'
import { popupLayout, type PopupButton, type PopupSpec } from './popup.ts'
import { composeSheet, findBrowser, renderDisplaySvg, settingsFromXml, writeRender, type RasterImage, type RenderSettings } from '../render-svg.ts'
import { parseDisplay } from '../model.ts'

/** Export files that are bytes, not text: artwork and other vendored binaries. */
const BINARY = /\.(png|jpe?g|gif|bmp|ico|emf|wmf|tif?f|cur|ani)$/iu


/** A JSON object of attribute names to string values, at most 200 pairs. */
function jsonAttributes(raw: string): Array<[string, string]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'attributes_json is not valid JSON.', 'Pass a JSON object, for example {"backColor":"#101820"}.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new EngineeringError('INVALID_ARGUMENT', 'attributes_json must be a JSON object.', 'Pass a JSON object of attribute names to values.')
  }
  const pairs: Array<[string, string]> = []
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value === 'object') {
      throw new EngineeringError('INVALID_ARGUMENT', `The attribute ${JSON.stringify(name)} is not a scalar value.`, 'Pass strings, numbers or booleans only.')
    }
    pairs.push([name, String(value)])
  }
  if (pairs.length === 0) throw new EngineeringError('INVALID_ARGUMENT', 'attributes_json is empty.', 'Pass at least one attribute.')
  if (pairs.length > 200) throw new EngineeringError('INVALID_ARGUMENT', 'attributes_json has more than 200 attributes.', 'Split the call into batches of at most 200 attributes.')
  return pairs
}

/** The view handle parameter, described once. */
/**
 * Find one display image by name, trying the extensions ME exports use.
 *
 * @param name - The image name as the display declares it.
 * @param root - The export root that holds `Images/`.
 * @param fs - Filesystem provider.
 * @param signal - Abort signal from the tool call.
 * @returns The path and file name, or undefined when the export does not carry it.
 */
async function findImage(name: string, root: string, fs: FsService, signal: AbortSignal | undefined): Promise<{ path: string; file: string } | undefined> {
  for (const extension of ['png', 'jpg', 'jpeg', 'gif', 'bmp']) {
    const file = `${name}.${extension}`
    const path = `${root}/Images/${file}`
    const stat = await fs.stat(path, signal)
    if (stat !== undefined) return { path, file }
  }
  return undefined
}

const VIEW_ID = string('View handle returned by ftview_open. Omit when exactly one export is open in this chat.')

/**
 * The alarm document this export carries.
 *
 * Alarms travel as the Alarm Import Export Wizard's own XML at
 * `Alarms/Alarms.xml`; an export without one cannot be drafted, because the
 * wizard imports a whole configuration, not a merge.
 */
function alarmFileOf(app: { readonly files: readonly { readonly file: string }[] }): string {
  const found = app.files.find(file => /^alarms\/alarms\.xml$/iu.test(file.file))
    ?? app.files.find(file => /(^|\/)alarms\.xml$/iu.test(file.file))
  if (found === undefined) {
    throw new EngineeringError('ALARM_FILE_MISSING', 'This export has no Alarms/Alarms.xml, so alarms cannot be drafted.', 'Export the alarm configuration from Studio (right-click Alarms > Alarm Setup > Import and Export) into the export folder, then reopen it with ftview_open.')
  }
  return found.file
}

/**
 * The Alarm Import Export Wizard steps appended to IMPORT.md.
 *
 * The wizard imports the whole alarm configuration at once, so the backup
 * export is part of the steps, and its error log — not a display comparison —
 * is the proof the import landed.
 */
function alarmImportSteps(): readonly string[] {
  return [
    '## Alarm setup',
    '',
    'This package changes the alarm setup. In FactoryTalk View Studio open the application, then right-click **Alarms > Alarm Setup** and choose **Import and Export**.',
    '',
    '1. Export the current alarm configuration first: the import **overwrites the entire alarm setup**, so the export is your backup.',
    '2. Choose "Import alarm configuration into application" and select `Alarms/Alarms.xml` from this package.',
    '3. The import error log opens when the import finishes; read it before opening the alarm setup. That log, not a display comparison, is the proof the alarm import landed.',
    '',
    'Alarm counts are limited by the licence (FactoryTalk VIE Alarm Pack counts alarm points), so an over-limit import reports its errors in that log.',
    '',
  ]
}

/** The draft handle parameter, described once. */
const DRAFT_ID = string('Draft handle returned by an ftview_draft_* tool. Omit when exactly one draft exists in this chat.')

/** What a render can and cannot show. */
const RENDER_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'the geometry is drawn from the export, not from Studio',
    'animations, global objects and vendor widgets are placeholders',
    'an image is inlined only when its file is present in the Images folder; many ME exports ship none',
    'no controller binding or runtime behaviour is shown',
    'a problem outline marks the object box only; it does not prove the runtime renders it that way',
  ],
}

/** Coverage for apply, which writes text exports only. */
const APPLY_COVERAGE: Coverage = {
  ...EDIT_COVERAGE,
  unverified: [...EDIT_COVERAGE.unverified, 'files that are not display XML or tag CSV are not copied'],
}

/** The next step after staging an operation. */
function nextValidate(draftId: string): readonly NextStep[] {
  return [{ tool: 'ftview_validate', args: { draft_id: draftId }, why: 'Prepare the changed export and read the findings before writing anything.' }]
}

/** Count duplicate named objects in one display. */
function objectCount(display: { objects: readonly { name?: string }[] }, name: string): number {
  return display.objects.filter(object => object.name === name).length
}

/** The chat's draft, when one exists (ambiguous or absent is fine here). */
function draftOf(store: EditDrafts, exec: ExecContext): EditDraft | undefined {
  try {
    return store.get(exec, undefined)
  } catch {
    return undefined
  }
}

/** One display by name, including a display this same draft creates. */
function displayOf(view: { app: { displays: readonly { name: string; file: string; objects: readonly { name?: string }[] }[] } }, name: string, draft?: EditDraft) {
  const display = view.app.displays.find(candidate => candidate.name === name)
  if (display !== undefined) return display
  const created = draft === undefined ? undefined : draft.operations.find((operation): operation is DisplayCreateOperation => operation.kind === 'display_create' && operation.name === name)
  if (created !== undefined) return { name, file: created.file, objects: [] }
  const copied = draft === undefined ? undefined : draft.operations.find((operation): operation is DisplayAddOperation => operation.kind === 'display_add' && operation.name === name)
  if (copied !== undefined) {
    const source = view.app.displays.find(candidate => candidate.name === copied.copyFrom)
    const directory = source === undefined ? '' : source.file.includes('/') ? source.file.slice(0, source.file.lastIndexOf('/') + 1) : ''
    return { name, file: `${directory}${name}.xml`, objects: [] }
  }
  throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(name)} in this export or this draft.`, 'Call ftview_list with kind "display" to see the display names.', view.app.displays.slice(0, 5).map(candidate => candidate.name))
}

/** Parse one JSON object argument into string attributes. */
/** Parse a bulk match description. */
function jsonMatch(raw: unknown): BulkMatch {
  const value = typeof raw === 'string' ? raw : ''
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'match_json is not valid JSON.', 'Pass an object such as {"type":"text"}.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new EngineeringError('INVALID_ARGUMENT', 'match_json must be a JSON object.', 'Pass an object such as {"type":"text"}.')
  }
  const record = parsed as Record<string, unknown>
  const match: { type?: string; name?: string; attribute?: Record<string, string> } = {}
  if (record.type !== undefined) {
    if (typeof record.type !== 'string') throw new EngineeringError('INVALID_ARGUMENT', 'match_json.type must be a string.', 'Pass the element type, for example "momentaryButton".')
    match.type = record.type
  }
  if (record.name !== undefined) {
    if (typeof record.name !== 'string') throw new EngineeringError('INVALID_ARGUMENT', 'match_json.name must be a string.', 'Pass a name glob, for example "Nav*".')
    match.name = record.name
  }
  if (record.attribute !== undefined) {
    if (record.attribute === null || typeof record.attribute !== 'object' || Array.isArray(record.attribute)) {
      throw new EngineeringError('INVALID_ARGUMENT', 'match_json.attribute must be a JSON object.', 'Pass existing values, for example {"visible":"1"}.')
    }
    const attribute: Record<string, string> = {}
    for (const [key, entry] of Object.entries(record.attribute as Record<string, unknown>)) {
      if (typeof entry !== 'string') throw new EngineeringError('INVALID_ARGUMENT', `match_json.attribute.${key} must be a string.`, 'Compare against the value as the export writes it.')
      attribute[key] = entry
    }
    match.attribute = attribute
  }
  if (match.type === undefined && match.name === undefined && match.attribute === undefined) {
    throw new EngineeringError('INVALID_ARGUMENT', 'match_json states nothing to match.', 'Pass type, name or attribute.')
  }
  return match
}

function jsonObject(value: unknown, name: string): Record<string, string> {
  if (value === undefined) return {}
  if (typeof value !== 'string') throw new EngineeringError('INVALID_ARGUMENT', `${name} must be a JSON object string.`, `Pass ${name} as a JSON object, for example {"height":"40"}.`)
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', `${name} is not valid JSON.`, `Pass ${name} as a JSON object, for example {"height":"40"}.`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new EngineeringError('INVALID_ARGUMENT', `${name} must be a JSON object.`, `Pass ${name} as a JSON object, for example {"height":"40"}.`)
  }
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof entry === 'number' || typeof entry === 'boolean') result[key] = String(entry)
    else if (typeof entry === 'string') result[key] = entry
    else throw new EngineeringError('INVALID_ARGUMENT', `${name}.${key} must be a string, number or boolean.`, 'Pass scalar values only.')
  }
  return result
}

/**
 * The editing tools.
 *
 * @param session - View handles from the read entry.
 * @param drafts - Draft store for the calling chat.
 * @param fs - Filesystem provider used to read sources and write the result.
 * @param maxOperations - Inclusive operations per draft.
 * @returns Tool definitions in registration order.
 */
/** Media type of one raster by file extension. */
const RASTER_TYPES: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }

/**
 * Load the rasters a display references, so the renderer inlines real artwork.
 *
 * Missing files are skipped: an image the export mentions but does not ship must not
 * stop the render, because the result already reports what it could not draw.
 */
async function loadRasters(fs: FsService, root: string, objects: readonly { attributes: Readonly<Record<string, string>> }[], signal: AbortSignal | undefined): Promise<Map<string, RasterImage>> {
  const names = new Set<string>()
  for (const object of objects) {
    const name = object.attributes.imageName ?? object.attributes.image
    if (name !== undefined && name !== '') names.add(name)
  }
  const loaded = new Map<string, RasterImage>()
  for (const name of names) {
    for (const [extension, mime] of Object.entries(RASTER_TYPES)) {
      try {
        const bytes = await fs.readBytes(`${root}/Images/${name}.${extension}`, signal, 8 * 1024 * 1024)
        loaded.set(name, { mime, base64: Buffer.from(bytes).toString('base64') })
        break
      } catch {
        // Try the next extension, then give up and let the renderer label the object.
      }
    }
  }
  return loaded
}

/** How one staged operation reads in a list: its kind and what it changes. */
function describeOperation(operation: EditOperation): { readonly kind: string; readonly target: string } {
  const record = operation as unknown as Record<string, unknown>
  const file = typeof record.file === 'string' ? record.file.replace(/^Displays\//u, '').replace(/\.xml$/u, '') : undefined
  const display = typeof record.display === 'string' ? record.display : file
  const target = [display, record.object].filter((part): part is string => typeof part === 'string' && part !== '').join('/')
  const field = typeof record.attribute === 'string' ? record.attribute : typeof record.name === 'string' ? record.name : undefined
  return { kind: operation.kind, target: field === undefined ? target : `${target} ${field}` }
}

/**
 * Connection tags that the export tag database does not declare.
 *
 * A connection may address a member (`Motor.Speed`), so only the root name is compared,
 * the same way `TAG_NOT_BOUND` in the checks does it.
 */
function unresolvedIn(
  app: { readonly tags: readonly { readonly name: string }[] } | undefined,
  operation: EditOperation,
): string[] {
  if (app === undefined || app.tags.length === 0) return []
  const record = operation as unknown as { connections?: Readonly<Record<string, string>> }
  const declared = new Set(app.tags.map(tag => tag.name))
  const roots = Object.values(record.connections ?? {}).map(value => value.split(/[.[:]/u)[0]?.trim() ?? '')
  return [...new Set(roots.filter(root => root !== '' && !declared.has(root)))]
}

export function editTools(session: ViewSession, drafts: EditDrafts, fs: FsService, maxOperations: number, profileOf?: (id: string) => unknown, policy?: SandboxPolicyResolver): readonly ToolDefinition[] {
  /** The policy this call must be judged by, resolved from its session. */
  const policyFor = (exec: ExecContext | undefined): unknown => {
    if (policy === undefined) return undefined
    const owner = (exec?.agent as { readonly session?: unknown } | undefined)?.session
    return policy.resolve(owner === undefined ? {} : { session: owner })
  }
  /** Where each draft came from, so a result can judge its connections against that export. */
  const apps = new Map<string, { readonly tags: readonly { readonly name: string }[] }>()

  /** Resolve the view and append one operation. */
  const stage = (exec: ExecContext | undefined, viewId: string | undefined, operation: EditOperation) => {
    const view = session.require(viewId, exec)
    const draft = drafts.append(exec, view.id, operation, maxOperations)
    apps.set(draft.id, view.app)
    return { view, draft }
  }
  const staged = (draft: { readonly id: string; readonly operations: readonly unknown[] }, operation: EditOperation, profileId?: string) => {
    const unknown = unresolvedIn(apps.get(draft.id), operation)
    const note = unknown.length === 0
      ? ''
      : ` ${unknown.length} connection tag(s) are not declared in this export tag CSV: ${unknown.join(', ')}. The draft still stages; ftview_check reports the rest at validate time.`
    return success(
      `Draft ${draft.id}: ${draft.operations.length} ${draft.operations.length === 1 ? 'operation' : 'operations'}.${note}`,
      {
        draft_id: draft.id,
        operation_count: draft.operations.length,
        last_operation: operation,
        ...(unknown.length === 0 ? {} : { unresolved_tags: unknown }),
        ...(profileId === undefined ? {} : { profile_applied: profileId }),
      },
      nextValidate(draft.id),
      EDIT_COVERAGE,
    )
  }
  return [
    tool({
      name: 'ftview_draft_display_set',
      description: 'Stage one attribute change on a display or on one of its named objects. Size, colour and window attributes (width, height, backColor, displayType, positionX, positionY) go to the display\'s displaySettings element, where Studio keeps them. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list. Example: "Main".'),
        object: string('Object name inside the display. Omit to change the display root. Example: "StartPB".'),
        attribute: string('Attribute to set. Example: "visible" or "caption".'),
        value: string('New attribute value. Example: "0".'),
      }, ['display', 'attribute', 'value']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const displayName = requiredString(args, 'display')
        const display = view.app.displays.find(candidate => candidate.name === displayName)
        if (display === undefined) {
          throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(displayName)} in this export.`, 'Call ftview_list with kind "display" to see the display names.', view.app.displays.slice(0, 5).map(candidate => candidate.name))
        }
        const objectName = optionalString(args, 'object')
        if (objectName !== undefined) {
          const count = objectCount(display, objectName)
          if (count === 0) {
            throw new EngineeringError('COMPONENT_NOT_FOUND', `No object in ${JSON.stringify(display.name)} is named ${JSON.stringify(objectName)}.`, 'Call ftview_get with kind "display" to see the object names.', display.objects.flatMap(candidate => candidate.name === undefined ? [] : [candidate.name]).slice(0, 5))
          }
          if (count > 1) {
            throw new EngineeringError('AMBIGUOUS_OBJECT', `${display.name} has ${count} objects named ${JSON.stringify(objectName)}, so the edit target is ambiguous.`, 'This export cannot be edited by name alone; use Studio for that display.')
          }
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'display_set',
          file: display.file,
          ...(objectName === undefined ? {} : { object: objectName }),
          attribute: requiredString(args, 'attribute'),
          value: requiredString(args, 'value'),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_display_attrs',
      description: 'Stage several attribute changes on one display or one of its objects in a single call. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list. Example: "Main".'),
        object: string('Object name inside the display. Omit to change the display root. Example: "StartPB".'),
        attributes_json: string('Attributes to set as a JSON object, for example {"backColor":"#101820","borderWidth":"0"}.'),
      }, ['display', 'attributes_json']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const displayName = requiredString(args, 'display')
        const display = view.app.displays.find(candidate => candidate.name === displayName)
        if (display === undefined) {
          throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(displayName)} in this export.`, 'Call ftview_list with kind "display" to see the display names.', view.app.displays.slice(0, 5).map(candidate => candidate.name))
        }
        const objectName = optionalString(args, 'object')
        if (objectName !== undefined) {
          const count = objectCount(display, objectName)
          if (count === 0) {
            throw new EngineeringError('COMPONENT_NOT_FOUND', `No object in ${JSON.stringify(display.name)} is named ${JSON.stringify(objectName)}.`, 'Call ftview_get with kind "display" to see the object names.', display.objects.flatMap(candidate => candidate.name === undefined ? [] : [candidate.name]).slice(0, 5))
          }
          if (count > 1) {
            throw new EngineeringError('AMBIGUOUS_OBJECT', `${display.name} has ${count} objects named ${JSON.stringify(objectName)}, so the edit target is ambiguous.`, 'This export cannot be edited by name alone; use Studio for that display.')
          }
        }
        const pairs = jsonAttributes(requiredString(args, 'attributes_json'))
        let draft: EditDraft | undefined
        for (const [attribute, value] of pairs) {
          const stagedOnce = stage(exec, optionalString(args, 'view_id'), {
            kind: 'display_set',
            file: display.file,
            ...(objectName === undefined ? {} : { object: objectName }),
            attribute,
            value,
          })
          draft = stagedOnce.draft
        }
        if (draft === undefined) throw new EngineeringError('INVALID_ARGUMENT', 'No attributes were given.', 'Pass attributes_json with at least one attribute.')
        const operations = draft.operations.slice(draft.operations.length - pairs.length)
        return success(
          `Staged ${pairs.length} attribute change(s) on ${objectName === undefined ? display.name : `${display.name}/${objectName}`}.`,
          { draft_id: draft.id, operation_count: draft.operations.length, operations: operations.map(operation => ({ operation: operation.kind, attribute: (operation as { attribute?: string }).attribute, value: (operation as { value?: string }).value })) },
          nextValidate(draft.id),
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_display_add',
      description: 'Stage a new display by copying an existing display file under a new name. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        copy_from: string('Display name to copy. Example: "Main".'),
        name: string('New display name, unique in the export. Example: "MainCopy".'),
      }, ['copy_from', 'name']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const copyFrom = requiredString(args, 'copy_from')
        const name = requiredString(args, 'name')
        if (!view.app.displays.some(display => display.name === copyFrom)) {
          throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(copyFrom)} to copy.`, 'Call ftview_list with kind "display" to see the display names.', view.app.displays.slice(0, 5).map(display => display.name))
        }
        if (view.app.displays.some(display => display.name === name)) {
          throw new EngineeringError('COMPONENT_EXISTS', `A display named ${JSON.stringify(name)} already exists in this export.`, 'Pass a new display name, for example "LineOverview2".')
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'display_add',
          copyFrom,
          name,
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_tag_upsert',
      description: 'Stage one HMI tag update: change an existing row\'s description or type, or append a new tag row. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        name: string('Tag name. Example: "StartPB".'),
        description: string('New tag description. Example: "Start pushbutton".'),
        type: string('New tag type. Example: "A" for analog or "D" for digital.'),
      }, ['name']),
      async run(args, exec) {
        const description = optionalString(args, 'description')
        const type = optionalString(args, 'type')
        if (description === undefined && type === undefined) {
          throw new EngineeringError('INVALID_ARGUMENT', 'A tag upsert needs a description, a type, or both.', 'Pass description, type, or both; for example "Start pushbutton".')
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'tag_upsert',
          name: requiredString(args, 'name'),
          ...(description === undefined ? {} : { description }),
          ...(type === undefined ? {} : { type }),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_tags',
      description: 'Stage many HMI tag updates in one call: each entry changes an existing row description or type, or appends a new row. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        tags_json: string('Tags as JSON, e.g. [{"name":"SP_Start","description":"Start setpoint","type":"A"},{"name":"StartPB","description":"Start pushbutton"}].'),
      }, ['tags_json']),
      async run(args, exec) {
        let parsed: unknown
        try {
          parsed = JSON.parse(requiredString(args, 'tags_json'))
        } catch {
          throw new EngineeringError('INVALID_ARGUMENT', 'tags_json is not valid JSON.', 'Pass an array like [{"name":"StartPB","description":"Start pushbutton"}].')
        }
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new EngineeringError('INVALID_ARGUMENT', 'tags_json must be a non-empty array.', 'Pass at least one tag, for example [{"name":"StartPB","description":"Start pushbutton"}].')
        }
        if (parsed.length > 500) {
          throw new EngineeringError('INVALID_ARGUMENT', 'tags_json holds more than 500 tags.', 'Split the batch; 500 tags is the limit for one call.')
        }
        const view = session.require(optionalString(args, 'view_id'), exec)
        const staged: { name: string; description?: string; type?: string }[] = []
        for (const [index, entry] of parsed.entries()) {
          if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new EngineeringError('INVALID_ARGUMENT', `Tag ${index} is not a JSON object.`, 'Pass {"name":"StartPB","description":"Start pushbutton"}.')
          }
          const record = entry as Record<string, unknown>
          const name = record.name
          if (typeof name !== 'string' || name === '') {
            throw new EngineeringError('INVALID_ARGUMENT', `Tag ${index} needs a name.`, 'Pass the HMI tag name, for example "StartPB".')
          }
          const description = typeof record.description === 'string' ? record.description : undefined
          const type = typeof record.type === 'string' ? record.type : undefined
          if (description === undefined && type === undefined) {
            throw new EngineeringError('INVALID_ARGUMENT', `Tag ${JSON.stringify(name)} needs a description, a type, or both.`, 'Pass description or type; nothing was staged.')
          }
          staged.push({ name, ...(description === undefined ? {} : { description }), ...(type === undefined ? {} : { type }) })
        }
        let draft: EditDraft | undefined
        for (const tag of staged) {
          draft = stage(exec, view.id, {
            kind: 'tag_upsert',
            name: tag.name,
            ...(tag.description === undefined ? {} : { description: tag.description }),
            ...(tag.type === undefined ? {} : { type: tag.type }),
          }).draft
        }
        if (draft === undefined) throw new EngineeringError('INTERNAL', 'The tag batch produced no operation.', 'Report this as a defect.')
        return success(
          `Draft ${draft.id}: staged ${staged.length} tag update(s).`,
          { draft_id: draft.id, operation_count: draft.operations.length, tags: staged.map(tag => tag.name) },
          [{ tool: 'ftview_validate', args: { draft_id: draft.id }, why: 'Validate the tag rows before writing anything.' }],
          EDIT_COVERAGE,
        )
      },
    }),    tool({
      name: 'ftview_draft_discard',
      description: 'Throw away the staged edits in this chat, so a draft that went the wrong way can be abandoned without applying it. Files are not touched; only the staged operations are dropped.',
      parameters: object({
        draft_id: string('Draft handle to discard. Omit when exactly one draft exists in this chat.'),
      }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const removed = drafts.discard(exec, draft.id)
        return success(
          removed ? `Discarded ${draft.operations.length} staged operation(s) from ${draft.id}.` : `No draft ${draft.id} was staged in this chat.`,
          { draft_id: draft.id, operations_dropped: removed ? draft.operations.length : 0, discarded: removed },
          [
            { tool: 'ftview_list', args: { kind: 'display' }, why: 'Confirm the export is untouched before starting again.' },
          ],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_ops',
      description: 'List the operations staged in this chat\'s draft with their index, kind and target, so a wrong step can be found without applying or re-staging everything.',
      parameters: object({
        draft_id: string('Draft handle. Omit when exactly one draft exists in this chat.'),
      }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const operations = draft.operations.map((operation, index) => ({ index, ...describeOperation(operation) }))
        return success(
          `Draft ${draft.id} holds ${operations.length} operation(s): ${operations.slice(0, 3).map(operation => `#${operation.index} ${operation.kind} ${operation.target}`).join('; ')}${operations.length > 3 ? ' and more' : ''}.`,
          { draft_id: draft.id, operation_count: operations.length, operations },
          operations.length === 0 ? [] : [{ tool: 'ftview_draft_drop', args: { draft_id: draft.id, index: 0 }, why: 'Drop the first wrong operation by index instead of discarding the whole draft.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_drop',
      description: 'Remove one staged operation by its index from ftview_draft_ops, so a single wrong step can be undone without discarding the draft or editing the L5X by hand.',
      parameters: object({
        index: integer('Zero-based operation index reported by ftview_draft_ops.'),
        draft_id: string('Draft handle. Omit when exactly one draft exists in this chat.'),
      }, ['index']),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const index = optionalInteger(args, 'index') ?? -1
        if (!Number.isInteger(index) || index < 0 || index >= draft.operations.length) {
          throw new EngineeringError('DRAFT_INDEX_RANGE', `This draft holds ${draft.operations.length} operation(s), so index ${index} cannot be dropped.`, 'Call ftview_draft_ops and pass an index it lists.')
        }
        const dropped = draft.operations[index] as EditOperation
        const updated = drafts.replaceOperations(exec, draft.id, draft.operations.filter((_, position) => position !== index))
        return success(
          `Dropped operation #${index} (${describeOperation(dropped).kind} ${describeOperation(dropped).target}); ${updated.operations.length} left.`,
          { draft_id: updated.id, index, dropped: describeOperation(dropped), operation_count: updated.operations.length },
          [{ tool: 'ftview_validate', args: { draft_id: updated.id }, why: 'Re-read the findings against the trimmed draft.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_display_create',
      description: 'Stage a brand-new display with a schema-valid skeleton. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        name: string('New display name, unique in the export. Example: "Arya Overview".'),
        width: integer('Display width in pixels. Example: 800.', { minimum: 1, maximum: 16384 }),
        height: integer('Display height in pixels. Example: 600.', { minimum: 1, maximum: 16384 }),
        display_type: string('Optional display type as Studio writes it, for example "replace" or "onTop".'),
        back_color: string('Optional background colour. Example: "#C6C6C6".'),
        display_number: integer('Optional display number.', { minimum: 0 }),
        file: string('Optional export-relative file path. Defaults to "Displays/<name>.xml".'),
        profile_id: string('Optional house-style profile from engineering_profile; its background colour is used when back_color is absent.'),
      }, ['name', 'width', 'height']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const name = requiredString(args, 'name')
        if (view.app.displays.some(display => display.name === name)) {
          throw new EngineeringError('COMPONENT_EXISTS', `A display named ${JSON.stringify(name)} already exists in this export.`, 'Pass a new display name.')
        }
        const displayType = optionalString(args, 'display_type')
        const profileId = optionalString(args, 'profile_id')
        const profile = profileId === undefined ? undefined : profileOf?.(profileId) as { hmi?: { palette?: { value: string }[] } } | undefined
        const backColor = optionalString(args, 'back_color') ?? profile?.hmi?.palette?.[0]?.value
        const displayNumber = optionalInteger(args, 'display_number')
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'display_create',
          file: optionalString(args, 'file') ?? `Displays/${name}.xml`,
          name,
          width: optionalInteger(args, 'width') ?? 800,
          height: optionalInteger(args, 'height') ?? 600,
          ...(displayType === undefined ? {} : { displayType }),
          ...(backColor === undefined ? {} : { backColor }),
          ...(displayNumber === undefined ? {} : { displayNumber }),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation, profileId)
      },
    }),
    tool({
      name: 'ftview_draft_display_scaffold',
      description: 'Stage the shared chrome of a screen in one call: backdrop, header bar, title, subtitle, content surface, footer bar and footer text. Returns the free rectangles (header, body, footer) so later objects are placed into known boxes instead of invented coordinates. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list, or one this draft creates.'),
        width: integer('Display width in pixels. Omit to read displaySettings from the display file.', { minimum: 200 }),
        height: integer('Display height in pixels. Omit to read displaySettings from the display file.', { minimum: 150 }),
        title: string('Header title text, for example "LAMINATOR · OVERVIEW".'),
        subtitle: string('Optional second header line.'),
        footer: string('Optional footer text; defaults to "AryaCode · FactoryTalk View ME".'),
      }, ['display', 'title']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const name = requiredString(args, 'display')
        const display = displayOf(view, name, draftOf(drafts, exec))
        let width = optionalInteger(args, 'width')
        let height = optionalInteger(args, 'height')
        if (width === undefined || height === undefined) {
          const file = `${view.app.root}/${display.file}`
          const bytes = await fs.readBytes(file, exec?.signal, 4 * 1024 * 1024)
          const text = new TextDecoder().decode(bytes)
          const settings = /<displaySettings\b[^>]*>/u.exec(text)?.[0] ?? ''
          const found = (attribute: string): number | undefined => {
            const raw = new RegExp(`${attribute}="(\\d+)"`, 'u').exec(settings)?.[1]
            return raw === undefined ? undefined : Number(raw)
          }
          width = width ?? found('width')
          height = height ?? found('height')
        }
        if (width === undefined || height === undefined) {
          throw new EngineeringError('INVALID_ARGUMENT', `Cannot read the size of display ${JSON.stringify(name)}.`, 'Pass width and height, or check that the display file still carries displaySettings.')
        }
        const layout = scaffoldLayout({
          width,
          height,
          title: requiredString(args, 'title'),
          ...(optionalString(args, 'subtitle') === undefined ? {} : { subtitle: optionalString(args, 'subtitle') as string }),
          ...(optionalString(args, 'footer') === undefined ? {} : { footer: optionalString(args, 'footer') as string }),
        })
        let draft: EditDraft | undefined
        for (const scaffoldObject of layout.objects) {
          draft = stage(exec, view.id, {
            kind: 'object_add',
            file: display.file,
            type: scaffoldObject.type,
            name: scaffoldObject.name,
            attributes: scaffoldObject.attributes,
          }).draft
        }
        if (draft === undefined) throw new EngineeringError('INTERNAL', 'The scaffold produced no objects.', 'Report this as a defect.')
        return success(
          `Draft ${draft.id}: scaffolded ${layout.objects.length} objects on ${name}; content slot is ${layout.slots.body.width}x${layout.slots.body.height} at (${layout.slots.body.left},${layout.slots.body.top}).`,
          {
            draft_id: draft.id,
            operation_count: draft.operations.length,
            placed: layout.objects.map(item => ({ type: item.type, name: item.name })),
            slots: layout.slots,
            theme: layout.theme,
            contrast: contrastRows(layout.theme),
            note: 'Place content objects inside slots.body; header, title, footer and footerText are already drawn. Keep every object inside its slot and clear of the others.',
          },
          [
            { tool: 'ftview_draft_object_add', why: 'Place the content objects inside slots.body.', args: { display: name } },
            ...nextValidate(draft.id),
          ],
          EDIT_COVERAGE,
        )
      },
    }),    tool({
      name: 'ftview_draft_screen',
      description: 'Stage a whole screen from one description: cards of label/value and label/lamp rows plus a navigation row, laid out on the scaffold slots so nothing is placed by guesswork. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list, or one this draft creates.'),
        spec_json: string('Screen description as JSON: {"title":"LAMINATOR","subtitle":"cutter and stack status","cards":[{"title":"CUTTER","rows":[{"kind":"value","label":"Belt speed","tag":"BeltSpeed"},{"kind":"lamp","label":"Cut off","tag":"CutOff"}]}],"nav":[{"label":"MAIN","display":"MAIN"}]}. Up to 4 cards and 4 navigation buttons.'),
        width: integer('Display width in pixels. Omit to read displaySettings from the display file.', { minimum: 200 }),
        height: integer('Display height in pixels. Omit to read displaySettings from the display file.', { minimum: 150 }),
        tags_json: string('Optional HMI tags for this screen as JSON, e.g. [{"name":"BeltSpeed","description":"Cutter belt speed"}]. Staged in the same draft as the objects.'),
        theme_json: string('Optional palette overrides as JSON, e.g. {"header":"#0088C8","footer":"#143243"}. Same slots as SCAFFOLD_THEME: backdrop, header, surface, footer, titleColor, footerColor.'),
      }, ['display', 'spec_json']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const name = requiredString(args, 'display')
        const display = displayOf(view, name, draftOf(drafts, exec))
        let width = optionalInteger(args, 'width')
        let height = optionalInteger(args, 'height')
        if (width === undefined || height === undefined) {
          const bytes = await fs.readBytes(`${view.app.root}/${display.file}`, exec?.signal, 4 * 1024 * 1024)
          const settings = /<displaySettings\b[^>]*>/u.exec(new TextDecoder().decode(bytes))?.[0] ?? ''
          const found = (attribute: string): number | undefined => {
            const raw = new RegExp(`${attribute}="(\\d+)"`, 'u').exec(settings)?.[1]
            return raw === undefined ? undefined : Number(raw)
          }
          width = width ?? found('width')
          height = height ?? found('height')
        }
        if (width === undefined || height === undefined) {
          throw new EngineeringError('INVALID_ARGUMENT', `Cannot read the size of display ${JSON.stringify(name)}.`, 'Pass width and height, or check that the display file still carries displaySettings.')
        }
        const spec = jsonScreen(requiredString(args, 'spec_json'))
        const palette = jsonPalette(optionalString(args, 'theme_json'))
        let layout: ReturnType<typeof screenLayout>
        try {
          layout = screenLayout({ ...spec, width, height, ...(palette === undefined ? {} : { theme: palette }) })
        } catch (error) {
          throw new EngineeringError('INVALID_ARGUMENT', error instanceof Error ? error.message : String(error), 'Adjust the cards, rows or navigation in spec_json.')
        }
        let draft: EditDraft | undefined
        for (const item of layout.objects) {
          draft = stage(exec, view.id, {
            kind: 'object_add',
            file: display.file,
            type: item.type,
            name: item.name,
            attributes: item.attributes,
            ...(item.caption === undefined ? {} : { caption: item.caption }),
            ...(item.connections === undefined ? {} : { connections: item.connections }),
            ...(item.states === undefined ? {} : { states: item.states.map(state => ({ ...state })) }),
          }).draft
        }
        const tagNames: string[] = []
        const tagsJson = optionalString(args, 'tags_json')
        if (tagsJson !== undefined) {
          let entries: unknown
          try {
            entries = JSON.parse(tagsJson)
          } catch {
            throw new EngineeringError('INVALID_ARGUMENT', 'tags_json is not valid JSON.', 'Pass an array like [{"name":"BeltSpeed","description":"Cutter belt speed"}].')
          }
          if (!Array.isArray(entries) || entries.length === 0) {
            throw new EngineeringError('INVALID_ARGUMENT', 'tags_json must be a non-empty array.', 'Pass at least one tag, or omit tags_json.')
          }
          if (entries.length > 500) {
            throw new EngineeringError('INVALID_ARGUMENT', 'tags_json holds more than 500 tags.', 'Split the batch; 500 tags is the limit for one call.')
          }
          entries.forEach((entry, index) => {
            const record = entry as Record<string, unknown>
            const tagName = record.name
            if (typeof tagName !== 'string' || tagName === '') {
              throw new EngineeringError('INVALID_ARGUMENT', `Tag ${index} needs a name.`, 'Pass the HMI tag name, for example "BeltSpeed".')
            }
            const description = typeof record.description === 'string' ? record.description : undefined
            const type = typeof record.type === 'string' ? record.type : undefined
            if (description === undefined && type === undefined) {
              throw new EngineeringError('INVALID_ARGUMENT', `Tag ${JSON.stringify(tagName)} needs a description, a type, or both.`, 'Pass description or type; nothing was staged.')
            }
            draft = stage(exec, view.id, {
              kind: 'tag_upsert',
              name: tagName,
              ...(description === undefined ? {} : { description }),
              ...(type === undefined ? {} : { type }),
            }).draft
            tagNames.push(tagName)
          })
        }
        if (draft === undefined) throw new EngineeringError('INTERNAL', 'The screen description produced no objects.', 'Report this as a defect.')
        const used: ScaffoldTheme = { ...SCAFFOLD_THEME, ...(palette ?? {}) }
        return success(
          `Draft ${draft.id}: laid out ${layout.objects.length} objects on ${name} (${spec.cards?.length ?? 0} card(s), ${spec.nav?.length ?? 0} nav button(s))${tagNames.length === 0 ? '' : ` and ${tagNames.length} tag row(s)`}.`,
          {
            draft_id: draft.id,
            operation_count: draft.operations.length,
            placed: layout.objects.map(item => ({ type: item.type, name: item.name })),
            ...(tagNames.length === 0 ? {} : { tags: tagNames }),
            slots: layout.slots,
            theme: used,
            contrast: contrastRows(used),
            note: 'Every object is positioned already. Validate the draft, render it with ftview_render source "draft", then apply.',
          },
          [
            { tool: 'ftview_validate', why: 'Validate the staged screen before writing anything.', args: { draft_id: draft.id } },
            { tool: 'ftview_render', why: 'Render the staged draft to see the screen before import.', args: { display: name, source: 'draft' } },
          ],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_popup',
      description: 'Stage a modal popup in one call: an onTop display at the size and position given, a title, a wrapped message, and one to three buttons that close the popup or open another display. Creates the display when the export has none with that name. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Popup display name, for example "Confirm Popup". A new onTop display is created when this export has none with the name.'),
        spec_json: string('Popup description as JSON: {"title":"CONFIRM","message":"ARE YOU SURE YOU WANT TO START THE SYSTEM?","buttons":[{"label":"NO","backColor":"#B91C1C"},{"label":"YES"}]}. Up to three buttons; add "action":"goto" with "display" to open another display instead of closing.'),
        width: integer('Popup width in pixels. Defaults to 395.', { minimum: 200 }),
        height: integer('Popup height in pixels. Defaults to 190.', { minimum: 120 }),
      }, ['display', 'spec_json']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const name = requiredString(args, 'display')
        const parsed = jsonPopup(requiredString(args, 'spec_json'))
        const width = optionalInteger(args, 'width')
        const height = optionalInteger(args, 'height')
        let layout: ReturnType<typeof popupLayout>
        try {
          layout = popupLayout({
            ...parsed,
            ...(width === undefined ? {} : { width }),
            ...(height === undefined ? {} : { height }),
          })
        } catch (error) {
          throw new EngineeringError('INVALID_ARGUMENT', error instanceof Error ? error.message : String(error), 'Adjust the message, buttons or size in spec_json.')
        }
        let draft: EditDraft | undefined
        const existing = view.app.displays.find(candidate => candidate.name === name)
        let file: string
        if (existing === undefined) {
          file = `Displays/${name}.xml`
          draft = stage(exec, view.id, {
            kind: 'display_create',
            file,
            name,
            width: layout.width,
            height: layout.height,
            displayType: 'onTop',
            ...(layout.settings.backColor === undefined ? {} : { backColor: layout.settings.backColor }),
          }).draft
        } else {
          file = existing.file
        }
        for (const [attribute, value] of Object.entries(layout.settings)) {
          if (attribute === 'width' || attribute === 'height' || attribute === 'displayType') continue
          draft = stage(exec, view.id, { kind: 'display_set', file, attribute, value }).draft
        }
        for (const item of layout.objects) {
          draft = stage(exec, view.id, {
            kind: 'object_add',
            file,
            type: item.type,
            name: item.name,
            attributes: item.attributes,
            ...(item.caption === undefined ? {} : { caption: item.caption }),
          }).draft
        }
        if (draft === undefined) throw new EngineeringError('INTERNAL', 'The popup description produced no objects.', 'Report this as a defect.')
        return success(
          `Draft ${draft.id}: popup ${name} at ${layout.width}x${layout.height} with ${layout.objects.length} object(s) and ${parsed.buttons.length} button(s).`,
          {
            draft_id: draft.id,
            operation_count: draft.operations.length,
            display: { name, file, width: layout.width, height: layout.height },
            placed: layout.objects.map(item => ({ type: item.type, name: item.name })),
            settings: layout.settings,
            note: 'Render the staged draft with ftview_render source "draft" to check the message fits before applying.',
          },
          [
            { tool: 'ftview_render', why: 'Look at the staged popup before applying it.', args: { display: name, source: 'draft' } },
            { tool: 'ftview_validate', why: 'Validate the staged popup before writing anything.', args: { draft_id: draft.id } },
          ],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_object_add',
      description: 'Stage one new object inside a display: geometry, attributes and tag connections. Validated against the vendor schema on ftview_validate. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list.'),
        type: string('Object element type as the export writes it, e.g. "momentaryButton", "text", "panel", "numericDisplay", "gotoButton".'),
        name: string('New object name, unique inside the display.'),
        attributes_json: string('Object attributes as a JSON object, e.g. {"height":"50","width":"120","left":"20","top":"40"}.'),
        caption: string('Optional caption text; on buttons and indicators it becomes the face caption inside states.'),
        states_json: string('Optional button or indicator faces as a JSON array, e.g. [{"stateId":"0","caption":"START","backColor":"#24384A"},{"stateId":"1","caption":"START","backColor":"#2FA8E0"}]. Buttons accept 0, 1, Error; multistateIndicator accepts numbered stateId with value.'),
        animations_json: string('Optional animations as JSON, e.g. {"visibility":{"expression":"{AutoRunning} = 0","expressionTrueState":"visible"}}.'),
        connections_json: string('Optional connections as a JSON object, e.g. {"Value":"SystemRunning"}.'),
        parent: string('Optional group name to add inside. Omit to add at the display root.'),
        index: integer('Optional position among siblings, for z-order.', { minimum: 0 }),
        profile_id: string('Optional house-style profile from engineering_profile; its button geometry and font are used when the attributes omit them.'),
      }, ['display', 'type', 'name']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const display = displayOf(view, requiredString(args, 'display'), draftOf(drafts, exec))
        const type = requiredString(args, 'type')
        if (!ELEMENT_TYPES.has(type)) {
          throw new EngineeringError(
            'UNKNOWN_OBJECT_TYPE',
            `${JSON.stringify(type)} is not a FactoryTalk View element type.`,
            `Use one of the ${ELEMENT_TYPES.size} drawable types; ftview_object_types lists what this export already uses.`,
            [...ELEMENT_TYPES].sort(),
          )
        }
        const attributes = { ...jsonObject(args.attributes_json, 'attributes_json') }
        const profileId = optionalString(args, 'profile_id')
        const profile = profileId === undefined ? undefined : profileOf?.(profileId) as {
          hmi?: { button?: { value: string }[]; fonts?: { value: string }[] }
        } | undefined
        if (profile !== undefined) {
          const cluster = profile.hmi?.button?.[0]?.value
          if (/button$/iu.test(type) && cluster !== undefined && attributes.width === undefined && attributes.height === undefined) {
            const [width, height] = cluster.split('x')
            if (width !== undefined && height !== undefined) {
              attributes.width = width
              attributes.height = height
            }
          }
          const font = profile.hmi?.fonts?.[0]?.value
          if (font !== undefined && attributes.fontFamily === undefined && (/text$/iu.test(type) || /button$/iu.test(type))) attributes.fontFamily = font
        }
        for (const [key, value] of [['left', '10'], ['top', '10'], ['width', '100'], ['height', '30']] as const) {
          if (attributes[key] === undefined) attributes[key] = value
        }
        const caption = optionalString(args, 'caption')
        const states = jsonStates(optionalString(args, 'states_json'))
        const animations = jsonAnimations(optionalString(args, 'animations_json'))
        const connections = jsonObject(optionalString(args, 'connections_json'), 'connections_json')
        const parent = optionalString(args, 'parent')
        const index = optionalInteger(args, 'index')
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'object_add',
          file: display.file,
          type,
          name: requiredString(args, 'name'),
          attributes,
          ...(caption === undefined ? {} : { caption }),
          ...(states === undefined ? {} : { states }),
          ...(animations === undefined ? {} : { animations }),
          ...(parent === undefined ? {} : { parent }),
          ...(index === undefined ? {} : { index }),
          ...(Object.keys(connections).length === 0 ? {} : { connections }),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation, profileId)
      },
    }),
    tool({
      name: 'ftview_draft_object_set',
      description: 'Stage attribute, caption or connection changes on one existing object. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list.'),
        object: string('Object name inside the display.'),
        attributes_json: string('Attributes to set as a JSON object, e.g. {"visible":"0","left":"30"}.'),
        caption: string('Optional new caption text.'),
        connections_json: string('Connections to set as a JSON object, e.g. {"Value":"SystemRunning"}.'),
      }, ['display', 'object']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const display = displayOf(view, requiredString(args, 'display'), draftOf(drafts, exec))
        const object = requiredString(args, 'object')

        const attributes = jsonObject(args.attributes_json, 'attributes_json')
        const connections = jsonObject(optionalString(args, 'connections_json'), 'connections_json')
        const caption = optionalString(args, 'caption')
        if (Object.keys(attributes).length === 0 && Object.keys(connections).length === 0 && caption === undefined) {
          throw new EngineeringError('INVALID_ARGUMENT', 'No change was requested.', 'Pass attributes_json, connections_json or caption.')
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'object_set',
          file: display.file,
          object,
          attributes,
          ...(caption === undefined ? {} : { caption }),
          ...(Object.keys(connections).length === 0 ? {} : { connections }),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_restyle',
      description: 'Repaint one existing display in the house theme: backdrop, panel surfaces, text colour and field/button shells, keeping geometry and every object. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list.'),
        theme_json: string('Optional palette overrides, e.g. {"header":"#0088C8"}.'),
      }, ['display']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const name = requiredString(args, 'display')
        const listed = view.app.displays.find(candidate => candidate.name === name)
        if (listed === undefined) {
          throw new EngineeringError(
            'NOT_FOUND',
            `No display is named ${JSON.stringify(name)} in ${view.app.name}.`,
            'Call ftview_list with kind "display" and use the exact name.',
          )
        }
        const prepared = await prepareEdit(fs, view.app, draftOf(drafts, exec)?.operations ?? [], exec?.signal)
        const normalize = (value: string) => value.replace(/\\/g, '/')
        const wanted = normalize(listed.file)
        const stagedText = [...prepared.texts].find(([path]) => {
          const candidate = normalize(path)
          return candidate === wanted || candidate.endsWith(`/${wanted}`) || wanted.endsWith(`/${candidate}`)
        })
        const display = stagedText === undefined ? listed : parseDisplay(stagedText[0], stagedText[1])
        const theme = { ...SCAFFOLD_THEME, ...jsonObject(args.theme_json, 'theme_json') } as RestyleTheme
        const result = restyleDisplay(display, theme)
        const settingEntries = Object.entries(result.settings)
        if (result.changes.length === 0 && settingEntries.length === 0) {
          throw new EngineeringError(
            'NO_CHANGES',
            `${JSON.stringify(display.name)} already matches this palette.`,
            'Pass theme_json with the colours you want, or use ftview_draft_object_set for one object.',
          )
        }
        let last: EditDraft | undefined
        for (const [attribute, value] of settingEntries) {
          const { draft } = stage(exec, optionalString(args, 'view_id'), {
            kind: 'display_set',
            file: listed.file,
            attribute,
            value,
          })
          last = draft
        }
        for (const change of result.changes) {
          const { draft } = stage(exec, optionalString(args, 'view_id'), {
            kind: 'object_set',
            file: display.file,
            object: change.object,
            attributes: change.attributes,
          })
          last = draft
        }
        const attributes = result.changes.reduce((sum, change) => sum + Object.keys(change.attributes).length, settingEntries.length)
        return success(
          `Staged ${result.changes.length} restyle change(s) on ${JSON.stringify(display.name)} (${attributes} attribute(s)); ${result.skipped.length} object(s) left as they are.`,
          {
            display: display.name,
            settings: result.settings,
            changes: result.changes,
            skipped: result.skipped,
            operation_count: last?.operations.length ?? 0,
          },
          [{ tool: 'ftview_validate', why: 'Check the palette against the schema before applying.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_object_delete',
      description: 'Stage the removal of one object from a display. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list.'),
        object: string('Object name to remove.'),
      }, ['display', 'object']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const display = displayOf(view, requiredString(args, 'display'), draftOf(drafts, exec))
        const object = requiredString(args, 'object')

        const { draft } = stage(exec, optionalString(args, 'view_id'), { kind: 'object_delete', file: display.file, object })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_bulk_set',
      description: 'Stage the same attribute, caption or connection change on every object that matches, across displays. A dry run reports what would change. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        displays_json: string('Optional JSON array of display names to restrict to, e.g. ["Main","Manual"]. Omit to search every display.'),
        match_json: string('What to select as JSON: {"type":"momentaryButton","name":"*Start*","attribute":{"visible":"1"}}. Absent fields match anything; name accepts * wildcards.'),
        attributes_json: string('Attributes to set on each match as a JSON object.'),
        caption: string('Optional caption to set on each match.'),
        connections_json: string('Connections to set on each match as a JSON object.'),
        dry_run: choice('Report the matches without staging anything.', ['no', 'yes']),
        limit: integer('Most objects to change. The selection stops there and the result says it was truncated.', { minimum: 1, maximum: 500 }),
      }, ['match_json']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const match = jsonMatch(args.match_json)
        const attributes = jsonObject(args.attributes_json, 'attributes_json')
        const connections = jsonObject(args.connections_json, 'connections_json')
        const caption = optionalString(args, 'caption')
        if (Object.keys(attributes).length === 0 && Object.keys(connections).length === 0 && caption === undefined) {
          throw new EngineeringError('INVALID_ARGUMENT', 'No change was requested.', 'Pass attributes_json, connections_json or caption.')
        }
        const only = optionalString(args, 'displays_json') === undefined ? undefined : jsonNames(optionalString(args, 'displays_json'))
        const limit = optionalInteger(args, 'limit') ?? 100
        const selection = selectBulk(view.app.displays, match, limit, only)
        if (selection.targets.length === 0) {
          const seen = new Map<string, number>()
          for (const display of view.app.displays) {
            for (const object of display.objects) seen.set(object.type, (seen.get(object.type) ?? 0) + 1)
          }
          const common = [...seen.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([type]) => type)
          throw new EngineeringError(
            'NO_MATCH',
            'No object matched that description.',
            `Match on a type this export uses (${common.join(', ')}), or widen the name glob.`,
            common,
          )
        }
        const files = new Map(view.app.displays.map(display => [display.name.toLowerCase(), display.file]))
        const samples = selection.targets.slice(0, 12).map(target => ({ display: target.display, object: target.object, type: target.type }))
        if (optionalString(args, 'dry_run') === 'yes') {
          return success(
            `Would change ${selection.targets.length} object(s) in ${selection.displays.length} display(s).`,
            {
              dry_run: true,
              matched: selection.targets.length,
              displays: selection.displays.length,
              scanned: selection.scanned,
              truncated: selection.truncated,
              samples,
            },
            [{ tool: 'ftview_bulk_set', why: 'Run the same call with dry_run "no" to stage it.', args }],
            EDIT_COVERAGE,
          )
        }
        for (const target of selection.targets) {
          const targetFile = files.get(target.display.toLowerCase())
          if (targetFile === undefined) continue
          stage(exec, optionalString(args, 'view_id'), {
            kind: 'object_set',
            file: targetFile,
            object: target.object,
            attributes,
            ...(caption === undefined ? {} : { caption }),
            ...(Object.keys(connections).length === 0 ? {} : { connections }),
          })
        }
        const draft = drafts.get(exec, undefined)
        return success(
          `Staged ${selection.targets.length} change(s) across ${selection.displays.length} display(s) in draft ${draft.id}.`,
          {
            draft_id: draft.id,
            matched: selection.targets.length,
            displays: selection.displays.length,
            operation_count: draft.operations.length,
            truncated: selection.truncated,
            samples,
          },
          [
            { tool: 'ftview_validate', why: 'Validate the staged changes before writing anything.', args: { draft_id: draft.id } },
          ],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_draft_object_order',
      description: 'Stage a z-order move for one object among its siblings. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list.'),
        object: string('Object name to move.'),
        index: integer('New position among the object siblings, 0 = back.', { minimum: 0 }),
      }, ['display', 'object', 'index']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const display = displayOf(view, requiredString(args, 'display'), draftOf(drafts, exec))
        const object = requiredString(args, 'object')

        const { draft } = stage(exec, optionalString(args, 'view_id'), { kind: 'object_order', file: display.file, object, index: optionalInteger(args, 'index') ?? 0 })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_alarm_add',
      description: 'Stage one new alarm: a trigger row with its expression plus a first message row, numbered and defaulted the way the Alarm Import Export Wizard writes them. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        expression: string('Trigger expression as Studio writes it. Example: "{[PLC]PumpPS>5}".'),
        message_text: string('Operator message the alarm shows. Example: "Pump discharge pressure above 5 psi".'),
        type: choice('Trigger type: bit alarms fire on a digital expression, value alarms on an analog one.', ['bit', 'value']),
        label: string('Alarm label. Defaults to the next LabelN the wizard would generate; pass a real label for anything an operator reads.'),
        trigger_value: string('Trigger-value for the message row. Defaults to the new message number, which is what the wizard writes for a bit alarm.'),
        ack_all: choice('Ack-all behaviour for a bit trigger.', ['default', 'yes', 'no']),
        audio: choice('Sound the alarm on first occurrence.', ['default', 'yes', 'no']),
        show: choice('Display the alarm in the alarm view.', ['default', 'yes', 'no']),
        print: choice('Print the alarm record.', ['default', 'yes', 'no']),
      }, ['expression', 'message_text']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const file = alarmFileOf(view.app)
        const flag = (name: string): boolean | undefined => {
          const value = optionalString(args, name)
          return value === undefined || value === 'default' ? undefined : value === 'yes'
        }
        const label = optionalString(args, 'label')
        const triggerValue = optionalString(args, 'trigger_value')
        const ackAll = flag('ack_all')
        const audio = flag('audio')
        const show = flag('show')
        const print = flag('print')
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'alarm_add',
          file,
          type: optionalString(args, 'type') === 'value' ? 'value' as const : 'bit' as const,
          exp: requiredString(args, 'expression'),
          text: requiredString(args, 'message_text'),
          ...(label === undefined ? {} : { label }),
          ...(triggerValue === undefined ? {} : { triggerValue }),
          ...(ackAll === undefined ? {} : { ackAll }),
          ...(audio === undefined ? {} : { audio }),
          ...(show === undefined ? {} : { display: show }),
          ...(print === undefined ? {} : { print }),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_alarm_set',
      description: 'Stage one attribute change on an alarm trigger row (by id, e.g. "T12") or a message row (by id, e.g. "M3"). Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        trigger: string('Trigger id to change, as ftview_alarm_report lists them. Example: "T12". Pass this or message, exactly one.'),
        message: string('Message id to change. Example: "M3".'),
        attribute: string('Attribute to set. Trigger rows take exp, label, type, ack-tag, remote-ack-exp and the rest of the wizard columns; message rows take text, trigger, audio, display, print and colours.'),
        value: string('New attribute value. Example: "Pump pressure high".'),
      }, ['attribute', 'value']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const file = alarmFileOf(view.app)
        const trigger = optionalString(args, 'trigger')
        const message = optionalString(args, 'message')
        if ((trigger === undefined) === (message === undefined)) {
          throw new EngineeringError('INVALID_ARGUMENT', 'An alarm row edit names exactly one row: pass trigger for a trigger row, or message for a message row.', 'Example: trigger "T12" with attribute "label" and value "Pump pressure high".')
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'alarm_set',
          file,
          target: trigger === undefined ? 'message' as const : 'trigger' as const,
          id: (trigger ?? message) as string,
          attribute: requiredString(args, 'attribute'),
          value: requiredString(args, 'value'),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_alarm_delete',
      description: 'Stage the removal of one alarm trigger, together with every message row that points at it. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        trigger: string('Trigger id to delete, as ftview_alarm_report lists them. Example: "T12".'),
      }, ['trigger']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const file = alarmFileOf(view.app)
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'alarm_delete',
          file,
          trigger: requiredString(args, 'trigger'),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_validate',
      description: 'Prepare the staged edits: apply them to a re-parsed copy, validate the changed displays against the installed Gfx-ME schema, and report the changed files and findings. Writes nothing.',
      parameters: object({ draft_id: DRAFT_ID, limit: integer('Maximum findings to return; the counts in by_rule stay complete.', { minimum: 1, maximum: 500 }) }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const view = session.require(draft.viewId, exec)
        const prepared = await prepareEdit(fs, view.app, draft.operations, exec.signal)
        const limit = optionalInteger(args, 'limit') ?? 50
        const byRule: Record<string, number> = {}
        for (const finding of prepared.findings) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1
        const schemaErrors = prepared.schema.findings.filter(finding => finding.error)
        // A schema error means apply will refuse the draft, so say that before suggesting apply.
        const blocked = schemaErrors.length > 0
        return success(
          blocked
            ? `${draft.operations.length} operation(s); ${prepared.texts.size} file(s) change; ${prepared.findings.length} finding(s); schema FAILED with ${schemaErrors.length} error(s), so ftview_apply will refuse this draft.`
            : `${draft.operations.length} operation(s); ${prepared.texts.size} file(s) change; ${prepared.findings.length} finding(s); schema ${prepared.schema.ran ? 'ran with no error' : 'unavailable'}.`,
          {
            draft_id: draft.id,
            draft_sha256: prepared.hash,
            changed_files: [...prepared.texts.keys()],
            added: prepared.added,
            findings: prepared.findings.slice(0, limit),
            findings_total: prepared.findings.length,
            findings_truncated: prepared.findings.length > limit,
            by_rule: byRule,
            schema: prepared.schema,
            schema_errors: schemaErrors,
            apply_blocked: blocked,
          },
          blocked
            ? [{ tool: 'ftview_validate', args: { draft_id: draft.id }, why: 'Fix the schema errors above, then validate again before applying.' }]
            : [{ tool: 'ftview_apply', args: { draft_id: draft.id }, why: 'Write the prepared export to a new folder.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_verify_import',
      description: 'Compare the staged draft object by object with a fresh export of the application, proving whether the import landed. Exports through the vendor engine by default, or reads an export folder you made by hand (`export_root`), which is the only path when the vendor export is unavailable.',
      parameters: object({
        view_id: VIEW_ID,
        draft_id: DRAFT_ID,
        application: string('Application name as ftview_apps lists it. The same application the package was imported into.'),
        export_root: string('Export folder to verify against instead of running the vendor export, for a File > Export you made by hand after importing the package.'),
      }, ['application']),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const view = session.require(draft.viewId, exec)
        const prepared = await prepareEdit(fs, view.app, draft.operations, exec.signal)
        const expected = new Map([...prepared.texts].filter(([file]) => /\.xml$/iu.test(file) && !/batchimport/iu.test(file) && !/^alarms\//iu.test(file)))
        if (expected.size === 0) {
          throw new EngineeringError('NOTHING_TO_VERIFY', 'This draft changes no display, so there is nothing to compare.', 'Alarm setup changes are proven by the wizard import log, not by this comparison; stage a display edit to verify one.')
        }
        const application = requiredString(args, 'application')
        const manual = optionalString(args, 'export_root')
        const handMade = manual === undefined ? undefined : await session.open(manual, exec)
        const proof = handMade === undefined ? 'a vendor export' : 'the export you passed'
        const root = handMade?.app.root ?? join(tmpdir(), `ftview-verify-${randomUUID()}`)
        if (handMade === undefined) {
          const exported = await exportApplication(application, root)
          if (exported.error !== undefined) {
            throw new EngineeringError(
              'NO_IMPORT_PROOF',
              `The vendor export did not run, so this chat cannot prove the import landed: ${exported.error}`,
              'In Studio choose File > Export for the application after importing the package, then pass that folder as export_root. That export is the proof; a folder exported before the import is not.',
            )
          }
          session.recordSnapshot(application, root)
        }
        const results = await verifyDisplays(fs, root, expected)
        const matched = results.filter(result => result.matched).length
        const differences = results.flatMap(result => result.differences.map(difference => ({ file: result.file, ...difference })))
        const normalised = results.flatMap(result => (result.normalised ?? []).map(difference => ({ file: result.file, ...difference })))
        const reopened = handMade ?? await session.open(root, exec)
        const drift = verifyDraft(draft, reopened.app)
        return success(
          `${matched}/${results.length} display(s) match the draft${allMatched(results) ? '' : `; ${differences.length} difference(s)`}; ${drift.missing + drift.changed === 0 ? 'staged objects all landed' : `${drift.missing} staged object(s) missing and ${drift.changed} changed`}${normalised.length === 0 ? '' : `; vendor added ${normalised.length} default attribute(s) the draft did not set`}. Compared against ${proof}, kept at ${root}.`,
          { application: requiredString(args, 'application'), export_root: root, displays: results, differences, normalised, matched: allMatched(results), drift },
          matched === results.length
            ? [{ tool: 'ftview_draft_display_create', why: 'Author the next screen against the verified export.' }]
            : [{ tool: 'ftview_validate', args: { draft_id: draft.id }, why: 'Re-read the draft findings before correcting the difference.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_apply',
      description: 'Write the prepared edits to a NEW export folder: changed files get the edits, other text exports are copied verbatim. The source folder is never modified.',
      parameters: object({
        draft_id: DRAFT_ID,
        output_root: string('Folder for the edited export. It must not exist unless overwrite is yes and this chat wrote it. Example: "C:/Projects/Line/ME Export Edited".'),
        overwrite: choice('Re-write a folder this chat already applied into, instead of naming a new one.', ['no', 'yes']),
        package: choice('What the import manifest should list: only the displays this draft changed (delta) or every display in the export (full), which is what a fresh application needs.', ['delta', 'full']),
      }, ['output_root']),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const view = session.require(draft.viewId, exec)
        const prepared = await prepareEdit(fs, view.app, draft.operations, exec.signal)
        const schemaErrors = prepared.schema.findings.filter(finding => finding.error)
        if (schemaErrors.length > 0) {
          throw new EngineeringError(
            'SCHEMA_INVALID',
            `${schemaErrors.length} schema error(s); nothing was written. First: ${schemaErrors[0]?.file}: ${schemaErrors[0]?.message}`,
            'Fix the offending attributes or elements and run ftview_validate again; apply refuses a document the vendor schema rejects.',
            schemaErrors.slice(0, 5).map(finding => `${finding.file}: ${finding.message}`),
          )
        }
        const resolvedRoot = await fs.resolve(requiredString(args, 'output_root'), {
          ...(exec.cwd === undefined ? {} : { cwd: exec.cwd }),
          ...(exec.signal === undefined ? {} : { signal: exec.signal }),
        })
        const existing = await fs.stat(resolvedRoot, exec.signal)
        const outputRoot = targetPath(resolvedRoot)
        const overwrite = optionalString(args, 'overwrite') === 'yes'
        if (existing !== undefined) {
          const tracked = session.appliedAt(outputRoot)
          if (!overwrite) {
            throw new EngineeringError(
              'OUTPUT_EXISTS',
              `A file or folder already exists at ${requiredString(args, 'output_root')}.`,
              'Pass overwrite: "yes" to re-apply into the folder this chat wrote, or a new output_root.',
            )
          }
          if (tracked === undefined) {
            throw new EngineeringError(
              'OUTPUT_NOT_TRACKED',
              `This chat did not write ${outputRoot}, so applying there would merge into someone else's folder.`,
              'Pass a new output_root; overwrite only re-writes a folder this chat created.',
            )
          }
        }
        if (fs.writeText === undefined) {
          throw new EngineeringError('OUTPUT_UNAVAILABLE', 'The filesystem provider in this profile cannot write files.', 'Use a profile whose filesystem provider allows writes.')
        }
        const hashes = new Map(view.app.files.map(file => [file.file, file.sha256]))
        const writeKind = existing === undefined ? 'createIfAbsent' as const : 'overwrite' as const
        const writtenFiles: string[] = []
        let written = 0
        for (const file of view.app.files) {
          const bytes = await fs.readBytes(`${view.app.root}/${file.file}`, exec.signal, 64 * 1024 * 1024)
          if (createHash('sha256').update(bytes).digest('hex') !== hashes.get(file.file)) {
            throw new EngineeringError('STALE_EXPORT', `The export changed on disk since it was opened: ${file.file}.`, 'Reopen the export with ftview_open, stage the edits again, then apply.')
          }
          if (BINARY.test(file.file)) {
            if (fs.writeBytes === undefined) {
              throw new EngineeringError('OUTPUT_UNAVAILABLE', `The filesystem provider cannot copy ${file.file}, which is a binary export file.`, 'Use a profile whose filesystem provider allows binary writes; artwork must travel with the displays.')
            }
            await fs.writeBytes(`${outputRoot}/${file.file}`, bytes, { kind: 'createIfAbsent' }, exec.signal, policyFor(exec))
            writtenFiles.push(file.file)
            written += 1
            continue
          }
          const text = prepared.texts.get(file.file) ?? new TextDecoder('utf-8').decode(bytes)
          await fs.writeText(`${outputRoot}/${file.file}`, text, { kind: 'createIfAbsent' }, exec.signal, policyFor(exec))
          written += 1
        }
        for (const file of prepared.added) {
          const text = prepared.texts.get(file) as string
          await fs.writeText(`${outputRoot}/${file}`, text, { kind: 'createIfAbsent' }, exec.signal, policyFor(exec))
          written += 1
        }
        // The vendor's own import file: Studio's Batch Import reads this list
        // from the Displays folder. Writing it here is what turns a folder of
        // XML into a one-step import.
        // Display files arrive as `Displays/X.xml` from a real export and as
        // `X.xml` when a draft created the display, so both shapes count.
        const changedDisplays = [...prepared.texts.keys()]
          .filter(file => /\.xml$/iu.test(file) && !/batchimport/iu.test(file) && !/^alarms\//iu.test(file))
        const changedAlarms = [...prepared.texts.keys()].filter(file => /^alarms\//iu.test(file) && /\.xml$/iu.test(file))
        const packageMode = optionalString(args, 'package') ?? 'delta'
        // A delta is right for an application that already holds the screens.
        // A fresh application needs every display, or the ones the draft did
        // not touch stay missing and their artwork is never copied.
        const packageDisplays = packageMode === 'full'
          ? view.app.files.map(file => file.file).filter(file => /\.xml$/iu.test(file) && !/batchimport/iu.test(file) && !/^alarms\//iu.test(file) && !/^Images\//iu.test(file) && !/tags/iu.test(file))
          : changedDisplays
        // Artwork travels with the display: a display that names an image is
        // broken after import unless the file is beside it, and the vendor
        // wizard copies only the XML.
        const imageNames = new Set<string>()
        for (const file of packageDisplays) {
          const staged = prepared.texts.get(file)
          const text = staged ?? new TextDecoder('utf-8').decode(await fs.readBytes(`${view.app.root}/${file}`, exec.signal, 64 * 1024 * 1024))
          for (const match of text.matchAll(/\bimageName="([^"]+)"/gu)) imageNames.add(match[1])
        }
        const copiedImages: string[] = []
        const missingImages: string[] = []
        for (const image of imageNames) {
          const found = await findImage(image, view.app.root, fs, exec.signal)
          if (found === undefined) {
            missingImages.push(image)
            continue
          }
          const bytes = await fs.readBytes(found.path, exec.signal, 32 * 1024 * 1024)
          if (fs.writeBytes === undefined) throw new EngineeringError('OUTPUT_UNAVAILABLE', 'This profile cannot copy binary files.', 'Use a profile whose filesystem provider writes bytes.')
          await fs.writeBytes(`${outputRoot}/Images/${found.file}`, bytes, { kind: 'createIfAbsent' }, exec.signal, policyFor(exec))
          copiedImages.push(found.file)
          written += 1
        }

        let manifest: string | undefined
        if (packageDisplays.length > 0) {
          // The wizard needs importType and display on every entry, and resolves
          // importFile beside the batch file, so entries carry bare file names.
          const existing = new Set(view.app.displays.map(display => display.name))
          const rows = packageDisplays.map(file => {
            const name = file.replace(/^Displays\//u, '').replace(/\.xml$/iu, '')
            const kind = existing.has(name) ? 'update' : 'create'
            const escaped = name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
            return { name, kind, line: `    <import importFile="${escaped}.xml" importType="${kind}" display="${escaped}"/>` }
          })
          manifest = `Displays/BatchImport_${view.app.name}.xml`
          await fs.writeText(`${outputRoot}/${manifest}`, `<?xml version="1.0" encoding="UTF-8"?>\n<gfxImport>\n${rows.map(row => row.line).join('\n')}\n</gfxImport>\n`, { kind: 'createIfAbsent' }, exec.signal, policyFor(exec))
          written += 1
          const creates = rows.filter(row => row.kind === 'create').map(row => row.name)
          const updates = rows.filter(row => row.kind === 'update').map(row => row.name)
          const steps = [
            `# Import ${view.app.name}`,
            '',
            `In FactoryTalk View Studio open **${view.app.name}**, then right-click **Displays > Import and Export**.`,
            '',
            '1. Select "Import graphic information into displays" -> Next.',
            '2. Choose Yes to back up the displays that will be modified -> Next (accept the backup folder).',
            '3. Choose "Multiple displays batch import file" -> Next.',
            `4. Select \`${manifest}\` -> Finish.`,
            '5. The wizard opens an import error log text file when the import ends: read it before opening any display — a refused file is named there.',
            '',
            `The manifest holds ${rows.length} display(s): ${creates.length} to create${creates.length === 0 ? '' : ` (${creates.join(', ')})`}, ${updates.length} to update${updates.length === 0 ? '' : ` (${updates.join(', ')})`}.`,
            'A "create" entry fails when the display already exists, and an "update" entry fails when it does not.',
            '',
            'Then:',
            '1. Verify each display opens without warnings.',
            '2. Create the runtime application (`.mer`).',
            '3. Run `ftview_verify_import` to prove the import matches this draft.',
            '',
            ...(changedAlarms.length === 0 ? [] : alarmImportSteps()),
          ].join('\n')
          await fs.writeText(`${outputRoot}/IMPORT.md`, steps, { kind: 'createIfAbsent' }, exec.signal, policyFor(exec))
          written += 1
        }
        if (manifest === undefined && changedAlarms.length > 0) {
          await fs.writeText(`${outputRoot}/IMPORT.md`, `# Import ${view.app.name}\n\n${alarmImportSteps().join('\n')}`, { kind: 'createIfAbsent' }, exec.signal, policyFor(exec))
          written += 1
        }
        session.recordApplied(outputRoot, writtenFiles)
        drafts.remove(exec, draft.id)
        const firstDisplay = changedDisplays[0]?.replace(/^Displays\//iu, '').replace(/\.xml$/iu, '')
        return success(
          `Wrote ${written} file(s) to ${outputRoot}${manifest === undefined ? '' : `; import manifest ${manifest}`}${copiedImages.length === 0 ? '' : `; ${copiedImages.length} image(s)`}${missingImages.length === 0 ? '' : `; ${missingImages.length} image(s) missing from the export`}.`,
          { output_root: outputRoot, draft_id: draft.id, package: packageMode, files_written: written, changed_files: [...prepared.texts.keys()], ...(manifest === undefined ? {} : { manifest }), images: copiedImages, missing_images: missingImages, schema: prepared.schema },
          [
            { tool: 'ftview_open', args: { root: outputRoot }, why: 'Reopen the written export and check it.' },
            ...(firstDisplay === undefined ? [] : [{ tool: 'ftview_render', args: { display: firstDisplay, output: `${outputRoot}/renders` }, why: 'Look at the screen you just wrote before anyone imports it; the PNG is beside the SVG.' }]),
            { tool: 'ftview_verify_import', args: { application: view.app.name }, why: 'After Studio imports it, prove the import matches this draft.' },
          ],
          APPLY_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_render',
      description: 'Draw one display, or up to eight in one call, of the open export as SVG files and as PNGs when a headless Chrome or Edge is installed, so the screens can be inspected before anyone imports them. Reports every object that leaves the canvas or overflows its box. Geometry and colour only: artwork is inlined when the export carries its file; animations and vendor widgets are drawn as labelled placeholders.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list. Omit when displays_json is given.'),
        displays_json: string('JSON array of up to 8 display names to draw in one call. Example: ["Main","Alarms"].'),
        output: string('Folder for the render. Defaults to a "renders" folder beside the export.'),
        source: choice('Draw the committed export file or the staged draft that has not been applied yet.', ['export', 'draft']),
        sheet: choice('Stack every drawing on one review image with a title per display, so a set can be judged in a single look.', ['no', 'yes']),
      }, []),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const fromDraft = optionalString(args, 'source') === 'draft'
        const single = optionalString(args, 'display')
        const listed = args.displays_json === undefined ? undefined : jsonNames(args.displays_json)
        if (single === undefined && listed === undefined) {
          throw new EngineeringError('INVALID_ARGUMENT', 'Pass display or displays_json so there is something to draw.', 'Example: {"display":"Main"} or {"displays_json":"[\"Main\",\"Alarms\"]"}.')
        }
        const names = listed ?? [single as string]
        const drawOne = async (name: string) => {
          const display = view.app.displays.find(candidate => candidate.name === name)
          if (display === undefined && !fromDraft) {
            throw new EngineeringError('NOT_FOUND', `No display is named ${JSON.stringify(name)} in ${view.app.name}.`, 'Call ftview_list with kind "display" and use the exact name.')
          }
          if (display !== undefined && display.parseError !== undefined) {
            throw new EngineeringError('DISPLAY_UNREADABLE', `${name} did not parse: ${display.parseError}`, 'Fix the display file, reopen the export and try again.')
          }
          const sourceFile = display === undefined ? `Displays/${name}.xml` : display.file
          let objects = display?.objects ?? []
          let settings: RenderSettings
          if (fromDraft) {
            const prepared = await prepareEdit(fs, view.app, draftOf(drafts, exec)?.operations ?? [], exec?.signal)
            const staged = [...prepared.texts].find(([path]) => path === sourceFile || path.endsWith(`/${sourceFile}`))
            if (staged === undefined) {
              throw new EngineeringError('NOT_FOUND', `The staged draft does not touch ${name}.`, 'Stage an object or display operation for this display, or render the export with source "export".')
            }
            const parsed = parseDisplay(staged[0], staged[1])
            if (parsed.parseError !== undefined) {
              throw new EngineeringError('DISPLAY_UNREADABLE', `The staged ${name} did not parse: ${parsed.parseError}`, 'Fix the staged edit and try again.')
            }
            objects = parsed.objects
            settings = settingsFromXml(staged[1])
          } else {
            const file = `${view.app.root}/${sourceFile}`
            const bytes = await fs.readBytes(file, exec?.signal, 4 * 1024 * 1024)
            settings = settingsFromXml(new TextDecoder().decode(bytes))
          }
          const images = await loadRasters(fs, view.app.root, objects, exec?.signal)
          const result = renderDisplaySvg(name, objects, settings, images)
          const outputRoot = optionalString(args, 'output') ?? `${view.app.root}/renders`
          const written = await writeRender(outputRoot, name, result)
          return { display: name, svg: written.svg, ...(written.png === undefined ? {} : { png: written.png }), width: result.width, height: result.height, drawn: result.drawn, problems: result.problems }
        }
        const sheetWanted = optionalString(args, 'sheet') === 'yes'
        const browser = findBrowser()
        const note = browser === undefined
          ? 'No Chrome or Edge was found, so only the SVG was written; open it in a browser to see the screen.'
          : undefined
        const screens = []
        for (const name of names) screens.push(await drawOne(name))
        for (const screen of screens) session.recordRendered(screen.display)
        const problems = screens.flatMap(screen => screen.problems)
        const trouble = problems.length === 0
          ? 'No object leaves the canvas or overflows its box.'
          : `${problems.length} layout problem(s): ${problems.slice(0, 3).map(problem => `${problem.object} ${problem.kind === 'outside' ? 'leaves the canvas' : 'overflows its box'}`).join('; ')}${problems.length > 3 ? ' and more' : ''}.`
        const written = screens.map(screen => screen.png ?? screen.svg).join(', ')
        let sheet: string | undefined
        if (sheetWanted && screens.length > 1) {
          const width = Math.max(...screens.map(screen => screen.width))
          const footer = `${screens.length} display(s) from the ${fromDraft ? 'staged draft' : 'export'}; ${problems.length === 0 ? 'no layout problems' : `${problems.length} layout problem(s) marked in red`}`
          const composed = composeSheet(screens.map(screen => ({ name: screen.display, svg: screen.svg })), width, footer)
          const outputRoot = optionalString(args, 'output') ?? `${view.app.root}/renders`
          const written = await writeRender(outputRoot, 'sheet', { ...composed, drawn: 0, problems: [], skipped: [] })
          sheet = written.png ?? written.svg
        }
        const first = screens[0] as { svg: string; png?: string; width: number; height: number; drawn: number }
        return success(
          `Rendered ${screens.length === 1 ? first === undefined ? 'one display' : names[0] : `${screens.length} displays (${names.join(', ')})`} from the ${fromDraft ? 'staged draft' : 'export'} to ${written}. ${note ?? `PNG written by ${browser}.`}${sheet === undefined ? '' : ` Sheet: ${sheet}.`} ${trouble}`,
          {
            source: fromDraft ? 'draft' : 'export',
            ...(screens.length === 1 ? {} : { screens }),
            svg: first.svg,
            ...(first.png === undefined ? {} : { png: first.png }),
            width: first.width,
            height: first.height,
            drawn: screens.reduce((total, screen) => total + screen.drawn, 0),
            problems,
            ...(sheet === undefined ? {} : { sheet }),
            browser: browser ?? null,
          },
          [
            { tool: 'ftview_validate', args: {}, why: 'Design findings explain overlaps and contrast the render shows.' },
            { tool: 'ftview_apply', args: {}, why: 'Write the edited export once the screen looks right.' },
          ],
          RENDER_COVERAGE,
        )
      },
    }),
  ]
}

/** A helper kept for callers that want the operation count type. */
export type { EditOperation }

/**
 * Parse the optional `states_json` array.
 *
 * @param value - JSON text from the tool arguments.
 * @returns States, or undefined when the argument is absent.
 */
/** Palette slots a screen request may override. */
const PALETTE_KEYS = ['backdrop', 'header', 'surface', 'footer', 'titleColor', 'footerColor'] as const

/** Parse palette overrides; a bad colour is refused rather than silently dropped. */
function jsonPalette(value: string | undefined): Partial<ScaffoldTheme> | undefined {
  if (value === undefined || value.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'theme_json is not valid JSON.', 'Pass for example {"header":"#0088C8"}.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new EngineeringError('INVALID_ARGUMENT', 'theme_json must be a JSON object.', 'Pass palette slots, for example {"footer":"#143243"}.')
  }
  const record = parsed as Record<string, unknown>
  const palette: Record<string, string> = {}
  for (const [key, colour] of Object.entries(record)) {
    if (!(PALETTE_KEYS as readonly string[]).includes(key)) {
      throw new EngineeringError('INVALID_ARGUMENT', `theme_json names ${JSON.stringify(key)}, which is not a palette slot.`, `Use one of: ${PALETTE_KEYS.join(', ')}.`)
    }
    if (typeof colour !== 'string' || !/^#[0-9A-Fa-f]{6}$/u.test(colour)) {
      throw new EngineeringError('INVALID_ARGUMENT', `theme_json.${key} is not a #RRGGBB colour.`, 'Pass a six-digit hex colour, for example "#0088C8".')
    }
    palette[key] = colour
  }
  return palette as Partial<ScaffoldTheme>
}

/** Contrast of the two text-on-band pairs the scaffold draws. */
function contrastRows(theme: ScaffoldTheme): readonly { pair: string; ratio: number; pass: boolean }[] {
  const rows = [
    { pair: 'title on header', fore: theme.titleColor, back: theme.header },
    { pair: 'footer text on footer', fore: theme.footerColor, back: theme.footer },
  ]
  return rows.map(row => {
    const ratio = Number(contrastRatio(row.fore, row.back).toFixed(2))
    return { pair: row.pair, ratio, pass: ratio >= 4.5 }
  })
}

/** Parse a screen description, keeping only the fields the layout understands. */
function jsonPopup(value: string): Omit<PopupSpec, 'width' | 'height'> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'spec_json is not valid JSON.', 'Pass a popup like {"title":"CONFIRM","message":"ARE YOU SURE","buttons":[{"label":"NO"},{"label":"YES"}]}.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new EngineeringError('INVALID_ARGUMENT', 'spec_json must be a JSON object.', 'Start from {"message": "...", "buttons": [...]}.')
  const record = parsed as Record<string, unknown>
  if (typeof record.message !== 'string' || record.message.trim() === '') throw new EngineeringError('INVALID_ARGUMENT', 'spec_json needs a message.', 'Pass the text the operator reads, for example "ARE YOU SURE YOU WANT TO START?".')
  if (!Array.isArray(record.buttons) || record.buttons.length === 0) throw new EngineeringError('INVALID_ARGUMENT', 'spec_json needs a buttons array.', 'Pass at least one button, for example [{"label":"YES"}].')
  const buttons: PopupButton[] = record.buttons.map(entry => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new EngineeringError('INVALID_ARGUMENT', 'Each button must be a JSON object.', 'Pass {"label":"YES"} or {"label":"NO","backColor":"#B91C1C"}.')
    const button = entry as Record<string, unknown>
    if (typeof button.label !== 'string' || button.label === '') throw new EngineeringError('INVALID_ARGUMENT', 'Each button needs a label.', 'Pass the caption, for example "YES".')
    const action = button.action
    if (action !== undefined && action !== 'close' && action !== 'goto') throw new EngineeringError('INVALID_ARGUMENT', 'A button action must be "close" or "goto".', 'Omit action to close the popup, or use "goto" with a display name.')
    if (action === 'goto' && (typeof button.display !== 'string' || button.display === '')) throw new EngineeringError('INVALID_ARGUMENT', `Button ${JSON.stringify(button.label)} goes to a display but names none.`, 'Pass the display name in "display".')
    return {
      label: button.label,
      ...(action === undefined ? {} : { action }),
      ...(typeof button.display === 'string' ? { display: button.display } : {}),
      ...(typeof button.backColor === 'string' ? { backColor: button.backColor } : {}),
    }
  })
  return {
    ...(typeof record.title === 'string' && record.title !== '' ? { title: record.title } : {}),
    message: record.message,
    buttons,
    ...(typeof record.positionX === 'number' ? { positionX: record.positionX } : {}),
    ...(typeof record.positionY === 'number' ? { positionY: record.positionY } : {}),
    ...(typeof record.backColor === 'string' ? { backColor: record.backColor } : {}),
    ...(record.frame === true ? { frame: true } : {}),
  }
}

function jsonScreen(value: string): Omit<ScreenSpec, 'width' | 'height'> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'spec_json is not valid JSON.', 'Pass a description like {"title":"MAIN","cards":[{"title":"CUTTER","rows":[{"kind":"value","label":"Belt speed","tag":"BeltSpeed"}]}]}.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new EngineeringError('INVALID_ARGUMENT', 'spec_json must be a JSON object.', 'Start from {"title": "...", "cards": [...]}.')
  const record = parsed as Record<string, unknown>
  if (typeof record.title !== 'string' || record.title === '') throw new EngineeringError('INVALID_ARGUMENT', 'spec_json needs a non-empty title.', 'Pass the header text, for example "LAMINATOR · OVERVIEW".')
  const cards: ScreenCard[] = []
  if (record.cards !== undefined) {
    if (!Array.isArray(record.cards)) throw new EngineeringError('INVALID_ARGUMENT', 'cards must be an array.', 'Pass cards as [{"title":"CUTTER","rows":[...]}].')
    for (const entry of record.cards) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new EngineeringError('INVALID_ARGUMENT', 'Each card must be a JSON object.', 'Pass {"title":"CUTTER","rows":[...]}.')
      const card = entry as Record<string, unknown>
      if (typeof card.title !== 'string' || card.title === '') throw new EngineeringError('INVALID_ARGUMENT', 'Each card needs a title.', 'Pass the card heading, for example "STACK".')
      if (!Array.isArray(card.rows)) throw new EngineeringError('INVALID_ARGUMENT', `Card ${JSON.stringify(card.title)} needs a rows array.`, 'Pass rows as [{"kind":"value","label":"Belt speed","tag":"BeltSpeed"}].')
      const rows = card.rows.map(row => {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) throw new EngineeringError('INVALID_ARGUMENT', 'Each row must be a JSON object.', 'Pass {"kind":"value","label":"Belt speed","tag":"BeltSpeed"}.')
        const item = row as Record<string, unknown>
        const kind = item.kind
        if (kind !== 'value' && kind !== 'lamp') throw new EngineeringError('INVALID_ARGUMENT', 'A row kind must be "value" or "lamp".', 'Use "value" for a numeric readout and "lamp" for a state indicator.')
        if (typeof item.label !== 'string' || item.label === '') throw new EngineeringError('INVALID_ARGUMENT', 'Each row needs a label.', 'Pass the text shown beside the value, for example "Belt speed".')
        if (typeof item.tag !== 'string' || item.tag === '') throw new EngineeringError('INVALID_ARGUMENT', 'Each row needs a tag.', 'Pass the HMI or PLC tag the row shows, for example "BeltSpeed".')
        return { kind, label: item.label, tag: item.tag } as const
      })
      cards.push({ title: card.title, rows })
    }
  }
  const nav: ScreenNav[] = []
  if (record.nav !== undefined) {
    if (!Array.isArray(record.nav)) throw new EngineeringError('INVALID_ARGUMENT', 'nav must be an array.', 'Pass nav as [{"label":"MAIN","display":"MAIN"}].')
    for (const entry of record.nav) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new EngineeringError('INVALID_ARGUMENT', 'Each navigation button must be a JSON object.', 'Pass {"label":"MAIN","display":"MAIN"}.')
      const button = entry as Record<string, unknown>
      if (typeof button.label !== 'string' || button.label === '') throw new EngineeringError('INVALID_ARGUMENT', 'Each navigation button needs a label.', 'Pass the caption, for example "MAIN".')
      if (typeof button.display !== 'string' || button.display === '') throw new EngineeringError('INVALID_ARGUMENT', 'Each navigation button needs a display.', 'Pass the target display name, for example "MAIN".')
      nav.push({ label: button.label, display: button.display })
    }
  }
  const subtitle = typeof record.subtitle === 'string' ? record.subtitle : undefined
  const footer = typeof record.footer === 'string' ? record.footer : undefined
  return {
    title: record.title,
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(footer === undefined ? {} : { footer }),
    cards,
    nav,
  }
}

/** A JSON array of display names, bounded so one call cannot draw a whole application. */
function jsonNames(value: unknown): readonly string[] {
  if (typeof value !== 'string') throw new EngineeringError('INVALID_ARGUMENT', 'displays_json must be a JSON array of display names.', 'Example: ["Main","Alarms"].')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'displays_json is not valid JSON.', 'Example: ["Main","Alarms"].')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new EngineeringError('INVALID_ARGUMENT', 'displays_json must be a non-empty JSON array.', 'Example: ["Main","Alarms"].')
  }
  if (parsed.length > 8) {
    throw new EngineeringError('INVALID_ARGUMENT', `displays_json lists ${parsed.length} displays; at most 8 can be drawn in one call.`, 'Split the list into calls of eight or fewer.')
  }
  for (const name of parsed) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new EngineeringError('INVALID_ARGUMENT', 'Every entry in displays_json must be a display name.', 'Example: ["Main","Alarms"].')
    }
  }
  return [...new Set(parsed as string[])]
}

function jsonStates(value: string | undefined): readonly ObjectState[] | undefined {
  if (value === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'states_json is not valid JSON.', 'Pass an array like [{"stateId":"0","caption":"START"}].')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new EngineeringError('INVALID_ARGUMENT', 'states_json must be a non-empty array.', 'Pass at least one state, for example [{"stateId":"0","caption":"START"}].')
  const states: ObjectState[] = []
  for (const entry of parsed) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new EngineeringError('INVALID_ARGUMENT', 'Each state must be a JSON object.', 'Pass states such as {"stateId":"0","caption":"START","backColor":"#24384A"}.')
    const record = entry as Record<string, unknown>
    const state: Record<string, unknown> = {}
    if (record.stateId !== undefined) {
      if (typeof record.stateId !== 'string') throw new EngineeringError('INVALID_ARGUMENT', 'stateId must be a string.', 'Use "0", "1" or "Error".')
      state.stateId = record.stateId
    }
    if (record.value !== undefined) {
      if (typeof record.value !== 'number' || !Number.isFinite(record.value)) throw new EngineeringError('INVALID_ARGUMENT', 'value must be a number.', 'Use the PLC value that selects this state, for example 1.')
      state.value = Math.trunc(record.value)
    }
    for (const key of ['caption', 'color', 'backColor', 'borderColor'] as const) {
      const field = record[key]
      if (field !== undefined) {
        if (typeof field !== 'string') throw new EngineeringError('INVALID_ARGUMENT', `${key} must be a string.`, `Pass ${key} as text.`)
        state[key] = field
      }
    }
    if (record.fontSize !== undefined) {
      if (typeof record.fontSize !== 'number' || !Number.isFinite(record.fontSize)) throw new EngineeringError('INVALID_ARGUMENT', 'fontSize must be a number.', 'Use a size such as 18.')
      state.fontSize = Math.trunc(record.fontSize)
    }
    if (record.blink !== undefined) {
      if (typeof record.blink !== 'boolean') throw new EngineeringError('INVALID_ARGUMENT', 'blink must be true or false.', 'Pass true to blink the face.')
      state.blink = record.blink
    }
    states.push(state as unknown as ObjectState)
  }
  return states
}

/**
 * Parse the optional `animations_json` object.
 *
 * @param value - JSON text from the tool arguments.
 * @returns Animations, or undefined when the argument is absent.
 */
function jsonAnimations(value: string | undefined): ObjectAnimations | undefined {
  if (value === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new EngineeringError('INVALID_ARGUMENT', 'animations_json is not valid JSON.', 'Pass {"visibility":{"expression":"{AutoRunning} = 0","expressionTrueState":"visible"}}.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new EngineeringError('INVALID_ARGUMENT', 'animations_json must be a JSON object.', 'Pass {"visibility":{"expression":"…","expressionTrueState":"visible"}}.')
  const visibility = (parsed as Record<string, unknown>).visibility
  if (visibility === undefined) throw new EngineeringError('INVALID_ARGUMENT', 'animations_json has no supported animation.', 'Only "visibility" is supported: {"visibility":{"expression":"{Tag} = 1","expressionTrueState":"visible"}}.')
  if (visibility === null || typeof visibility !== 'object' || Array.isArray(visibility)) throw new EngineeringError('INVALID_ARGUMENT', 'visibility must be a JSON object.', 'Pass an expression and an optional expressionTrueState.')
  const record = visibility as Record<string, unknown>
  if (typeof record.expression !== 'string' || record.expression.trim() === '') throw new EngineeringError('INVALID_ARGUMENT', 'visibility.expression must be a non-empty string.', 'Pass for example "{AutoRunning} = 0".')
  const trueState = record.expressionTrueState
  if (trueState !== undefined && trueState !== 'visible' && trueState !== 'invisible') throw new EngineeringError('INVALID_ARGUMENT', 'expressionTrueState must be "visible" or "invisible".', 'Omit it to default to visible.')
  return { visibility: { expression: record.expression, ...(trueState === undefined ? {} : { expressionTrueState: trueState }) } }
}
