/**
 * Read a FactoryTalk View ME alarm database without the alarm wizard.
 *
 * The application keeps its alarm database in `M_Alarms\MachineAlarms.mal`, an
 * OLE2 compound file with two streams: `Alarms` (numbers, expressions and the
 * header/trailer record) and `ls00000409` (the localised labels and message
 * text). Decoding those two streams reproduces the alarm XML the Alarm
 * Import/Export wizard writes, byte for byte - proven against wizard exports
 * from three applications (see `test/alarmdb.spec.ts`).
 *
 * Nothing here writes to the project store: the `.mal` is read, the XML is
 * rendered, and only the caller's output path is written.
 *
 * @module dsh-engineering-ftview/alarmdb
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EngineeringError } from './core.ts'
import { projectFolder } from './vendor.ts'

/** One alarm trigger row. */
export interface AlarmTrigger {
  /** Trigger number as the XML names it: `T1`, `T2`, ... */
  readonly id: number
  readonly type: 'bit' | 'value'
  readonly ackAllValue: number
  readonly useAckAll: boolean
  readonly ackTag: string
  readonly exp: string
  readonly messageTag: string
  readonly messageHandshakeExp: string
  readonly messageNotificationTag: string
  readonly remoteAckExp: string
  readonly remoteAckHandshakeTag: string
  readonly label: string
  readonly handshakeTag: string
}

/** One alarm message row. */
export interface AlarmMessage {
  /** Message name as the XML writes it: `M1`, `M2`, ... */
  readonly id: string
  /** 1-based position in the message table. */
  readonly ordinal: number
  readonly triggerValue: string
  readonly identifier: number
  /** 1-based trigger number, or `0` when the message names no trigger. */
  readonly trigger: number
  readonly backcolor: string
  readonly forecolor: string
  readonly audio: boolean
  readonly display: boolean
  readonly print: boolean
  readonly messageToTag: boolean
  readonly text: string
}

/** A decoded alarm database, in the wizard's field order. */
export interface AlarmDatabase {
  readonly application: string
  /** `Alarms` stream format version; only 16 is decoded. */
  readonly version: number
  readonly historySize: number
  readonly capacityHighWarning: number
  readonly capacityHighHighWarning: number
  readonly displayName: string
  readonly holdTime: number
  readonly maxUpdateRate: string
  readonly embeddedServerUpdateRate: string
  readonly silenceTag: string
  readonly remoteSilenceExp: string
  readonly remoteAckAllExp: string
  readonly statusResetTag: string
  readonly remoteStatusResetExp: string
  readonly closeDisplayTag: string
  readonly remoteCloseDisplayExp: string
  readonly triggers: readonly AlarmTrigger[]
  readonly messages: readonly AlarmMessage[]
}

/** Where one application keeps its alarm database. */
export interface AlarmDatabaseFiles {
  readonly application: string
  /** Application folder the database was found in. */
  readonly folder: string
  /** `M_Alarms\MachineAlarms.mal` */
  readonly mal: string
  /** Size of the `.mal`, in bytes. */
  readonly bytes: number
}

/** A completed alarm export. */
export interface AlarmSnapshot {
  readonly application: string
  /** Alarm database read. */
  readonly mal: string
  /** XML written. */
  readonly path: string
  readonly triggers: number
  readonly messages: number
  /** Size of the written file, in bytes. */
  readonly bytes: number
}

/** One trigger record, exactly as the `Alarms` stream stores it. */
interface TriggerRecord {
  readonly slot: string | null
  readonly exp: string | null
  readonly ints: readonly [number, number, number, number]
  readonly pairs: readonly (readonly [string | null, string | null])[]
  readonly labelId: number
}

/** One message record, exactly as the `Alarms` stream stores it. */
interface MessageRecord {
  readonly slot: string | null
  readonly value: string | null
  readonly ints: readonly [number, number, number, number, number, number]
}

