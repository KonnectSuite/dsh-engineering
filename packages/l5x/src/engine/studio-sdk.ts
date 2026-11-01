import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'
import { documentRoot, firstChild, optionalAttribute, parseXml } from '../model/xml.ts'
import { decodeExport } from '../fs.ts'
import type { LogicSample } from './observations.ts'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const bridgeRoot = [resolve(moduleDir, '../../studio-bridge'), resolve(moduleDir, '../studio-bridge')].find(existsSync) ?? resolve(moduleDir, '../../studio-bridge')
const bridgeProject = join(bridgeRoot, 'StudioBridge.csproj')
const bridgeSource = join(bridgeRoot, 'Program.cs')
const bridgeKey = existsSync(bridgeProject) && existsSync(bridgeSource)
  ? createHash('sha256').update(readFileSync(bridgeProject)).update(readFileSync(bridgeSource)).digest('hex').slice(0, 16)
  : 'missing'
const bridgeBuildRoot = join(tmpdir(), `arya-l5x-studio-bridge-${bridgeKey}-${process.pid}`)
const bridgeDll = join(bridgeBuildRoot, 'bin', 'Release', 'net8.0', 'StudioBridge.dll')
const defaultSdkRoot = 'C:\\Users\\Public\\Documents\\Studio 5000\\Logix Designer SDK'
const sdkRoot = (): string => process.env.LOGIX_DESIGNER_SDK_ROOT || defaultSdkRoot
const bridgeBuilt = (): boolean => existsSync(bridgeProject) && existsSync(bridgeSource) && existsSync(bridgeDll)

export interface SdkStatus {
  available: boolean
  reason: string
  sdk_service_status?: string
  activation_service_status?: string
  communication_services?: { readonly factorytalk_linx: string; readonly factorytalk_linx_02: string; readonly rslinx_classic: string }
  live_communications_available?: boolean
  sdk_root: string
  client_package?: string
  bridge_built: boolean
  /** Minimum project revision the SDK can open. */
  open_supported_project_revisions: '31+'
  /** Minimum project revision whose Logix Designer engine supports Build. */
  build_supported_project_revisions: '37+'
  /** Highest installed Logix Designer release, which is the SDK release axis. */
  sdk_release: number | null
  installed_studio_versions: readonly number[]
}

/** The SDK selects the engine by the project's revision, so these are project floors. */
const MIN_OPEN_REVISION = 31
const MIN_BUILD_REVISION = 37
/** The SDK's documented refusal for a project below the build floor. */
const BUILD_REVISION_OBSERVED = 'Operation not supported on Logix Designer version 36.0'
/** A FactoryTalk Directory cache failure is transient; one retry refreshes it. */
const FTSP_RETRYABLE = /Security cannot proceed|Directory Server|cache has expired/iu

export function parseSdkServiceState(output: string): string {
  return /\bSTATE\s*:\s*\d+\s+([A-Z_]+)/iu.exec(output)?.[1]?.toUpperCase() ?? 'UNKNOWN'
}

export function hasLiveCommunicationsService(states: readonly string[]): boolean {
  return states.slice(0, 2).includes('RUNNING')
}

export function sdkDiagnosticLines(output: string): string[] {
  // ImportLog can contain the only specific reason for an import failure.
  // Remove progress chatter, but preserve import evidence for the engineer.
  return output.split(/\r?\n/u).filter(line => !line.includes('[PROGRESS]'))
}

async function windowsServiceState(name: string): Promise<string> {
  if (process.platform !== 'win32') return 'UNSUPPORTED_PLATFORM'
  try {
    const result = await run('sc.exe', ['query', name], 5_000)
    return result.code === 0 ? parseSdkServiceState(result.output) : 'NOT_INSTALLED'
  } catch { return 'UNAVAILABLE' }
}

function installedStudioVersions(): number[] {
  const base = 'C:\\Program Files (x86)\\Rockwell Software\\Studio 5000\\Logix Designer\\ENU'
  if (!existsSync(base)) return []
  return readdirSync(base).map(name => /^v(\d+)$/iu.exec(name)).filter((match): match is RegExpExecArray => match !== null).map(match => Number(match[1])).sort((a, b) => a - b)
}

async function run(program: string, args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<{ code: number | null; output: string }> {
  return new Promise((done, fail) => {
    const child = spawn(program, args, { windowsHide: true, signal, shell: false })
    let output = ''
    const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-1_000_000) }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timeout = setTimeout(() => child.kill(), timeoutMs)
    child.on('error', error => { clearTimeout(timeout); fail(error) })
    child.on('close', code => { clearTimeout(timeout); done({ code, output }) })
  })
}

