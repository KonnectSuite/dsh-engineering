/**
 * The wasm transport: `packages/ecad/assets/acadrust.wasm` instantiated by hand.
 *
 * ## Why no wasm-bindgen
 *
 * The module is a plain `cdylib` for `wasm32-unknown-unknown` with a raw C ABI
 * (see `packages/ecad/rust/src/lib.rs`). Its only import is
 * `env.ecad_host_now_millis`, which acadrust uses for elapsed-time diagnostics.
 * That means the loader is `new WebAssembly.Instance` plus an alloc/copy/free
 * dance — no generated glue, no `wasm-bindgen` in the dependency graph, and no
 * toolchain step between `cargo build` and the committed asset.
 *
 * ## State
 *
 * One compiled module is kept for the process. One instance serves a small
 * bounded batch of conversions, then a fresh instance replaces it: the Rust
 * allocator inside `acadrust` retains memory across calls, and a long-lived
 * instance eventually aborted with `memory access out of bounds`. Four
 * conversions per instance keeps that growth bounded without creating an
 * instance per call (which made sustained conversion work allocate many wasm
 * memories faster than the JavaScript heap collected them).
 *
 * A trap (acadrust aborts a malformed input rather than unwinding) drops the
 * instance, so the next call starts clean.
 *
 * @module dsh-engineering-ecad/dwg/wasm
 */

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { DwgBackend, DwgConversion } from './backend.ts'
import { DwgError, converterStatusError, type DwgErrorCode } from './errors.ts'

/** Where the build script writes the module. */
export const WASM_ASSET_URL = new URL('../../assets/acadrust.wasm', import.meta.url)

/** ABI version this loader understands. */
const SUPPORTED_ABI = 1

/**
 * Conversions one wasm instance serves before it is replaced.
 *
 * Four is a compromise measured on the corpus: small enough that the Rust
 * allocator's retained memory cannot grow into the trap seen after a long
 * session, large enough that a normal open/write does not pay instance setup
 * more than once in a while.
 */
const USES_PER_INSTANCE = 4

/** The exported functions, typed once. */
interface DwgExports {
  readonly memory: WebAssembly.Memory
  ecad_abi_version(): number
  ecad_version_ptr(): number
  ecad_version_len(): number
  ecad_supported_versions_ptr(): number
  ecad_supported_versions_len(): number
  ecad_alloc(len: number): number
  ecad_dealloc(ptr: number, len: number): void
  ecad_convert_dwg_to_dxf(ptr: number, len: number, maxBytes: number): number
  ecad_convert_dxf_to_dwg(
    ptr: number,
    len: number,
    versionPtr: number,
    versionLen: number,
    maxBytes: number
  ): number
  ecad_result_data_ptr(): number
  ecad_result_data_len(): number
  ecad_result_version_ptr(): number
  ecad_result_version_len(): number
  ecad_result_warnings_ptr(): number
  ecad_result_warnings_len(): number
  ecad_result_message_ptr(): number
  ecad_result_message_len(): number
  ecad_result_release(): void
}

/** True when the committed asset exists and is not empty. */
export function wasmAssetPresent(): boolean {
  try {
    return statSync(fileURLToPath(WASM_ASSET_URL)).size > 0
  } catch {
    return false
  }
}

/** ASCII text from the instance's memory. */
function readText(exports: DwgExports, ptr: number, len: number): string {
  if (len === 0) return ''
  return new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len).slice())
}

/** Copy `len` bytes out of the instance's memory. */
function readBytes(exports: DwgExports, ptr: number, len: number): Uint8Array {
  if (len === 0) return new Uint8Array(0)
  return new Uint8Array(exports.memory.buffer, ptr, len).slice()
}

/**
 * The last conversion's result, read and released.
 *
 * The reads happen before `ecad_result_release`, and nothing in between can
 * allocate in the module, so the pointers stay valid.
 */