/** Everything the `Alarms` stream holds. */
interface AlarmsStream {
  readonly version: number
  readonly triggerCount: number
  readonly triggers: readonly TriggerRecord[]
  readonly messageCount: number
  readonly pad: number
  readonly messages: readonly MessageRecord[]
  readonly trailer: {
    readonly ints: readonly number[]
    readonly pairs: readonly (readonly [string | null, string | null])[]
    readonly tail: readonly number[]
    readonly tailPairs: readonly (readonly [string | null, string | null])[]
  }
}

/** The localised string table. */
interface LsStream {
  readonly version: number
  readonly count: number
  readonly unknown: number
  /** Resolve one string id, or `undefined` when the table has none. */
  readonly text: (id: number) => string | undefined
}

/** The marker the message table uses for "this message names no trigger". */
const NO_TRIGGER = 0xfffffffe

/** Bytes the compound-file reader treats as end-of-chain markers. */
const CFB_END = 0xfffffffa

/** The wizard's XML declaration and document element, reproduced verbatim. */
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
  '<alarms version="1.0" product="{E44CB020-C21D-11D3-8A3F-0010A4EF3494}" id="Alarms">\r\n'

/* ------------------------------------------------------------------ CFB ---- */

/**
 * Read every named stream of an OLE2 compound file.
 *
 * Only what a `.mal` needs: header, FAT, mini FAT, directory and stream
 * chains. Small streams live in the mini stream, which is why the root entry is
 * read first.
 *
 * @param path - Compound file to read.
 * @returns Stream name to its bytes.
 */
export function readCompoundFile(path: string): ReadonlyMap<string, Buffer> {
  const buf = readFileSync(path)
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xe011cfd0 || buf.readUInt32LE(4) !== 0xe11ab1a1) {
    throw new EngineeringError(
      'ALARM_DATABASE_UNREADABLE',
      `${path} is not an OLE2 compound file, so it is not a FactoryTalk View alarm database.`,
      'Point the snapshot at the application folder that carries M_Alarms\\MachineAlarms.mal.',
    )
  }
  const sectorSize = 1 << buf.readUInt16LE(30)
  const sector = (index: number): Buffer => buf.subarray((index + 1) * sectorSize, (index + 1) * sectorSize + sectorSize)
  const difat: number[] = []
  for (let index = 0; index < 109; index++) difat.push(buf.readUInt32LE(76 + index * 4))
  const fatCount = buf.readUInt32LE(44)
  const fat: number[] = []
  for (const index of difat.filter(value => value < CFB_END).slice(0, fatCount)) {
    const sec = sector(index)
    for (let slot = 0; slot < sectorSize / 4; slot++) fat.push(sec.readUInt32LE(slot * 4))
  }
  const chain = (start: number): readonly number[] => {
    const out: number[] = []
    let index: number | undefined = start
    while (index !== undefined && index < CFB_END) {
      out.push(index)
      index = fat[index]
      if (index === undefined) throw new EngineeringError('ALARM_DATABASE_UNREADABLE', 'The compound file has a broken sector chain.', 'Copy the .mal again and retry.')
    }
    return out
  }
  const readChain = (start: number): Buffer => Buffer.concat(chain(start).map(sector))
  const directory = readChain(buf.readUInt32LE(48))
  const entries: { name: string; type: number; start: number; size: number }[] = []
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory.readUInt16LE(offset + 64)
    if (nameLength < 2 || nameLength > 64) continue
    entries.push({
      name: directory.subarray(offset, offset + nameLength - 2).toString('utf16le'),
      type: directory[offset + 66] ?? 0,
      start: directory.readUInt32LE(offset + 116),
      size: Number(directory.readBigUInt64LE(offset + 120)),
    })
  }
  const root = entries.find(entry => entry.type === 5)
  if (root === undefined) {
    throw new EngineeringError('ALARM_DATABASE_UNREADABLE', 'The compound file has no root entry.', 'Copy the .mal again and retry.')
  }
  const miniSectors = readChain(root.start).subarray(0, root.size)
  const miniFatStart = buf.readUInt32LE(60)
  const miniFat = chain(miniFatStart).length === 0 ? Buffer.alloc(0) : readChain(miniFatStart)
  const miniChain = (start: number): readonly number[] => {
    const out: number[] = []
    let index: number | undefined = start
    while (index !== undefined && index < CFB_END) {
      out.push(index)
      index = miniFat.readUInt32LE(index * 4)
    }
    return out
  }
  const readMini = (start: number, size: number): Buffer =>
    Buffer.concat(miniChain(start).map(index => miniSectors.subarray(index * 64, index * 64 + 64))).subarray(0, size)
  const streams = new Map<string, Buffer>()
  for (const entry of entries) {
    if (entry.type !== 2) continue
    streams.set(entry.name, entry.size < 4096 ? readMini(entry.start, entry.size) : readChain(entry.start).subarray(0, entry.size))
  }
  return streams
}

