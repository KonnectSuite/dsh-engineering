import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

/**
 * Each starter carries its own copy of the Studio bridge, and those copies are older than the
 * bridge this package tracks. `optix_bridge_arm` is what closes that gap, so the copy has to name
 * it: a project that keeps the bridge it shipped cannot invoke methods or import library items.
 */
const versionOf = text => text.match(/BridgeVersion\s*=\s*"([^"]+)"/u)?.[1] ?? ''

test('a starter whose bridge is older than the tracked one names the step that arms it', () => {
  const tracked = readFileSync(new URL('../packages/optix/bridge/StudioMCPBridge.cs', import.meta.url), 'utf8')
  const trackedVersion = versionOf(tracked)
  assert.ok(trackedVersion !== '', 'the tracked bridge states no version')
  assert.ok(tracked.includes('ImpersonateRootTemporary'), 'the tracked bridge no longer runs a method inside an impersonated session')
  const source = readFileSync(new URL('../packages/optix/lib/index.js', import.meta.url), 'utf8')
  for (const id of templates) {
    const bundled = versionOf(readFileSync(
      new URL(`../packages/optix/templates/${id}/project/ProjectFiles/NetSolution/StudioMCPBridge.cs`, import.meta.url), 'utf8',
    ))
    assert.ok(bundled !== '', `${id}: its shipped bridge states no version`)
    if (bundled === trackedVersion) continue
    assert.ok(source.includes('optix_bridge_arm'), `${id}: ships bridge ${bundled} while the tracked bridge is ${trackedVersion}, and nothing names the arming step`)
    assert.ok(source.includes('run optix_bridge_arm on the copy'), `${id}: the copy instructions do not tell the engineer to arm the bridge`)
  }
})

/**
 * A template or standard request is answered before anything is copied: both starters and the
 * questions they need answered, with nothing written. That call is only possible because the
 * `template` parameter is optional, and it is what keeps an agent from surveying the machine to
 * work out what our own starters are.
 */
test('no starter named answers with both manifests and their questions, writing nothing', () => {
  const source = readFileSync(new URL('../packages/optix/lib/index.js', import.meta.url), 'utf8')
  const tool = source.slice(source.indexOf('name: "optix_template"'), source.indexOf('name: "optix_template"') + 3000)
  assert.match(tool, /chosen between, not surveyed/u, 'the description still invites a survey')
  assert.match(tool, /With no arguments it answers with both manifests and their `questions` and writes nothing/u)
  const template = tool.slice(tool.indexOf('template: {'), tool.indexOf('path: {'))
  assert.match(template, /Omit to receive both manifests and their questions, writing nothing\./u)
  assert.ok(!template.includes('required: true'), 'the template parameter is still required')
  const execute = source.slice(source.indexOf('if (args.template === void 0) {'), source.indexOf('if (args.template === void 0) {') + 1600)
  assert.match(execute, /for \(const id of ids\)/u, 'the no-starter answer does not read both starters')
  assert.match(execute, /starters\.push\(\{/u)
  assert.match(execute, /return \{\s*starters,\s*instructions:/u)
  assert.doesNotMatch(execute, /scaffoldProject|writeFile|mkdir/u, 'the no-starter answer must not write anything')
  for (const id of templates) assert.ok(manifestOf(id).questions.length >= 4, `${id}: no questions to answer before a copy`)
})


/**
 * A starter is also an operator shell. Both starters ship the four screens a line application opens
 * on, so the first thing an agent drafts lands in a project that already has the pages the operator
 * navigates — the loader and the bar are created and proven in phase 4 by `optix_screen` and
 * `optix_nav`, never hand-written into the starter's YAML.
 */
test('both starters ship the four screens the operator shell opens on', () => {
  const wanted = ['Home', 'Alarms', 'Diagnostics', 'Settings']
  for (const id of templates) {
    const yaml = readFileSync(
      new URL(`../packages/optix/templates/${id}/project/Nodes/UI/Screens/Screens.yaml`, import.meta.url), 'utf8',
    )
    const names = [...yaml.matchAll(/^- Name: (.+)$/gmu)].map(match => match[1])
    assert.deepEqual(names, wanted, `${id}: the shell screens are ${names.join(', ')}`)
    assert.equal((yaml.match(/Supertype: Screen/gu) ?? []).length, wanted.length, `${id}: a screen is not a Screen supertype`)
  }
})

/**
 * The manifest is what `optix_template` reads before anything is copied, so it must describe the
 * files that are actually on disk. Regenerate it with `node scripts/gen-optix-template.mjs` when a
 * starter changes; this test is what makes a stale hash impossible to miss.
 */
test('every starter manifest matches the files it ships', () => {
  for (const id of templates) {
    const manifest = manifestOf(id)
    assert.equal(manifest.fileCount, manifest.files.length, `${id}: fileCount does not match files[]`)
    assert.equal(manifest.totalBytes, manifest.files.reduce((sum, file) => sum + file.size, 0), `${id}: totalBytes does not add up`)
    const lines = []
    for (const file of manifest.files) {
      const bytes = readFileSync(new URL(`../packages/optix/templates/${id}/project/${file.path}`, import.meta.url))
      assert.equal(bytes.length, file.size, `${id}: ${file.path} is ${bytes.length} bytes, the manifest says ${file.size}`)
      const sha = createHash('sha256').update(bytes).digest('hex')
      assert.equal(sha, file.sha256, `${id}: ${file.path} does not match its recorded sha256`)
      lines.push(`${file.path}\n${sha}\n`)
    }
    assert.equal(manifest.contentHash, createHash('sha256').update(lines.join('')).digest('hex'), `${id}: contentHash does not follow from the files`)
  }
})
