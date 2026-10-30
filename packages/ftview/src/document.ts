import type { Application, DisplayFile, DisplayObject } from './model.ts'

/**
 * Documentation bundle for one opened export: a readable overview plus three
 * spreadsheets (displays, HMI tags, bindings) that a panel builder or a
 * reviewer can hand to someone who has never opened Studio.
 *
 * Pure text generation: the tool decides where the files go, so this module
 * stays testable without a filesystem.
 */
export interface DocumentCounts {
  readonly displays: number
  readonly tags: number
  readonly bindings: number
  readonly missing: number
  readonly unverified: number
  readonly navigation: number
}

export interface DocumentBundle {
  readonly overview: string
  readonly displays: string
  readonly tags: string
  readonly bindings: string
  readonly counts: DocumentCounts
}

/** Child elements the parser reports as objects but which place nothing on screen. */
const STRUCTURAL = new Set([
  'connections',
  'connection',
  'caption',
  'states',
  'state',
  'animations',
  'imagesettings',
  'displaysettings',
  'parameterfile',
  'message',
  'scada',
])

/** Objects that actually draw or bind something. */
function drawnOf(display: DisplayFile): readonly DisplayObject[] {
  return display.objects.filter(object => !STRUCTURAL.has(object.type.toLowerCase()))
}

/** Types that carry a caption or a bound value worth counting separately. */
const BUTTON = /button$/iu
const NUMERIC = /^(numericDisplay|numericInputEnable|barGraph|trend)$/iu
const INDICATOR = /^(multistateIndicator|indicator|stateIndicator)$/iu
const TEXT = /^(text|caption|messageDisplay)$/iu

