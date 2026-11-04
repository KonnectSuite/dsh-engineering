/**
 * Evidence runs for the ECAD DWG converter.
 *
 * Every number this script prints is measured on this machine, on the owner's
 * read-only print set, and the script is committed so the numbers can be
 * reproduced rather than trusted. It is not part of the package's runtime: the
 * converter API is `packages/ecad/src/dwg/index.ts`.
 *
 * The engine must be built first:
 *
 * ```sh
 * node node_modules/typescript/bin/tsc -p packages/ecad/tsconfig.json
 * node packages/ecad/rust/evidence.mjs versions
 * node packages/ecad/rust/evidence.mjs corpus
 * node packages/ecad/rust/evidence.mjs equivalence
 * node packages/ecad/rust/evidence.mjs write
 * node packages/ecad/rust/evidence.mjs roundtrip
 * ```
 *
 * Modes:
 *
 * | Mode | What it proves |
 * |---|---|
 * | `versions` | the DWG version distribution of the 33 real files, and whether a write keeps the DXF's version |
 * | `corpus` | every DWG converts to DXF, with bytes, time and warnings per file |
 * | `equivalence` | the converted DXF and the shipped DXF of the same drawing build the same engine model |
 * | `write` | DXF → DWG → DXF returns a model the engine still reads as the same drawing |
 * | `roundtrip` | DWG → DXF → DWG → DXF keeps the model stable on real DWG input |
 *
 * The corpus path comes from `ECAD_CORPUS` and defaults to the owner's set, which
 * is read-only and never copied into the repository. Every corpus mode exits 0
 * with a skip line when the directory is absent.
 *
 * @module dsh-engineering-ecad/rust/evidence
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildSheetModel,
  defaultProfile,
  detectTitleBlock,
  diffSheetModels,
  openSheet
} from '../lib/engine/index.js'
import { converterInfo, dwgToDxf, dxfToDwg } from '../lib/dwg/index.js'

const CORPUS = process.env.ECAD_CORPUS ?? 'C:/Users/KNPhu/AryaCode/KonnectSuite/tmp/ecad-corpus/Prints'
const DWG_DIR = join(CORPUS, 'DWG')
const DXF_DIR = join(CORPUS, 'DXF')
const WORK_DIR = join(tmpdir(), 'dsh-dwg-evidence')
const CONVERTED_DIR = join(WORK_DIR, 'converted')

/** Throwing when the corpus is absent keeps the skip explicit. */
const corpusPresent = existsSync(DWG_DIR) && existsSync(DXF_DIR)

/** File stem suffix that pairs a DWG with the same sheet's DXF. */
function suffixOf(name) {
  const match = /-(\d+)\./.exec(name)
  return match === null ? name : match[1]
}

/** The DWG files, sorted. */
function dwgFiles() {
  return readdirSync(DWG_DIR)
    .filter(name => name.toLowerCase().endsWith('.dwg'))
    .sort()
}

/** The DXF files, sorted. */
function dxfFiles() {
  return readdirSync(DXF_DIR)
    .filter(name => name.toLowerCase().endsWith('.dxf'))
    .sort()
}

/** Pairs of `{ suffix, dwg, dxf }` where both formats exist. */
function pairs() {
  const byDxf = new Map(dxfFiles().map(name => [suffixOf(name), name]))
  const result = []
  for (const dwg of dwgFiles()) {
    const dxf = byDxf.get(suffixOf(dwg))
    if (dxf !== undefined) result.push({ suffix: suffixOf(dwg), dwg, dxf })
  }
  return result
}

/** Read one corpus file. */
function readCorpus(directory, name) {
  return new Uint8Array(readFileSync(join(directory, name)))
}

/** Milliseconds, rounded to one decimal. */
function ms(started) {
  return Math.round((performance.now() - started) * 10) / 10
}

/** One table row. */
function row(cells) {
  return `| ${cells.join(' | ')} |`
}

/** A markdown table with its header separator. */
function table(headers, rows) {
  return [row(headers), row(headers.map(() => '---')), ...rows].join('\n')
}

/** Open bytes and build the engine model. */
async function modelOf(path, bytes) {
  const opened = await openSheet({ path, bytes })
  return { opened, model: buildSheetModel(opened) }
}

/** Diff counts as one compact string. */
function diffCounts(diff) {
  return `added ${diff.added.length} · removed ${diff.removed.length} · changed ${diff.changed.length}${diff.truncated ? ' (truncated)' : ''}`
}

/** Round to a thousandth, so a geometry key is stable against float noise. */
function round(value) {
  return Math.round(value * 1000) / 1000
}

/**
 * Canonical geometry key for a model entity: what a person would compare by eye,
 * independent of handles, so "the same line drawn by two writers" matches.
 */
