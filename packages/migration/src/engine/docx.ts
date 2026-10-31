/**
 * Render a migration report as a Word document.
 *
 * Word files are a zip of XML parts. This module writes the package itself —
 * no dependency, no vendor library — with a stylesheet that gives the report a
 * title page header, coloured section headings, banded tables and a footer with
 * page numbers, so the document a customer receives looks like a document.
 *
 * The document is composed from the same {@link ReportModel} the markdown
 * renderer uses, so the two never disagree.
 *
 * @module dsh-engineering-migration/docx
 */

import type { ReportBlock, ReportModel } from './report.ts'

/** A4 width in twentieths of a point (twips). */
const PAGE_WIDTH = 11906

/** A4 height in twips. */
const PAGE_HEIGHT = 16838

/** One-inch margins. */
const MARGIN = 1134

/** Navy used for the title and section headings. */
const NAVY = '1F3864'

/** Muted grey for supporting text. */
const MUTED = '595959'

/** Table rule colour. */
const RULE = 'BFC9D9'

/** Table header fill. */
const HEADER_FILL = '1F3864'

/** Alternate row fill. */
const BAND = 'EEF3F9'

/** Escape text for XML content or an attribute value. */
function xml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** One run of text with the emphasis a Markdown-lite string carries. */
interface Run {
  readonly text: string
  readonly bold: boolean
  readonly code: boolean
}

/** Split `**bold**` and `` `code` `` out of a line, keeping the plain text. */
export function inlineRuns(text: string): readonly Run[] {
  const runs: Run[] = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/gu
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > cursor) runs.push({ text: text.slice(cursor, start), bold: false, code: false })
    if (match[1] !== undefined) runs.push({ text: match[1], bold: true, code: false })
    else runs.push({ text: match[2] ?? '', bold: false, code: true })
    cursor = start + match[0].length
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), bold: false, code: false })
  return runs.length === 0 ? [{ text, bold: false, code: false }] : runs
}

/** Render runs as Word runs. */
function runsXml(text: string, size?: number): string {
  return inlineRuns(text).map(run => {
    const properties: string[] = []
    if (run.bold) properties.push('<w:b/>')
    if (run.code) {
      properties.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>')
      properties.push('<w:color w:val="1F3864"/>')
    }
    if (size !== undefined) properties.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`)
    const rPr = properties.length === 0 ? '' : `<w:rPr>${properties.join('')}</w:rPr>`
    return `<w:r>${rPr}<w:t xml:space="preserve">${xml(run.text)}</w:t></w:r>`
  }).join('')
}

/** A paragraph of body text. */
function paraXml(text: string, style = 'BodyText'): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runsXml(text)}</w:p>`
}

/** A bullet paragraph, drawn with a hanging indent so no numbering part is needed. */
function bulletXml(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ReportBullet"/></w:pPr><w:r><w:t xml:space="preserve">•  </w:t></w:r>${runsXml(text)}</w:p>`
}

/** A section heading. */
function headingXml(text: string, level: 1 | 2): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level === 1 ? 1 : 2}"/></w:pPr>${runsXml(text)}</w:p>`
}

