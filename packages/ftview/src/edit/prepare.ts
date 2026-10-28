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
import { addObject, createDisplay, deleteObject, orderObject, renameDisplay, setAttribute, setObject, upsertTag, type EditOperation } from './operations.ts'
import { validateSchema, type SchemaValidation } from '../schema.ts'

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
    'native binary files are not copied by apply',
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
  for (const operation of operations) {
    if (operation.kind === 'display_set') {
      if (!displayByFile.has(operation.file) && !added.includes(operation.file)) {
        throw new EngineeringError('COMPONENT_NOT_FOUND', `The draft targets ${operation.file}, which this export no longer contains.`, 'Reopen the export and stage the edit again.')
      }
      const current = texts.get(operation.file) ?? await readText(fs, app.root, operation.file, signal)
      texts.set(operation.file, setAttribute(current, operation.object, operation.attribute, operation.value))
      continue
    }
    if (operation.kind === 'display_create') {
      if (displayNames.has(operation.name) || added.includes(operation.file)) {
        throw new EngineeringError('COMPONENT_EXISTS', `A display named ${JSON.stringify(operation.name)} already exists in this export or draft.`, 'Pass a new display name.')
      }
      if (app.files.some(file => file.file.toLowerCase() === operation.file.toLowerCase())) {
        throw new EngineeringError('COMPONENT_EXISTS', `The export already has a file ${operation.file}.`, 'Pass a different file path.')
      }
      texts.set(operation.file, createDisplay(operation))
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
      const next = operation.kind === 'object_add' ? addObject(current, operation)
        : operation.kind === 'object_set' ? setObject(current, operation)
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
  const findings = findingsOf({ displays, tags, tagErrors, diagnostics })
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
