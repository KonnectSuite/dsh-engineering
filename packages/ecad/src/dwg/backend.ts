/**
 * The transport contract both converter backends implement.
 *
 * `wasm.ts` and `sidecar.ts` each turn the same raw ABI into a
 * {@link DwgBackend}, so `index.ts` never branches on the transport for
 * anything except which one loaded. Byte-in/byte-out only: no backend takes or
 * returns a path.
 *
 * @module dsh-engineering-ecad/dwg/backend
 */

/** Which transport answered `converterInfo()`. */
export type DwgConverterKind = 'wasm' | 'sidecar' | 'unavailable'

/** One conversion's bytes plus what the reader observed. */
export interface DwgConversion {
  /** Converted bytes (DXF for `dwgToDxf`, DWG for `dxfToDwg`). */
  readonly data: Uint8Array
  /** `AC10xx` version of the input (for DXF) or of the written DWG. */
  readonly version: string
  /** Reader warnings, one sentence each; empty when the read was clean. */
  readonly warnings: readonly string[]
}

/** One loaded converter transport. */
export interface DwgBackend {
  /** Transport that produced this backend. */
  readonly kind: Exclude<DwgConverterKind, 'unavailable'>
  /** `acadrust` version, for example `"0.6.8"`. */
  readonly version: string
  /** Supported `AC10xx` version codes. */
  readonly versions: readonly string[]
  /**
   * Report the converter's own metadata without converting anything.
   *
   * The sidecar runs its `info` command here; the wasm backend answers from the
   * module's exported statics. Neither reads or writes a drawing.
   */
  info(): Promise<{ version: string; versions: readonly string[] }>
  /**
   * Convert DWG bytes to DXF bytes.
   *
   * @param bytes - the DWG file bytes.
   * @param maxBytes - conversion limit in bytes.
   */
  convertDwgToDxf(bytes: Uint8Array, maxBytes: number): Promise<DwgConversion>
  /**
   * Convert DXF bytes to DWG bytes.
   *
   * @param bytes - the DXF file bytes.
   * @param targetVersion - `AC10xx` code to write, or `undefined` to keep the
   * document's own `$ACADVER`.
   * @param maxBytes - conversion limit in bytes.
   */
  convertDxfToDwg(
    bytes: Uint8Array,
    targetVersion: string | undefined,
    maxBytes: number
  ): Promise<DwgConversion>
}

/** Default conversion limit: the engine's own file limit, 64 MiB. */
export const DEFAULT_MAX_CONVERT_BYTES = 64 * 1024 * 1024

/** The six-byte DWG version marker every DWG file starts with. */
const DWG_MAGIC = /^AC10\d\d$/

/**
 * True when the bytes open with a DWG `AC10xx` version marker.
 *
 * A cheap magic check, not validation: it refuses a DXF, a PNG or a ZIP before
 * the converter is loaded, and it is what lets the engine route a file to the
 * DWG path without parsing it twice.
 *
 * @param bytes - candidate file bytes.
 */
export function isDwgBytes(bytes: Uint8Array | null | undefined): boolean {
  if (!bytes || bytes.byteLength < 6) return false
  return DWG_MAGIC.test(new TextDecoder('latin1').decode(bytes.subarray(0, 6)))
}