/* --------------------------------------------------------------- cursor ---- */

/** A bounds-checked reader over one stream. */
interface Cursor {
  readonly offset: number
  remaining(): number
  u16(): number
  u32(): number
  str(): string | null
}

/**
 * Wrap one stream in the reader the `Alarms` format uses.
 *
 * A string is `FF FE` for null, otherwise `FF <charCount>` followed by UTF-16LE.
 *
 * @param buf - Stream bytes.
 * @returns A cursor over them.
 */
function cursor(buf: Buffer): Cursor {
  let index = 0
  const need = (bytes: number): void => {
    if (index + bytes > buf.length) {
      throw new EngineeringError(
        'ALARM_DATABASE_UNREADABLE',
        `The alarm stream ends at byte ${buf.length} in the middle of a record (needed ${bytes} bytes at ${index}).`,
        'Confirm the .mal belongs to a FactoryTalk View ME version this decoder knows, or export the alarms with the wizard.',
      )
    }
  }
  return {
    get offset() { return index },
    remaining: () => buf.length - index,
    u16() {
      need(2)
      const value = buf.readUInt16LE(index)
      index += 2
      return value
    },
    u32() {
      need(4)
      const value = buf.readUInt32LE(index)
      index += 4
      return value
    },
    str() {
      need(2)
      if (buf[index] !== 0xff) {
        throw new EngineeringError(
          'ALARM_DATABASE_UNREADABLE',
          `Expected a string tag at byte ${index} of the alarm stream, found 0x${(buf[index] ?? 0).toString(16)}.`,
          'The .mal uses an alarm stream layout this decoder does not know (only version 16 is supported).',
        )
      }
      const length = buf[index + 1] ?? 0
      if (length === 0xfe) {
        index += 2
        return null
      }
      need(2 + length * 2)
      const text = buf.subarray(index + 2, index + 2 + length * 2).toString('utf16le')
      index += 2 + length * 2
      return text
    },
  }
}

/* -------------------------------------------------------------- streams ---- */

/**
 * Parse the `Alarms` stream.
 *
 * Layout: `u32 version`, `u16 triggerCount`, the trigger records, `u32
 * messageCount`, `u16` pad, the message records, then the trailer that carries
 * the `<alarm>` header values.
 *
 * @param buf - `Alarms` stream bytes.
 * @returns Records in file order.
 */
export function parseAlarmsStream(buf: Buffer): AlarmsStream {
  const read = cursor(buf)
  const version = read.u32()
  const triggerCount = read.u16()
  const triggers: TriggerRecord[] = []
  for (let index = 0; index < triggerCount; index++) {
    const slot = read.str()
    const exp = read.str()
    const ints = [read.u32(), read.u32(), read.u32(), read.u32()] as const
    const pairs: (readonly [string | null, string | null])[] = []
    for (let pair = 0; pair < 7; pair++) pairs.push([read.str(), read.str()] as const)
    triggers.push({ slot, exp, ints, pairs, labelId: read.u32() })
  }
  const messageCount = read.u32()
  const pad = read.u16()
  const messages: MessageRecord[] = []
  for (let index = 0; index < messageCount; index++) {
    const slot = read.str()
    const value = read.str()
    messages.push({ slot, value, ints: [read.u32(), read.u32(), read.u32(), read.u32(), read.u32(), read.u32()] as const })
  }
  const ints: number[] = []
  for (let index = 0; index < 5; index++) ints.push(read.u32())
  const pairs: (readonly [string | null, string | null])[] = []
  for (let index = 0; index < 8; index++) pairs.push([read.str(), read.str()] as const)
  const tail: number[] = []
  for (let index = 0; index < 4; index++) tail.push(read.u32())
  const tailPairs: (readonly [string | null, string | null])[] = []
  for (let index = 0; index < 4; index++) tailPairs.push([read.str(), read.str()] as const)
  if (read.remaining() !== 0) {
    throw new EngineeringError(
      'ALARM_DATABASE_UNREADABLE',
      `The alarm stream trailer left ${read.remaining()} bytes unread.`,
      'The .mal uses an alarm stream layout this decoder does not know (only version 16 is supported).',
    )
  }
  return { version, triggerCount, triggers, messageCount, pad, messages, trailer: { ints, pairs, tail, tailPairs } }
}

