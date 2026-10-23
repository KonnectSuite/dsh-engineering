import { apply, type ToolDefinition } from '../src/index.ts'

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
  readonly call: (name: string, args?: Record<string, unknown>, exec?: Record<string, unknown>) => Promise<Envelope>
}

/**
 * Register the plugin with a filesystem serving the given files.
 *
 * @param files - Absolute-style path to file text.
 * @returns The registered definitions and a call helper.
 */
export function harness(files: ReadonlyMap<string, string>): Harness {
  const definitions: ToolDefinition[] = []
  const normalized = new Map([...files].map(([path, text]) => [path.replace(/\\/gu, '/'), text]))
  const directoryOf = (path: string): boolean => [...normalized.keys()].some(key => key.startsWith(`${path}/`))
  const ctx = {
    tools: { register(definition: ToolDefinition) { definitions.push(definition) } },
    fs: {
      async resolve(path: string) { return path.replace(/\\/gu, '/').replace(/\/+$/u, '') },
      async stat(path: string) {
        if (normalized.has(path)) return { type: 'file' }
        if (directoryOf(path)) return { type: 'directory' }
        return undefined
      },
      async readBytes(path: string) {
        const text = normalized.get(path)
        if (text === undefined) throw new Error(`missing ${path}`)
        return new TextEncoder().encode(text)
      },
      async listDir(path: string) {
        const prefix = `${path}/`
        const children = new Map<string, string>()
        for (const key of normalized.keys()) {
          if (!key.startsWith(prefix)) continue
          const rest = key.slice(prefix.length)
          const separator = rest.indexOf('/')
          children.set(separator < 0 ? rest : rest.slice(0, separator), separator < 0 ? 'file' : 'directory')
        }
        return [...children].map(([name, type]) => ({ name, type }))
      },
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
