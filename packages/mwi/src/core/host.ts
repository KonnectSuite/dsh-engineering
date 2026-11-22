/**
 * What this host can honestly say about MotionWorks IEC.
 *
 * MotionWorks IEC is a Windows application and it is not installed everywhere.
 * The bundle must answer with a probe result — what was looked for and where —
 * rather than with a claimed pass. This module owns the known v3 release line,
 * the probe, the stubbable engine seam and the NOT_INSTALLED envelope.
 *
 * @module dsh-engineering-mwi/core/host
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineResult } from './code-engine.ts'
import { MwiError } from './errors.ts'
import { success, type Success } from './result.ts'

/** The product this bundle drives. */
export const MWI_PRODUCT = 'MotionWorks IEC 3 Pro'

/**
 * The published MotionWorks IEC v3 release line.
 *
 * The "1.19" that old notes recorded is the Ade/math-library version, not a
 * product release; no MotionWorks IEC release numbered 1.19 exists.
 */
export const MWI_KNOWN_VERSIONS = [
  '3.0.3',
  '3.1.0',
  '3.2.0',
  '3.3.0',
  '3.4.0',
  '3.5.0',
  '3.6.0',
  '3.6.1',
  '3.7.0',
  '3.7.5',
] as const

/** The most recent known v3 release. */
export const MWI_LATEST_KNOWN_VERSION = '3.7.5'

/** The known v3 line as one human-readable range. */
export const MWI_VERSION_LINE = '3.0.3–3.7.5'

/** One row of the known-version table. */
export interface MwiKnownVersion {
  /** Three-part product version. */
  readonly version: string
  /** Release date when it is documented; null when it is not verified here. */
  readonly release: string | null
  /** Where the row comes from. */
  readonly note: string
}

/** The published v3 releases this bundle recognises, oldest first. */
export const MWI_VERSION_TABLE: readonly MwiKnownVersion[] = [
  { version: '3.0.3', release: '2015-03-09', note: 'RN.MWIEC.19' },
  { version: '3.1.0', release: null, note: 'vendor v3 line' },
  { version: '3.2.0', release: null, note: 'vendor v3 line' },
  { version: '3.3.0', release: null, note: 'vendor v3 line' },
  { version: '3.4.0', release: null, note: 'vendor v3 line' },
  { version: '3.5.0', release: null, note: 'vendor v3 line' },
  { version: '3.6.0', release: null, note: 'vendor v3 line' },
  { version: '3.6.1', release: null, note: 'vendor v3 line' },
  { version: '3.7.0', release: null, note: 'vendor v3 line' },
  { version: '3.7.5', release: '2024-06-13', note: 'RN.MWIEC.45, current v3 release' },
]

/** One parsed version string, keeping the four-part build when it was recorded. */
export interface MwiVersionInfo {
  /** Three-part product version. */
  readonly version: string
  /** Fourth component of a four-part install version, when present. */
  readonly build: string | null
  /** The version as recorded, three or four parts. */
  readonly display: string
  /** Whether the three-part version is on the known v3 line. */
  readonly known: boolean
}

/**
 * Parse a MotionWorks IEC version out of an About string, uninstall database row
 * or directory name.
 *
 * @param text - Text that may contain a three- or four-part version.
 * @returns The parsed version, or undefined when the text has none.
 */
