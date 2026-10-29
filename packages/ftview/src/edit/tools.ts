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
import { EngineeringError, targetPath, choice, integer, object, optionalInteger, optionalString, requiredString, string, success, tool, type Coverage, type ExecContext, type FsService, type NextStep, type ToolDefinition } from '../core.ts'
import type { ViewSession } from '../session.ts'
import type { EditDraft, EditDrafts } from './drafts.ts'
import { EDIT_COVERAGE, prepareEdit } from './prepare.ts'
import type { DisplayAddOperation, DisplayCreateOperation, EditOperation, ObjectAnimations, ObjectState } from './operations.ts'
import { exportApplication } from '../vendor.ts'
import { allMatched, verifyDisplays } from '../handoff.ts'
import { ELEMENT_TYPES } from '../catalog.ts'
import { scaffoldLayout } from './scaffold.ts'
import { screenLayout, type ScreenCard, type ScreenNav, type ScreenSpec } from './screen.ts'
import { findBrowser, renderDisplaySvg, settingsFromXml, writeRender, type RasterImage, type RenderSettings } from '../render-svg.ts'
import { parseDisplay } from '../model.ts'

/** The view handle parameter, described once. */
const VIEW_ID = string('View handle returned by ftview_open. Omit when exactly one export is open in this chat.')

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

