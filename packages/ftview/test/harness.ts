import { apply, type ToolDefinition } from '../src/index.ts'
import { apply as applyEdit } from '../src/edit.ts'
import { apply as applyStudio } from '../src/studio.ts'

/** The subset of the envelope a test asserts against. */
export interface Envelope {
  readonly summary?: string
  readonly data?: Record<string, unknown>
  readonly next?: readonly unknown[]
  readonly coverage?: { readonly complete: boolean; readonly unverified: readonly string[] }
  readonly error?: { readonly code: string; readonly message: string; readonly fix: string; readonly candidates: readonly string[] }
}

/** A registered plugin over an in-memory export folder. */
export interface Harness {
  readonly definitions: readonly ToolDefinition[]
  readonly written: ReadonlyMap<string, string>
  readonly call: (name: string, args?: Record<string, unknown>, exec?: Record<string, unknown>) => Promise<Envelope>
}

/**
 * Register the plugin with a filesystem serving the given files.
 *
 * @param files - Absolute-style path to file text.
 * @returns The registered definitions and a call helper.
 */
export function harness(files: ReadonlyMap<string, string>, options: { edit?: boolean; studio?: boolean } = {}): Harness {
  const definitions: ToolDefinition[] = []
  const written = new Map<string, string>()
  const services = new Map<string, unknown>()
  const normalized = new Map([...files].map(([path, text]) => [path.replace(/\\/gu, '/'), text]))
  // Files written by a tool are readable again, so a test can reopen what it wrote.
  const textOf = (path: string): string | undefined => written.get(path) ?? normalized.get(path)
  const directoryOf = (path: string): boolean => [...new Set([...normalized.keys(), ...written.keys()])].some(key => key.startsWith(`${path}/`))
  const ctx = {
    tools: { register(definition: ToolDefinition) { definitions.push(definition) } },
    fs: {
      async resolve(path: string) { return path.replace(/\\/gu, '/').replace(/\/+$/u, '') },
      // Tools may join with either separator; the fixture keys use forward slashes.
      async stat(rawPath: string) {
        const path = rawPath.replace(/\\/gu, '/')
        if (textOf(path) !== undefined) return { type: 'file' }
        if (directoryOf(path)) return { type: 'directory' }
        return undefined
      },
      async readBytes(rawPath: string) {
        const path = rawPath.replace(/\\/gu, '/')
        const text = textOf(path)
        if (text === undefined) throw new Error(`missing ${path}`)
        return new TextEncoder().encode(text)
      },
      async writeText(path: string, text: string) { written.set(path, text) },
    async writeBytes(path: string, bytes: Uint8Array) { written.set(path, new TextDecoder('latin1').decode(bytes)) },
      async listDir(rawPath: string) {
        const path = rawPath.replace(/\\/gu, '/')
        const prefix = `${path}/`
        const children = new Map<string, string>()
        for (const key of new Set([...normalized.keys(), ...written.keys()])) {
          if (!key.startsWith(prefix)) continue
          const rest = key.slice(prefix.length)
          const separator = rest.indexOf('/')
          children.set(separator < 0 ? rest : rest.slice(0, separator), separator < 0 ? 'file' : 'directory')
        }
        return [...children].map(([name, type]) => ({ name, type }))
      },
    },
    provide(name: string, value: unknown) { services.set(name, value) },
    get(name: string) { return services.get(name) },
  }
  apply(ctx, {})
  if (options.edit === true) applyEdit(ctx, {})
  if (options.studio === true) applyStudio(ctx, {})
  const byName = new Map(definitions.map(definition => [definition.name, definition]))
  return {
    definitions,
    written,
    async call(name, args = {}, exec = {}) {
      const definition = byName.get(name)
      if (definition === undefined) throw new Error(`no tool ${name}`)
      return await definition.execute(args, exec) as Envelope
    },
  }
}
