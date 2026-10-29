/**
 * Prepare and verify FactoryTalk View asset exports.
 *
 * Rockwell ships desktop wizards for the assets the normal export cannot carry:
 * `DatabaseConverter.exe` (the "Tag Import and Export Wizard") writes the tag
 * database to CSV, and the Alarm Import Export Wizard writes the alarm
 * configuration to XML. Both are dialogs; the reliable actuator is the
 * harness's own computer use.
 *
 * This module does the parts a tool can do deterministically: resolve the
 * application's `.med`, name the wizard and the exact file that must appear, and
 * on the way back validate that the file is a real export before copying it.
 *
 * @module dsh-engineering-ftview/studio-assets
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parseDisplay } from './model.ts'
import { projectFolder } from './vendor.ts'

/** Kinds of asset the wizards produce. */
export type AssetKind = 'tags' | 'alarms'

/** What preparing an export tells the caller to do. */
export interface AssetPlan {
  /** Application name. */
  readonly application: string
  /** Asset kind. */
  readonly kind: AssetKind
  /** Application database handed to the wizard. */
  readonly med: string
  /** File the wizard must write. */
  readonly destination: string
  /** Wizard executable, when one is known. */
  readonly wizard?: string
  /** Steps for the computer-use agent. */
  readonly steps: readonly string[]

}

/** What accepting an export found. */
export interface AcceptedAsset {
  /** Asset kind. */
  readonly kind: AssetKind
  /** Verified source file. */
  readonly source: string
  /** Size in bytes. */
  readonly bytes: number
  /** Modification time, ISO. */
  readonly modified: string
  /** Rows (CSV) or alarm elements (XML). */
  readonly entries: number
  /** Where the file was copied, when a destination was given. */
  readonly copiedTo?: string
}

/** The installed tag wizard. */
export function tagWizardPath(): string {
  return join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Rockwell Software/RSView Enterprise/DatabaseConverter.exe')
}

/**
 * Build the instruction plan for one application's tag export.
 *
 * @param application - Application name as `ftview_apps` lists it.
 * @param documentsRoot - Public Documents folder, injectable for tests.
 * @param wizard - Wizard path, injectable for tests.
 * @returns Paths and the steps the actuator must perform.
 */
export function prepareTagExport(application: string, documentsRoot?: string, wizard = tagWizardPath(), exportRoot?: string): AssetPlan {
  const store = projectFolder(application, documentsRoot)
  if (store === undefined) throw new Error(`no Studio project store for ${application}`)
  const med = join(store, `${application}.med`)
  if (!existsSync(med)) throw new Error(`no application database at ${med}`)
  if (!existsSync(wizard)) throw new Error(`the Tag Import and Export Wizard is not installed at ${wizard}`)
  const destination = exportRoot === undefined || exportRoot === '' ? join(store, `${application}-Tags.CSV`) : join(exportRoot, 'Tags', `${application}.csv`)
  return {
    application,
    kind: 'tags',
    med,
    destination,
    wizard,
    steps: [
      `Start ${basename(wizard)} (Tag Import and Export Wizard).`,
      'Operation: Export FactoryTalk View tag database to CSV files -> Next.',
      `Project: ${med}`,
      `Destination: ${destination} -> Finish.`,
      exportRoot === undefined || exportRoot === ''
        ? 'Then call ftview_studio_export_accept with kind="tags" and that destination.'
        : 'The file is already inside the export, so nothing is copied: call ftview_studio_export_accept with kind="tags", source and destination both that file, to validate it in place.',
    ],
  }
}

/**
 * Validate an asset file the wizard produced and optionally copy it.
 *
 * Tags: a FactoryTalk CSV whose header names `Tag Name`, with at least one data
 * row. Alarms: XML whose root element is `<alarms>`. Empty or wrong-shaped files
 * are refused instead of copied.
 *
 * @param kind - Asset kind.
 * @param source - File to verify.
 * @param destination - Optional folder or file to copy into.
 * @returns What was verified and where it went.
 */
