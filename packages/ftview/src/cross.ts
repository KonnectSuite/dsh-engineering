/**
 * Cross-component references between a FactoryTalk View ME export and a
 * Studio 5000 L5X.
 *
 * The HMI side is the export already opened with `ftview_open`: its tag CSV
 * carries the device address each HMI tag points at, and the display files
 * carry the tag names their objects reference. The PLC side is read from the
 * L5X file itself, so no second project has to be opened.
 *
 * The match is deliberately name-based and one-directional: an HMI tag is
 * joined to a PLC tag when the device address root equals the PLC tag name,
 * ignoring case. Bit members and array elements join to their root tag.
 *
 * @module dsh-engineering-ftview/cross
 */
import { XMLParser } from 'fast-xml-parser'
import type { Application } from './model.ts'

/** One tag declared in the L5X. */
export interface PlcTag {
  readonly name: string
  readonly dataType: string
  readonly scope: string
}

/** What the L5X reader kept from the export. */
export interface PlcSide {
  readonly tags: readonly PlcTag[]
  readonly texts: readonly string[]
}

/** One HMI tag and what it points at. */
export interface CrossRow {
  readonly hmiTag: string
  readonly address: string | null
  readonly plcTag: string | null
  readonly displays: number
  readonly alarms: number
  readonly plcUses: number
  readonly status: 'linked' | 'memory' | 'unlinked' | 'unsupported'
}

/** A finding the caller has to act on. */
export interface CrossFinding {
  readonly code: string
  readonly severity: 'info' | 'warning'
  readonly subject: string
  readonly detail: string
}

/** The whole answer. */
export interface CrossReport {
  readonly rows: readonly CrossRow[]
  readonly findings: readonly CrossFinding[]
  readonly counts: {
    readonly hmiTags: number
    readonly linked: number
    readonly memory: number
    readonly unlinked: number
    readonly unsupported: number
    readonly plcTags: number
    readonly plcUnreferencedByHmi: number
    /** Alarm triggers found in the alarm configuration. */
    readonly alarmTriggers: number
    /** HMI tags an alarm watches but no display shows. */
    readonly alarmOnly: readonly string[]
    /** Alarm expressions naming a tag the HMI tag CSV does not declare. */
    readonly alarmUnresolved: readonly string[]
  }
}

/** Options for one cross-reference run. */
export interface CrossOptions {
  readonly limit?: number
  readonly includeMemory?: boolean
  /** Display file path to text, so the tool decides how files are read. */
  readonly displays?: ReadonlyMap<string, string>
  /** Alarm configuration XML, when the export carries one. */
  readonly alarms?: string
}

/** Parse the tag and routine text out of an L5X. */
export function readL5x(text: string): PlcSide {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name: string) => name === 'Tag' || name === 'Program' || name === 'Routine' || name === 'Rung' || name === 'Line',
  })
  const doc = parser.parse(text) as Record<string, any>
  const controller = doc?.RSLogix5000Content?.Controller
  if (!controller) throw new Error('the file has no RSLogix5000Content/Controller element')
  const tags: PlcTag[] = []
  const take = (list: unknown, scope: string): void => {
    for (const entry of (list as Record<string, any>[] | undefined) ?? []) {
      if (typeof entry?.Name !== 'string') continue
      tags.push({ name: entry.Name, dataType: String(entry.DataType ?? ''), scope })
    }
  }
  take(controller.Tags?.Tag, 'controller')
  const texts: string[] = []
  for (const program of (controller.Programs?.Program as Record<string, any>[] | undefined) ?? []) {
    const scope = typeof program?.Name === 'string' ? program.Name : 'program'
    take(program.Tags?.Tag, scope)
    for (const routine of (program.Routines?.Routine as Record<string, any>[] | undefined) ?? []) {
      for (const rung of (routine?.RLLContent?.Rung as Record<string, any>[] | undefined) ?? []) {
        const body = rung?.Text
        const first = Array.isArray(body) ? body[0] : body
        if (typeof first === 'string') texts.push(first)
        else if (typeof first?.['#text'] === 'string') texts.push(first['#text'])
      }
      for (const line of (routine?.STContent?.Lines?.Line as Record<string, any>[] | undefined) ?? []) {
        const body = typeof line === 'string' ? line : line?.['#text']
        if (typeof body === 'string') texts.push(body)
      }
    }
  }
  return { tags, texts }
}