/** One table cell. */
function cellXml(text: string, width: number, header: boolean, banded: boolean): string {
  const shading = header ? HEADER_FILL : banded ? BAND : undefined
  const fill = shading === undefined ? '' : `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>`
  const size = header ? 17 : 17
  const run = header
    ? `<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`
    : runsXml(text, size)
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill}<w:vAlign w:val="top"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr>${run}</w:p></w:tc>`
}

/** A table, with a repeated header row and banded body. */
function tableXml(block: Extract<ReportBlock, { kind: 'table' }>): string {
  const columns = block.headers.length
  // The first column labels the row, so it needs less room than the evidence
  // columns; with four columns the two evidence pairs split the rest.
  const weights = block.headers.map((_, index) => (index === 0 ? 22 : Math.round(78 / Math.max(1, columns - 1))))
  const available = PAGE_WIDTH - MARGIN * 2
  const widths = weights.map(weight => Math.round((available * weight) / 100))
  const border = `<w:top w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`
  const header = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${block.headers.map((text, index) => cellXml(text, widths[index] ?? 0, true, false)).join('')}</w:tr>`
  const body = block.rows.map((row, rowIndex) => {
    const cells = block.headers.map((_, index) => cellXml(row[index] ?? '', widths[index] ?? 0, false, rowIndex % 2 === 1))
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`
  }).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="${available}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:top w:w="71" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="71" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${header}${body}</w:tbl><w:p><w:pPr><w:pStyle w:val="TableGap"/></w:pPr></w:p>`
}

/** The document body for one model. */
function bodyXml(model: ReportModel): string {
  const parts: string[] = []
  parts.push(`<w:p><w:pPr><w:pStyle w:val="ReportTitle"/></w:pPr>${runsXml(model.title)}</w:p>`)
  parts.push(`<w:p><w:pPr><w:pStyle w:val="ReportSubtitle"/></w:pPr>${runsXml(model.subtitle)}</w:p>`)
  parts.push(paraXml(model.intro, 'ReportIntro'))
  for (const [index, section] of model.sections.entries()) {
    parts.push(headingXml(index === 0 ? section.title : `${index}. ${section.title}`, 1))
    for (const block of section.blocks) {
      if (block.kind === 'para') parts.push(paraXml(block.text))
      else if (block.kind === 'bullets') parts.push(...block.items.map(item => bulletXml(item)))
      else {
        parts.push(tableXml(block))
        if (block.note !== undefined) parts.push(paraXml(block.note, 'ReportNote'))
      }
    }
  }
  return parts.join('')
}

/** The package parts, before zipping. */
function partsXml(model: ReportModel): { name: string; data: string }[] {
  const footer = `<w:ftr><w:p><w:pPr><w:pStyle w:val="ReportFooter"/></w:pPr><w:r><w:t xml:space="preserve">${xml(model.title)}  ·  page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`
  return [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>',
    },
    { name: 'word/footer1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${footer.replace(/^<w:ftr>|<\/w:ftr>$/gu, '')}</w:ftr>` },
    {
      name: 'word/document.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<w:body>${bodyXml(model)}`
        + '<w:sectPr>'
        + '<w:footerReference w:type="default" r:id="rId1"/>'
        + `<w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/>`
        + `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="567" w:footer="567" w:gutter="0"/>`
        + '</w:sectPr></w:body></w:document>',
    },
    { name: 'word/styles.xml', data: stylesXml() },
    {
      name: 'docProps/core.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
        + `<dc:title>${xml(model.title)}</dc:title><dc:description>${xml(model.subtitle)}</dc:description>`
        + '<cp:revision>1</cp:revision></cp:coreProperties>',
    },
    {
      name: 'docProps/app.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
        + '<Application>AryaCode dsh-engineering</Application></Properties>',
    },
  ]
}

/** The stylesheet. */
function stylesXml(): string {
  const body = (size: number, color: string, after: number): string => `<w:spacing w:after="${after}" w:line="264" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/></w:rPr>`
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr>' + body(20, '262626', 140) + '</w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ReportTitle"><w:name w:val="Report Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="60"/><w:rPr><w:b/><w:color w:val="' + NAVY + '"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ReportSubtitle"><w:name w:val="Report Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="2E74B5"/></w:pBdr><w:rPr><w:color w:val="' + MUTED + '"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ReportIntro"><w:name w:val="Report Intro"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/><w:rPr><w:color w:val="404040"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="BFC9D9"/></w:pBdr><w:outlineLvl w:val="0"/><w:rPr><w:b/><w:color w:val="' + NAVY + '"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ReportBullet"><w:name w:val="Report Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/><w:ind w:left="284" w:hanging="284"/><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="TableGap"><w:name w:val="Table Gap"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60" w:line="120" w:lineRule="auto"/><w:rPr><w:sz w:val="8"/><w:szCs w:val="8"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ReportNote"><w:name w:val="Report Note"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/><w:rPr><w:i/><w:color w:val="' + MUTED + '"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ReportFooter"><w:name w:val="Report Footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="right"/><w:rPr><w:color w:val="' + MUTED + '"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:pPr></w:style>'
    + '</w:styles>'
}

/** CRC-32 as the zip format defines it. */
function crc32(bytes: Uint8Array): number {
  let table = crcTables
  if (table === undefined) {
    table = new Uint32Array(256)
    for (let index = 0; index < 256; index += 1) {
      let value = index
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
      table[index] = value >>> 0
    }
    crcTables = table
  }
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xFF] ?? 0)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

let crcTables: Uint32Array | undefined

/** DOS time and date for one moment. */
function dosStamp(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1F)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

/**
 * Zip entries with the store method.
 *
 * A store entry needs no compressor, which keeps this module free of a
 * dependency and of any platform API; a report is a few hundred kilobytes, so
 * the size the method costs does not matter.
 */
export function zipStore(entries: readonly { name: string; bytes: Uint8Array }[], now = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  const stamp = dosStamp(now)
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const checksum = crc32(entry.bytes)
    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034B50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, stamp.time, true)
    localView.setUint16(12, stamp.date, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, entry.bytes.length, true)
    localView.setUint32(22, entry.bytes.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    locals.push(local, entry.bytes)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014B50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, stamp.time, true)
    centralView.setUint16(14, stamp.date, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, entry.bytes.length, true)
    centralView.setUint32(24, entry.bytes.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length + entry.bytes.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054B50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  endView.setUint16(20, 0, true)

  const total = offset + centralSize + end.length
  const output = new Uint8Array(total)
  let cursor = 0
  for (const part of [...locals, ...centrals, end]) {
    output.set(part, cursor)
    cursor += part.length
  }
  return output
}

/**
 * Render the report as a Word document.
 *
 * @param model - The report model.
 * @param now - Clock for the zip's timestamps.
 * @returns The bytes of a `.docx` file.
 */
export function renderDocx(model: ReportModel, now = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  return zipStore(partsXml(model).map(part => ({ name: part.name, bytes: encoder.encode(part.data) })), now)
}
