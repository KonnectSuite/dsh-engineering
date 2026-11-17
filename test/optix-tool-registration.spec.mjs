/**
 * Every Optix tool must survive the harness's own parameter compiler.
 *
 * The tool DSL (`@deepseek-ai/dsh-tools` defineTool) refuses a parameter schema it cannot express,
 * and a row that catches the refusal boots with the tool missing. `test/entry-tool-contract.spec.mjs`
 * mounts the entries but its stub `effect` never calls the registration callback, so a schema the
 * compiler refuses is invisible there. This spec mounts the package with an `effect` that does call
 * it, which is how the omission was found by hand on 2026-11-17: `optix_script` declared
 * `pointers.items.required: ["name", "target"]`, the compiler compiles an array's items with
 * allowRequired false, and registration threw UNSUPPORTED_SCHEMA - the plugin would have booted with
 * no NetLogic tool at all.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply as registerOptix } from '../packages/optix/lib/index.js'

/** The tools the Optix product advertises. A missing name here is a tool the agent cannot call. */
const EXPECTED_TOOLS = [
  'optix_action',
  'optix_bridge_arm',
  'optix_build',
  'optix_design_check',
  'optix_docs',
  'optix_edit',
  'optix_emulator',
  'optix_get_skill',
  'optix_invoke',
  'optix_library',
  'optix_list_skills',
  'optix_logs',
  'optix_model',
  'optix_nav',
  'optix_ocr_setup',
  'optix_production_check',
  'optix_project',
  'optix_read',
  'optix_save',
  'optix_schema',
  'optix_screen',
  'optix_script',
  'optix_status',
  'optix_svg',
  'optix_template',
  'optix_ui',
  'optix_validate_expression',
]

/**
 * Mount the package the way the harness does: `ctx.effect(() => registration)` runs the callback at
 * mount time, so a refused definition throws here exactly as it throws in the field.
 * @returns {{ registered: string[], failures: Array<{ at: string, error: any }> }}
 */
function mountOptix() {
  const registered = []
  const failures = []
  const ctx = {
    effect: (fn) => {
      try {
        fn()
      } catch (error) {
        failures.push({ at: `effect #${failures.length}`, error })
      }
      return () => {}
    },
    tools: {
      register: (definition) => {
        registered.push(definition?.name ?? '?')
        return () => {}
      },
    },
    inject: () => {},
    get: () => undefined,
    provide: () => {},
    plugin: () => {},
    logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    on: () => () => {},
    emit: () => {},
  }
  registerOptix(ctx, { bridgeUrls: ['http://127.0.0.1:8768'] })
  return { registered, failures }
}

describe('every Optix tool compiles against the harness parameter DSL', () => {
  const { registered, failures } = mountOptix()

  it('no tool definition is refused by the parameter compiler', () => {
    const reasons = failures.map(
      (failure) => `${failure.at}: ${(failure.error?.violations ?? [failure.error?.message]).join(' | ')}`,
    )
    assert.deepEqual(reasons, [], 'a refused parameter schema means the tool is missing from the booted plugin')
  })

  it('every advertised tool registered', () => {
    const missing = EXPECTED_TOOLS.filter((name) => !registered.includes(name))
    assert.deepEqual(missing, [], 'these tools did not register')
  })

  it('registers exactly the advertised tools, nothing unnamed', () => {
    const extra = registered.filter((name) => !EXPECTED_TOOLS.includes(name))
    assert.deepEqual(extra, [], 'a tool registered that the product does not advertise')
  })
})