/** Run the bridge, retrying once when FactoryTalk Directory cached credentials expired. */
async function runBridge(args: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<{ code: number | null; output: string }> {
  const first = await run('dotnet', args, timeoutMs, signal)
  if (first.code === 0 || !FTSP_RETRYABLE.test(first.output)) return first
  return run('dotnet', args, timeoutMs, signal)
}

export async function studioSdkStatus(): Promise<SdkStatus> {
  const root = sdkRoot()
  const installedVersions = installedStudioVersions()
  const release = installedVersions.at(-1) ?? null
  const [service, activation, factorytalk, factorytalk02, rslinx] = await Promise.all([
    windowsServiceState('LdSdkService'), windowsServiceState('FactoryTalk Activation Service'),
    windowsServiceState('RSLinxNG'), windowsServiceState('RSLinxNG02'), windowsServiceState('RSLinx'),
  ])
  const serviceFields = { sdk_service_status: service, activation_service_status: activation,
    communication_services: { factorytalk_linx: factorytalk, factorytalk_linx_02: factorytalk02, rslinx_classic: rslinx },
    live_communications_available: hasLiveCommunicationsService([factorytalk, factorytalk02, rslinx]) }
  if (service !== 'RUNNING') return { available: false, reason: `Logix Designer SDK Service (LdSdkService) is ${service}; start it in Windows Services before using SDK tools`, ...serviceFields, sdk_root: root, bridge_built: bridgeBuilt(), open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
  if (activation !== 'RUNNING') return { available: false, reason: `FactoryTalk Activation Service is ${activation}; start it before using SDK tools`, ...serviceFields, sdk_root: root, bridge_built: bridgeBuilt(), open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
  if (!existsSync(bridgeProject) || !existsSync(bridgeSource)) return { available: false, reason: 'Studio bridge source was not packaged', ...serviceFields, sdk_root: root, bridge_built: false, open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
  const packageDir = join(root, 'dotnet')
  const files = existsSync(packageDir) ? await readdir(packageDir) : []
  const clientPackage = files.find(file => /^RockwellAutomation\.LogixDesigner\.CSClient\.2\.1\.974\.nupkg$/iu.test(file))
  if (clientPackage === undefined) return { available: false, reason: 'Compatible SDK client package not installed', ...serviceFields, sdk_root: root, bridge_built: bridgeBuilt(), open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
  if (installedVersions.length === 0) return { available: false, reason: 'No Studio 5000 Logix Designer version is installed', ...serviceFields, sdk_root: root, client_package: clientPackage, bridge_built: bridgeBuilt(), open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
  try {
    const dotnet = await run('dotnet', ['--list-sdks'], 10_000)
    const hasNet8 = /(?:^|\n)8\.\d+|(?:^|\n)(?:9|10)\.\d+/u.test(dotnet.output)
    if (dotnet.code !== 0 || !hasNet8) return { available: false, reason: '.NET SDK 8 or later is unavailable', ...serviceFields, sdk_root: root, client_package: clientPackage, bridge_built: bridgeBuilt(), open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
  } catch {
    return { available: false, reason: 'dotnet executable is unavailable', ...serviceFields, sdk_root: root, client_package: clientPackage, bridge_built: bridgeBuilt(), open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
  }
  return { available: true, reason: 'SDK and activation services, client package, and .NET SDK detected', ...serviceFields, sdk_root: root, client_package: clientPackage, bridge_built: bridgeBuilt(), open_supported_project_revisions: '31+', build_supported_project_revisions: '37+', sdk_release: release, installed_studio_versions: installedVersions }
}

function requireLiveDependencies(availability: SdkStatus): void {
  if (!availability.available) throw new EngineeringError('SDK_UNAVAILABLE', availability.reason)
  if (!availability.live_communications_available) throw new EngineeringError('COMMUNICATIONS_UNAVAILABLE',
    'FactoryTalk Linx is not running; the Logix Designer SDK does not support RSLinx Classic communications')
}

/**
 * An export writes a new file, so a missing folder is created for it: the caller named the
 * output it wants, and refusing the folder only made it create one first.
 */
async function createOutputFolder(path: string): Promise<void> {
  const folder = dirname(path)
  if (existsSync(folder)) return
  await mkdir(folder, { recursive: true }).catch(() => {
    throw new EngineeringError('OUTPUT_DIRECTORY', `The folder ${folder} could not be created.`,
      'Pass an output path under a folder this process can write, such as a workspace folder.')
  })
}

/** Export one existing ACD as a new full L5X; this never connects to a controller. */
export async function exportAcdToL5x(acdPath: string, outputPath: string, signal?: AbortSignal): Promise<object> {
  const availability = await studioSdkStatus()
  if (!availability.available) throw new EngineeringError('SDK_UNAVAILABLE', availability.reason)
  if (extname(acdPath).toLowerCase() !== '.acd') throw new EngineeringError('INVALID_ACD', 'Source must be an ACD file')
  if (extname(outputPath).toLowerCase() !== '.l5x') throw new EngineeringError('INVALID_OUTPUT', 'Output must end in .l5x')
  const source = resolve(acdPath)
  const output = resolve(outputPath)
  const sourceInfo = await stat(source).catch(() => { throw new EngineeringError('FILE_NOT_FOUND', 'ACD file not found') })
  if (!sourceInfo.isFile()) throw new EngineeringError('INVALID_ACD', 'ACD path must name a file')
  if (existsSync(output)) throw new EngineeringError('OUTPUT_EXISTS', 'L5X output must be a new file')
  await createOutputFolder(output)
  const sourceHash = createHash('sha256').update(await readFile(source)).digest('hex')
  await ensureBridge(availability, signal)
  let result = await runBridge([bridgeDll, 'export-l5x', source, output], 240_000, signal)
  // A project open in Studio 5000 holds an exclusive handle on its ACD, and the
  // SDK opens the file itself, so the ordinary case - the project the user is
  // working on - failed with "being used by another process". Exporting reads a
  // snapshot: copy the ACD and open the copy. Nothing is written to the original.
  let scratch: string | undefined
  if ((result.code !== 0 || !result.output.includes('EXPORTED_L5X_SUCCEEDED')) && /being used by another process|could not open file/iu.test(result.output)) {
    const scratchDir = join(tmpdir(), `arya-l5x-export-${process.pid}-${Date.now()}`)
    await mkdir(scratchDir, { recursive: true })
    scratch = join(scratchDir, basename(source))
    await copyFile(source, scratch)
    if (createHash('sha256').update(await readFile(scratch)).digest('hex') !== sourceHash) {
      throw new EngineeringError('ACD_CHANGED', 'The ACD changed while it was being copied; save or close it in Studio 5000 and retry')
    }
    result = await runBridge([bridgeDll, 'export-l5x', scratch, output], 240_000, signal)
  }
  if (result.code !== 0 || !result.output.includes('EXPORTED_L5X_SUCCEEDED')) {
    throw new EngineeringError('L5X_EXPORT_FAILED', result.output, 'Close the project in Studio 5000, or retry: a locked ACD is exported from a private copy.')
  }
  if (createHash('sha256').update(await readFile(source)).digest('hex') !== sourceHash)
    throw new EngineeringError('ACD_CHANGED', 'Source ACD changed during export; reopen and export an unchanged source copy')
  if (scratch !== undefined) await rm(dirname(scratch), { recursive: true, force: true }).catch(() => {})
  const bytes = await readFile(output)
  if (bytes.length === 0 || !bytes.toString('utf8', 0, Math.min(bytes.length, 2048)).includes('<RSLogix5000Content')) {
    throw new EngineeringError('L5X_EXPORT_INVALID', 'SDK export did not produce a recognizable L5X file')
  }
  return { source_acd: source, source_sha256: sourceHash, output_path: output, output_bytes: bytes.length,
    output_sha256: createHash('sha256').update(bytes).digest('hex'), exported_at: new Date().toISOString(),
    ...(scratch === undefined ? {} : { exported_from_copy: true }), controller_operation: 'none', studio_review: 'required' }
}

function checkProject(project: ProjectSnapshot, availability: SdkStatus): void {
  if (!availability.available) throw new EngineeringError('SDK_UNAVAILABLE', availability.reason)
  if (project.exportKind !== 'controller') throw new EngineeringError('UNSUPPORTED_EXPORT', 'Offline Studio build requires a full controller L5X export')
  const revision = Number.parseInt(project.softwareRevision, 10)
  if (!Number.isFinite(revision) || revision < MIN_OPEN_REVISION) throw new EngineeringError('SDK_REVISION_UNSUPPORTED', `Installed SDK opens project revision ${MIN_OPEN_REVISION} and later`)
  if (!availability.installed_studio_versions.includes(revision)) throw new EngineeringError('STUDIO_VERSION_UNAVAILABLE', `Studio 5000 v${revision} is not installed; the SDK opens a project with the matching Logix Designer release. Installed versions: ${availability.installed_studio_versions.join(', ') || 'none'}`)
}

async function ensureBridge(availability: SdkStatus, signal?: AbortSignal): Promise<void> {
  if (bridgeBuilt()) return
  const packageDir = join(availability.sdk_root, 'dotnet')
  const escaped = packageDir.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  await mkdir(bridgeBuildRoot, { recursive: true })
  await copyFile(bridgeProject, join(bridgeBuildRoot, 'StudioBridge.csproj'))
  await copyFile(bridgeSource, join(bridgeBuildRoot, 'Program.cs'))
  await writeFile(join(bridgeBuildRoot, 'NuGet.Config'), `<configuration><packageSources><clear/><add key="LocalRockwellSdk" value="${escaped}"/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources></configuration>`, 'utf8')
  const buildProject = join(bridgeBuildRoot, 'StudioBridge.csproj')
  const restored = await run('dotnet', ['restore', buildProject, '--configfile', join(bridgeBuildRoot, 'NuGet.Config'), '--ignore-failed-sources'], 120_000, signal)
  if (restored.code !== 0) throw new EngineeringError('SDK_BRIDGE_BUILD_FAILED', restored.output)
  const built = await run('dotnet', ['build', buildProject, '-c', 'Release', '--no-restore'], 120_000, signal)
  if (built.code !== 0 || !existsSync(bridgeDll)) throw new EngineeringError('SDK_BRIDGE_BUILD_FAILED', built.output)
}

/**
 * What to do after one offline verification attempt.
 *
 * A failed build can come back with no diagnostic line at all — the Studio engine stops and
 * reports nothing — and telling a reader to "read diagnostics" when the list is empty is advice
 * that cannot be followed. The gates to check are stated instead.
 *
 * @param result - The observed outcome of the attempt.
 * @returns The next step, in the reader's terms.
 */
export function verifyNextStep(result: {
  readonly passed: boolean
  readonly failureStage: string | null
  readonly sdkError: string | null
  readonly diagnosticCount: number
}): string {
  if (result.passed) return 'Review the engineering diff and controller target before any approved download.'
  if (result.failureStage === 'import') return 'The SDK could not import this export; the failure is not the build revision. Read sdk_error and diagnostics, then compare an unedited export from this project before changing the draft.'
  if (result.sdkError === null && result.diagnosticCount === 0) {
    return `The Studio engine stopped at ${String(result.failureStage)} without reporting a diagnostic line, so there is nothing to read. The two gates to check are a Logix Designer release installed for this export revision, and project revision ${MIN_BUILD_REVISION} or later for a build. Keep log as the evidence, then compare an unedited export from this project before changing the draft.`
  }
  return 'Read diagnostics, correct the L5X, reopen the changed file, and retry with a new ACD path. If the cause is unclear, build the unedited source as a baseline.'
}

export async function verifyOfflineL5x(project: ProjectSnapshot, outputPath: string, signal?: AbortSignal, options: { readonly probeBuild?: boolean } = {}): Promise<object> {
  // Local preconditions first. Whether the export this chat reviewed is still the file on disk
  // needs no SDK, and answering first means a missing or replaced file is reported as that
  // rather than surfacing as a plugin defect behind an SDK probe.
  const source = resolve(project.path)
  if (!existsSync(source)) throw new EngineeringError('FILE_NOT_FOUND', `The export ${project.path} is no longer on disk, so there is nothing to verify.`, 'Reopen the export with open_project — a draft applied in this chat has to be reopened — then retry with a new .ACD path.')
  const output = resolve(outputPath)
  if (extname(output).toLowerCase() !== '.acd') throw new EngineeringError('INVALID_OUTPUT', 'Output path must end in .acd')
  if (source.toLowerCase() === output.toLowerCase()) throw new EngineeringError('SOURCE_OVERWRITE', 'Output must differ from source')
  if (existsSync(output)) throw new EngineeringError('OUTPUT_EXISTS', 'Output must be a new file')
  const sourceHash = createHash('sha256').update(await readFile(source)).digest('hex')
  if (sourceHash !== project.sha256) throw new EngineeringError('STALE_EXPORT', 'Source L5X changed since open_project')
  const availability = await studioSdkStatus()
  checkProject(project, availability)
  const revision = Number.parseInt(project.softwareRevision, 10)
  if (revision < MIN_BUILD_REVISION && options.probeBuild !== true) throw new EngineeringError('SDK_BUILD_UNSUPPORTED', `Project revision ${revision} cannot be built: the SDK selects the Logix Designer engine by project revision, and Build is supported only for project revision ${MIN_BUILD_REVISION} or later (observed: "${BUILD_REVISION_OBSERVED}"). Upgrade or convert the project, use Studio 5000 Import + Verify, or pass probe=true to attempt the build and report the SDK's own error.`)
  await createOutputFolder(output)
  await ensureBridge(availability, signal)
  const result = await runBridge([bridgeDll, 'verify', source, output], 180_000, signal)
  const outputInfo = existsSync(output) ? await stat(output) : undefined
  const summary = /<Summary Warnings="(\d+)" Errors="(\d+)"\s*\/>/u.exec(result.output)
  const lines = sdkDiagnosticLines(result.output)
  const log = lines.slice(-60).join('\n').slice(-16_000)
  const passed = result.code === 0 && result.output.includes('OFFLINE_BUILD_SUCCEEDED') && (outputInfo?.size ?? 0) > 0
  const diagnostics = lines.filter(line => /\b(?:error|failed|exception|warning)\b/iu.test(line) && !/Warnings="0" Errors="0"/u.test(line)).slice(-30)
  const sdkError = /SDK_OPERATION_FAILED:\s*([^\r\n]+)/u.exec(result.output)?.[1]?.trim()
    ?? /(?:ERROR|error)[^\r\n]*(?:Exception|XMLSrv_)[^\r\n]*/u.exec(result.output)?.[0]?.trim() ?? null
  const failureStage = passed ? null
    : /XMLSrv_E_IMPORT|Import was cancelled|IMPORT_ABORTED/iu.test(result.output) ? 'import'
      : result.output.includes('Build started') ? 'build'
        : result.output.includes('Save As started') ? 'import_or_save' : 'open_source'
  return {
    project_id: project.id, source_path: source, source_sha256: sourceHash,
    output_path: passed ? output : null, partial_output_path: passed ? null : outputInfo === undefined ? null : output,
    output_sha256: passed ? createHash('sha256').update(await readFile(output)).digest('hex') : null,
    sdk_available: true, offline_build: passed ? 'passed' : 'failed', download_ready: passed,
    build_gate: { axis: 'project_revision', minimum: MIN_BUILD_REVISION },
    output_bytes: outputInfo?.size ?? 0, import_warnings: summary === null ? null : Number(summary[1]), import_errors: summary === null ? null : Number(summary[2]),
    failure_stage: failureStage, sdk_error: sdkError, diagnostics, log,
    next_step: verifyNextStep({ passed, failureStage, sdkError, diagnosticCount: diagnostics.length }),
    controller_operation: 'none', studio_review: 'required',
  }
}

/** Work only on a fresh ACD copy; this bridge command has no controller route. */
export async function editOfflineAcd(acdPath: string, draft: ProjectSnapshot, program: string, routine: string, outputPath: string, exportPath: string, signal?: AbortSignal): Promise<{ offline_build: string; source_acd_sha256: string; output_path: string | null; output_sha256: string | null; result_export_path: string | null; log: string; partial_output_path: string | null; failure_stage: string | null; import_errors: number | null }> {
  const availability = await studioSdkStatus()
  checkProject(draft, availability)
  if (Number.parseInt(draft.softwareRevision, 10) < MIN_BUILD_REVISION) throw new EngineeringError('SDK_BUILD_UNSUPPORTED', `Offline ACD edit/build requires project revision ${MIN_BUILD_REVISION} or later because the SDK selects the engine by project revision (observed: "${BUILD_REVISION_OBSERVED}"). Use Studio 5000 for a revision ${draft.softwareRevision} project.`)
  const source = resolve(acdPath); const output = resolve(outputPath); const exported = resolve(exportPath)
  if (extname(source).toLowerCase() !== '.acd' || extname(output).toLowerCase() !== '.acd' || extname(exported).toLowerCase() !== '.l5x')
    throw new EngineeringError('INVALID_OUTPUT', 'Source/output must be ACD and result export must be L5X')
  for (const path of [output, exported, `${output}.routine.l5x`]) {
    if (existsSync(path)) throw new EngineeringError('OUTPUT_EXISTS', `Output must be new: ${path}`)
    await createOutputFolder(path)
  }
  const sourceHash = createHash('sha256').update(await readFile(source)).digest('hex')
  if (createHash('sha256').update(await readFile(draft.path)).digest('hex') !== draft.sha256) throw new EngineeringError('STALE_EXPORT', 'Draft changed since open_project')
  await ensureBridge(availability, signal)
  const result = await run('dotnet', [bridgeDll, 'edit-routine', source, resolve(draft.path), output, program, routine, exported, sourceHash, draft.sha256], 240_000, signal)
  const summary = /<Summary Warnings="(\d+)" Errors="(\d+)"\s*\/>/u.exec(result.output)
  const importErrors = summary === null ? null : Number(summary[2])
  const passed = result.code === 0 && result.output.includes('OFFLINE_ACD_EDIT_SUCCEEDED') && existsSync(output) && existsSync(exported) && (importErrors ?? 0) === 0
  return { offline_build: passed ? 'passed' : 'failed', source_acd_sha256: sourceHash,
    output_path: passed ? output : null, output_sha256: passed ? createHash('sha256').update(await readFile(output)).digest('hex') : null,
    result_export_path: passed ? exported : null, log: sdkDiagnosticLines(result.output).slice(-80).join('\n').slice(-24_000),
    partial_output_path: !passed && existsSync(output) ? output : null, import_errors: importErrors,
    failure_stage: passed ? null : result.output.includes('Build succeeded') ? 'save_or_export' : result.output.includes('Build started') ? 'build' : result.output.includes('OFFLINE_COMPONENT_IMPORT_STARTED') ? 'component_import' : 'open_or_prepare_component' }
}

export async function readControllerMode(project: ProjectSnapshot, commPath: string, signal?: AbortSignal, snapshotPath?: string): Promise<object> {
  const availability = await studioSdkStatus()
  checkProject(project, availability)
  requireLiveDependencies(availability)
  if (commPath.length > 256 || /[\r\n\0]/u.test(commPath)) throw new EngineeringError('INVALID_COMM_PATH', 'Provide one FactoryTalk Linx communications path')
  let mode: string
  let snapshot: ControllerActionFile | undefined
  if (snapshotPath !== undefined) {
    snapshot = await controllerActionPreflight(snapshotPath, commPath)
    mode = await readControllerModeForAction(snapshot, commPath, signal)
  } else {
    await ensureBridge(availability, signal)
    const result = await run('dotnet', [bridgeDll, 'read-mode', resolve(project.path), commPath], 90_000, signal)
    const observed = /^READ_CONTROLLER_MODE=(\w+)$/mu.exec(result.output)?.[1]
    if (result.code !== 0 || observed === undefined) throw new EngineeringError('CONTROLLER_READ_FAILED', result.output)
    mode = observed
  }
  return { project_id: project.id, source_project_sha256: project.sha256, ...(snapshot === undefined ? {} : { snapshot_path: snapshot.path, snapshot_sha256: snapshot.sha256 }), controller_mode: mode, observed_at: new Date().toISOString(), communications_path: commPath, project_controller_match: 'unverified', operation: 'read_only' }
}

/** Read the exported Controller attribute, never an instruction string or a guessed route. */
export function savedL5xCommPath(xml: string): string {
  if (/<!DOCTYPE\b|<!ENTITY\b/iu.test(xml)) throw new EngineeringError('UNSUPPORTED_XML', 'DTD and entity declarations are not accepted')
  const root = documentRoot(parseXml(xml))
  if (root.name !== 'RSLogix5000Content') throw new EngineeringError('INVALID_PROJECT', 'Expected an L5X export')
  const controller = firstChild(root, 'Controller')
  if (controller === undefined) throw new EngineeringError('INVALID_PROJECT', 'L5X export has no Controller element')
  return optionalAttribute(controller, 'CommPath', '').trim()
}

/** Inspect the path recorded in one project, without browsing drivers or going online. */
export async function readProjectCommPath(inputPath: string, signal?: AbortSignal): Promise<object> {
  if (!['.acd', '.l5x'].includes(extname(inputPath).toLowerCase())) throw new EngineeringError('INVALID_PROJECT', 'Path must name an ACD or L5X project')
  const availability = extname(inputPath).toLowerCase() === '.acd' ? await studioSdkStatus() : undefined
  if (availability !== undefined && !availability.available) throw new EngineeringError('SDK_UNAVAILABLE', availability.reason)
  const path = resolve(inputPath)
  const info = await stat(path).catch(() => { throw new EngineeringError('FILE_NOT_FOUND', 'Project file not found') })
  if (!info.isFile()) throw new EngineeringError('INVALID_PROJECT', 'Project path must name a file')
  if (extname(path).toLowerCase() === '.l5x') {
    const bytes = await readFile(path, signal === undefined ? undefined : { signal })
    const commPath = savedL5xCommPath(decodeExport(bytes))
    return { project_path: path, communications_path: commPath, source: 'exported_controller_attribute',
      verified_against_controller: false, operation: 'offline_read_only',
      note: commPath === '' ? 'No communications path is saved; obtain one from Studio 5000 Who Active / FactoryTalk Linx.'
        : 'Confirm this exported path in Studio 5000 Who Active / FactoryTalk Linx before a controller operation.' }
  }
  if (availability === undefined) throw new EngineeringError('SDK_UNAVAILABLE', 'ACD route inspection requires the SDK')
  await ensureBridge(availability, signal)
  const result = await run('dotnet', [bridgeDll, 'get-comm-path', path, '--read-only'], 90_000, signal)
  const commPath = /^PROJECT_COMM_PATH=(.*)$/mu.exec(result.output)?.[1]?.trim()
  if (result.code !== 0 || commPath === undefined) throw new EngineeringError('COMM_PATH_READ_FAILED', result.output)
  return { project_path: path, communications_path: commPath, source: 'project_saved_path',
    verified_against_controller: false, operation: 'offline_read_only',
    note: commPath === '' ? 'No communications path is saved; obtain one from Studio 5000 Who Active / FactoryTalk Linx.'
      : 'Confirm this saved path in Studio 5000 Who Active / FactoryTalk Linx before a controller operation.' }
}

const controllerRouteCache = new Map<string, { sha256: string; ip: string; path: string }>()

export async function rememberControllerRoute(ip: string, projectPath: string, route: string): Promise<void> {
  validateControllerRoute(ip, route)
  const path = resolve(projectPath)
  const bytes = await readFile(path)
  controllerRouteCache.set(path.toLowerCase(), { sha256: createHash('sha256').update(bytes).digest('hex'), ip, path: route })
}

export async function inheritControllerRoute(sourcePath: string, targetPath: string): Promise<void> {
  const source = resolve(sourcePath)
  const saved = controllerRouteCache.get(source.toLowerCase())
  if (saved === undefined) return
  const sourceHash = createHash('sha256').update(await readFile(source)).digest('hex')
  if (sourceHash !== saved.sha256) return
  await rememberControllerRoute(saved.ip, targetPath, saved.path)
}

export function validateControllerIp(ip: string): string {
  const parts = ip.split('.')
  if (parts.length !== 4 || parts.some(part => !/^(?:0|[1-9]\d{0,2})$/u.test(part) || Number(part) > 255))
    throw new EngineeringError('INVALID_IP_ADDRESS', 'Provide the target controller IPv4 address explicitly, for example 192.168.1.3')
  return ip
}

/** A saved Linx route is usable only when its final IP hop is the user's exact target. */
export function validateControllerRoute(ip: string, route: string): string {
  validateControllerIp(ip)
  if (!route || route.length > 256 || /[\r\n\0]/u.test(route))
    throw new EngineeringError('ROUTE_UNAVAILABLE', 'The selected project has no usable FactoryTalk Linx route')
  const addresses = route.split('\\').filter(segment => /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(segment))
  if (addresses.at(-1) !== ip)
    throw new EngineeringError('CONTROLLER_IP_MISMATCH', `Saved FactoryTalk Linx route does not target the supplied controller IP ${ip}`)
  return route
}

/** Resolve a route from the named project and cache it only while that exact file hash is unchanged. */
export async function resolveControllerRoute(ip: string, projectPath: string, signal?: AbortSignal): Promise<string> {
  validateControllerIp(ip)
  requireLiveDependencies(await studioSdkStatus())
  if (!['.acd', '.l5x'].includes(extname(projectPath).toLowerCase()))
    throw new EngineeringError('INVALID_ROUTE_SOURCE', 'route project must be an ACD or full L5X export')
  const path = resolve(projectPath)
  const bytes = await readFile(path).catch(() => { throw new EngineeringError('FILE_NOT_FOUND', 'Route source project not found') })
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const cached = controllerRouteCache.get(path.toLowerCase())
  if (cached?.sha256 === sha256 && cached.ip === ip) return validateControllerRoute(ip, cached.path)
  const result = await readProjectCommPath(path, signal) as { communications_path: string }
  const route = validateControllerRoute(ip, result.communications_path)
  controllerRouteCache.set(path.toLowerCase(), { sha256, ip, path: route })
  return route
}

export type LiveScalarType = 'BOOL' | 'INT' | 'DINT' | 'REAL'
export interface LiveWatchTag { readonly name: string; readonly data_type: LiveScalarType }

/** Wire result from the bounded read-only SDK sampler. */
export interface LiveSamplingResult {
  snapshot_path: string
  snapshot_sha256: string
  communications_path: string
  requested_interval_ms: number
  sample_count: number
  tags: readonly LiveWatchTag[]
  samples: LogicSample[]
  timing: { average_sweep_ms: number; max_sweep_ms: number; average_observed_interval_ms: number | null }
  operation: 'read_only'
  note: string
}

/** Validate SDK sample wire data, including identity, per-tag type, quality and timestamps.
 * @param text - JSON emitted by the owned bridge.
 * @param tags - exact requested watch list.
 * @returns a validated sweep.
 */
export function decodeLogicSample(text: string, tags: readonly LiveWatchTag[]): LogicSample {
  const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  const value: unknown = JSON.parse(text)
  if (!object(value) || typeof value.elapsed_ms !== 'number' || !Number.isFinite(value.elapsed_ms) || value.elapsed_ms < 0
    || typeof value.sweep_ms !== 'number' || !Number.isFinite(value.sweep_ms) || value.sweep_ms < 0 || !Array.isArray(value.values) || value.values.length !== tags.length)
    throw new EngineeringError('CONTROLLER_READ_FAILED', 'SDK returned invalid sample timing or tag count')
  const values: LogicSample['values'] = value.values.map((entry: unknown, index: number) => {
    const tag = tags[index]!
    if (!object(entry) || entry.tag !== tag.name || entry.data_type !== tag.data_type || !['good', 'error'].includes(String(entry.quality))
      || typeof entry.observed_at !== 'string' || !Number.isFinite(Date.parse(entry.observed_at)))
      throw new EngineeringError('CONTROLLER_READ_FAILED', 'SDK returned incorrect tag identity, quality or timestamp')
    const scalar = entry.value
    if (entry.quality === 'good' && (tag.data_type === 'BOOL' ? typeof scalar !== 'boolean'
      : typeof scalar !== 'number' || !Number.isFinite(scalar) || (tag.data_type !== 'REAL' && !Number.isInteger(scalar))))
      throw new EngineeringError('CONTROLLER_READ_FAILED', 'SDK returned a value inconsistent with the requested type')
    if (entry.quality === 'error' && scalar !== null) throw new EngineeringError('CONTROLLER_READ_FAILED', 'Failed read must contain no value')
    return { tag: tag.name, value: typeof scalar === 'boolean' || typeof scalar === 'number' ? scalar : null,
      quality: String(entry.quality), observed_at: entry.observed_at, ...(typeof entry.error === 'string' ? { error: entry.error } : {}) }
  })
  return { elapsed_ms: value.elapsed_ms, sweep_ms: value.sweep_ms, values }
}

export function validateLiveSampling(tags: readonly LiveWatchTag[], sampleCount: number, intervalMs: number): void {
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > 16) throw new EngineeringError('INVALID_WATCH', 'Provide 1 to 16 controller-scoped scalar tags')
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 20) throw new EngineeringError('INVALID_SAMPLE_COUNT', 'sample_count must be 1 through 20')
  if (!Number.isInteger(intervalMs) || intervalMs < 250 || intervalMs > 5000 || sampleCount * intervalMs > 30_000)
    throw new EngineeringError('INVALID_INTERVAL', 'interval_ms must be 250 through 5000, with a maximum 30 second sampling window')
  const names = new Set<string>()
  for (const tag of tags) {
    if (typeof tag?.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(tag.name)) throw new EngineeringError('INVALID_TAG', 'Watch tags must be controller-scoped scalar names')
    if (!['BOOL', 'INT', 'DINT', 'REAL'].includes(tag.data_type)) throw new EngineeringError('INVALID_DATA_TYPE', 'Watch data_type must be BOOL, INT, DINT, or REAL')
    const key = tag.name.toLowerCase()
    if (names.has(key)) throw new EngineeringError('DUPLICATE_TAG', `Duplicate watch tag: ${tag.name}`)
    names.add(key)
  }
}

/** Read repeated sweeps through one open SDK project. Actual sweep timing is returned; the requested interval is not guaranteed. */
export async function sampleLiveTags(snapshotPath: string, commPath: string, tags: readonly LiveWatchTag[], sampleCount: number, intervalMs: number, signal?: AbortSignal): Promise<LiveSamplingResult> {
  validateLiveSampling(tags, sampleCount, intervalMs)
  const availability = await studioSdkStatus()
  requireLiveDependencies(availability)
  checkCommPath(commPath)
  if (extname(snapshotPath).toLowerCase() !== '.acd') throw new EngineeringError('INVALID_SNAPSHOT', 'Live reads require an ACD uploaded from the target controller')
  const snapshot = resolve(snapshotPath)
  const bytes = await readFile(snapshot).catch(() => { throw new EngineeringError('FILE_NOT_FOUND', 'Snapshot ACD not found') })
  await ensureBridge(availability, signal)
  const specs = tags.map(tag => ({ Name: tag.name, DataType: tag.data_type }))
  const result = await run('dotnet', [bridgeDll, 'sample-tags', snapshot, commPath, JSON.stringify(specs), String(sampleCount), String(intervalMs)], 100_000, signal)
  const lines = result.output.split(/\r?\n/u).filter(line => line.startsWith('SAMPLE_JSON='))
  if (result.code !== 0 || !result.output.includes('SAMPLING_SUCCEEDED') || lines.length !== sampleCount)
    throw new EngineeringError('CONTROLLER_READ_FAILED', result.output)
  let samples: LogicSample[]
  try { samples = lines.map(line => decodeLogicSample(line.slice('SAMPLE_JSON='.length), tags)) }
  catch { throw new EngineeringError('CONTROLLER_READ_FAILED', 'SDK returned malformed sample data') }
  if (samples.some(sample => !Number.isFinite(sample.elapsed_ms) || !Number.isFinite(sample.sweep_ms) || !Array.isArray(sample.values) || sample.values.length !== tags.length))
    throw new EngineeringError('CONTROLLER_READ_FAILED', 'SDK returned incomplete sample data')
  const sweepTimes = samples.map(sample => sample.sweep_ms)
  const observedIntervals = samples.slice(1).map((sample, index) => sample.elapsed_ms - samples[index]!.elapsed_ms)
  return { snapshot_path: snapshot, snapshot_sha256: createHash('sha256').update(bytes).digest('hex'), communications_path: commPath,
    requested_interval_ms: intervalMs, sample_count: sampleCount, tags, samples,
    timing: { average_sweep_ms: Math.round(sweepTimes.reduce((sum, value) => sum + value, 0) / sweepTimes.length),
      max_sweep_ms: Math.max(...sweepTimes),
      average_observed_interval_ms: observedIntervals.length ? Math.round(observedIntervals.reduce((sum, value) => sum + value, 0) / observedIntervals.length) : null },
    operation: 'read_only',
    note: 'Readings are sequential SDK calls. Reported sweep and elapsed times show the achieved rate; short transitions can be missed.' }
}

export async function readLiveTag(snapshotPath: string, commPath: string, tag: string, dataType: LiveScalarType, signal?: AbortSignal): Promise<object> {
  const availability = await studioSdkStatus()
  requireLiveDependencies(availability)
  if (commPath.length > 256 || /[\r\n\0]/u.test(commPath)) throw new EngineeringError('INVALID_COMM_PATH', 'Provide one FactoryTalk Linx communications path')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(tag)) throw new EngineeringError('INVALID_TAG', 'Only one controller-scoped scalar tag name is accepted')
  const normalizedType = dataType.toUpperCase() as LiveScalarType
  if (!['BOOL', 'INT', 'DINT', 'REAL'].includes(normalizedType)) throw new EngineeringError('INVALID_DATA_TYPE', 'data_type must be BOOL, INT, DINT, or REAL')
  if (extname(snapshotPath).toLowerCase() !== '.acd') throw new EngineeringError('INVALID_SNAPSHOT', 'Live reads require an ACD uploaded from the target controller')
  const snapshot = resolve(snapshotPath)
  if (!existsSync(snapshot)) throw new EngineeringError('FILE_NOT_FOUND', 'Snapshot ACD not found')
  const bytes = await readFile(snapshot)
  await ensureBridge(availability, signal)
  const result = await run('dotnet', [bridgeDll, 'read-tag', snapshot, commPath, tag, normalizedType], 90_000, signal)
  const value = /^READ_TAG=(.+)$/mu.exec(result.output)?.[1]
  if (result.code !== 0 || value === undefined) throw new EngineeringError('CONTROLLER_READ_FAILED', result.output)
  if (normalizedType === 'BOOL' && value !== 'true' && value !== 'false') throw new EngineeringError('CONTROLLER_READ_FAILED', 'Invalid BOOL value returned by SDK')
  const parsed = normalizedType === 'BOOL' ? value === 'true' : Number(value)
  if (normalizedType !== 'BOOL' && !Number.isFinite(parsed)) throw new EngineeringError('CONTROLLER_READ_FAILED', `Invalid ${normalizedType} value returned by SDK`)
  return { snapshot_path: snapshot, snapshot_sha256: createHash('sha256').update(bytes).digest('hex'), tag, data_type: normalizedType, value: parsed, observed_at: new Date().toISOString(), communications_path: commPath, operation: 'read_only' }
}

export async function readLiveDint(snapshotPath: string, commPath: string, tag: string, signal?: AbortSignal): Promise<object> {
  return readLiveTag(snapshotPath, commPath, tag, 'DINT', signal)
}

export async function captureControllerSnapshot(commPath: string, outputPath: string, signal?: AbortSignal): Promise<object> {
  const availability = await studioSdkStatus()
  requireLiveDependencies(availability)
  if (commPath.length > 256 || /[\r\n\0]/u.test(commPath)) throw new EngineeringError('INVALID_COMM_PATH', 'Provide one FactoryTalk Linx communications path')
  if (extname(outputPath).toLowerCase() !== '.acd') throw new EngineeringError('INVALID_OUTPUT', 'Snapshot path must end in .acd')
  const output = resolve(outputPath)
  if (existsSync(output)) throw new EngineeringError('OUTPUT_EXISTS', 'Snapshot must be a new file')
  await createOutputFolder(output)
  await ensureBridge(availability, signal)
  const result = await run('dotnet', [bridgeDll, 'upload-new', output, commPath], 900_000, signal)
  if (result.code !== 0 || !result.output.includes('UPLOAD_TO_NEW_ACD_SUCCEEDED')) throw new EngineeringError('CONTROLLER_UPLOAD_FAILED', result.output)
  const bytes = await readFile(output)
  return { output_path: output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), captured_at: new Date().toISOString(), communications_path: commPath, controller_operation: 'read_only_upload_to_new_local_file' }
}

export async function controllerUploadPreflight(commPath: string, outputPath: string): Promise<string> {
  const availability = await studioSdkStatus()
  requireLiveDependencies(availability)
  checkCommPath(commPath)
  if (extname(outputPath).toLowerCase() !== '.acd') throw new EngineeringError('INVALID_OUTPUT', 'Snapshot path must end in .acd')
  const output = resolve(outputPath)
  if (existsSync(output)) throw new EngineeringError('OUTPUT_EXISTS', 'Snapshot must be a new file')
  await createOutputFolder(output)
  return output
}

export interface ControllerActionFile { path: string; sha256: string }

function checkCommPath(commPath: string): void {
  if (!commPath || commPath.length > 256 || /[\r\n\0]/u.test(commPath)) throw new EngineeringError('INVALID_COMM_PATH', 'Provide one FactoryTalk Linx communications path')
}

export async function controllerActionPreflight(acdPath: string, commPath: string): Promise<ControllerActionFile> {
  const availability = await studioSdkStatus()
  requireLiveDependencies(availability)
  checkCommPath(commPath)
  if (extname(acdPath).toLowerCase() !== '.acd') throw new EngineeringError('INVALID_ACD', 'Controller actions require an existing ACD file')
  const path = resolve(acdPath)
  const info = await stat(path).catch(() => { throw new EngineeringError('FILE_NOT_FOUND', 'ACD file not found') })
  if (!info.isFile()) throw new EngineeringError('INVALID_ACD', 'ACD path must name a file')
  const sha256 = createHash('sha256').update(await readFile(path)).digest('hex')
  return { path, sha256 }
}

async function runControllerAction(command: string, file: ControllerActionFile, commPath: string, signal?: AbortSignal, mode?: string, expectedMode?: string): Promise<string> {
  const availability = await studioSdkStatus()
  requireLiveDependencies(availability)
  checkCommPath(commPath)
  const current = createHash('sha256').update(await readFile(file.path)).digest('hex')
  if (current !== file.sha256) throw new EngineeringError('ACD_CHANGED', 'ACD changed after approval; request a new approval')
  await ensureBridge(availability, signal)
  const result = await run('dotnet', [bridgeDll, command, file.path, commPath, file.sha256, ...(mode ? [mode] : []), ...(expectedMode ? [expectedMode] : [])], command === 'download' ? 240_000 : 90_000, signal)
  if (result.code !== 0) throw new EngineeringError('CONTROLLER_OPERATION_FAILED', result.output)
  return result.output
}

export async function goOnline(acdPath: string, commPath: string, signal?: AbortSignal): Promise<object> {
  const file = await controllerActionPreflight(acdPath, commPath)
  await runControllerAction('go-online', file, commPath, signal)
  return { acd_path: file.path, acd_sha256: file.sha256, communications_path: commPath, operation: 'read_only_go_online', observed_at: new Date().toISOString() }
}

export async function readControllerModeForAction(file: ControllerActionFile, commPath: string, signal?: AbortSignal): Promise<string> {
  const availability = await studioSdkStatus()
  requireLiveDependencies(availability)
  checkCommPath(commPath)
  await ensureBridge(availability, signal)
  const result = await run('dotnet', [bridgeDll, 'read-mode', file.path, commPath], 90_000, signal)
  const mode = /^READ_CONTROLLER_MODE=(\w+)$/mu.exec(result.output)?.[1]
  if (result.code !== 0 || mode === undefined) throw new EngineeringError('CONTROLLER_READ_FAILED', result.output)
  return mode
}

export async function changeControllerMode(file: ControllerActionFile, commPath: string, mode: string, expectedMode: string, signal?: AbortSignal): Promise<object> {
  if (!['Program', 'Run', 'Test'].includes(mode)) throw new EngineeringError('INVALID_MODE', 'target_mode must be Program, Run, or Test')
  const log = await runControllerAction('change-mode', file, commPath, signal, mode, expectedMode)
  return { acd_path: file.path, acd_sha256: file.sha256, communications_path: commPath, mode_before: expectedMode, requested_mode: mode, operation: 'approved_mode_change', observed_mode: /^CONTROLLER_MODE_AFTER=(\w+)$/mu.exec(log)?.[1] ?? 'unverified', completed_at: new Date().toISOString() }
}

export async function downloadProject(file: ControllerActionFile, commPath: string, signal?: AbortSignal): Promise<object> {
  const log = await runControllerAction('download', file, commPath, signal)
  return { acd_path: file.path, acd_sha256: file.sha256, communications_path: commPath, operation: 'approved_download', controller_mode_before: /^CONTROLLER_MODE_BEFORE=(\w+)$/mu.exec(log)?.[1] ?? 'unverified', completed_at: new Date().toISOString(), studio_validation: 'human_required' }
}
