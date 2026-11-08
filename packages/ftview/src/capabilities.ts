/**
 * What this host can actually do with FactoryTalk View.
 *
 * The toolset mixes three kinds of capability: exported-file work that runs
 * anywhere, vendor wizards that are separate executables, and wizards that only
 * exist inside a running Studio. Agents should ask this before promising a step.
 *
 * @module dsh-engineering-ftview/capabilities
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { findSqlcmd } from './tagdb.ts'

/** One capability status. */
export type CapabilityStatus = 'available' | 'requires-studio' | 'unverified' | 'missing'

/** Host facts and what each asset path needs. */
export interface Capabilities {
  /** Platform the tools are running on. */
  readonly platform: string
  /** FactoryTalk View Studio executable, when installed. */
  readonly studio: string | undefined
  /** Tag Import and Export Wizard executable, when installed. */
  readonly tagWizard: string | undefined
  /** Installed Gfx schema versions, oldest first. */
  readonly schemas: readonly string[]
  /** Applications present in the public project store. */
  readonly applications: number
  /** Tag database to CSV. */
  readonly tags: CapabilityStatus
  /** Alarm configuration to XML. */
  readonly alarms: CapabilityStatus
  /** Display XML import into an application. */
  readonly import: CapabilityStatus
  /** Application backup through ApplicationManagerServer. */
  readonly backup: CapabilityStatus
  /** Live tag values over EtherNet/IP. */
  readonly live: CapabilityStatus
  /** One line per fact an agent must not guess. */
  readonly notes: readonly string[]
}

/** Locations this detection reads, injectable for tests. */
export interface CapabilityProbe {
  /** `Program Files (x86)` equivalent. */
  readonly programFiles?: string
  /** Public Documents root. */
  readonly documentsRoot?: string
  /** Forced sqlcmd path; null means no local SQL tools. */
  readonly sqlcmd?: string | null
}

/**
 * Read what is installed on this host.
 *
 * @param probe - Optional roots, for tests.
 * @returns Capability matrix.
 */
export function capabilities(probe: CapabilityProbe = {}): Capabilities {
  const programFiles = probe.programFiles ?? process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)'
  const documentsRoot = probe.documentsRoot ?? join(process.env.PUBLIC ?? 'C:/Users/Public', 'Documents')
  const studio = join(programFiles, 'Rockwell Software/RSView Enterprise/VStudio.exe')
  const tagWizard = join(programFiles, 'Rockwell Software/RSView Enterprise/DatabaseConverter.exe')
  const schemasDir = join(programFiles, 'Rockwell Software/RSView Enterprise/Schemas')
  const store = join(documentsRoot, 'RSView Enterprise/ME/HMI projects')
  const schemas = existsSync(schemasDir)
    ? readdirSync(schemasDir).map(name => /^Gfx-ME(\d+)\.xsd$/u.exec(name)?.[1]).filter((version): version is string => version !== undefined).map(Number).sort((a, b) => a - b).map(String)
    : []
  const sqlcmd = probe.sqlcmd === undefined ? findSqlcmd() : probe.sqlcmd ?? undefined
  const applications = existsSync(store) ? readdirSync(store, { withFileTypes: true }).filter(entry => entry.isDirectory()).length : 0
  return {
    platform: process.platform,
    studio: existsSync(studio) ? studio : undefined,
    tagWizard: existsSync(tagWizard) ? tagWizard : undefined,
    schemas,
    applications,
    tags: sqlcmd !== undefined ? 'available' : existsSync(tagWizard) ? 'requires-studio' : 'missing',
    alarms: existsSync(studio) ? 'available' : 'missing',
    import: existsSync(studio) ? 'requires-studio' : 'missing',
    backup: 'unverified',
    live: 'unverified',
    notes: [
      'Tag CSV: ftview_tag_snapshot reads the application tag database directly through local SQL Server and reproduces the wizard CSV byte for byte; no Studio and no wizard. DatabaseConverter.exe remains the fallback.',
      'Alarm XML: ftview_alarm_snapshot decodes M_Alarms\\MachineAlarms.mal into the wizard-identical XML with no Studio and no wizard; only Alarms-stream version 16 is decoded, so the Alarm Import Export Wizard remains the fallback for older databases.',
      'Display import: the Graphics Import Export Wizard is a Studio context menu; there is no standalone importer.',
      'Component install: SEAddComponent.exe installs components (displays, global objects, images, folders) from a component list file; ftview_component_package writes that list file and returns the command line, and $AddComponent.txt beside the list file is the install log.',
      'Backup: ApplicationManagerServer is a 32-bit COM server and BackupLocal has failed on this host; treat backup as unverified.',
      'Live values: EtherNet/IP reads are implemented but not hardware-verified here.',
    ],
  }
}


