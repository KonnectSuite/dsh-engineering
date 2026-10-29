import { mkdirSync, writeFileSync, utimesSync, rmSync, copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { copyProjectExtras } from '../src/vendor.ts'

/** One fake Studio project store with an app database, alarms and tags. */
function store(options: { alarms: boolean; tags: boolean; olderThanDatabase: boolean }): { root: string; app: string; folder: string; destination: string } {
  const root = join(tmpdir(), `ftview-store-${randomUUID()}`)
  const app = 'TestApp'
  const folder = join(root, 'RSView Enterprise/ME/HMI projects', app)
  mkdirSync(folder, { recursive: true })
  const database = join(folder, `${app}.med`)
  writeFileSync(database, 'database')
  if (options.alarms) writeFileSync(join(folder, 'Alarms.xml'), '<alarm/>')
  if (options.tags) writeFileSync(join(folder, `${app}-Tags.CSV`), ';Tag Type, Tag Name\n')
  if (options.olderThanDatabase) {
    const old = new Date('2026-01-01T00:00:00Z')
    const files = [join(folder, 'Alarms.xml'), join(folder, `${app}-Tags.CSV`)]
    for (const file of files) {
      try { utimesSync(file, old, old) } catch { /* the option may be absent */ }
    }
  }
  const destination = join(root, 'export')
  mkdirSync(destination, { recursive: true })
  return { root, app, folder, destination }
}

describe('project store extras', () => {
  it('copies alarms and tags into the export layout', () => {
    const { root, app, destination } = store({ alarms: true, tags: true, olderThanDatabase: false })
    const result = copyProjectExtras(app, destination, root)
    expect(result.copied).toEqual(['Alarms/Alarms.xml', `Tags/${app}.csv`])
    expect(result.warnings).toEqual([])
    expect(result.status).toEqual({ alarms: 'fresh', tags: 'fresh' })
    rmSync(root, { recursive: true, force: true })
  })

  it('marks a snapshot older than the database as stale', () => {
    const { root, app, destination } = store({ alarms: true, tags: true, olderThanDatabase: true })
    const result = copyProjectExtras(app, destination, root)
    expect(result.status).toEqual({ alarms: 'stale', tags: 'stale' })
    rmSync(root, { recursive: true, force: true })
  })

  it('marks absent assets as missing', () => {
    const { root, app, destination } = store({ alarms: false, tags: false, olderThanDatabase: false })
    const result = copyProjectExtras(app, destination, root)
    expect(result.status).toEqual({ alarms: 'missing', tags: 'missing' })
    rmSync(root, { recursive: true, force: true })
  })

  it('warns when a copied snapshot predates the application database', () => {
    const { root, app, destination } = store({ alarms: true, tags: true, olderThanDatabase: true })
    const result = copyProjectExtras(app, destination, root)
    expect(result.copied).toHaveLength(2)
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[0]).toContain('older than the application database')
    rmSync(root, { recursive: true, force: true })
  })

  it('names the components that are missing', () => {
    const { root, app, destination } = store({ alarms: false, tags: false, olderThanDatabase: false })
    const result = copyProjectExtras(app, destination, root)
    expect(result.copied).toEqual([])
    expect(result.warnings.join(' ')).toContain('No Alarms.xml')
    expect(result.warnings.join(' ')).toContain('No tag CSV')
    rmSync(root, { recursive: true, force: true })
  })

  it('decodes current alarms from the alarm database instead of copying a snapshot', () => {
    const { root, app, folder, destination } = store({ alarms: false, tags: false, olderThanDatabase: false })
    mkdirSync(join(folder, 'M_Alarms'), { recursive: true })
    copyFileSync(join(import.meta.dirname, 'fixtures/alarms/AryaFTV_CarpenterPilot_20261007/MachineAlarms.mal'), join(folder, 'M_Alarms/MachineAlarms.mal'))
    const result = copyProjectExtras(app, destination, root)
    expect(result.status.alarms).toBe('fresh')
    expect(result.copied).toContain('Alarms/Alarms.xml')
    const decoded = readFileSync(join(destination, 'Alarms/Alarms.xml'), 'utf8')
    expect(decoded.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(decoded).toContain('<trigger id="T1"')
    expect(decoded).toContain('<message id="M1"')
    rmSync(root, { recursive: true, force: true })
  })

  it('falls back to the snapshot and says why when the alarm stream is unknown', () => {
    const { root, app, folder, destination } = store({ alarms: true, tags: false, olderThanDatabase: false })
    mkdirSync(join(folder, 'M_Alarms'), { recursive: true })
    writeFileSync(join(folder, 'M_Alarms/MachineAlarms.mal'), 'not a compound file')
    const result = copyProjectExtras(app, destination, root)
    expect(result.copied).toContain('Alarms/Alarms.xml')
    expect(result.warnings.join(' ')).toContain('could not be decoded')
    rmSync(root, { recursive: true, force: true })
  })

  it('copies the bitmaps the displays reference', () => {
    const { root, app, folder, destination } = store({ alarms: true, tags: true, olderThanDatabase: false })
    mkdirSync(join(folder, 'Images'), { recursive: true })
    writeFileSync(join(folder, 'Images', 'logo.bmp'), 'bmp')
    const result = copyProjectExtras(app, destination, root)
    expect(result.copied).toContain('Images/logo.bmp')
    expect(result.warnings).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })

  it('warns only when a display actually references an image', () => {
    const { root, app, destination } = store({ alarms: true, tags: true, olderThanDatabase: false })
    mkdirSync(join(destination, 'Displays'), { recursive: true })
    writeFileSync(join(destination, 'Displays', 'Main.xml'), '<display><image imageName="logo"/></display>')
    const result = copyProjectExtras(app, destination, root)
    expect(result.warnings.join(' ')).toContain('cannot render')
    rmSync(root, { recursive: true, force: true })
  })

  it('reports a missing project store instead of pretending', () => {
    const root = join(tmpdir(), `ftview-store-${randomUUID()}`)
    mkdirSync(root, { recursive: true })
    const destination = join(root, 'export')
    mkdirSync(destination)
    const result = copyProjectExtras('Absent', destination, root)
    expect(result.copied).toEqual([])
    expect(result.warnings[0]).toContain('No Studio project folder')
    rmSync(root, { recursive: true, force: true })
  })
})