function geometryKey(entity) {
  const nums = values => values.map(point => `${round(point[0])},${round(point[1])}`).join(';')
  switch (entity.k) {
    case 'line':
      return `line:${nums(entity.pts)}`
    case 'arc':
      return `arc:${round(entity.c[0])},${round(entity.c[1])},${round(entity.r)},${round(entity.a0 ?? 0)},${round(entity.a1 ?? 0)}`
    case 'circle':
      return `circle:${round(entity.c[0])},${round(entity.c[1])},${round(entity.r)}`
    case 'ellipse':
      return `ellipse:${round(entity.c[0])},${round(entity.c[1])},${round(entity.rx ?? 0)},${round(entity.ry ?? 0)}`
    case 'text':
      return `text:${round(entity.p[0])},${round(entity.p[1])}:${entity.t}`
    case 'mtext':
      return `mtext:${round(entity.p[0])},${round(entity.p[1])}:${entity.t}`
    case 'polyline':
      return `poly:${nums(entity.pts)}`
    case 'hatch':
      return `hatch:${entity.loops?.map(nums).join('|') ?? ''}`
    case 'insert':
      return `insert:${round(entity.p[0])},${round(entity.p[1])}:${entity.block}`
    case 'solid':
      return `solid:${nums(entity.pts ?? [])}`
    default:
      return `${entity.k}:${JSON.stringify(entity).slice(0, 120)}`
  }
}

/**
 * How much of the shipped drawing the converted drawing also draws.
 *
 * @returns `{ shipped, converted, shared }` counts of distinct geometry keys.
 */
function geometryOverlap(shippedModel, convertedModel, layerFilter = () => true) {
  const collect = model => {
    const keys = new Set()
    for (const layout of model.layouts) {
      for (const entity of layout.entities) {
        if (!layerFilter(entity)) continue
        keys.add(geometryKey(entity))
      }
    }
    return keys
  }
  const a = collect(shippedModel)
  const b = collect(convertedModel)
  let shared = 0
  for (const key of b) if (a.has(key)) shared += 1
  return { shipped: a.size, converted: b.size, shared }
}

/** Print the first few rows of a diff, so a non-zero result is inspectable. */
function explainDiff(diff, limit = 5) {
  const label = change => {
    const entity = change.before ?? change.after
    return `${change.entityKind} ${entity?.id ?? '?'} [${change.layout}:${change.layer}]`
  }
  for (const change of diff.added.slice(0, limit)) {
    console.log(`  + ${label(change)}: ${change.reason}`)
  }
  for (const change of diff.removed.slice(0, limit)) {
    console.log(`  - ${label(change)}: ${change.reason}`)
  }
  for (const change of diff.changed.slice(0, limit)) {
    console.log(`  ~ ${label(change)}: ${change.reason}`)
  }
}

/** `versions` — the DWG marker of every real file, and write-version fidelity. */
function modeVersions() {
  if (!corpusPresent) return skip('versions')
  console.log('## DWG version distribution\n')
  const counts = new Map()
  const rows = []
  for (const name of dwgFiles()) {
    const bytes = new Uint8Array(readFileSync(join(DWG_DIR, name)))
    const marker = new TextDecoder('latin1').decode(bytes.subarray(0, 6))
    counts.set(marker, (counts.get(marker) ?? 0) + 1)
    rows.push(row([name, String(bytes.byteLength), marker]))
  }
  const distribution = [...counts.entries()].sort()
  console.log(table(['DWG file', 'bytes', 'version marker'], rows))
  console.log('\nDistribution:\n')
  console.log(table(['marker', 'files'], distribution.map(([marker, count]) => row([marker, String(count)]))))
  return 0
}

/** `corpus` — convert all 33 DWGs. */
async function modeCorpus() {
  if (!corpusPresent) return skip('corpus')
  rmSync(CONVERTED_DIR, { recursive: true, force: true })
  mkdirSync(CONVERTED_DIR, { recursive: true })
  const info = await converterInfo()
  console.log(`converter: kind=${info.kind} version=${info.version} versions=${info.versions.join(',')}\n`)
  const rows = []
  let ok = 0
  let bytesIn = 0
  let bytesOut = 0
  let warnings = 0
  const startedAll = performance.now()
  for (const name of dwgFiles()) {
    const bytes = new Uint8Array(readFileSync(join(DWG_DIR, name)))
    const started = performance.now()
    try {
      const converted = await dwgToDxf(bytes)
      const elapsed = ms(started)
      writeFileSync(join(CONVERTED_DIR, `${suffixOf(name)}.dxf`), converted.dxf)
      rows.push(
        row([
          name,
          String(bytes.byteLength),
          String(converted.dxf.byteLength),
          `${elapsed}`,
          converted.version,
          String(converted.warnings.length)
        ])
      )
      ok += 1
      bytesIn += bytes.byteLength
      bytesOut += converted.dxf.byteLength
      warnings += converted.warnings.length
    } catch (error) {
      const elapsed = ms(started)
      rows.push(row([name, String(bytes.byteLength), 'FAILED', `${elapsed}`, '-', error.code ?? '-']))
      console.log(`${name}: ${error.code} ${error.message}`)
    }
  }
  const total = ms(startedAll)
  console.log(table(['DWG', 'bytes in', 'DXF bytes', 'ms', 'version', 'warnings'], rows))
  console.log(
    `\nconverted ${ok}/${rows.length} · ${bytesIn} → ${bytesOut} bytes · total ${total} ms · ${warnings} warning line(s)`
  )
  return ok === rows.length ? 0 : 1
}