function takeResult(exports: DwgExports, status: number, fallbackFix: string): DwgConversion {
  const data = readBytes(exports, exports.ecad_result_data_ptr(), exports.ecad_result_data_len())
  const version = readText(
    exports,
    exports.ecad_result_version_ptr(),
    exports.ecad_result_version_len()
  )
  const warningsText = readText(
    exports,
    exports.ecad_result_warnings_ptr(),
    exports.ecad_result_warnings_len()
  )
  const message = readText(
    exports,
    exports.ecad_result_message_ptr(),
    exports.ecad_result_message_len()
  )
  exports.ecad_result_release()
  if (status !== 0) throw converterStatusError(status, message, fallbackFix)
  const warnings =
    warningsText.length > 0
      ? warningsText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
      : []
  return { data, version, warnings }
}

/** Pass `bytes` into the instance and return the pointer to free afterwards. */
function writeInput(exports: DwgExports, bytes: Uint8Array): number {
  const ptr = exports.ecad_alloc(bytes.byteLength)
  if (ptr === 0) {
    throw new DwgError(
      'DWG_TOO_LARGE',
      `the converter could not allocate ${bytes.byteLength} bytes of wasm memory`,
      'Raise maxBytes only if the host has memory to spare, or split the drawing before converting it.'
    )
  }
  new Uint8Array(exports.memory.buffer, ptr, bytes.byteLength).set(bytes)
  return ptr
}

/** Message of an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Free a buffer, tolerating an instance that trapped in the conversion call. */
function freeQuietly(exports: DwgExports, ptr: number, len: number): void {
  if (ptr === 0) return
  try {
    exports.ecad_dealloc(ptr, len)
  } catch {
    // The instance is being dropped anyway; leaking inside a trapped module is
    // bounded by the process lifetime and never reaches the caller.
  }
}

/** One instantiated module; recycled after a bounded number of conversions. */
class WasmBackend implements DwgBackend {
  readonly kind = 'wasm' as const
  readonly version: string
  readonly versions: readonly string[]
  private instance: WebAssembly.Instance | null = null
  private uses = 0

  constructor(
    private readonly module: WebAssembly.Module,
    metadata: { version: string; versions: readonly string[] }
  ) {
    this.version = metadata.version
    this.versions = metadata.versions
  }

  async info(): Promise<{ version: string; versions: readonly string[] }> {
    return { version: this.version, versions: this.versions }
  }

  /**
   * The current instance, recycled after {@link USES_PER_INSTANCE} conversions.
   *
   * The allocator is not reset between conversions, so a long-lived instance
   * eventually grows into a trap; recycling bounds that growth while keeping
   * instance creation off the hot path for ordinary single-drawing use.
   */
  private exports(): DwgExports {
    if (this.instance === null || this.uses >= USES_PER_INSTANCE) {
      this.instance = newInstance(this.module)
      this.uses = 0
    }
    this.uses += 1
    return this.instance.exports as unknown as DwgExports
  }

  /** Drop a trapped instance so the next call starts clean. */
  private poison(): void {
    this.instance = null
    this.uses = 0
  }

  /**
   * Run one exported conversion, turning a module abort (a wasm trap) into a
   * typed failure.
   *
   * `acadrust` returns `Result` values rather than panicking, but a panic in a
   * `panic = "abort"` wasm build is a trap: the JavaScript caller sees a
   * `RuntimeError` and the module's allocator may be mid-flight, so the
   * instance is dropped and the next call instantiates a fresh one.
   *
   * @param code - failure class to report a trap under.
   * @param fix - fix sentence for that failure.
   * @param run - the exported call.
   */
  private trapSafe(code: DwgErrorCode, fix: string, run: () => number): number {
    try {
      return run()
    } catch (error) {
      this.poison()
      throw new DwgError(
        code,
        `the DWG converter aborted while converting: ${messageOf(error)}`,
        fix
      )
    }
  }

