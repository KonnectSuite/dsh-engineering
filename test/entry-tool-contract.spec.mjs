/**
 * The harness refuses a tool definition that does not declare `output.render`,
 * and a product row that catches the refusal can boot with no tools at all.
 *
 * 0.94.3 did exactly that: `engineering_reference` and `engineering_profile`
 * were refused (`tool "engineering_reference" must declare output { schema,
 * render, presentationMeta? }`), the resources row swallowed the error, and
 * every agent ran without the standards tools while the release reported
 * success. A module-level proof (importing the entry and calling `apply` with a
 * stub that records names) could not see it, because the stub accepted what the
 * real registry rejects.
 *
 * This spec mounts every entry against a stub that applies the harness's own
 * precondition, so the same omission fails here instead of in the field.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const entriesDir = join(root, 'entries')

/** Entries that mount product tools and must therefore register at least one. */
const ENTRIES_WITH_TOOLS = ['resources', 'l5x', 'ftview', 'optix', 'mwi', 'plc5', 'migration', 'ecad']

/**
 * Mount one entry the way the harness does, rejecting what it rejects.
 * @param {string} name - entry module name without extension.
 * @returns {Promise<{ registered: string[], refused: string[] }>} what mounted.
 */
async function mountEntry(name) {
  const module = await import(pathToFileURL(join(entriesDir, `${name}.js`)).href)
  const registered = []
  const refused = []
  const ctx = {
    tools: {
      register(definition) {
        const output = definition?.output
        // The exact precondition the harness applies (packages/core/tools).
        if (output === undefined || typeof output !== 'object' || typeof output.render !== 'function') {
          refused.push(definition?.name ?? '?')
          throw new TypeError(`tool "${definition?.name}" must declare output { schema, render, presentationMeta? }`)
        }
        registered.push(definition.name)
        return () => {}
      },
    },
    get: () => undefined,
    provide: () => {},
    plugin: () => {},
    effect: () => () => {},
    logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    on: () => () => {},
    emit: () => {},
  }
  try {
    module.apply(ctx, {})
  } catch {
    // A row that needs a service we did not stub may throw after mounting its
    // tools; the registrations it already made still count.
  }
  return { registered, refused }
}

describe('every entry honours the harness tool contract', () => {
  for (const name of ENTRIES_WITH_TOOLS) {
    it(`entries/${name}.js registers tools the harness accepts`, async () => {
      const { registered, refused } = await mountEntry(name)
      assert.deepEqual(refused, [], `${name} had tools refused for a missing output.render`)
      if (name === 'resources') assert.ok(registered.length > 0, 'resources registered no tools')
    })
  }

  it('the standards tools are among the mounted tools', async () => {
    const { registered } = await mountEntry('resources')
    assert.ok(registered.includes('engineering_reference'), 'engineering_reference must register')
    assert.ok(registered.includes('engineering_profile'), 'engineering_profile must register')
  })

  it('the resources row reports a refused tool instead of swallowing it', async () => {
    const module = await import(pathToFileURL(join(entriesDir, 'resources.js')).href)
    const errors = []
    const ctx = {
      tools: { register() { throw new TypeError('tool "x" must declare output { schema, render, presentationMeta? }') } },
      get: () => undefined,
      provide: () => {},
      plugin: () => {},
      logger: { warn: () => {}, error: message => errors.push(message) },
    }
    module.apply(ctx, {})
    assert.ok(errors.length > 0, 'a refused tool must be reported at error level')
    assert.match(errors[0], /refused by the harness/u)
  })

  it('every product tool definition in the built packages declares output.render', () => {
    const offenders = []
    const packages = ['resources', 'l5x', 'ftview', 'optix', 'mwi', 'plc5', 'migration', 'ecad']
    for (const pkg of packages) {
      const libDir = join(root, 'vendor', pkg, 'lib')
      let files
      try {
        files = readdirSync(libDir, { recursive: true }).map(String).filter(file => file.endsWith('.js'))
      } catch {
        continue
      }
      for (const file of files) {
        const source = readFileSync(join(libDir, file), 'utf8')
        const marker = 'output: { schema'
        for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) {
          // Walk the braces so a nested schema object cannot truncate the block.
          let depth = 0
          let end = at
          for (let i = source.indexOf('{', at); i < source.length; i += 1) {
            if (source[i] === '{') depth += 1
            else if (source[i] === '}') {
              depth -= 1
              if (depth === 0) { end = i; break }
            }
          }
          const block = source.slice(at, end + 1)
          if (!/render/u.test(block)) offenders.push(`${pkg}/lib/${file}: ${block.slice(0, 80)}`)
        }
      }
    }
    assert.deepEqual(offenders, [], 'tool definitions must declare output.render')
  })
})
