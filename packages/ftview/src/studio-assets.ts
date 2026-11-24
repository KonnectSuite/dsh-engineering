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
import { parseDisplay, type DisplayObject } from './model.ts'
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
      'The wizard opens an import error log text file when the import ends: read it before verifying — a refused file is named there, not in the display comparison.',
    ],
  }
}
/** A prepared component list file for the Add Component Tool. */
export interface ComponentPackagePlan {
  /** Folder holding the component XML files and the list file. */
  readonly folder: string
  /** Component list file SEAddComponent consumes. */
  readonly listFile: string
  /** Install log SEAddComponent writes beside the list file. */
  readonly logFile: string
  /** Command line that runs the install. */
  readonly command: string
  /** Packaged components with their category and target folder. */
  readonly components: readonly { readonly file: string; readonly category: string; readonly folder: string }[]
  /** Steps for the computer-use agent. */
  readonly steps: readonly string[]
}

/** Category types the Add Component Tool installs into. */
export const COMPONENT_CATEGORIES = [
  'Graphics;Displays',
  'Graphics;Global Objects',
  'Graphics;Images',
  'Graphics;DisplayFolders',
  'Graphics;GlobalObjectsFolders',
] as const

/** Characters the Add Component Tool refuses inside a component name. */
export const COMPONENT_FORBIDDEN = /[."%:?*<>#{}[\]'\\\/;=&+\-]/u

/**
 * Build a component list file for the Add Component Tool.
 *
 * `SEAddComponent <application> ME / "<list file>" [overwrite]` installs XML
 * components into an application from a list file naming each file, its
 * category and the folder inside the application it lands in. The tool writes
 * `$AddComponent.txt` beside the list file as the install log, and exits 0 on
 * success, 1 on refusal. Each packaged display must be a `<gfx>` document that
 * parses: a file Studio would refuse is refused here, where the reason is legible.
 *
 * @param application - Application name as `ftview_apps` lists it.
 * @param exportRoot - Applied export folder containing `Displays/`.
 * @param components - Component (display) names, without `.xml`.
 * @param outputRoot - New folder for the package.
 * @param category - Category to install into, one of `COMPONENT_CATEGORIES`.
 * @param targetFolder - Folder inside the application; empty installs at the root of
 *   the category, and a leading separator is dropped rather than passed on. Measured
 *   on Studio 15.0: a component with no `folder` attribute lands at the root,
 *   `folder="\"` makes a folder with an empty name in the tree, and `folder="/"`
 *   makes the tool import the file and then fail the move ("Program completed with
 *   ERRORS." with no "Moving component" line).
 * @param overwrite - Append `overwrite` to the command, replacing existing components.
 * @returns The package paths, the command and the steps.
 */
export function prepareComponentPackage(
  application: string,
  exportRoot: string,
  components: readonly string[],
  outputRoot: string,
  category: string = 'Graphics;Displays',
  targetFolder = '',
  overwrite = false,
): ComponentPackagePlan {
  if (components.length === 0) throw new Error('name at least one component to install')
  if (!(COMPONENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`the Add Component Tool installs into ${COMPONENT_CATEGORIES.join(', ')}; ${category} is not one of them`)
  }
  if (existsSync(outputRoot)) throw new Error(`a file or folder already exists at ${outputRoot}`)
  mkdirSync(outputRoot, { recursive: true })
  const folder = targetFolder.trim().replace(/^[\\/]+/u, '')
  const atRoot = folder === ''
  const entries: { file: string; category: string; folder: string }[] = []
  for (const component of components) {
    const stem = component.replace(/\.xml$/iu, '')
    const refused = [...stem].filter(char => COMPONENT_FORBIDDEN.test(char))
    if (refused.length > 0) throw new Error(`component name ${stem} carries characters the Add Component Tool refuses: ${refused.join(' ')}`)
    const source = join(exportRoot, 'Displays', `${stem}.xml`)
    if (!existsSync(source)) throw new Error(`no component file at ${source}`)
    const text = readFileSync(source, 'utf8')
    if (!/<gfx[\s>]/iu.test(text)) throw new Error(`${source} is not a <gfx> display document`)
    const parsed = parseDisplay(`${stem}.xml`, text)
    if (parsed.parseError !== undefined) throw new Error(`${source} does not parse as a display: ${parsed.parseError}`)
    copyFileSync(source, join(outputRoot, `${stem}.xml`))
    entries.push({ file: `${stem}.xml`, category, folder: atRoot ? '' : folder })
  }
  const listFile = join(outputRoot, `${application}-Components.xml`)
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<hmi>']
  const groups = new Map<string, typeof entries>()
  for (const entry of entries) {
    const group = groups.get(entry.category) ?? []
    group.push(entry)
    groups.set(entry.category, group)
  }
  for (const [type, group] of groups) {
    lines.push(`    <category type="${escapeXmlAttribute(type)}" folder="${escapeXmlAttribute(outputRoot)}">`)
    for (const entry of group) {
      const attribute = entry.folder === '' ? '' : ` folder="${escapeXmlAttribute(entry.folder)}"`
      lines.push(`        <component file="${escapeXmlAttribute(entry.file)}"${attribute}/>`)
    }
    lines.push('    </category>')
  }
  lines.push('</hmi>', '')
  writeFileSync(listFile, lines.join('\n'))
  const command = `SEAddComponent ${application} ME / "${listFile}"${overwrite ? ' overwrite' : ''}`
  return {
    folder: outputRoot,
    listFile,
    logFile: join(outputRoot, '$AddComponent.txt'),
    command,
    components: entries,
    steps: [
      `Close ${application} in FactoryTalk View Studio; the Add Component Tool writes into the application database.`,
      `Run: ${command}`,
      'Add "overwrite" at the end only when replacing components the application already has.',
      `Read ${join(outputRoot, '$AddComponent.txt')} — the install log SEAddComponent writes beside the list file; exit code 0 means installed, 1 means refused.`,
      'A component listed with the Hidden attribute installs without appearing in the Explorer list.',
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
export interface PackageComparison {
  /** Displays the application already holds with the same objects. */
  readonly unchanged: readonly string[]
  /** Displays that exist but differ. */
  readonly changed: readonly string[]
  /** Displays the application does not have. */
  readonly added: readonly string[]
}

/**
 * Compare packaged displays with the application export they will replace.
 *
 * An import rewrites the display, so one whose objects already match costs an
 * update and changes nothing; saying so lets a package drop it before asking.
 *
 * @param exportRoot - Package folder containing the display XML.
 * @param currentRoot - Export of the application as it stands.
 * @param displays - Display names to compare.
 * @param layout - `package` reads `<root>/<name>.xml`; `export` reads `<root>/Displays/<name>.xml`.
 * @returns Which displays are unchanged, changed or new.
 */
export function comparePackage(exportRoot: string, currentRoot: string, displays: readonly string[], layout: 'package' | 'export' = 'package'): PackageComparison {
  const unchanged: string[] = []
  const changed: string[] = []
  const added: string[] = []
  for (const display of displays) {
    const currentFile = join(currentRoot, 'Displays', `${display}.xml`)
    if (!existsSync(currentFile)) {
      added.push(display)
      continue
    }
    const nextFile = layout === 'package' ? join(exportRoot, `${display}.xml`) : join(exportRoot, 'Displays', `${display}.xml`)
    const next = parseDisplay(`${display}.xml`, readFileSync(nextFile, 'utf8'))
    const previous = parseDisplay(`${display}.xml`, readFileSync(currentFile, 'utf8'))
    const same = next.parseError === undefined && previous.parseError === undefined
      ? JSON.stringify(shapeOf(next.objects)) === JSON.stringify(shapeOf(previous.objects))
      : false
    ;(same ? unchanged : changed).push(display)
  }
  return { unchanged, changed, added }
}

/** Object identity: type, name, geometry and caption, enough to spot a real edit. */
function shapeOf(objects: readonly DisplayObject[]): string[] {
  return objects
    .filter(object => !/^(connections|connection|caption|states|state|animations|imageSettings|displaySettings|parameterFile)$/iu.test(object.type))
    .map(object => [object.type, object.name ?? '', object.attributes.left ?? '', object.attributes.top ?? '', object.attributes.width ?? '', object.attributes.height ?? '', object.attributes.caption ?? ''].join('|'))
    .sort()
}

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