export function editTools(session: ViewSession, drafts: EditDrafts, fs: FsService, maxOperations: number, profileOf?: (id: string) => unknown): readonly ToolDefinition[] {
  /** Resolve the view and append one operation. */
  const stage = (exec: ExecContext | undefined, viewId: string | undefined, operation: EditOperation) => {
    const view = session.require(viewId, exec)
    return { view, draft: drafts.append(exec, view.id, operation, maxOperations) }
  }
  const staged = (draft: { readonly id: string; readonly operations: readonly unknown[] }, operation: EditOperation, profileId?: string) => success(
    `Draft ${draft.id}: ${draft.operations.length} ${draft.operations.length === 1 ? 'operation' : 'operations'}.`,
    { draft_id: draft.id, operation_count: draft.operations.length, last_operation: operation, ...(profileId === undefined ? {} : { profile_applied: profileId }) },
    nextValidate(draft.id),
    EDIT_COVERAGE,
  )
  return [
    tool({
      name: 'ftview_draft_display_set',
      description: 'Stage one attribute change on a display or on one of its named objects. Nothing is written until ftview_apply.',
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
        let layout: ReturnType<typeof screenLayout>
        try {
          layout = screenLayout({ ...spec, width, height })
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
        if (draft === undefined) throw new EngineeringError('INTERNAL', 'The screen description produced no objects.', 'Report this as a defect.')
        return success(
          `Draft ${draft.id}: laid out ${layout.objects.length} objects on ${name} (${spec.cards?.length ?? 0} card(s), ${spec.nav?.length ?? 0} nav button(s)).`,
          {
            draft_id: draft.id,
            operation_count: draft.operations.length,
            placed: layout.objects.map(item => ({ type: item.type, name: item.name })),
            slots: layout.slots,
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
        for (const [key, value] of [['left', '10'], ['top', '10'], ['width', '100'], ['height', '30']] as const) {
          if (attributes[key] === undefined) attributes[key] = value
        }
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
        return success(
          `${draft.operations.length} operation(s); ${prepared.texts.size} file(s) change; ${prepared.findings.length} finding(s); schema ${prepared.schema.ran ? `ran (${schemaErrors.length} error(s))` : 'unavailable'}.`,
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
          },
          [{ tool: 'ftview_apply', args: { draft_id: draft.id }, why: 'Write the prepared export to a new folder.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_verify_import',
      description: 'Export the application again through the vendor engine and compare it object by object with the staged draft, proving whether the import landed. Writes only a temporary export folder.',
      parameters: object({
        view_id: VIEW_ID,
        draft_id: DRAFT_ID,
        application: string('Application name as ftview_apps lists it. The same application the package was imported into.'),
      }, ['application']),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const view = session.require(draft.viewId, exec)
        const prepared = await prepareEdit(fs, view.app, draft.operations, exec.signal)
        const expected = new Map([...prepared.texts].filter(([file]) => /\.xml$/iu.test(file) && !/batchimport/iu.test(file)))
        if (expected.size === 0) {
          throw new EngineeringError('NOTHING_TO_VERIFY', 'This draft changes no display, so there is nothing to compare.', 'Stage a display edit first, import it in Studio, then run this again.')
        }
        const root = join(tmpdir(), `ftview-verify-${randomUUID()}`)
        const exported = await exportApplication(requiredString(args, 'application'), root)
        if (exported.error !== undefined) {
          throw new EngineeringError('VENDOR_EXPORT_FAILED', exported.error, 'Close the application in Studio if it is open, then retry.')
        }
        const results = await verifyDisplays(fs, root, expected)
        const matched = results.filter(result => result.matched).length
        const differences = results.flatMap(result => result.differences.map(difference => ({ file: result.file, ...difference })))
        return success(
          `${matched}/${results.length} display(s) match the draft${allMatched(results) ? '' : `; ${differences.length} difference(s)`}. Export kept at ${root}.`,
          { application: requiredString(args, 'application'), export_root: root, displays: results, differences, matched: allMatched(results) },
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
          const text = prepared.texts.get(file.file) ?? new TextDecoder('utf-8').decode(bytes)
          await fs.writeText(`${outputRoot}/${file.file}`, text, { kind: 'createIfAbsent' }, exec.signal)
          written += 1
        }
        for (const file of prepared.added) {
          const text = prepared.texts.get(file) as string
          await fs.writeText(`${outputRoot}/${file}`, text, { kind: 'createIfAbsent' }, exec.signal)
          written += 1
        }
        // The vendor's own import file: Studio's Batch Import reads this list
        // from the Displays folder. Writing it here is what turns a folder of
        // XML into a one-step import.
        // Display files arrive as `Displays/X.xml` from a real export and as
        // `X.xml` when a draft created the display, so both shapes count.
        const changedDisplays = [...prepared.texts.keys()]
          .filter(file => /\.xml$/iu.test(file) && !/batchimport/iu.test(file) && !/^alarms\//iu.test(file))
        let manifest: string | undefined
        if (changedDisplays.length > 0) {
          const entries = changedDisplays
            .map(file => `    <import importFile="${file.replace(/^Displays\//u, '').replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"/>`)
            .join('\n')
          manifest = `Displays/BatchImport_${view.app.name}.xml`
          await fs.writeText(`${outputRoot}/${manifest}`, `<?xml version="1.0" encoding="UTF-8"?>\n<gfxImport>\n${entries}\n</gfxImport>\n`, { kind: 'createIfAbsent' }, exec.signal)
          written += 1
          const steps = [
            `# Import ${view.app.name}`,
            '',
            `Open FactoryTalk View Studio → Application Manager, open **${view.app.name}**, and import the displays listed in \`Displays/BatchImport_${view.app.name}.xml\` (${changedDisplays.length} file(s)).`,
            '',
            'Then:',
            '1. Verify each display opens without warnings.',
            '2. Create the runtime application (`.mer`).',
            '3. Run `ftview_verify_import` with the draft id to prove the import matches this draft.',
            '',
            'Changed displays:',
            ...changedDisplays.map(file => `- ${file}`),
            '',
          ].join('\n')
          await fs.writeText(`${outputRoot}/IMPORT.md`, steps, { kind: 'createIfAbsent' }, exec.signal)
          written += 1
        }
        session.recordApplied(outputRoot, writtenFiles)
        drafts.remove(exec, draft.id)
        const firstDisplay = changedDisplays[0]?.replace(/^Displays\//iu, '').replace(/\.xml$/iu, '')
        return success(
          `Wrote ${written} file(s) to ${outputRoot}${manifest === undefined ? '' : `; import manifest ${manifest}`}.`,
          { output_root: outputRoot, draft_id: draft.id, files_written: written, changed_files: [...prepared.texts.keys()], ...(manifest === undefined ? {} : { manifest }), schema: prepared.schema },
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
      description: 'Draw one display of the open export as an SVG file, and as a PNG when a headless Chrome or Edge is installed, so the screen can be inspected before anyone imports it. Geometry and colour only: animations, images and vendor widgets are drawn as labelled placeholders.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list.'),
        output: string('Folder for the render. Defaults to a "renders" folder beside the export.'),
        source: choice('Draw the committed export file or the staged draft that has not been applied yet.', ['export', 'draft']),
      }, ['display']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const name = requiredString(args, 'display')
        const fromDraft = optionalString(args, 'source') === 'draft'
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
          const prepared = await prepareEdit(fs, view.app, drafts.get(exec, undefined).operations, exec?.signal)
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
        const browser = findBrowser()
        const note = written.png === undefined
          ? browser === undefined
            ? 'No Chrome or Edge was found, so only the SVG was written; open it in a browser to see the screen.'
            : 'The browser did not produce a PNG; the SVG is valid, so open it directly.'
          : `PNG written by ${browser}.`
        return success(
          `Rendered ${name} (${result.width}x${result.height}) with ${result.drawn} object(s) from the ${fromDraft ? 'staged draft' : 'export'} to ${written.svg}${written.png === undefined ? '' : ` and ${written.png}`}. ${note}`,
          { source: fromDraft ? 'draft' : 'export', svg: written.svg, ...(written.png === undefined ? {} : { png: written.png }), width: result.width, height: result.height, drawn: result.drawn, skipped: result.skipped, browser: browser ?? null },
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
/** Parse a screen description, keeping only the fields the layout understands. */
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
