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
import type { EditDrafts } from './drafts.ts'
import { EDIT_COVERAGE, prepareEdit } from './prepare.ts'
import type { EditOperation } from './operations.ts'
import { exportApplication } from '../vendor.ts'
import { allMatched, verifyDisplays } from '../handoff.ts'
import { ELEMENT_TYPES } from '../catalog.ts'

/** The view handle parameter, described once. */
const VIEW_ID = string('View handle returned by ftview_open. Omit when exactly one export is open in this chat.')

/** The draft handle parameter, described once. */
const DRAFT_ID = string('Draft handle returned by an ftview_draft_* tool. Omit when exactly one draft exists in this chat.')

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

/** One display by name, with a repairable failure. */
function displayOf(view: { app: { displays: readonly { name: string; file: string; objects: readonly { name?: string }[] }[] } }, name: string) {
  const display = view.app.displays.find(candidate => candidate.name === name)
  if (display === undefined) {
    throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(name)} in this export.`, 'Call ftview_list with kind "display" to see the display names.', view.app.displays.slice(0, 5).map(candidate => candidate.name))
  }
  return display
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
      name: 'ftview_draft_object_add',
      description: 'Stage one new object inside a display: geometry, attributes and tag connections. Validated against the vendor schema on ftview_validate. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list.'),
        type: string('Object element type as the export writes it, e.g. "momentaryButton", "text", "panel", "numericDisplay", "gotoButton".'),
        name: string('New object name, unique inside the display.'),
        attributes_json: string('Object attributes as a JSON object, e.g. {"height":"50","width":"120","left":"20","top":"40"}.'),
        caption: string('Optional caption text (text objects and buttons).'),
        connections_json: string('Optional connections as a JSON object, e.g. {"Value":"SystemRunning"}.'),
        parent: string('Optional group name to add inside. Omit to add at the display root.'),
        index: integer('Optional position among siblings, for z-order.', { minimum: 0 }),
        profile_id: string('Optional house-style profile from engineering_profile; its button geometry and font are used when the attributes omit them.'),
      }, ['display', 'type', 'name']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const display = displayOf(view, requiredString(args, 'display'))
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
        if (caption !== undefined) attributes.caption = caption
        const connections = jsonObject(optionalString(args, 'connections_json'), 'connections_json')
        const parent = optionalString(args, 'parent')
        const index = optionalInteger(args, 'index')
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'object_add',
          file: display.file,
          type,
          name: requiredString(args, 'name'),
          attributes,
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
        const display = displayOf(view, requiredString(args, 'display'))
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
        const display = displayOf(view, requiredString(args, 'display'))
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
        const display = displayOf(view, requiredString(args, 'display'))
        const object = requiredString(args, 'object')

        const { draft } = stage(exec, optionalString(args, 'view_id'), { kind: 'object_order', file: display.file, object, index: optionalInteger(args, 'index') ?? 0 })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_validate',
      description: 'Prepare the staged edits: apply them to a re-parsed copy, validate the changed displays against the installed Gfx-ME schema, and report the changed files and findings. Writes nothing.',
      parameters: object({ draft_id: DRAFT_ID }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const view = session.require(draft.viewId, exec)
        const prepared = await prepareEdit(fs, view.app, draft.operations, exec.signal)
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
            findings: prepared.findings,
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
        output_root: string('New folder for the edited export. It must not exist. Example: "C:/Projects/Line/ME Export Edited".'),
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
        if (existing !== undefined) {
          throw new EngineeringError('OUTPUT_EXISTS', `A file or folder already exists at ${requiredString(args, 'output_root')}.`, 'Pass a new output_root; apply never merges into an existing folder.')
        }
        if (fs.writeText === undefined) {
          throw new EngineeringError('OUTPUT_UNAVAILABLE', 'The filesystem provider in this profile cannot write files.', 'Use a profile whose filesystem provider allows writes.')
        }
        const hashes = new Map(view.app.files.map(file => [file.file, file.sha256]))
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
        const changedDisplays = [...prepared.texts.keys()]
          .filter(file => /^Displays\/.+\.xml$/iu.test(file) && !/batchimport/iu.test(file))
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
        drafts.remove(exec, draft.id)
        return success(
          `Wrote ${written} file(s) to ${outputRoot}${manifest === undefined ? '' : `; import manifest ${manifest}`}.`,
          { output_root: outputRoot, draft_id: draft.id, files_written: written, changed_files: [...prepared.texts.keys()], ...(manifest === undefined ? {} : { manifest }), schema: prepared.schema },
          [
            { tool: 'ftview_open', args: { root: outputRoot }, why: 'Reopen the written export and check it.' },
            { tool: 'ftview_verify_import', args: { application: view.app.name }, why: 'After Studio imports it, prove the import matches this draft.' },
          ],
          APPLY_COVERAGE,
        )
      },
    }),
  ]
}

/** A helper kept for callers that want the operation count type. */
export type { EditOperation }
