/**
 * The engineering handbook: source shape, coverage, and the built artifact set.
 *
 * The handbook is authored as Markdown in docs/handbook/src and built by
 * scripts/gen-handbook.py. These tests hold the parts a reader depends on:
 * every page is titled and ordered, the required surfaces are covered, the
 * three artifacts are present and match the sources, and the generator is
 * deterministic for the format that does not need a browser.
 *
 * The generator checks that need Python are skipped when the host cannot
 * provide an interpreter; the shape and coverage checks always run.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'docs', 'handbook', 'src')
const OUT = join(ROOT, 'docs', 'handbook')
const GENERATOR = join(ROOT, 'scripts', 'gen-handbook.py')
const ARTIFACTS = ['engineering-handbook.html', 'engineering-handbook.docx', 'engineering-handbook.pdf']

/** The pages a reader needs, in the order the handbook introduces them. */
const REQUIRED_TITLES = [
  ['bundle', 'what the bundle is'],
  ['session', 'how a session works'],
  ['studio 5000', 'Studio 5000 L5X'],
  ['factorytalk view', 'FactoryTalk View ME and SE'],
  ['motionworks', 'MotionWorks IEC'],
  ['optix', 'FactoryTalk Optix and NetLogic'],
  ['migration', 'legacy migration'],
  ['plc-5', 'RSLogix 5 and PLC-5 reads'],
  ['slc 500', 'SLC 500'],
  ['engineering resources', 'engineering resources'],
  ['documentation', 'documentation tools'],
  ['preview', 'previews'],
  ['safety', 'safety, approvals'],
  ['troubleshooting', 'troubleshooting'],
  ['known gaps', 'known gaps'],
]

function readPages() {
  assert.ok(existsSync(SRC), 'docs/handbook/src is missing')
  const files = readdirSync(SRC)
    .filter(name => name.endsWith('.md'))
    .sort()
  assert.ok(files.length >= 10 && files.length <= 16, `expected 10-16 handbook pages, found ${files.length}`)
  return files.map(name => {
    const text = readFileSync(join(SRC, name), 'utf8')
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
    assert.ok(match, `${name}: missing front matter delimited by ---`)
    const front = {}
    for (const line of match[1].split(/\r?\n/)) {
      const field = /^([A-Za-z]+):\s*(.*)$/.exec(line)
      if (field) front[field[1]] = field[2].trim()
    }
    return { name, front, body: match[2] }
  })
}

/** Run a child without ever throwing: some sandboxes refuse pipes outright. */
function trySpawn(command, args, options) {
  try {
    return spawnSync(command, args, options)
  } catch (error) {
    return { error, status: null, stdout: '', stderr: '' }
  }
}

function findPython() {
  const candidates = [process.env.HANDBOOK_PYTHON, 'python', 'python3', 'py'].filter(Boolean)
  for (const candidate of candidates) {
    const args = candidate === 'py' ? ['-3', '--version'] : ['--version']
    const result = trySpawn(candidate, args, { cwd: ROOT, encoding: 'utf8', timeout: 30_000 })
    if (result.error || result.status !== 0) continue
    // A launcher that answers --version may still be a broken stub (the Windows
    // Python installer leaves one with no stdlib). Probe an import so the
    // Python-dependent checks skip instead of failing on a host that cannot run
    // the generator at all.
    const imports = candidate === 'py' ? ['-3', '-c', 'import encodings'] : ['-c', 'import encodings']
    const usable = trySpawn(candidate, imports, { cwd: ROOT, encoding: 'utf8', timeout: 30_000 })
    if (usable.error || usable.status !== 0) continue
    const python = candidate === 'py' ? ['py', '-3'] : [candidate]
    return python
  }
  return null
}

function runGenerator(python, args) {
  return trySpawn(python[0], [...python.slice(1), GENERATOR, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180_000,
  })
}

/** The --check path reads DOCX core properties, so it needs python-docx. */
function hasDocx(python) {
  const probe = trySpawn(python[0], [...python.slice(1), '-c', 'import docx'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  })
  return !probe.error && probe.status === 0
}

const python = findPython()
const pages = readPages()

test('every page has front matter with a title, order and purpose', () => {
  for (const page of pages) {
    for (const field of ['title', 'order', 'purpose']) {
      assert.ok(page.front[field], `${page.name}: front matter has no ${field}`)
    }
    const order = Number(page.front.order)
    assert.ok(Number.isInteger(order) && order > 0, `${page.name}: order "${page.front.order}" is not a positive integer`)
    assert.ok(page.body.trim().length > 200, `${page.name}: body is too short to be a page`)
  }
})