/**
 * Parse the `ls00000409` localised string table.
 *
 * Layout: `u16 version`, `u32 count`, `u32` unknown, then `count` 12-byte
 * entries (`u32 id`, `u32 charOffset`, `u32 0`), then the strings packed as
 * UTF-16LE with no separators. An entry ends where the next entry starts, and
 * the offset counts UTF-16 code units, not bytes.
 *
 * @param buf - `ls00000409` stream bytes.
 * @returns The table and a resolver by id.
 */
export function parseLsStream(buf: Buffer): LsStream {
  const version = buf.readUInt16LE(0)
  const count = buf.readUInt32LE(2)
  const unknown = buf.readUInt32LE(6)
  const entries: { id: number; charOffset: number }[] = []
  for (let index = 0; index < count; index++) {
    const offset = 10 + index * 12
    entries.push({ id: buf.readUInt32LE(offset), charOffset: buf.readUInt32LE(offset + 4) })
  }
  const poolStart = 10 + count * 12
  const byId = new Map<number, string>()
  entries.forEach((entry, index) => {
    const next = entries[index + 1]
    const end = next === undefined ? (buf.length - poolStart) / 2 : next.charOffset
    byId.set(entry.id, buf.subarray(poolStart + entry.charOffset * 2, poolStart + end * 2).toString('utf16le'))
  })
  return { version, count, unknown, text: (id: number) => byId.get(id) }
}

/* ------------------------------------------------------------- rendering --- */

/** Escape one XML attribute value the way the wizard does. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Render one colour the way the wizard does.
 *
 * @param value - `0x00BBGGRR`, as the stream stores it.
 * @returns `#RRGGBB`, upper case.
 */
function colour(value: number): string {
  const hex = (byte: number): string => byte.toString(16).toUpperCase().padStart(2, '0')
  return `#${hex(value & 0xff)}${hex((value >>> 8) & 0xff)}${hex((value >>> 16) & 0xff)}`
}

/** Render one update rate: per-mille in the stream, two decimals in the XML. */
function rate(perMille: number): string {
  return (perMille / 1000).toFixed(2)
}

/**
 * Decode the two streams into the wizard's field values.
 *
 * Field mapping, proven against wizard exports from three applications:
 *
 * - Trigger record: `slot` (unused), expression, four u32 `[type][?][use-ack-all]
 *   [ack-all-value]`, seven `(null, text)` pairs, then the label's string id.
 *   Pair 0 is `ack-tag`, 1 `message-tag`, 2 `remote-ack-exp` (proven on
 *   CC019_Main, whose pair 2 is `{[PLC]CMD_RESET}` and whose XML carries it as
 *   `remote-ack-exp`), 3 `message-handshake-exp`, 4 `message-notification-tag`,
 *   5 `remote-ack-handshake-tag`, 6 `handshake-tag`.
 * - Message record: `slot`, trigger-value, six u32 `[textId][flags][back][fore]
 *   [identifier][trigger]`. `flags` bit 0 is `display`, bit 8 is `audio`;
 *   colours are `0x00BBGGRR`. `trigger` is the *next* message's trigger minus
 *   one, so a message's trigger is the previous record's value plus one, and
 *   `0xFFFFFFFE` means "no trigger".
 * - The last message record is a settings record when its trigger-value string
 *   is empty; it is not a message, and its `[trigger]` field holds
 *   `history-size`.
 *
 * @param application - Application name, for the returned database.
 * @param streams - Stream name to bytes.
 * @returns The decoded database.
 */