/** Read an L5X from disk. */
/** Escape one literal for a regular expression. */
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** Count whole-word occurrences of a name in the texts. */
export function uses(texts: readonly string[], name: string): number {
  const pattern = new RegExp(`(?<![A-Za-z0-9_])${escape(name)}(?![A-Za-z0-9_])`, 'gu')
  let total = 0
  for (const text of texts) total += text.match(pattern)?.length ?? 0
  return total
}

/** The PLC tag an HMI device address points at, or null when it is not a name. */
export function addressRoot(address: string | null): { root: string | null; unsupported: boolean } {
  if (address === null || address.trim() === '') return { root: null, unsupported: false }
  const match = /^::\[[^\]]*\](.+)$/u.exec(address.trim())
  if (!match) return { root: null, unsupported: true }
  const path = (match[1] ?? '').trim()
  // A data-table address (F260:0, N7:5/2) is not a Logix tag name.
  if (path.includes(':') || path.includes('/')) return { root: null, unsupported: true }
  const root = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(path)?.[0]
  if (!root) return { root: null, unsupported: true }
  return { root, unsupported: false }
}

/** Count the displays whose text mentions the tag. */
function displaysUsing(app: Application, name: string, texts: ReadonlyMap<string, string> | undefined): number {
  if (texts === undefined) return 0
  const pattern = new RegExp(`(?<![A-Za-z0-9_])${escape(name)}(?![A-Za-z0-9_])`, 'gu')
  let count = 0
  for (const display of app.displays) {
    const text = texts.get(display.file)
    if (text === undefined) continue
    if (pattern.test(text)) count += 1
    pattern.lastIndex = 0
  }
  return count
}

export interface AlarmUsage {
  readonly triggers: number
  /** HMI tag name (lower case) to the trigger ids watching it. */
  readonly byTag: ReadonlyMap<string, readonly string[]>
}

/**
 * Read which tags the alarm configuration watches.
 *
 * Alarm expressions use the same `{[device]Tag.bit}` form as displays, and
 * several non-expression attributes (ack, handshake, silence) can hold a tag
 * too, so every attribute value is scanned for braces rather than guessing
 * which attributes matter.
 *
 * @param text - Alarm XML from the export.
 * @returns Trigger count and the tags each trigger references.
 */
export function readAlarms(text: string): AlarmUsage {
  const byTag = new Map<string, string[]>()
  const triggers = [...text.matchAll(/<trigger\b[^>]*>/gu)]
  for (const [index, trigger] of triggers.entries()) {
    const id = /\bid="([^"]+)"/u.exec(trigger[0])?.[1] ?? `T${index + 1}`
    for (const reference of trigger[0].matchAll(/\{([^}]*)\}/gu)) {
      const inside = reference[1] ?? ''
      const name = inside.replace(/^\[[^\]]*\]/u, '').split('.')[0]?.trim().toLowerCase() ?? ''
      if (name === '') continue
      const list = byTag.get(name) ?? []
      if (!list.includes(id)) list.push(id)
      byTag.set(name, list)
    }
  }
  return { triggers: triggers.length, byTag }
}