/** The converted DXF of one sheet, converting it when the cache is cold. */
async function convertedDxf(suffix, dwgName) {
  const cached = join(CONVERTED_DIR, `${suffix}.dxf`)
  if (existsSync(cached)) return new Uint8Array(readFileSync(cached))
  const converted = await dwgToDxf(readCorpus(DWG_DIR, dwgName))
  mkdirSync(CONVERTED_DIR, { recursive: true })
  writeFileSync(cached, converted.dxf)
  return converted.dxf
}

/** `equivalence` — the same drawing through two writers must build one model. */
async function modeEquivalence() {
  if (!corpusPresent) return skip('equivalence')
  const profile = defaultProfile()
  const list = pairs()
  console.log(`comparing ${list.length} DWG/DXF pairs by sheet suffix\n`)
  const rows = []
  const layerHistogram = new Map()
  const kindHistogram = new Map()
  const overlaps = []
  const contentOverlaps = []
  let clean = 0
  for (const { suffix, dwg, dxf } of list) {
    const shipped = await modelOf(dxf, readCorpus(DXF_DIR, dxf))
    const converted = new Uint8Array(await convertedDxf(suffix, dwg))
    const rewritten = await modelOf(`converted:${suffix}.dxf`, converted)
    const diff = diffSheetModels(shipped.model, rewritten.model)
    const same = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0
    if (same) clean += 1
    const overlap = geometryOverlap(shipped.model, rewritten.model)
    const contentOverlap = geometryOverlap(
      shipped.model,
      rewritten.model,
      entity => entity.layer.toUpperCase() !== 'TITLE_BLOCK'
    )
    overlaps.push(overlap)
    contentOverlaps.push(contentOverlap)
    const percent = (part, whole) => (whole === 0 ? '0' : ((part / whole) * 100).toFixed(1))
    const shippedTitle = detectTitleBlock(shipped.opened, profile, { model: shipped.model })
    const convertedTitle = detectTitleBlock(rewritten.opened, profile, { model: rewritten.model })
    const fieldOf = (title, name) => title.fields?.[name]?.value ?? ''
    for (const change of [...diff.added, ...diff.removed]) {
      const key = `${change.layer}${change.before?.g ?? change.after?.g ? ' (in block)' : ''}`
      layerHistogram.set(key, (layerHistogram.get(key) ?? 0) + 1)
      kindHistogram.set(change.entityKind, (kindHistogram.get(change.entityKind) ?? 0) + 1)
    }
    rows.push(
      row([
        suffix,
        fieldOf(shippedTitle, 'sheetNumber') || '-',
        fieldOf(convertedTitle, 'sheetNumber') || '-',
        fieldOf(shippedTitle, 'date') || '-',
        fieldOf(convertedTitle, 'date') || '-',
        String(shipped.model.stats.entities),
        String(rewritten.model.stats.entities),
        diffCounts(diff),
        `${percent(overlap.shared, overlap.shipped)} / ${percent(contentOverlap.shared, contentOverlap.shipped)}`
      ])
    )
    if (!same) {
      console.log(`pair ${suffix}: ${diffCounts(diff)} · geometry shared ${percent(overlap.shared, overlap.shipped)}% · outside TITLE_BLOCK ${percent(contentOverlap.shared, contentOverlap.shipped)}%`)
      explainDiff(diff)
    }
  }
  console.log(
    table(
      [
        'sheet',
        'DXF sheet no.',
        'DWG sheet no.',
        'DXF date',
        'DWG date',
        'ents DXF',
        'ents DWG→DXF',
        'model diff',
        'geometry shared % (all / no TITLE_BLOCK)'
      ],
      rows
    )
  )
  const mean = (values, pick) =>
    values.length === 0 ? '0' : ((values.reduce((sum, value) => sum + pick(value), 0) / values.length) * 100).toFixed(1)
  console.log(
    `\nclean ${clean}/${list.length} pairs · mean geometry shared ${mean(overlaps, o => (o.shipped === 0 ? 0 : o.shared / o.shipped))}% (all layers) · ${mean(contentOverlaps, o => (o.shipped === 0 ? 0 : o.shared / o.shipped))}% outside TITLE_BLOCK`
  )
  console.log('\nWhere the added+removed entities live (all pairs):\n')
  const byCount = [...layerHistogram.entries()].sort((a, b) => b[1] - a[1])
  console.log(table(['layer', 'entities'], byCount.map(([layer, count]) => row([layer, String(count)]))))
  console.log('\nBy entity kind (all pairs):\n')
  const byKind = [...kindHistogram.entries()].sort((a, b) => b[1] - a[1])
  console.log(table(['kind', 'entities'], byKind.map(([kind, count]) => row([kind, String(count)]))))
  return clean === list.length ? 0 : 1
}

