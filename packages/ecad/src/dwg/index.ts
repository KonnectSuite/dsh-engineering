/**
 * DWG support for the ECAD engine: a byte-in/byte-out DWG↔DXF converter.
 *
 * The converter is `acadrust` 0.6.8 (MPL-2.0), compiled from
 * `packages/ecad/rust` into `packages/ecad/assets/acadrust.wasm` (the shipping
 * transport) or `packages/ecad/bin/dsh-ecad-dwg[.exe]` (the native fallback).
 * This module is the only entry point a caller needs: it picks a transport,
 * keeps it warm, and reports every failure as a {@link DwgError} with a code and
 * a fix sentence.
 *
 * Nothing here takes a path. A caller reads bytes with the workspace file
 * service, converts, and writes the result where it needs it; that is what keeps
 * the converter usable from a tool, the panel service and a test alike.
 *
 * ```ts
 * import { dwgToDxf, isDwg } from './dwg/index.ts'
 *
 * const dwg = await fs.readFile(path)
 * if (isDwg(dwg)) {
 *   const { dxf, version, warnings } = await dwgToDxf(dwg)
 *   // `dxf` is a DXF drawing the engine's openSheet() can read.
 * }
 * ```
 *
 * @module dsh-engineering-ecad/dwg
 */

import {
  DEFAULT_MAX_CONVERT_BYTES,
  isDwgBytes,
  type DwgBackend,
  type DwgConverterKind
} from './backend.ts'
import { DwgError } from './errors.ts'
import { loadSidecarBackend } from './sidecar.ts'
import { loadWasmBackend } from './wasm.ts'

export { DEFAULT_MAX_CONVERT_BYTES, isDwgBytes } from './backend.ts'
export type { DwgConverterKind } from './backend.ts'
export { DwgError, isDwgError } from './errors.ts'
export type { DwgErrorCode } from './errors.ts'

/** Which converter is installed, and what it can read and write. */
export interface DwgConverterInfo {
  /** Transport that answered, or `unavailable` when nothing is installed. */
  kind: DwgConverterKind
  /** `acadrust` version, for example `"0.6.8"`; empty when unavailable. */
  version: string
  /** Supported `AC10xx` version codes; empty when unavailable. */
  versions: readonly string[]
}

/** Options shared by both conversion directions. */
export interface DwgConvertOptions {
  /**
   * Limit in bytes applied to the input and to the produced drawing.
   * Defaults to {@link DEFAULT_MAX_CONVERT_BYTES} (64 MiB).
   */
  maxBytes?: number
}

/** Options for {@link dxfToDwg}. */
export interface DxfToDwgOptions extends DwgConvertOptions {
  /**
   * `AC10xx` code the DWG is written in. Defaults to the DXF document's own
   * `$ACADVER`, which is what makes a round trip keep the source version.
   */
  targetVersion?: string
}

/** Result of {@link dwgToDxf}. */
export interface DwgToDxfResult {
  /** DXF bytes the engine can open. */
  dxf: Uint8Array
  /** `AC10xx` version of the source DWG (and of the produced DXF). */
  version: string
  /** Reader warnings, one sentence each; empty when the read was clean. */
  warnings: readonly string[]
}

/** Result of {@link dxfToDwg}. */
export interface DxfToDwgResult {
  /** DWG bytes. */
  dwg: Uint8Array
  /** `AC10xx` version the DWG was written in. */
  version: string
  /** Reader warnings, one sentence each; empty when the read was clean. */
  warnings: readonly string[]
}

/**
 * True when the bytes open with a DWG `AC10xx` version marker.
 *
 * Cheap and synchronous: no converter is loaded, so a caller can route a file
 * before paying for the wasm instance.
 *
 * @param bytes - candidate file bytes.
 */
export function isDwg(bytes: Uint8Array): boolean {
  return isDwgBytes(bytes)
}

/** The resolved backend: a promise so concurrent first calls share one load. */
let backendPromise: Promise<DwgBackend | null> | null = null

/** Message of an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Load the shipping transport, falling back to the native one.
 *
 * A missing transport is `null`; a transport that is installed but unusable is
 * an error, because silently treating a corrupt asset as "not installed" would
 * hide a packaging defect.
 */
async function resolveBackend(): Promise<DwgBackend | null> {
  let failure: unknown = null
  try {
    const wasm = await loadWasmBackend()
    if (wasm !== null) return wasm
  } catch (error) {
    failure = error
  }
  try {
    const sidecar = await loadSidecarBackend()
    if (sidecar !== null) return sidecar
  } catch (error) {
    failure ??= error
  }
  if (failure !== null) {
    throw new DwgError(
      'DWG_CONVERTER_MISSING',
      `the DWG converter is installed but unusable: ${messageOf(failure)}`,
      'Reinstall the package so packages/ecad/assets/acadrust.wasm matches the loader that reads it.'
    )
  }
  return null
}