export function acceptAsset(kind: AssetKind, source: string, destination?: string): AcceptedAsset {
  if (!existsSync(source)) throw new Error(`no file at ${source}`)
  const info = statSync(source)
  if (info.size === 0) throw new Error(`${source} is empty`)
  const text = readFileSync(source, 'utf8')
  let entries = 0
  if (kind === 'tags') {
    if (!/Tag Name/iu.test(text) || !/;\s*Tag Type/iu.test(text)) throw new Error(`${source} is not a FactoryTalk tag CSV (no ';Tag Type, Tag Name' header)`)
    entries = text.split(/\r?\n/u).filter(line => /^[DAS],/u.test(line)).length
    if (entries === 0) throw new Error(`${source} has no tag rows`)
  } else {
    if (!/<alarms[\s>]/iu.test(text)) throw new Error(`${source} is not an alarm XML (root <alarms> not found)`)
    entries = (text.match(/<alarm[\s>]/gu) ?? []).length
  }
  let copiedTo: string | undefined
  if (destination !== undefined && destination !== '') {
    const target = /\.(csv|xml)$/iu.test(destination) ? destination : join(destination, basename(source))
    if (resolve(target) !== resolve(source)) {
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(source, target)
    }
    copiedTo = target
  }
  return {
    kind,
    source,
    bytes: info.size,
    modified: info.mtime.toISOString(),
    entries,
    ...(copiedTo === undefined ? {} : { copiedTo }),
  }
}

/**
 * Build the instruction plan for one application's alarm export.
 *
 * The Alarm Import Export Wizard is a dialog hosted by FactoryTalk View Studio
 * (it runs inside `VStudio.exe`), so there is no executable to start: the
 * application must be open, and the wizard is reached from Studio's menu. The
 * wizard defaults to the store folder and the file name `Alarms`, which is the
 * expected file below.
 *
 * @param application - Application name as `ftview_apps` lists it.
 * @param documentsRoot - Public Documents folder, injectable for tests.
 * @returns Paths and the steps the actuator must perform.
 */
export function prepareAlarmExport(application: string, documentsRoot?: string, exportRoot?: string): AssetPlan {
  const store = projectFolder(application, documentsRoot)
  if (store === undefined) throw new Error(`no Studio project store for ${application}`)
  const med = join(store, `${application}.med`)
  if (!existsSync(med)) throw new Error(`no application database at ${med}`)
  const folder = exportRoot === undefined || exportRoot === '' ? store : join(exportRoot, 'Alarms')
  const destination = join(folder, 'Alarms.xml')
  return {
    application,
    kind: 'alarms',
    med,
    destination,
    steps: [
      `Start FactoryTalk View Studio and open ${application}; the alarm wizard runs inside Studio, so it must be open.`,
      'Right-click Alarms > Alarm Setup in the Explorer, choose Import and Export...',
      'Select "Export alarm configuration from application" -> Next.',
      `File name "Alarms", folder ${folder} -> Finish. Use the "..." button to browse there; the wizard defaults to the project store, not this folder.`,
      exportRoot === undefined || exportRoot === ''
        ? 'Then call ftview_studio_export_accept with kind="alarms" and that destination.'
        : 'The file is already inside the export, so nothing is copied: call ftview_studio_export_accept with kind="alarms", source and destination both that file, to validate it in place.',
    ],
  }
}
/** A prepared import package for the Graphics Import Export Wizard. */
export interface DisplayImportPlan {
  /** Folder holding the display XML files and the batch import file. */
  readonly folder: string
  /** Batch import file the wizard consumes. */
  readonly manifest: string
  /** Display names copied into the folder. */
  readonly displays: readonly string[]
  /** Steps for the computer-use agent. */
  readonly steps: readonly string[]
  /** Per-display import action written into the manifest. */
  readonly decisions: readonly { readonly display: string; readonly action: 'create' | 'update' }[]
  /** Displays the application does not have yet. */
  readonly created: number
  /** Displays the application already has. */
  readonly updated: number
}

