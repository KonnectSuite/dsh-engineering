import { readFileSync } from 'node:fs'
import { apply, type ToolDefinition } from '../src/index.ts'

/** The fixture export every test opens. */
export const fixture = new URL('./fixtures/sample.l5x', import.meta.url)

/** Bytes of the fixture, read fresh each call so a test can mutate its copy. */
export function fixtureBytes(): Uint8Array {
  return new Uint8Array(readFileSync(fixture))
}

/** The success or failure document a tool returns. */
export interface Envelope {
  readonly summary?: string
  readonly data?: Record<string, unknown>
  readonly coverage?: { readonly complete: boolean; readonly unverified: readonly string[] }
  readonly next?: readonly { readonly tool: string; readonly why: string }[]
  readonly error?: { readonly code: string; readonly message: string; readonly fix: string; readonly candidates: readonly string[] }
}

/** A registered plugin over an in-memory filesystem serving one export. */
export interface Harness {
  readonly definitions: readonly ToolDefinition[]
  readonly call: (name: string, args?: Record<string, unknown>) => Promise<Envelope>
}

/**
 * Register the plugin with a filesystem that serves one export.
 *
 * @param source - Export bytes for every path, or one entry per resolved path.
 * @returns The registered definitions and a call helper.
 */
export function harness(source: (() => Uint8Array) | Map<string, Uint8Array> = fixtureBytes): Harness {
  const definitions: ToolDefinition[] = []
  const read = (path: string): Uint8Array => source instanceof Map ? source.get(path) ?? new Uint8Array() : source()
  const ctx = {
    tools: { register(definition: ToolDefinition) { definitions.push(definition) } },
    fs: {
      async resolve(path: string) { return path },
      async stat(path: string) { return source instanceof Map && !source.has(path) ? undefined : { type: 'file' } },
      async readBytes(path: string) { return read(path) },
    },
  }
  apply(ctx, {})
  const byName = new Map(definitions.map(definition => [definition.name, definition]))
  return {
    definitions,
    async call(name, args = {}, exec = {}) {
      const definition = byName.get(name)
      if (definition === undefined) throw new Error(`no tool ${name}`)
      return await definition.execute(args, exec) as Envelope
    },
  }
}