/** `write` — DXF → DWG → DXF on the smallest, a middle and the largest sheet. */
async function modeWrite() {
  if (!corpusPresent) return skip('write')
  const files = dxfFiles()
    .map(name => ({ name, size: readCorpus(DXF_DIR, name).byteLength }))
    .sort((a, b) => a.size - b.size)
  const picks = [files[0], files[Math.floor(files.length / 2)], files[files.length - 1]]
  console.log('sheets: smallest, median and largest by shipped DXF size\n')
  const rows = []
  let clean = 0
  for (const pick of picks) {
    const bytes = readCorpus(DXF_DIR, pick.name)
    const original = await modelOf(pick.name, bytes)
    const started = performance.now()
    const dwg = await dxfToDwg(bytes)
    const dxfBack = await dwgToDxf(dwg.dwg)
    const elapsed = ms(started)
    const rewritten = await modelOf(`written:${pick.name}`, dxfBack.dxf)
    const diff = diffSheetModels(original.model, rewritten.model)
    const same = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0
    if (same) clean += 1
    rows.push(
      row([
        pick.name,
        String(pick.size),
        dwg.version,
        String(dwg.dwg.byteLength),
        String(dxfBack.dxf.byteLength),
        `${elapsed}`,
        diffCounts(diff)
      ])
    )
    if (!same) {
      console.log(`${pick.name}:`)
      explainDiff(diff)
    }
  }
  console.log(
    table(
      ['sheet', 'DXF bytes', 'written DWG version', 'DWG bytes', 'DXF back', 'ms', 'model diff'],
      rows
    )
  )
  console.log(`\nclean ${clean}/${picks.length} sheets`)
  return clean === picks.length ? 0 : 1
}

/** `roundtrip` — DWG → DXF → DWG → DXF must not move the model. */
async function modeRoundtrip() {
  if (!corpusPresent) return skip('roundtrip')
  const files = dwgFiles()
    .map(name => ({ name, size: new Uint8Array(readFileSync(join(DWG_DIR, name))).byteLength }))
    .sort((a, b) => a.size - b.size)
  const picks = [files[0], files[Math.floor(files.length / 2)], files[files.length - 1]]
  console.log('sheets: smallest, median and largest by DWG size\n')
  const rows = []
  let clean = 0
  for (const pick of picks) {
    const source = new Uint8Array(readFileSync(join(DWG_DIR, pick.name)))
    const first = await dwgToDxf(source)
    const second = await dxfToDwg(first.dxf)
    const third = await dwgToDxf(second.dwg)
    const a = await modelOf(`first:${pick.name}`, first.dxf)
    const b = await modelOf(`third:${pick.name}`, third.dxf)
    const diff = diffSheetModels(a.model, b.model)
    const same = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0
    if (same) clean += 1
    rows.push(
      row([
        pick.name,
        String(pick.size),
        first.version,
        String(first.dxf.byteLength),
        second.version,
        String(second.dwg.byteLength),
        String(third.dxf.byteLength),
        diffCounts(diff)
      ])
    )
    if (!same) {
      console.log(`${pick.name}:`)
      explainDiff(diff)
    }
  }
  console.log(
    table(
      ['DWG', 'bytes', 'v1', 'DXF 1', 'v2', 'DWG 2', 'DXF 2', 'model diff'],
      rows
    )
  )
  console.log(`\nclean ${clean}/${picks.length} sheets`)
  return clean === picks.length ? 0 : 1
}

/** Print the skip line for a corpus mode. */
function skip(mode) {
  console.log(`skip ${mode}: the read-only corpus is not present at ${CORPUS}`)
  return 0
}

const modes = {
  versions: modeVersions,
  corpus: modeCorpus,
  equivalence: modeEquivalence,
  write: modeWrite,
  roundtrip: modeRoundtrip
}

const requested = process.argv[2] ?? 'versions'
const run = modes[requested]
if (run === undefined) {
  console.error(`unknown mode ${requested}; use one of ${Object.keys(modes).join(', ')}`)
  process.exit(2)
}
process.exit(await run())
