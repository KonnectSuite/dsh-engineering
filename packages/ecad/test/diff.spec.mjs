import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffSheetModels } from '../src/engine/index.ts'
import { entity, layout, sheetModel, ok } from './helpers.mjs'

/** A model with one entity. */
function modelWith(entities, path = 'A.dxf', version = 'v1') {
  return { ...sheetModel({ path, layouts: [layout('Model', entities)] }), version }
}

test('identical models have no rows and are not truncated', () => {
  const a = modelWith([entity('1', 'line', { pts: [[0, 0], [1, 1]] })])
  const diff = diffSheetModels(a, a)
  assert.deepEqual(diff.added, [])
  assert.deepEqual(diff.removed, [])
  assert.deepEqual(diff.changed, [])
  assert.equal(diff.truncated, false)
  assert.equal(diff.a.path, 'A.dxf')
})

test('a text change is reported with the text reason and both versions', () => {
  const a = modelWith([entity('1', 'text', { t: 'OLD', p: [0, 0], h: 0.1 })])
  const b = { ...a, version: 'v2', layouts: [layout('Model', [entity('1', 'text', { t: 'NEW', p: [0, 0], h: 0.1 })])] }
  const diff = diffSheetModels(a, b)
  assert.equal(diff.changed.length, 1)
  assert.equal(diff.changed[0].kind, 'changed')
  assert.equal(diff.changed[0].before.t, 'OLD')
  assert.equal(diff.changed[0].after.t, 'NEW')
  ok(diff.changed[0].reason.includes('text changed'))
})

test('added and removed entities are reported separately', () => {
  const a = modelWith([entity('1', 'line', { pts: [[0, 0], [1, 1]] })])
  const b = modelWith([entity('2', 'circle', { c: [5, 5], r: 2 })])
  const diff = diffSheetModels(a, b)
  assert.equal(diff.added.length, 1)
  assert.equal(diff.added[0].entityKind, 'circle')
  assert.equal(diff.removed.length, 1)
  assert.equal(diff.removed[0].entityKind, 'line')
  assert.equal(diff.changed.length, 0)
})

test('geometry is compared at the tolerance, so a sub-tolerance move is not a change', () => {
  const a = modelWith([entity('1', 'line', { pts: [[0, 0], [10, 10]] })])
  const b = modelWith([entity('1', 'line', { pts: [[0.0001, 0], [10.0001, 10]] })])
  assert.equal(diffSheetModels(a, b).changed.length, 0)
  const c = modelWith([entity('1', 'line', { pts: [[1, 0], [11, 10]] })])
  const moved = diffSheetModels(a, c)
  assert.equal(moved.changed.length, 1)
  ok(moved.changed[0].reason.includes('geometry changed'))
  const coarse = diffSheetModels(a, c, { tolerance: 5 })
  assert.equal(coarse.changed.length, 0)
})

test('a layer change is reported', () => {
  const a = modelWith([entity('1', 'line', { layer: '0', pts: [[0, 0], [1, 1]] })])
  const b = modelWith([entity('1', 'line', { layer: 'WIRES', pts: [[0, 0], [1, 1]] })])
  const diff = diffSheetModels(a, b)
  assert.equal(diff.changed.length, 1)
  ok(diff.changed[0].reason.includes('layer changed'))
})

test('an entity whose handle changed but whose content matches is not a change', () => {
  const a = modelWith([entity('1', 'line', { pts: [[0, 0], [1, 1]] })])
  const b = modelWith([entity('9', 'line', { pts: [[0, 0], [1, 1]] })])
  const diff = diffSheetModels(a, b)
  assert.equal(diff.added.length, 0)
  assert.equal(diff.removed.length, 0)
  assert.equal(diff.changed.length, 0)
})

test('arc angles compare modulo 2π', () => {
  const a = modelWith([entity('1', 'arc', { c: [0, 0], r: 1, a0: 0, a1: 1 })])
  const b = modelWith([entity('1', 'arc', { c: [0, 0], r: 1, a0: Math.PI * 2, a1: 1 })])
  assert.equal(diffSheetModels(a, b).changed.length, 0)
})

test('the row cap sets truncated and limits the rows', () => {
  const entities = [entity('1', 'line', { pts: [[0, 0], [1, 1]] }), entity('2', 'line', { pts: [[2, 2], [3, 3]] }), entity('3', 'line', { pts: [[4, 4], [5, 5]] })]
  const a = modelWith(entities)
  const b = modelWith([], 'B.dxf')
  const diff = diffSheetModels(a, b, { maxChanges: 2 })
  assert.equal(diff.truncated, true)
  assert.equal(diff.removed.length, 2)
})

test('layout ids are compared across both models', () => {
  const a = sheetModel({ path: 'A.dxf', layouts: [layout('Model', [entity('1', 'line', { pts: [[0, 0], [1, 1]] })])] })
  const b = sheetModel({
    path: 'B.dxf',
    layouts: [layout('Model', [entity('1', 'line', { pts: [[0, 0], [1, 1]] })]), layout('Layout1', [entity('2', 'text', { t: 'x', p: [0, 0], h: 0.1 })], 'paper')]
  })
  const diff = diffSheetModels(a, b)
  assert.equal(diff.added.length, 1)
  assert.equal(diff.added[0].layout, 'Layout1')
})
