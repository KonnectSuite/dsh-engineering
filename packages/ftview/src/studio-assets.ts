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

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
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
export function prepareTagExport(application: string, documentsRoot?: string, wizard = tagWizardPath()): AssetPlan {
  const store = projectFolder(application, documentsRoot)
  if (store === undefined) throw new Error(`no Studio project store for ${application}`)
  const med = join(store, `${application}.med`)
  if (!existsSync(med)) throw new Error(`no application database at ${med}`)
  if (!existsSync(wizard)) throw new Error(`the Tag Import and Export Wizard is not installed at ${wizard}`)
  const destination = join(store, `${application}-Tags.CSV`)
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
      'Then call ftview_studio_export_accept with kind="tags" and that destination.',
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
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
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