/** One cell, quoted only when it would otherwise break the row. */
function cell(value: string | number): string {
  const text = String(value)
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** A CSV document with a header row and CRLF-free newlines. */
function csv(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  return [header, ...rows].map(row => row.map(cell).join(',')).join('\n') + '\n'
}

/**
 * The tag an expression reads, without the program scope, member or bit:
 * `{[Cutter]Alarm_Word.0}` becomes `Alarm_Word`, `Motor_Run` stays as it is.
 * Returns undefined when the expression names nothing (a literal).
 */
export function expressionTag(expression: string): string | undefined {
  const braced = /\{([^}]+)\}/u.exec(expression)
  const text = (braced?.[1] ?? expression).trim()
  if (text === '' || /^[0-9.+-]+$/u.test(text)) return undefined
  const unscoped = text.includes(']') ? text.slice(text.indexOf(']') + 1) : text
  return unscoped.split(/[.:[]/u)[0]?.trim() || undefined
}

/** Count the objects of one display by the role they play on screen. */
function summaryOf(display: DisplayFile): {
  buttons: number
  numeric: number
  indicators: number
  text: number
  unparsed: boolean
} {
  let buttons = 0
  let numeric = 0
  let indicators = 0
  let text = 0
  for (const object of drawnOf(display)) {
    if (BUTTON.test(object.type)) buttons += 1
    else if (NUMERIC.test(object.type)) numeric += 1
    else if (INDICATOR.test(object.type)) indicators += 1
    else if (TEXT.test(object.type)) text += 1
  }
  return { buttons, numeric, indicators, text, unparsed: display.parseError !== undefined }
}

/** Every binding in the application, one row per connection. */
export function bindingsOf(application: Application): {
  rows: { display: string; object: string; connection: string; expression: string; tag: string; status: string }[]
} {
  const known = new Set(application.tags.map(tag => tag.name.toLowerCase()))
  const rows: {
    display: string
    object: string
    connection: string
    expression: string
    tag: string
    status: string
  }[] = []
  for (const display of application.displays) {
    for (const object of drawnOf(display)) {
      for (const [connection, expression] of Object.entries(object.connections ?? {})) {
        const tag = expressionTag(expression)
        const status = tag === undefined
          ? 'literal'
          : known.size === 0 ? 'unverified' : known.has(tag.toLowerCase()) ? 'hmi tag' : 'missing'
        rows.push({
          display: display.name,
          object: object.name ?? object.type,
          connection,
          expression,
          tag: tag ?? '',
          status,
        })
      }
    }
  }
  return { rows }
}

/** Every screen-to-screen jump this application declares. */
export function navigationOf(application: Application): {
  rows: { from: string; object: string; target: string }[]
} {
  const known = new Set(application.displays.map(display => display.name))
  const rows: { from: string; object: string; target: string }[] = []
  for (const display of application.displays) {
    for (const object of drawnOf(display)) {
      for (const [connection, expression] of Object.entries(object.connections ?? {})) {
        const direct = /^display$/iu.test(connection)
        const target = direct ? expression.trim() : ''
        if (target !== '' && known.has(target)) {
          rows.push({ from: display.name, object: object.name ?? object.type, target })
        }
      }
      const attribute = object.attributes.display
      if (typeof attribute === 'string' && known.has(attribute.trim()) && !rows.some(row => row.from === display.name && row.target === attribute.trim() && row.object === (object.name ?? object.type))) {
        rows.push({ from: display.name, object: object.name ?? object.type, target: attribute.trim() })
      }
    }
  }
  return { rows }
}

/** Build the four files of a documentation bundle. */
export function documentApplication(application: Application): DocumentBundle {
  const bindings = bindingsOf(application)
  const missing = bindings.rows.filter(row => row.status === 'missing')
  const unverified = bindings.rows.filter(row => row.status === 'unverified')
  const navigation = navigationOf(application)
  const summaries = application.displays.map(display => ({ display, ...summaryOf(display) }))

  const displayRows = summaries.map(({ display, buttons, numeric, indicators, text, unparsed }) => [
    display.name,
    display.file,
    drawnOf(display).length,
    buttons,
    numeric,
    indicators,
    text,
    unparsed ? 'yes' : 'no',
    missing.filter(row => row.display === display.name).length,
  ])

  const usedBy = new Map<string, Set<string>>()
  for (const row of bindings.rows) {
    if (row.tag === '') continue
    const set = usedBy.get(row.tag.toLowerCase()) ?? new Set<string>()
    set.add(row.display)
    usedBy.set(row.tag.toLowerCase(), set)
  }

  const tagRows = application.tags.map(tag => {
    const used = usedBy.get(tag.name.toLowerCase()) ?? new Set<string>()
    return [
      tag.name,
      tag.type,
      tag.description,
      tag.raw['Data Source'] ?? '',
      tag.raw['Native Type'] ?? '',
      used.size,
      [...used].sort().join(' '),
    ]
  })

  const bindingRows = bindings.rows
    .map(row => [row.display, row.object, row.connection, row.expression, row.tag, row.status])
    .sort((left, right) => `${left[0]}|${left[1]}`.localeCompare(`${right[0]}|${right[1]}`))

  const unparsed = summaries.filter(entry => entry.unparsed).map(entry => entry.display.name)
  const overview = [
    `# ${application.name} - display documentation`,
    '',
    `Export root: \`${application.root}\``,
    '',
    '## Contents',
    '',
    `- ${application.displays.length} display(s), ${unparsed.length === 0 ? 'all parsed' : `${unparsed.length} could not be parsed: ${unparsed.join(', ')}`}`,
    application.tagFiles.length === 0
      ? '- no tag table in this export: bindings below carry no tag and cannot be verified'
      : `- ${application.tags.length} HMI tag(s) from ${application.tagFiles.length} tag file(s)`,
    unverified.length > 0
      ? `- ${bindings.rows.length} binding(s), listed in bindings.csv without a tag`
      : `- ${bindings.rows.length} binding(s), ${missing.length} naming a tag this export does not declare`,
    '',
    '| Display | Objects | Buttons | Numeric | Indicators | Text | Unparsed | Missing bindings |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...displayRows.map(row => `| ${row[0]} | ${row[2]} | ${row[3]} | ${row[4]} | ${row[5]} | ${row[6]} | ${row[7]} | ${row[8]} |`),
    '',
    '## Files',
    '',
    '- `displays.csv` - one row per display with object counts.',
    '- `tags.csv` - one row per HMI tag with the displays that read it.',
    '- `bindings.csv` - one row per connection with the tag it resolves to; `status` is `hmi tag`,' +
      '`missing`, `unverified` (no tag table in this export) or `literal` (the expression is not a tag).',
    ...(navigation.rows.length === 0 ? [] : ['', '## Navigation', '', '| From | Object | To |', '| --- | --- | --- |', ...navigation.rows.map(row => `| ${row.from} | ${row.object} | ${row.target} |`)]),
    '',
    'Bindings marked `missing` do not prove a fault: the tag may live in a tag file that was not',
    'exported with this application, and Studio resolves some expressions the export cannot show.',
    '',
  ].join('\n')

  return {
    overview,
    displays: csv(
      ['display', 'file', 'objects', 'buttons', 'numeric', 'indicators', 'text', 'unparsed', 'missing_bindings'],
      displayRows,
    ),
    tags: csv(['name', 'type', 'description', 'data_source', 'native_type', 'used_by_count', 'used_by'], tagRows),
    bindings: csv(['display', 'object', 'connection', 'expression', 'tag', 'status'], bindingRows),
    counts: {
      displays: application.displays.length,
      tags: application.tags.length,
      bindings: bindings.rows.length,
      missing: missing.length,
      unverified: unverified.length,
      navigation: navigation.rows.length,
    },
  }
}
