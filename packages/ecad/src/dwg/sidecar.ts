/**
 * The native fallback transport: `packages/ecad/bin/dsh-ecad-dwg[.exe]`.
 *
 * Built from the same Rust source as the wasm module (`src/bin/sidecar.rs`),
 * used when a host cannot instantiate the wasm asset. The ABI is byte-in/byte-
 * out like the wasm one; only the plumbing differs, because a process needs
 * files.
 *
 * Every call gets its own `mkdtemp` directory under `os.tmpdir()`, so two
 * concurrent conversions never share a path, and the directory is removed in a
 * `finally` whether the conversion succeeded, failed or timed out.
 *
 * @module dsh-engineering-ecad/dwg/sidecar
 */

import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { DwgBackend, DwgConversion } from './backend.ts'
import { converterStatusError } from './errors.ts'

/** Where the native build script writes the binary. */
const SIDECAR_NAME = process.platform === 'win32' ? 'dsh-ecad-dwg.exe' : 'dsh-ecad-dwg'
const SIDECAR_URL = new URL(`../../bin/${SIDECAR_NAME}`, import.meta.url)

/** A drawing conversion on 30 MB of entities can take a while; this is a hang guard. */
const SIDECAR_TIMEOUT_MS = 300_000

/** True when the native binary is installed and executable-sized. */
export function sidecarPresent(): boolean {
  try {
    return statSync(fileURLToPath(SIDECAR_URL)).size > 0
  } catch {
    return false
  }
}

/** One run of the binary. */
interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/** Run the binary once and collect its output; resolves for a non-zero exit too. */
function run(args: readonly string[]): Promise<RunResult> {
  const file = fileURLToPath(SIDECAR_URL)
  return new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { windowsHide: true, timeout: SIDECAR_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr })
          return
        }
        const code = typeof error.code === 'number' ? error.code : null
        if (code === null) {
          // Spawn failure (ENOENT, EACCES, timeout): the binary is not usable.
          reject(error)
          return
        }
        resolve({ code, stdout, stderr })
      }
    )
  })
}

/** Records of `key=value` lines, preserving repeated `warning=` lines. */
function parseRecords(stdout: string): { first: string; fields: Map<string, string>; warnings: string[] } {
  const lines = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  const fields = new Map<string, string>()
  const warnings: string[] = []
  for (const line of lines.slice(1)) {
    const split = line.indexOf('=')
    if (split <= 0) continue
    const key = line.slice(0, split)
    const value = line.slice(split + 1)
    if (key === 'warning') warnings.push(value)
    else fields.set(key, value)
  }
  return { first: lines[0] ?? '', fields, warnings }
}

/** Metadata the binary reports for `info`. */
async function readInfo(): Promise<{ version: string; versions: readonly string[] }> {
  const result = await run(['info'])
  if (result.code !== 0) {
    throw new Error(
      `the installed DWG converter exited ${result.code} reading its version: ${result.stderr.trim()}`
    )
  }
  const { fields } = parseRecords(result.stdout)
  const version = fields.get('acadrust') ?? ''
  const versions = (fields.get('versions') ?? '')
    .split(',')
    .map(code => code.trim())
    .filter(code => code.length > 0)
  if (version.length === 0 || versions.length === 0) {
    throw new Error('the installed DWG converter reports no version metadata')
  }
  return { version, versions }
}

/** One installed binary. */
class SidecarBackend implements DwgBackend {
  readonly kind = 'sidecar' as const
  readonly version: string
  readonly versions: readonly string[]

  constructor(metadata: { version: string; versions: readonly string[] }) {
    this.version = metadata.version
    this.versions = metadata.versions
  }

  async info(): Promise<{ version: string; versions: readonly string[] }> {
    return { version: this.version, versions: this.versions }
  }

  /** Convert through a private temp directory; always removed. */
  private async convert(
    command: 'dwg-to-dxf' | 'dxf-to-dwg',
    bytes: Uint8Array,
    inputExtension: string,
    outputExtension: string,
    maxBytes: number,
    targetVersion: string | undefined
  ): Promise<DwgConversion> {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-ecad-dwg-'))
    try {
      const input = join(directory, `input${inputExtension}`)
      const output = join(directory, `output${outputExtension}`)
      await writeFile(input, bytes)
      const args = [command, input, output, String(maxBytes)]
      if (targetVersion !== undefined) args.push(targetVersion)
      const result = await run(args)
      const { first, fields, warnings } = parseRecords(result.stdout)
      if (result.code !== 0 || first !== 'ok') {
        const detail = fields.get('message') ?? result.stderr.trim() ?? ''
        throw converterStatusError(result.code, detail, 'Re-run the conversion on the source drawing.')
      }
      const data = await readFile(output)
      const version = fields.get('version') ?? ''
      if (data.byteLength === 0 || version.length === 0) {
        throw new Error('the DWG converter reported success but wrote no drawing')
      }
      return { data: new Uint8Array(data), version, warnings }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  async convertDwgToDxf(bytes: Uint8Array, maxBytes: number): Promise<DwgConversion> {
    return this.convert('dwg-to-dxf', bytes, '.dwg', '.dxf', maxBytes, undefined)
  }

  async convertDxfToDwg(
    bytes: Uint8Array,
    targetVersion: string | undefined,
    maxBytes: number
  ): Promise<DwgConversion> {
    return this.convert('dxf-to-dwg', bytes, '.dxf', '.dwg', maxBytes, targetVersion)
  }
}

/**
 * Load the sidecar backend, or `null` when the binary is not installed.
 *
 * Checks the file before spawning anything, so a package without the native
 * build answers "unavailable" without starting a process.
 */
export async function loadSidecarBackend(): Promise<DwgBackend | null> {
  if (!sidecarPresent() || !existsSync(fileURLToPath(SIDECAR_URL))) return null
  return new SidecarBackend(await readInfo())
}