/** Join the HMI export to the PLC tags. */
export function crossReference(app: Application, plc: PlcSide, options: CrossOptions = {}): CrossReport {
  const limit = options.limit ?? 50
  const byName = new Map<string, PlcTag>()
  for (const tag of plc.tags) if (!byName.has(tag.name.toLowerCase())) byName.set(tag.name.toLowerCase(), tag)
  const rows: CrossRow[] = []
  const findings: CrossFinding[] = []
  const texts = options.displays
  const linked = new Set<string>()
  const alarms = options.alarms === undefined ? undefined : readAlarms(options.alarms)
  const alarmCount = (name: string): number => alarms?.byTag.get(name.toLowerCase())?.length ?? 0
  let memory = 0
  let unlinked = 0
  let unsupported = 0
  for (const tag of app.tags) {
    const address = tag.raw.DevAddress?.trim() || null
    const parsed = addressRoot(address)
    if (parsed.unsupported) {
      unsupported += 1
      rows.push({ hmiTag: tag.name, address, plcTag: null, displays: displaysUsing(app, tag.name, texts), alarms: alarmCount(tag.name), plcUses: 0, status: 'unsupported' })
      findings.push({ code: 'ADDRESS_UNSUPPORTED', severity: 'info', subject: tag.name, detail: `${address} is a data-table address, not a Logix tag name; the link is not verified.` })
      continue
    }
    if (parsed.root === null) {
      memory += 1
      if (options.includeMemory === true) rows.push({ hmiTag: tag.name, address, plcTag: null, displays: displaysUsing(app, tag.name, texts), alarms: alarmCount(tag.name), plcUses: 0, status: 'memory' })
      continue
    }
    const target = byName.get(parsed.root.toLowerCase())
    if (target === undefined) {
      unlinked += 1
      rows.push({ hmiTag: tag.name, address, plcTag: null, displays: displaysUsing(app, tag.name, texts), alarms: alarmCount(tag.name), plcUses: 0, status: 'unlinked' })
      findings.push({ code: 'HMI_TAG_NOT_IN_PLC', severity: 'warning', subject: tag.name, detail: `points at ${parsed.root}, which no tag in this L5X declares.` })
      continue
    }
    linked.add(target.name.toLowerCase())
    rows.push({ hmiTag: tag.name, address, plcTag: target.name, displays: displaysUsing(app, tag.name, texts), alarms: alarmCount(tag.name), plcUses: uses(plc.texts, target.name), status: 'linked' })
  }
  const unused = plc.tags.filter(tag => !linked.has(tag.name.toLowerCase()))
  let unreferenced = 0
  for (const tag of unused) {
    if (uses(plc.texts, tag.name) === 0) unreferenced += 1
    if (findings.length < limit) {
      findings.push({ code: 'PLC_TAG_NOT_IN_HMI', severity: 'info', subject: tag.name, detail: `declared in ${tag.scope} scope; no HMI tag points at it.` })
    }
  }
  const alarmOnly = app.tags
    .filter(tag => alarmCount(tag.name) > 0 && displaysUsing(app, tag.name, texts) === 0)
    .map(tag => tag.name)
  const hmiNames = new Set(app.tags.map(tag => tag.name.toLowerCase()))
  const alarmUnresolved = [...(alarms?.byTag.keys() ?? [])].filter(name => !hmiNames.has(name)).sort()
  for (const name of alarmUnresolved) {
    if (findings.length >= limit) break
    findings.push({ code: 'ALARM_TAG_NOT_IN_HMI', severity: 'warning', subject: name, detail: `alarm trigger(s) ${(alarms?.byTag.get(name) ?? []).join(', ')} watch this tag, which the HMI tag CSV does not declare.` })
  }
  return {
    rows: rows.slice(0, limit),
    findings: findings.slice(0, limit),
    counts: {
      hmiTags: app.tags.length,
      linked: [...linked].length,
      memory,
      unlinked,
      unsupported,
      plcTags: plc.tags.length,
      plcUnreferencedByHmi: unreferenced,
      alarmTriggers: alarms?.triggers ?? 0,
      alarmOnly,
      alarmUnresolved,
    },
  }
}
