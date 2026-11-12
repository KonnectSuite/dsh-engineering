import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * A starter project is a set of irreversible choices: the runtime target, the screen box, the
 * project name and the destination are all baked into files the agent then edits. The manifest
 * carries the questions so `optix_template` returns them and the agent asks instead of guessing.
 */

const templates = ['arya-optix-ipc', 'arya-optix-panel']

/** @param id - Template folder. */
const manifestOf = id => JSON.parse(readFileSync(
  new URL(`../packages/optix/templates/${id}/manifest.json`, import.meta.url), 'utf8',
))

test('every packaged starter carries the questions that must be asked before copying', () => {
  for (const id of templates) {
    const questions = manifestOf(id).questions
    assert.ok(Array.isArray(questions) && questions.length >= 4, `${id}: manifest carries no questions array`)
    for (const question of questions) {
      assert.ok(typeof question.question === 'string' && question.question.length > 20, `${id}: ${question.id} asks nothing`)
      assert.ok(typeof question.why === 'string' && question.why.length > 40, `${id}: ${question.id} gives no reason to ask`)
    }
  }
})

test('the questions cover the choices a copy cannot undo', () => {
  const needed = ['target', 'resolution', 'project_name', 'destination']
  for (const id of templates) {
    const ids = new Set((manifestOf(id).questions ?? []).map(question => question.id))
    assert.deepEqual(needed.filter(name => !ids.has(name)), [], `${id}: nobody is asked about ${needed.filter(name => !ids.has(name)).join(', ')}`)
  }
})

test('the name question names the name the project files actually carry', () => {
  for (const id of templates) {
    const manifest = manifestOf(id)
    const asked = (manifest.questions ?? []).find(question => question.id === 'project_name')
    assert.ok(asked.question.includes(manifest.sourceProjectName), `${id}: asks about a name the project does not use`)
    assert.ok(asked.why.includes(manifest.sourceProjectName), `${id}: the reason does not name the files that carry the name`)
  }
})

test('the size question states the box the project actually ships', () => {
  for (const id of templates) {
    const yaml = readFileSync(
      new URL(`../packages/optix/templates/${id}/project/Nodes/UI/UI.yaml`, import.meta.url), 'utf8',
    )
    const box = yaml.match(/- Name: MainWindow[\s\S]{0,400}?- Name: Width[\s\S]{0,120}?Value: ([\d.]+)[\s\S]{0,120}?- Name: Height[\s\S]{0,120}?Value: ([\d.]+)/u)
    assert.ok(box, `${id}: no MainWindow Width/Height found to compare the question against`)
    const asked = (manifestOf(id).questions ?? []).find(question => question.id === 'resolution')
    for (const side of [box[1], box[2]]) {
      assert.ok(asked.why.includes(String(parseFloat(side))), `${id}: the question says ${asked.why.slice(0, 60)} but the project ships ${side}`)
    }
  }
})

test('the two starters point at different runtimes and say so to each other', () => {
  const ipc = manifestOf('arya-optix-ipc')
  const panel = manifestOf('arya-optix-panel')
  assert.notEqual(ipc.target, panel.target)
  const ipcTarget = ipc.questions.find(question => question.id === 'target')
  const panelTarget = panel.questions.find(question => question.id === 'target')
  assert.ok(ipcTarget.why.includes('arya-optix-panel'), 'the IPC target question does not name the other template')
  assert.ok(panelTarget.why.includes('arya-optix-ipc'), 'the panel target question does not name the other template')
})