/** The cached backend, loading it on first use. */
function backend(): Promise<DwgBackend | null> {
  backendPromise ??= resolveBackend()
  return backendPromise
}

/** The loaded backend, or a typed "not installed" failure. */
async function requireBackend(): Promise<DwgBackend> {
  const loaded = await backend()
  if (loaded === null) {
    throw new DwgError(
      'DWG_CONVERTER_MISSING',
      'no DWG converter is installed: packages/ecad/assets/acadrust.wasm and packages/ecad/bin/dsh-ecad-dwg are both absent',
      'Reinstall @aryacode/dsh-engineering-ecad so the DWG converter asset ships with it.'
    )
  }
  return loaded
}

/** Validate caller bytes and resolve the byte limit. */
function inputsOf(bytes: unknown, maxBytes: number | undefined): { input: Uint8Array; limit: number } {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new DwgError(
      'DWG_UNSUPPORTED',
      'the converter needs the drawing bytes as a non-empty Uint8Array',
      'Read the file with the workspace file service and pass its bytes unchanged.'
    )
  }
  const limit =
    typeof maxBytes === 'number' && Number.isFinite(maxBytes) && maxBytes > 0
      ? Math.trunc(maxBytes)
      : DEFAULT_MAX_CONVERT_BYTES
  if (bytes.byteLength > limit) {
    throw new DwgError(
      'DWG_TOO_LARGE',
      `the drawing is ${bytes.byteLength} bytes, over the ${limit}-byte limit`,
      'Raise the maxBytes option for this call, or split the drawing before converting it.'
    )
  }
  return { input: bytes, limit }
}

/**
 * Report which converter is installed without converting anything.
 *
 * Loads the wasm module when the asset is present (it answers from the module's
 * own version statics) and never spawns the native binary unless that binary is
 * what is installed.
 */
export async function converterInfo(): Promise<DwgConverterInfo> {
  const loaded = await backend()
  if (loaded === null) return { kind: 'unavailable', version: '', versions: [] }
  const info = await loaded.info()
  return { kind: loaded.kind, version: info.version, versions: info.versions }
}

/**
 * Convert DWG bytes to DXF bytes.
 *
 * @param bytes - the `.dwg` file bytes.
 * @param options - byte limit for the call.
 * @returns the DXF bytes, the source `AC10xx` version and reader warnings.
 * @throws DwgError `DWG_UNSUPPORTED` when the bytes are not a DWG,
 * `DWG_TOO_LARGE` over the limit, `DWG_READ_FAILED` when the reader refuses the
 * drawing, `DWG_WRITE_FAILED` when the DXF cannot be produced, and
 * `DWG_CONVERTER_MISSING` when no converter is installed.
 */
export async function dwgToDxf(
  bytes: Uint8Array,
  options: DwgConvertOptions = {}
): Promise<DwgToDxfResult> {
  const { input, limit } = inputsOf(bytes, options.maxBytes)
  if (!isDwgBytes(input)) {
    throw new DwgError(
      'DWG_UNSUPPORTED',
      'the bytes do not start with a DWG AC10xx version marker',
      'Pass the .dwg file bytes unchanged; a DXF drawing belongs on the DXF path.'
    )
  }
  const loaded = await requireBackend()
  const converted = await loaded.convertDwgToDxf(input, limit)
  return { dxf: converted.data, version: converted.version, warnings: converted.warnings }
}

/**
 * Convert DXF bytes to DWG bytes.
 *
 * @param bytes - the `.dxf` file bytes.
 * @param options - target `AC10xx` version and the byte limit for the call.
 * @returns the DWG bytes, the version written and reader warnings.
 * @throws DwgError `DWG_UNSUPPORTED` for a non-DXF or an unknown target version,
 * `DWG_TOO_LARGE` over the limit, `DWG_READ_FAILED` when the DXF cannot be
 * read, `DWG_WRITE_FAILED` when the DWG cannot be produced, and
 * `DWG_CONVERTER_MISSING` when no converter is installed.
 */
export async function dxfToDwg(
  bytes: Uint8Array,
  options: DxfToDwgOptions = {}
): Promise<DxfToDwgResult> {
  const { input, limit } = inputsOf(bytes, options.maxBytes)
  const loaded = await requireBackend()
  let targetVersion: string | undefined
  if (options.targetVersion !== undefined) {
    const requested = String(options.targetVersion).trim().toUpperCase()
    if (!loaded.versions.includes(requested)) {
      throw new DwgError(
        'DWG_UNSUPPORTED',
        `target version ${JSON.stringify(options.targetVersion)} is not one this converter writes`,
        `Pass one of ${loaded.versions.join(', ')} as targetVersion, or omit it to keep the DXF version.`
      )
    }
    targetVersion = requested
  }
  const converted = await loaded.convertDxfToDwg(input, targetVersion, limit)
  return { dwg: converted.data, version: converted.version, warnings: converted.warnings }
}