export function decodeAlarmStreams(application: string, streams: ReadonlyMap<string, Buffer>): AlarmDatabase {
  const alarms = streams.get('Alarms')
  // The localised table is named for its locale: `ls00000409` (en-US) on most
  // applications, but `ls00004009` and others appear on older or non-US ones.
  // Any of them carries the same table, so take the exact US stream when it is
  // there and otherwise the first localised stream the file holds.
  const lsName = streams.has('ls00000409')
    ? 'ls00000409'
    : [...streams.keys()].find(name => /^ls[0-9a-f]{8}$/iu.test(name))
  const lsBytes = lsName === undefined ? undefined : streams.get(lsName)
  if (alarms === undefined || lsBytes === undefined) {
    throw new EngineeringError(
      'ALARM_DATABASE_UNREADABLE',
      `The alarm database of ${application} lacks the ${alarms === undefined ? 'Alarms' : 'ls<locale>'} stream.`,
      'Start FactoryTalk View Studio once with this application so it rewrites MachineAlarms.mal, or confirm the application name.',
    )
  }
  // The version comes first in the stream, and an older version lays its records
  // out differently, so refuse it before walking anything.
  const version = alarms.length >= 4 ? alarms.readUInt32LE(0) : 0
  if (version !== 16) {
    throw new EngineeringError(
      'ALARM_VERSION_UNSUPPORTED',
      `${application} stores its alarms in stream version ${version}; this decoder reads version 16.`,
      'Export the alarms with the Alarm Import/Export wizard in FactoryTalk View Studio instead.',
    )
  }
  const parsed = parseAlarmsStream(alarms)
  const ls = parseLsStream(lsBytes)
  const trailer = parsed.trailer
  const last = parsed.messages[parsed.messages.length - 1]
  const historySize = last === undefined ? 128 : last.ints[5]
  const settingsRecord = last !== undefined && (last.value === '' || last.value === null)
  const records = settingsRecord ? parsed.messages.slice(0, -1) : parsed.messages

  const text = (id: number): string => ls.text(id) ?? ''
  const triggers: AlarmTrigger[] = parsed.triggers.map((trigger, index) => ({
    id: index + 1,
    type: trigger.ints[0] !== 0 ? 'bit' : 'value',
    ackAllValue: trigger.ints[3],
    useAckAll: trigger.ints[2] !== 0,
    ackTag: trigger.pairs[0]?.[1] ?? '',
    exp: trigger.exp ?? '',
    messageTag: trigger.pairs[1]?.[1] ?? '',
    remoteAckExp: trigger.pairs[2]?.[1] ?? '',
    messageHandshakeExp: trigger.pairs[3]?.[1] ?? '',
    messageNotificationTag: trigger.pairs[4]?.[1] ?? '',
    remoteAckHandshakeTag: trigger.pairs[5]?.[1] ?? '',
    label: text(trigger.labelId),
    handshakeTag: trigger.pairs[6]?.[1] ?? '',
  }))

  const messages: AlarmMessage[] = records.map((message, index) => {
    const previous = index === 0 ? undefined : records[index - 1]
    let trigger = 1
    if (previous !== undefined) trigger = previous.ints[5] === NO_TRIGGER ? 0 : previous.ints[5] + 1
    if (trigger > parsed.triggerCount) trigger = 0
    return {
      id: `M${index + 1}`,
      ordinal: index + 1,
      triggerValue: message.value ?? '',
      identifier: message.ints[4],
      trigger,
      backcolor: colour(message.ints[2]),
      forecolor: colour(message.ints[3]),
      audio: (message.ints[1] & 0x100) !== 0,
      display: (message.ints[1] & 0x1) !== 0,
      print: (message.ints[1] & 0x2) !== 0,
      messageToTag: (message.ints[1] & 0x4) !== 0,
      text: text(message.ints[0]),
    }
  })

  return {
    application,
    version: parsed.version,
    historySize,
    capacityHighWarning: trailer.tail[2] ?? 90,
    capacityHighHighWarning: trailer.tail[3] ?? 99,
    displayName: trailer.pairs[7]?.[1] ?? '',
    holdTime: trailer.ints[1] ?? 250,
    maxUpdateRate: rate(trailer.ints[3] ?? 1000),
    embeddedServerUpdateRate: rate(trailer.ints[4] ?? 1000),
    silenceTag: trailer.pairs[0]?.[1] ?? '',
    remoteSilenceExp: trailer.pairs[1]?.[1] ?? '',
    remoteAckAllExp: trailer.pairs[6]?.[1] ?? '',
    statusResetTag: trailer.pairs[2]?.[1] ?? '',
    remoteStatusResetExp: trailer.pairs[3]?.[1] ?? '',
    closeDisplayTag: trailer.pairs[4]?.[1] ?? '',
    remoteCloseDisplayExp: trailer.pairs[5]?.[1] ?? '',
    triggers,
    messages,
  }
}