export function normalizeMwiVersion(text: string): MwiVersionInfo | undefined {
  const match = /(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(text)
  if (match === null) return undefined
  const version = `${match[1]}.${match[2]}.${match[3]}`
  const build = match[4] ?? null
  return {
    version,
    build,
    display: build === null ? version : `${version}.${build}`,
    known: (MWI_KNOWN_VERSIONS as readonly string[]).includes(version),
  }
}

/** Where a probe looked, and what it found there. */
export interface MwiProbeLocation {
  /** What kind of location this is. */
  readonly kind: 'platform' | 'directory' | 'file' | 'registry' | 'process' | 'help-tree' | 'env'
  /** The concrete path, key or variable that was inspected. */
  readonly where: string
  /** Whether the probe found the installation there. */
  readonly found: boolean
  /** Anything worth stating about that location. */
  readonly note?: string
  /** Versions recorded at that location, when it reported any. */
  readonly versions?: readonly string[]
}

/** One uninstall-database row a probe can consume. */
export interface MwiUninstallEntry {
  /** DisplayName value. */
  readonly displayName: string
  /** DisplayVersion value. */
  readonly displayVersion: string | null
  /** InstallLocation value. */
  readonly installLocation: string | null
}

/** Inputs a probe can vary; tests pass fakes instead of touching the host. */
export interface MwiProbeDeps {
  /** Defaults to `process.platform`. */
  readonly platform?: string
  /** Defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>
  /** Defaults to `fs.existsSync`. */
  readonly exists?: (path: string) => boolean
  /** Defaults to `fs.readdirSync`. */
  readonly readDir?: (path: string) => readonly string[]
  /** Defaults to a read-only `reg query` over the machine uninstall keys. */
  readonly uninstallRegistry?: () => readonly MwiUninstallEntry[]
}

/** The honest host answer the tools and the envelope share. */
export interface MwiProbe {
  /** The host platform that was inspected. */
  readonly platform: string
  /** Whether any MotionWorks IEC 3 installation was detected. */
  readonly installed: boolean
  /** Normalised three-part versions detected, oldest first. */
  readonly versions: readonly string[]
  /** Versions exactly as recorded (three- or four-part). */
  readonly displays: readonly string[]
  /** The known v3 release line. */
  readonly known_versions: readonly string[]
  /** The most recent known release. */
  readonly latest_known: string
  /** The known line as a range. */
  readonly version_line: string
  /** Every location the probe inspected, with its result. */
  readonly looked_for: readonly MwiProbeLocation[]
  /** What to do when the installation is absent. */
  readonly fix: string
  /** One sentence describing the detection result. */
  readonly detail: string
  /** The first installation root that was found, when there was one. */
  readonly install_root?: string
}

/** What the honest NOT_INSTALLED answer is asked about. */
export type MwiCapability = 'compile' | 'live' | 'profile'

/** The answer for one capability on a host without the IDE. */
export interface MwiCapabilityAnswer {
  /** Always false: this type is the not-runnable answer. */
  readonly runnable: false
  /** The capability that was asked about. */
  readonly capability: MwiCapability
  /** The machine-readable code. */
  readonly code: 'NOT_INSTALLED'
  /** One sentence naming the result and the probe. */
  readonly message: string
  /** What to do to make it runnable elsewhere. */
  readonly fix: string
  /** Every location the probe inspected. */
  readonly looked_for: readonly MwiProbeLocation[]
  /** Versions the probe detected (empty when nothing was found). */
  readonly installed_versions: readonly string[]
  /** The known v3 release line. */
  readonly known_versions: readonly string[]
}

/** The engine surface the reads use, injectable without Python. */
export interface EngineLike {
  /** Run one engine verb. */
  run(verb: string, request: Readonly<Record<string, unknown>>, timeoutMs?: number, signal?: AbortSignal): Promise<EngineResult>
}

/** One stubbed engine verb. */
export type StubEngineHandler = (request: Readonly<Record<string, unknown>>) => EngineResult

/** One environment override for a deliberate, recorded installation list. */
const INSTALL_VERSIONS_ENV = 'MWI_INSTALL_VERSIONS'
/** The environment variable that points at an extracted help tree. */
const HELP_TREE_ENV = 'MWI_HELP_TREE'
/** Cache for the no-argument probe: the host does not change under one session. */
let cachedProbe: MwiProbe | undefined

/**
 * Read the machine uninstall database for MotionWorks IEC 3 rows.
 *
 * @returns The matching rows, or none when the registry cannot be read.
 */
function registryUninstallEntries(): readonly MwiUninstallEntry[] {
  const hives = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  const entries: MwiUninstallEntry[] = []
  for (const hive of hives) {
    const result = spawnSync('reg', ['query', hive, '/s', '/f', 'MotionWorks IEC 3'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    })
    if (result.error !== undefined || typeof result.stdout !== 'string') continue
    let displayName: string | null = null
    let displayVersion: string | null = null
    let installLocation: string | null = null
    const flush = (): void => {
      if (displayName === null) return
      if (/MotionWorks IEC 3/iu.test(displayName)) entries.push({ displayName, displayVersion, installLocation })
      displayName = null
      displayVersion = null
      installLocation = null
    }
    for (const line of result.stdout.split(/\r?\n/u)) {
      if (line.startsWith('HKEY_')) {
        flush()
        continue
      }
      const match = /^\s{4}([A-Za-z]+)\s+REG_\w+\s+(.*)$/u.exec(line)
      if (match === null) continue
      const key = match[1]
      const value = match[2]
      if (key === 'DisplayName') displayName = value.trim()
      else if (key === 'DisplayVersion') displayVersion = value.trim()
      else if (key === 'InstallLocation') installLocation = value.trim()
    }
    flush()
  }
  return entries
}

/** The fix sentence shared with every not-installed answer. */
function installFix(): string {
  return `Install ${MWI_PRODUCT} (v3 line ${MWI_VERSION_LINE}) on Windows with the 32-bit COM bridge and Python engine, then re-run mw_ide_status; nothing on this host is claimed as verified MotionWorks behavior.`
}

/** Sort three-part versions numerically. */
function sortVersions(versions: readonly string[]): string[] {
  return [...new Set(versions)].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
}

/**
 * Probe the host for a MotionWorks IEC installation.
 *
 * The probe never starts the IDE and never invents a result: it reports every
 * location it inspected, whether that location exists, and the versions found.
 *
 * @param deps - Fakes for tests; omitted, the real host is inspected once.
 * @returns The probe result.
 */
export function probeMwiHost(deps: MwiProbeDeps = {}): MwiProbe {
  if (Object.keys(deps).length === 0 && cachedProbe !== undefined) return cachedProbe
  const platform = deps.platform ?? process.platform
  const env = deps.env ?? process.env
  const exists = deps.exists ?? existsSync
  const readDir = deps.readDir ?? ((path: string): readonly string[] => readdirSync(path))
  const windows = platform === 'win32'
  const located: MwiProbeLocation[] = []
  const versions: string[] = []
  const displays: string[] = []
  let installRoot: string | undefined

  const addVersion = (info: MwiVersionInfo): void => {
    versions.push(info.version)
    displays.push(info.display)
  }

  located.push({
    kind: 'platform',
    where: `process.platform = ${platform}`,
    found: windows,
    note: windows ? 'Windows host.' : `${MWI_PRODUCT} is a Windows application; the vendor IDE and its 32-bit COM bridge cannot be installed on ${platform}.`,
  })

  const installDirs = [
    { where: join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Yaskawa', 'MotionWorks IEC 3 Pro'), kind: 'directory' as const },
    { where: join(env.ProgramFiles ?? 'C:\\Program Files', 'Yaskawa', 'MotionWorks IEC 3 Pro'), kind: 'directory' as const },
  ]
  for (const dir of installDirs) {
    const found = windows && exists(join(dir.where, 'Mwt.exe'))
    if (found && installRoot === undefined) installRoot = dir.where
    located.push({ kind: dir.kind, where: `${dir.where}\\Mwt.exe`, found, note: found ? 'MotionWorks IEC executable found.' : 'No MotionWorks IEC executable there.' })
  }

  const programDataRoot = join(env.ProgramData ?? 'C:\\ProgramData', 'Yaskawa', 'MotionWorks IEC 3 Pro')
  let dataEntries: readonly string[] = []
  if (windows) {
    try {
      dataEntries = readDir(programDataRoot)
    } catch {
      dataEntries = []
    }
  }
  const dataVersions: string[] = []
  for (const entry of dataEntries) {
    const info = normalizeMwiVersion(entry)
    if (info === undefined) continue
    addVersion(info)
    dataVersions.push(info.display)
  }
  located.push({
    kind: 'directory',
    where: `${programDataRoot}\\<version>`,
    found: dataVersions.length > 0,
    note: dataVersions.length > 0 ? 'Executable data directories present.' : 'No installed version directory was found.',
    ...(dataVersions.length > 0 ? { versions: dataVersions } : {}),
  })

  const uninstall = deps.uninstallRegistry === undefined
    ? (windows ? safeRegistry() : [])
    : safeCall(deps.uninstallRegistry)
  const registryVersions: string[] = []
  for (const entry of uninstall) {
    const info = normalizeMwiVersion(entry.displayVersion ?? '')
    if (info === undefined) continue
    addVersion(info)
    registryVersions.push(info.display)
    if (installRoot === undefined && entry.installLocation !== null && entry.installLocation !== '') installRoot = entry.installLocation
  }
  located.push({
    kind: 'registry',
    where: 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall (DisplayName = MotionWorks IEC 3*)',
    found: registryVersions.length > 0,
    note: registryVersions.length > 0 ? 'Uninstall rows named the installed version.' : 'No MotionWorks IEC 3 uninstall row there.',
    ...(registryVersions.length > 0 ? { versions: registryVersions } : {}),
  })

  const helpRoot = env[HELP_TREE_ENV]
  located.push({
    kind: 'help-tree',
    where: helpRoot === undefined ? `${HELP_TREE_ENV} (unset)` : `${HELP_TREE_ENV}=${helpRoot}`,
    found: helpRoot !== undefined && exists(join(helpRoot, 'index.json')),
    note: 'An extracted help tree only; the installed CHMs under %ProgramData%\\Yaskawa\\MotionWorks IEC 3 Pro\\<version>\\plc\\FW_LIB are not extracted by this probe.',
  })

  const envVersions = env[INSTALL_VERSIONS_ENV]
  if (envVersions !== undefined && envVersions !== '') {
    const names = envVersions.split(',').map(part => part.trim()).filter(part => part !== '')
    const recorded: string[] = []
    for (const name of names) {
      const info = normalizeMwiVersion(name)
      if (info === undefined) continue
      addVersion(info)
      recorded.push(info.display)
    }
    located.push({ kind: 'env', where: `${INSTALL_VERSIONS_ENV}=${envVersions}`, found: recorded.length > 0, note: 'Deliberately declared installation list.', ...(recorded.length > 0 ? { versions: recorded } : {}) })
  }

  located.push({
    kind: 'process',
    where: 'Mwt.exe and the Ade.Application.550 COM automation server',
    found: false,
    note: 'A probe does not start the vendor process; mw_ide_status asks the installed bridge instead.',
  })

  const sortedVersions = sortVersions(versions)
  const sortedDisplays = [...new Set(displays)].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  const installed = sortedVersions.length > 0 || installRoot !== undefined
  const probe: MwiProbe = {
    platform,
    installed,
    versions: sortedVersions,
    displays: sortedDisplays,
    known_versions: [...MWI_KNOWN_VERSIONS],
    latest_known: MWI_LATEST_KNOWN_VERSION,
    version_line: MWI_VERSION_LINE,
    looked_for: located,
    fix: installFix(),
    detail: installed
      ? `Detected ${MWI_PRODUCT} installation: ${sortedDisplays.join(', ')}.`
      : `No ${MWI_PRODUCT} installation was detected on ${platform}; ${located.length} locations were inspected and none reported a version.`,
    ...(installRoot === undefined ? {} : { install_root: installRoot }),
  }
  if (Object.keys(deps).length === 0) cachedProbe = probe
  return probe
}

/** Call a registry reader without letting a refusal crash the probe. */
function safeRegistry(): readonly MwiUninstallEntry[] {
  try {
    return registryUninstallEntries()
  } catch {
    return []
  }
}

/** Call an injected reader without letting a refusal crash the probe. */
function safeCall(read: () => readonly MwiUninstallEntry[]): readonly MwiUninstallEntry[] {
  try {
    return read()
  } catch {
    return []
  }
}

/** A probe fixture for tests and for injected adapters. */
export function mwiProbeStub(overrides: Partial<MwiProbe> = {}): MwiProbe {
  return {
    platform: 'win32',
    installed: false,
    versions: [],
    displays: [],
    known_versions: [...MWI_KNOWN_VERSIONS],
    latest_known: MWI_LATEST_KNOWN_VERSION,
    version_line: MWI_VERSION_LINE,
    looked_for: [
      { kind: 'platform', where: 'process.platform = win32', found: true, note: 'Stub host.' },
      { kind: 'directory', where: 'C:\\Program Files (x86)\\Yaskawa\\MotionWorks IEC 3 Pro\\Mwt.exe', found: false, note: 'Stub probe: not inspected.' },
    ],
    fix: installFix(),
    detail: 'Stub probe for tests.',
    ...overrides,
  }
}

/** The honest not-runnable answer for one capability. */
export class MwiHostAdapter {
  /**
   * @param probe - Host probe result; defaults to the real probe.
   */
  constructor(readonly probe: MwiProbe = probeMwiHost()) {}

  /**
   * Answer one capability from the probe.
   *
   * @param kind - Capability asked about.
   * @returns The answer, runnable only when the IDE was detected.
   */
  capability(kind: MwiCapability): MwiCapabilityAnswer {
    const where = this.probe.looked_for.map(location => `${location.kind} at ${location.where}${location.found ? ' (found)' : ' (not found)'}`).join('; ')
    return {
      runnable: false,
      capability: kind,
      code: 'NOT_INSTALLED',
      message: `${MWI_PRODUCT} ${kind} is not runnable on this host: no installation was detected. The probe inspected ${where}. Known ${MWI_PRODUCT} v3 releases are ${MWI_VERSION_LINE}; no MotionWorks result is claimed.`,
      fix: this.fix(kind),
      looked_for: this.probe.looked_for,
      installed_versions: this.probe.versions,
      known_versions: this.probe.known_versions,
    }
  }

  /**
   * The not-runnable success envelope, or undefined when the IDE was found.
   *
   * @param kind - Capability asked about.
   * @returns The honest envelope, or undefined on a host with the IDE.
   */
  notRunnable(kind: MwiCapability): Success<Record<string, unknown>> | undefined {
    if (this.probe.installed) return undefined
    const answer = this.capability(kind)
    return success(
      `${MWI_PRODUCT} ${kind} is not runnable on this host: no installation was detected, and no vendor result is claimed.`,
      {
        status: 'not-runnable',
        code: answer.code,
        capability: kind,
        message: answer.message,
        platform: this.probe.platform,
        installed_versions: this.probe.versions,
        known_versions: this.probe.known_versions,
        known_line: this.probe.version_line,
        looked_for: this.probe.looked_for,
        fix: answer.fix,
      },
      [{ tool: 'mw_ide_status', why: 'Re-probe the host after the vendor IDE is installed.' }],
      {
        complete: false,
        unverified: [`${kind} behavior of ${MWI_PRODUCT}; the IDE is not installed on this host`],
      },
    )
  }

  /**
   * Refuse a capability with the shared NOT_INSTALLED error.
   *
   * @param kind - Capability asked about.
   */
  requireRunnable(kind: MwiCapability): void {
    if (this.probe.installed) return
    const answer = this.capability(kind)
    throw new MwiError('NOT_INSTALLED', `${MWI_PRODUCT} ${kind} is not runnable on this host: no installation was detected.`, answer.fix, answer.looked_for.map(location => location.where))
  }

  /** The fix for one capability. */
  private fix(kind: MwiCapability): string {
    if (kind === 'compile') {
      return `Install ${MWI_PRODUCT} (v3 line ${MWI_VERSION_LINE}) on a Windows host, then re-run mw_ide_status and mw_compile; this host has no vendor IDE, so no compile verdict exists here.`
    }
    if (kind === 'live') {
      return `Start ${MWI_PRODUCT} with the project open (mw_ide_start) on a Windows host; the 32-bit COM bridge cannot run without the installed IDE.`
    }
    return `Run the profile end-to-end on a Windows host with ${MWI_PRODUCT} installed (Dev AryaCode); this host reports no installation, so the profile is not proved.`
  }
}

/**
 * Build an engine stub tests can inject without Python.
 *
 * @param handlers - One response builder per engine verb.
 * @returns An engine that answers every verb.
 */
export function createStubEngine(handlers: Readonly<Record<string, StubEngineHandler>> = {}): EngineLike {
  return {
    async run(verb: string, request: Readonly<Record<string, unknown>>): Promise<EngineResult> {
      const handler = handlers[verb]
      return handler === undefined ? { ok: true, verb, stub: true } : handler(request)
    },
  }
}

/** The Python engine behind the stubbed seam. */
export class MwiEngineHost {
  /**
   * @param engine - The engine surface; a stub in tests.
   * @param probe - The host probe result asked about.
   */
  constructor(private readonly engine: EngineLike, readonly probe: MwiProbe = probeMwiHost()) {}

  /** Run one engine verb. */
  async run(verb: string, request: Readonly<Record<string, unknown>>, timeoutMs?: number, signal?: AbortSignal): Promise<EngineResult> {
    return await this.engine.run(verb, request, timeoutMs, signal)
  }
}