/**
 * Build a batch import folder from an applied export.
 *
 * `ftview_apply` writes display XML beside a manifest; the Graphics Import
 * Export Wizard needs the files and a `gfxImport` file together, and the app
 * name in the manifest is not what the plugin knows, so the manifest is written
 * from the selected display names. Each source file must be a `<gfx>` document:
 * anything else is refused rather than handed to Studio.
 *
 * @param exportRoot - Applied export folder containing `Displays/`.
 * @param displays - Display names to import, without `.xml`.
 * @param outputRoot - New folder for the package.
 * @returns The package paths and the wizard steps.
 */
export function prepareDisplayImport(
  exportRoot: string,
  displays: readonly string[],
  outputRoot: string,
  mode: 'create' | 'update' = 'create',
  existing?: readonly string[],
): DisplayImportPlan {
  if (displays.length === 0) throw new Error('name at least one display to import')
  if (existsSync(outputRoot)) throw new Error(`a file or folder already exists at ${outputRoot}`)
  // Studio resolves importFile beside the batch file, so the XML files live at the package root.
  const folder = outputRoot
  mkdirSync(folder, { recursive: true })
  for (const display of displays) {
    const source = join(exportRoot, 'Displays', `${display}.xml`)
    if (!existsSync(source)) throw new Error(`no display file at ${source}`)
    const text = readFileSync(source, 'utf8')
    if (!/<gfx[\s>]/iu.test(text)) throw new Error(`${source} is not a <gfx> display document`)
    // A file that does not parse is rejected here rather than inside Studio's wizard,
    // where the only feedback is "Unable to load the XML file".
    const parsed = parseDisplay(`${display}.xml`, text)
    if (parsed.parseError !== undefined) throw new Error(`${source} does not parse as a display: ${parsed.parseError}`)
    copyFileSync(source, join(folder, `${display}.xml`))
  }
  const manifest = join(outputRoot, 'BatchImport.xml')
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<gfxImport>']
  const present = new Set(existing ?? [])
  const decisions: { display: string; action: 'create' | 'update' }[] = displays.map(display => ({
    display,
    action: (existing === undefined ? mode === 'update' : present.has(display)) ? 'update' : 'create',
  }))
  for (const decision of decisions) lines.push(`    <import importFile="${escapeXmlAttribute(decision.display)}.xml" importType="${decision.action}" display="${escapeXmlAttribute(decision.display)}"/>`)
  lines.push('</gfxImport>', '')
  writeFileSync(manifest, lines.join('\n'))
  return {
    folder: outputRoot,
    manifest,
    displays,
    decisions,
    created: decisions.filter(decision => decision.action === 'create').length,
    updated: decisions.filter(decision => decision.action === 'update').length,
    steps: [
      `In FactoryTalk View Studio open the application, then right-click Displays > Import and Export.`,
      'Import graphic information into displays -> Next.',
      'Choose Yes to back up the displays that will be modified -> Next (accept the backup folder).',
      'Choose Multiple displays batch import file -> Next.',
      `Select ${manifest} -> Finish (${decisions.filter(decision => decision.action === 'create').length} create, ${decisions.filter(decision => decision.action === 'update').length} update), then open the display in Studio.`,
    ],
  }
}
/**
 * Display names an export folder holds.
 *
 * This is how the plugin learns whether a display already exists in the
 * application: export the application as it stands, then pass the folder.
 *
 * @param exportRoot - Export folder containing `Displays/`.
 * @returns Display names without the `.xml` suffix.
 */
export function displayNamesIn(exportRoot: string): string[] {
  const folder = join(exportRoot, 'Displays')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter(file => /\.xml$/iu.test(file))
    .map(file => file.replace(/\.xml$/iu, ''))
}

/**
 * Escape a value for an XML attribute.
 *
 * @param value - Text to escape.
 * @returns The escaped text.
 */
function escapeXmlAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}