/**
 * Render the alarm XML exactly as the wizard writes it: UTF-8, no BOM, CRLF
 * line ends, four-space indent, and the wizard's attribute order.
 *
 * @param db - Decoded database.
 * @returns XML text, CRLF terminated.
 */
export function renderAlarmXml(db: AlarmDatabase): string {
  const bool = (value: boolean): string => (value ? 'true' : 'false')
  const lines: string[] = []
  lines.push(`    <alarm history-size="${db.historySize}" capacity-high-warning="${db.capacityHighWarning}"` +
    ` capacity-high-high-warning="${db.capacityHighHighWarning}" display-name="${escapeXml(db.displayName)}"` +
    ` hold-time="${db.holdTime}" max-update-rate="${db.maxUpdateRate}"` +
    ` embedded-server-update-rate="${db.embeddedServerUpdateRate}" silence-tag="${escapeXml(db.silenceTag)}"` +
    ` remote-silence-exp="${escapeXml(db.remoteSilenceExp)}" remote-ack-all-exp="${escapeXml(db.remoteAckAllExp)}"` +
    ` status-reset-tag="${escapeXml(db.statusResetTag)}" remote-status-reset-exp="${escapeXml(db.remoteStatusResetExp)}"` +
    ` close-display-tag="${escapeXml(db.closeDisplayTag)}" remote-close-display-exp="${escapeXml(db.remoteCloseDisplayExp)}"` +
    ' use-alarm-identifier="false" capacity-high-warning-tag="" capacity-high-high-warning-tag=""' +
    ' capacity-overrun-tag="" remote-clear-history-exp="">')
  lines.push('        <triggers>')
  for (const trigger of db.triggers) {
    lines.push(`            <trigger id="T${trigger.id}" type="${trigger.type}" ack-all-value="${trigger.ackAllValue}"` +
      ` use-ack-all="${bool(trigger.useAckAll)}" ack-tag="${escapeXml(trigger.ackTag)}" exp="${escapeXml(trigger.exp)}"` +
      ` message-tag="${escapeXml(trigger.messageTag)}" message-handshake-exp="${escapeXml(trigger.messageHandshakeExp)}"` +
      ` message-notification-tag="${escapeXml(trigger.messageNotificationTag)}" remote-ack-exp="${escapeXml(trigger.remoteAckExp)}"` +
      ` remote-ack-handshake-tag="${escapeXml(trigger.remoteAckHandshakeTag)}" label="${escapeXml(trigger.label)}"` +
      ` handshake-tag="${escapeXml(trigger.handshakeTag)}"/>`)
  }
  lines.push('        </triggers>')
  lines.push('        <messages>')
  for (const message of db.messages) {
    const trigger = message.trigger > 0 ? `#T${message.trigger}` : ''
    lines.push(`            <message id="${message.id}" trigger-value="${escapeXml(message.triggerValue)}"` +
      ` identifier="${message.identifier}" trigger="${trigger}" backcolor="${message.backcolor}"` +
      ` forecolor="${message.forecolor}" audio="${bool(message.audio)}" display="${bool(message.display)}"` +
      ` print="${bool(message.print)}" message-to-tag="${bool(message.messageToTag)}" text="${escapeXml(message.text)}"/>`)
  }
  lines.push('        </messages>')
  lines.push('    </alarm>')
  lines.push('</alarms>')
  return `${XML_HEAD}${lines.join('\r\n')}\r\n`
}