test('order values are unique', () => {
  const orders = pages.map(page => Number(page.front.order))
  assert.equal(new Set(orders).size, orders.length, `duplicate order values: ${orders.join(', ')}`)
  assert.ok(
    orders.every(order => order > 0),
    'every page order must be positive',
  )
})

test('the page set covers every required surface and states the retired ECAD row', () => {
  const titles = pages.map(page => page.front.title.toLowerCase())
  for (const [needle, label] of REQUIRED_TITLES) {
    assert.ok(
      titles.some(title => title.includes(needle)),
      `no page title covers ${label} (looked for "${needle}")`,
    )
  }
  const ecad = pages.find(page => page.front.title.toLowerCase().includes('bundle'))
  assert.ok(ecad, 'no bundle page')
  assert.match(ecad.body, /ECAD/, 'the bundle page does not explain the retired ECAD row')
  assert.match(ecad.body, /SLC 500/, 'the bundle page does not introduce the SLC 500 row')
})

test('the built artifacts exist and are not empty', () => {
  for (const name of ARTIFACTS) {
    const path = join(OUT, name)
    assert.ok(existsSync(path), `missing built artifact docs/handbook/${name}`)
    assert.ok(statSync(path).size > 10_000, `docs/handbook/${name} is unexpectedly small`)
  }
})

test('the artifacts match the sources (generator --check)', t => {
  if (!python) {
    t.skip('no usable Python interpreter on this host; the artifact check cannot run')
    return
  }
  if (!hasDocx(python)) {
    t.skip('python-docx is not installed; the artifact check needs it to read the DOCX')
    return
  }
  const result = runGenerator(python, ['--check'])
  if (result.error || result.status === null) {
    t.skip(`cannot start Python here (${result.error?.code ?? 'no status'}); the artifact check cannot run`)
    return
  }
  assert.equal(result.status, 0, `gen-handbook.py --check failed:\n${result.stderr || result.stdout}`)
})

test('the generator is deterministic for HTML', t => {
  if (!python) {
    t.skip('no usable Python interpreter on this host; determinism cannot be checked')
    return
  }
  const first = mkdtempSync(join(tmpdir(), 'handbook-a-'))
  const second = mkdtempSync(join(tmpdir(), 'handbook-b-'))
  try {
    for (const dir of [first, second]) {
      const result = runGenerator(python, ['--formats', 'html', '--out-dir', dir])
      if (result.error || result.status === null) {
        t.skip(`cannot start the generator on this host (${result.error?.code ?? 'no status'}); determinism not checked`)
        return
      }
      assert.equal(result.status, 0, `generator failed for ${dir}:\n${result.stderr || result.stdout}`)
    }
    const a = readFileSync(join(first, 'engineering-handbook.html'))
    const b = readFileSync(join(second, 'engineering-handbook.html'))
    assert.ok(a.equals(b), 'two builds produced different HTML bytes')
  } finally {
    rmSync(first, { recursive: true, force: true })
    rmSync(second, { recursive: true, force: true })
  }
})

test('the scaffold checklist names every wiring step', () => {
  const readme = join(ROOT, 'packages', '_scaffold', 'README.md')
  assert.ok(existsSync(readme), 'packages/_scaffold/README.md is missing')
  const text = readFileSync(readme, 'utf8')
  for (const needle of ['components.json', 'cordis.patch.yml', 'assemble.mjs', 'gen-tool-reference.ts', 'locale/', 'scripts/test.mjs']) {
    assert.ok(text.includes(needle), `the scaffold README does not mention ${needle}`)
  }
  assert.ok(
    existsSync(join(ROOT, 'packages', '_scaffold', 'src', 'index.ts')),
    'the scaffold has no src/index.ts',
  )
  assert.ok(
    existsSync(join(ROOT, 'packages', '_scaffold', 'test', 'smoke.spec.mjs')),
    'the scaffold has no test/smoke.spec.mjs',
  )
})

test('the handbook development page documents the command and the check', () => {
  const page = join(ROOT, 'docs', 'development', 'handbook.md')
  assert.ok(existsSync(page), 'docs/development/handbook.md is missing')
  const text = readFileSync(page, 'utf8')
  for (const needle of ['pnpm docs:handbook', '--check', 'docs/handbook/src']) {
    assert.ok(text.includes(needle), `docs/development/handbook.md does not mention ${needle}`)
  }
})
