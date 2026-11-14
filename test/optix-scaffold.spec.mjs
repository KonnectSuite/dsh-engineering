import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scaffoldProject } from '../packages/optix/lib/scaffold.js'

/**
 * The first step of a new Optix project is a copy of a packaged starter that already carries this
 * bundle's bridge and the operator's screen box. What is under test is that the copy is never made
 * over somebody's project, that the name reaches every file that carries it, and that the canvas
 * declared in `Nodes/UI/UI.yaml` is the one the screens drafted afterwards will inherit.
 */

const SHIPPED = 'public class StudioMCPBridge { private const string BridgeVersion = "1.0.9"; }'
const TEMPLATE_ROOT = new URL('../packages/optix/templates/arya-optix-ipc', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/u, '')
const SOURCE_NAME = 'AryaNewHMIProject_IPC'

/** A temp directory the test owns, under the OS temp root. */
const scratchRoot = () => mkdtemp(join(tmpdir(), 'dsh-optix-scaffold-'))

const cleanup = (path) => rm(path, { recursive: true, force: true })

test('a scaffold copies the starter, renames it, and carries this bridge', async () => {
  const parent = await scratchRoot()
  const destination = join(parent, 'Kymera')
  try {
    const report = await scaffoldProject({
      templateRoot: TEMPLATE_ROOT,
      destination,
      sourceProjectName: SOURCE_NAME,
      name: 'Kymera',
      shipped: SHIPPED,
    })
    assert.equal(report.bridge_version, '1.0.9')
    assert.equal(report.project_name, 'Kymera')
    assert.equal(report.file_count, 34)
    assert.ok(report.renamed_files.includes('Kymera.optix'), `${report.renamed_files.join(', ')} does not name the project file`)
    assert.equal(await readFile(join(destination, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), SHIPPED)
    const optix = await readFile(report.optix_file, 'utf8')
    assert.match(optix, /^\s*Name: Kymera$/mu)
    assert.doesNotMatch(optix, new RegExp(SOURCE_NAME, 'u'))
  } finally {
    await cleanup(parent)
  }
})

test('the screen box the operator gave becomes the canvas the screens inherit', async () => {
  const parent = await scratchRoot()
  const destination = join(parent, 'PanelApp')
  try {
    const report = await scaffoldProject({
      templateRoot: TEMPLATE_ROOT,
      destination,
      sourceProjectName: SOURCE_NAME,
      name: 'PanelApp',
      width: 800,
      height: 480,
      shipped: SHIPPED,
    })
    assert.deepEqual(
      { width: report.screen.width, height: report.screen.height, orientation: report.screen.orientation, changed: report.screen.changed },
      { width: 800, height: 480, orientation: 'landscape', changed: true },
    )
    const ui = await readFile(join(destination, 'Nodes', 'UI', 'UI.yaml'), 'utf8')
    assert.match(ui, /- Name: Width\r?\n(?: {2,}[^\r\n]*\r?\n)*? {4,}Value: 800\.0/u)
    assert.match(ui, /- Name: Height\r?\n(?: {2,}[^\r\n]*\r?\n)*? {4,}Value: 480\.0/u)
  } finally {
    await cleanup(parent)
  }
})

test('no screen box keeps the starter canvas instead of inventing one', async () => {
  const parent = await scratchRoot()
  const destination = join(parent, 'Stock')
  try {
    const report = await scaffoldProject({
      templateRoot: TEMPLATE_ROOT,
      destination,
      sourceProjectName: SOURCE_NAME,
      shipped: SHIPPED,
    })
    assert.deepEqual(
      { width: report.screen.width, height: report.screen.height, changed: report.screen.changed },
      { width: 1920, height: 1080, changed: false },
    )
    assert.equal(report.project_name, SOURCE_NAME)
  } finally {
    await cleanup(parent)
  }
})

test('a directory holding somebody else is refused rather than merged into', async () => {
  const parent = await scratchRoot()
  const destination = join(parent, 'Taken')
  try {
    await writeFile(join(parent, 'Taken.keep'), 'x')
    await rm(destination, { force: true })
    const { mkdir } = await import('node:fs/promises')
    await mkdir(destination, { recursive: true })
    await writeFile(join(destination, 'notes.txt'), 'mine')
    await assert.rejects(
      () => scaffoldProject({ templateRoot: TEMPLATE_ROOT, destination, sourceProjectName: SOURCE_NAME, shipped: SHIPPED }),
      /already holds files\. A starter is only copied into a new or empty directory, so nothing there is overwritten\./u,
    )
    assert.equal((await stat(join(destination, 'notes.txt'))).isFile(), true)
  } finally {
    await cleanup(parent)
  }
})