/**
 * Encode rendered XML the way the wizard writes it: UTF-8 with no byte-order mark.
 *
 * @param xml - Rendered document.
 * @returns File bytes.
 */
export function alarmXmlBytes(xml: string): Buffer {
  return Buffer.from(xml, 'utf8')
}

/* ------------------------------------------------------------------ API ---- */

/**
 * The project store holding the applications.
 *
 * @returns Absolute path, from `%PUBLIC%`.
 */
export function storeRoot(): string {
  return join(process.env['PUBLIC'] ?? 'C:/Users/Public', 'Documents', 'RSView Enterprise/ME/HMI projects')
}

/** The application folder, falling back to the store when it is not installed. */
function applicationFolder(application: string, folder?: string): string {
  return folder ?? projectFolder(application) ?? join(storeRoot(), application)
}

/**
 * The default XML path for one application.
 *
 * The alarm wizard exports to `Alarms.xml`, which is the file a decoder is
 * usually compared against, so the default output is named after the
 * application instead (`<app>-Alarms.xml`, as the tag snapshot is
 * `<app>-Tags.CSV`). Pass the wizard's own path explicitly when it is wanted.
 *
 * @param application - Application name as the project store lists it.
 * @param folder - Application folder, when not the default store.
 * @returns Path for the decoded XML.
 */
export function defaultAlarmXml(application: string, folder?: string): string {
  return join(applicationFolder(application, folder), `${application}-Alarms.xml`)
}

/**
 * Locate the alarm database of one application.
 *
 * @param application - Application name as the project store lists it.
 * @param folder - Application folder, when not the default store.
 * @returns The `.mal` and its size.
 */
export function findAlarmDatabase(application: string, folder?: string): AlarmDatabaseFiles {
  const root = applicationFolder(application, folder)
  const mal = join(root, 'M_Alarms', 'MachineAlarms.mal')
  if (!existsSync(mal)) {
    throw new EngineeringError(
      'ALARM_DATABASE_MISSING',
      `${application} has no M_Alarms\\MachineAlarms.mal, so it carries no alarm database.`,
      'Start FactoryTalk View Studio once with this application, or confirm the application name.',
    )
  }
  return { application, folder: root, mal, bytes: statSync(mal).size }
}

/**
 * Read and decode the alarm database of one application.
 *
 * @param application - Application name as the project store lists it.
 * @param folder - Application folder, when not the default store.
 * @returns The decoded database.
 */
export function readAlarmDatabase(application: string, folder?: string): AlarmDatabase {
  const files = findAlarmDatabase(application, folder)
  return decodeAlarmStreams(application, readCompoundFile(files.mal))
}

/**
 * Write the wizard-equivalent alarm XML for one application.
 *
 * @param application - Application name as the project store lists it.
 * @param output - XML file to write; defaults to the application's `Alarms.xml`.
 * @param folder - Application folder, when not the default store.
 * @returns What was written.
 */
export function exportAlarmSnapshot(application: string, output?: string, folder?: string): AlarmSnapshot {
  const files = findAlarmDatabase(application, folder)
  const db = decodeAlarmStreams(application, readCompoundFile(files.mal))
  const path = output ?? defaultAlarmXml(application, folder)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, alarmXmlBytes(renderAlarmXml(db)))
  return {
    application,
    mal: files.mal,
    path,
    triggers: db.triggers.length,
    messages: db.messages.length,
    bytes: statSync(path).size,
  }
}
