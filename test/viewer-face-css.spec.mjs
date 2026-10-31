/**
 * The ladder pane's stylesheet and its renderer agree on one class set.
 *
 * A CSS-module class is only reachable through `css.name`, so a class the
 * stylesheet defines and the renderer never asks for is dead weight that reads
 * as live intent, and a name the renderer asks for that the stylesheet does not
 * define renders an unstyled element with no error anywhere. Neither shows up in
 * a screenshot when the missing rule was decoration, which is why the pairing is
 * checked here rather than left to review.
 *
 * Only literal `css.<name>` accesses count: the renderer builds every composed
 * class name from those, and a computed `css[...]` access would defeat the
 * check - so one is reported instead of silently skipping it.
 */
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const RENDERER = 'packages/viewer/src/client/L5xBody.tsx'
const STYLESHEET = 'packages/viewer/src/client/L5xBody.module.css'

/**
 * Class names the stylesheet defines. Element, id and at-rule text is ignored,
 * because a selector such as `.a > .b:hover` defines `a` and `b` only.
 */
function definedClasses(css) {
  return new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/gu)].map(match => match[1]))
}

/** Class names the renderer reads off its CSS-module import. */
function usedClasses(source) {
  return new Set([...source.matchAll(/\bcss\.([A-Za-z][A-Za-z0-9_]*)/gu)].map(match => match[1]))
}

test('the ladder stylesheet defines exactly the classes the renderer uses', () => {
  const source = read(RENDERER)
  const css = read(STYLESHEET)
  const used = usedClasses(source)
  const defined = definedClasses(css)

  assert.deepEqual(
    [...used].filter(name => !defined.has(name)).sort(),
    [],
    'every css.<name> the renderer reads must exist in the stylesheet',
  )
  assert.deepEqual(
    [...defined].filter(name => !used.has(name)).sort(),
    [],
    'a class the renderer never reads is dead; delete it or use it',
  )
})

test('the renderer reads its classes literally, so the check above can hold', () => {
  const source = read(RENDERER)
  assert.deepEqual(
    [...source.matchAll(/\bcss\s*\[/gu)].map(match => match[0]),
    [],
    'a computed css[...] access hides the name from every reader of this file',
  )
})
