/**
 * The viewer's vocabulary is generated from the installed ME schema, not kept by hand.
 *
 * The preview used to hold a hand-kept set of 34 object names while `Gfx-ME16.xsd`
 * declares 91, so it drew eight names the vendor never writes and dropped
 * twenty-nine real objects without a trace — a blank area that looked intentional.
 * `scripts/gen-ftview-viewer-vocabulary.mjs` now emits one module from the schema
 * snapshot, twice: the viewer bundles its own copy, the host tool compiles the
 * other, and both packages build with `rootDir: src`, so neither can import the
 * other's file.
 *
 * Two copies of a generated file is a drift risk, so this spec is the gate:
 *
 *   1. the two emitted files are byte-identical;
 *   2. regenerating produces no change (`--check` exits 0);
 *   3. every element the snapshot declares has a row, and the invented names are gone;
 *   4. every element resolves to a painter family, so nothing falls through to the
 *      safety floor.
 *
 * Run with: node --import tsx --test test/ftview-viewer-vocabulary.spec.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { bundledSchema } from '../packages/ftview/lib/schema.js'
import { ELEMENT_COUNT, ELEMENTS, FAMILIES, PARTS, SCHEMA, elementFacts, partFacts } from '../packages/ftview-viewer/src/vocabulary.generated.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const VIEWER_COPY = 'packages/ftview-viewer/src/vocabulary.generated.ts'
const HOST_COPY = 'packages/ftview/src/render-vocabulary.generated.ts'

/** The names the old hand-kept set offered that no ME schema declares. */
const PHANTOMS = ['globalObject', 'listSelector', 'maintainButton', 'numericInput', 'recipe', 'referenceObject', 'stringInput', 'trend']

describe('the generated viewer vocabulary', () => {
  it('is emitted to both packages byte for byte', () => {
    // The viewer bundles its copy; the host tool compiles the other. A generator
    // run that writes one and not the other would leave the preview and
    // ftview_render disagreeing about which objects exist.
    const viewer = readFileSync(`${ROOT}/${VIEWER_COPY}`, 'utf8')
    const host = readFileSync(`${ROOT}/${HOST_COPY}`, 'utf8')
    assert.equal(viewer, host, `${VIEWER_COPY} and ${HOST_COPY} differ; run node scripts/gen-ftview-viewer-vocabulary.mjs`)
  })

  it('is current against the schema snapshot', () => {
    const run = spawnSync(process.execPath, ['scripts/gen-ftview-viewer-vocabulary.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(run.status, 0, `the generated vocabulary is stale: ${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /up to date/u)
  })

  it('declares every element the schema declares, and no invented name', () => {
    const schema = bundledSchema()
    assert.ok(schema !== undefined, 'packages/ftview/schema/me-schema.json must ship with the payload')
    assert.equal(ELEMENT_COUNT, schema.displayChildren.length, 'the generated count must equal the declared elements')
    assert.deepEqual(Object.keys(ELEMENTS).sort(), [...schema.displayChildren].sort())
    assert.equal(SCHEMA, schema.schema)
    for (const phantom of PHANTOMS) {
      assert.equal(ELEMENTS[phantom], undefined, `${phantom} is not an ME element and must not be offered`)
    }
  })

  it('resolves every element to a painter family instead of the safety floor', () => {
    // `box` is the fallback for a type the rules do not recognise. An element
    // sitting on it draws as a generic rectangle, which is precisely the silent
    // approximation this vocabulary exists to replace, so it is a failure.
    const onFloor = Object.keys(ELEMENTS).filter(name => elementFacts(name)?.family === 'box')
    assert.equal(JSON.stringify(onFloor), '[]')
    for (const [name, facts] of Object.entries(ELEMENTS)) {
      assert.ok(FAMILIES.includes(facts.family), `${name} names an unknown family ${String(facts.family)}`)
      assert.equal(elementFacts(name), facts, `${name} must resolve to its own facts`)
      assert.match(facts.type, /^[A-Za-z]+Type$/u, `${name} names a schema type`)
    }
  })

  it('separates the parts from the elements', () => {
    // A part (<caption>, <innerPolygon>, …) is drawn by its parent, never as an
    // object of its own: a preview that treated <innerPolygon> as an object would
    // paint a second polygon on top of its parent.
    // PARTS holds the parts the schema gives their own global type; the anonymous
    // inner parts (<caption>, <state>, …) are declared by their parent instead.
    assert.ok(Object.keys(PARTS).includes('innerPolygon'), 'innerPolygon is the part polyPolygon needs twice')
    for (const part of Object.keys(PARTS)) assert.equal(ELEMENTS[part], undefined, `${part} is a part, not an element`)
    assert.equal(JSON.stringify(partFacts('innerPolygon')?.attributes), '["polygon"]')
    assert.ok(elementFacts('polyPolygon')?.requiredChildren.includes('innerPolygon'))
    // The anonymous parts are still visible on the element that declares them: a
    // push button carries its faces, and each face carries the caption.
    assert.ok(elementFacts('momentaryButton')?.children.includes('states'))
  })

  it('carries the geometry facts the renderer reads', () => {
    // The renderer decides how to read a coordinate from the attribute's home,
    // so these declarations are what let it resolve `line` and `path` at all.
    assert.ok(elementFacts('line')?.attributes.includes('line'))
    assert.ok(elementFacts('polyline')?.attributes.includes('path'))
    assert.ok(elementFacts('polygon')?.attributes.includes('path'))
    assert.ok(elementFacts('roundedRectangle')?.attributes.includes('roundingWidth'))
    assert.ok(elementFacts('arc')?.attributes.includes('startAngle'))
  })
})