  async convertDwgToDxf(bytes: Uint8Array, maxBytes: number): Promise<DwgConversion> {
    const exports = this.exports()
    let inputPtr = 0
    try {
      inputPtr = writeInput(exports, bytes)
      const status = this.trapSafe(
        'DWG_READ_FAILED',
        'Open the drawing in a CAD application and re-export it as DXF.',
        () => exports.ecad_convert_dwg_to_dxf(inputPtr, bytes.byteLength, maxBytes)
      )
      return takeResult(
        exports,
        status,
        'Open the drawing in a CAD application and re-export it as DXF.'
      )
    } finally {
      freeQuietly(exports, inputPtr, bytes.byteLength)
    }
  }

  async convertDxfToDwg(
    bytes: Uint8Array,
    targetVersion: string | undefined,
    maxBytes: number
  ): Promise<DwgConversion> {
    const exports = this.exports()
    let inputPtr = 0
    let versionPtr = 0
    const versionBytes = targetVersion === undefined ? null : new TextEncoder().encode(targetVersion)
    try {
      inputPtr = writeInput(exports, bytes)
      if (versionBytes !== null) {
        versionPtr = exports.ecad_alloc(versionBytes.byteLength)
        if (versionPtr === 0) {
          throw new DwgError(
            'DWG_WRITE_FAILED',
            'the converter could not allocate memory for the target version',
            'Omit targetVersion to keep the DXF document version.'
          )
        }
        new Uint8Array(exports.memory.buffer, versionPtr, versionBytes.byteLength).set(versionBytes)
      }
      const status = this.trapSafe(
        'DWG_WRITE_FAILED',
        'Re-export the DXF from the application that wrote it and convert again.',
        () =>
          exports.ecad_convert_dxf_to_dwg(
            inputPtr,
            bytes.byteLength,
            versionPtr,
            versionBytes === null ? 0 : versionBytes.byteLength,
            maxBytes
          )
      )
      return takeResult(exports, status, 'Re-export the DXF from the application that wrote it.')
    } finally {
      if (versionBytes !== null) freeQuietly(exports, versionPtr, versionBytes.byteLength)
      freeQuietly(exports, inputPtr, bytes.byteLength)
    }
  }
}

/**
 * Instantiate an already-compiled module.
 *
 * `new WebAssembly.Instance` is synchronous; the async `instantiate` overload
 * would add a microtask per conversion. A fresh instance starts with empty
 * wasm memory, so it costs one page-table setup and nothing else.
 */
function newInstance(module: WebAssembly.Module): WebAssembly.Instance {
  return new WebAssembly.Instance(module, {
    env: {
      // acadrust reads this clock for elapsed-time diagnostics only; the host
      // answers with wall-clock milliseconds since the epoch as a BigInt (i64).
      ecad_host_now_millis: (): bigint => BigInt(Date.now())
    }
  })
}

/**
 * Load the wasm backend, or `null` when the asset is not installed.
 *
 * Reads, compiles and probes the module but converts nothing. Throws when the
 * asset exists and cannot be used: a corrupt or ABI-mismatched module is a
 * packaging defect, not a reason to silently fall back to another transport.
 */
export async function loadWasmBackend(): Promise<DwgBackend | null> {
  if (!wasmAssetPresent()) return null
  const module = await WebAssembly.compile(readFileSync(fileURLToPath(WASM_ASSET_URL)))
  const instance = newInstance(module)
  const exports = instance.exports as unknown as DwgExports
  const abi = exports.ecad_abi_version()
  if (abi !== SUPPORTED_ABI) {
    throw new Error(
      `the committed DWG converter wasm has ABI ${abi}, this loader speaks ABI ${SUPPORTED_ABI}`
    )
  }
  const version = readText(exports, exports.ecad_version_ptr(), exports.ecad_version_len())
  const versions = readText(
    exports,
    exports.ecad_supported_versions_ptr(),
    exports.ecad_supported_versions_len()
  )
    .split(',')
    .map(code => code.trim())
    .filter(code => code.length > 0)
  if (version.length === 0 || versions.length === 0) {
    throw new Error('the committed DWG converter wasm reports no version metadata')
  }
  return new WasmBackend(module, { version, versions })
}
