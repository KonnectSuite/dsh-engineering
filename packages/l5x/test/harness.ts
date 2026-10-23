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
 * @param bytes - Export bytes; defaults to the fixture.
 * @returns The registered definitions and a call helper.
 */
export function harness(bytes: () => Uint8Array = fixtureBytes): Harness {
  const definitions: ToolDefinition[] = []
  const ctx = {
    tools: { register(definition: ToolDefinition) { definitions.push(definition) } },
    fs: {
      async resolve(path: string) { return path },
      async stat() { return { type: 'file' } },
      async readBytes() { return bytes() },
    },
  }
  apply(ctx, {})
  const byName = new Map(definitions.map(definition => [definition.name, definition]))
  return {
    definitions,
    async call(name, args = {}) {
      const definition = byName.get(name)
      if (definition === undefined) throw new Error(`no tool ${name}`)
      return await definition.execute(args, {}) as Envelope
    },
  }
}
