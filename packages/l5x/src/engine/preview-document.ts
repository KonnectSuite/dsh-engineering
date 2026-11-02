/**
 * The minimal L5X document the project viewer draws for composed logic.
 *
 * Three callers need the same document: `l5x_rung_preview`, when the caller asks to see rungs, and the
 * composer and draft tools, so that composing anything produces something the chat can draw without a
 * second call. It is scratch output - a controller, a program and one routine in the language that was
 * composed - and is never an importable project.
 *
 * @module dsh-engineering-l5x/engine/preview-document
 */

/** One rung the preview carries. */
export interface PreviewRung {
  /** Rung number the document declares. */
  readonly number: number
  /** NeutralText the rung shows. */
  readonly text: string
  /** Optional comment, shown above the rung. */
  readonly comment?: string
}

/** What one preview document carries, in the language that was composed. */
export type PreviewBody =
  | { readonly language: 'RLL'; readonly rungs: readonly PreviewRung[] }
  | { readonly language: 'ST'; readonly code: string }
  | { readonly language: 'FBD'; readonly content: string }
  | { readonly language: 'SFC'; readonly content: string }

/** Escape text for XML element content. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

/** Escape text for an XML attribute value. */
export function escapeAttribute(value: string): string {
  return escapeXml(value).replace(/"/gu, '&quot;')
}

/** The body element of one routine, in the shape Studio writes it. */
function contentOf(body: PreviewBody): string {
  if (body.language === 'RLL') {
    const rungs = body.rungs.map(rung => {
      const comment = rung.comment === undefined || rung.comment === ''
        ? ''
        : `\n          <Comment>${escapeXml(rung.comment)}</Comment>`
      return `        <Rung Number="${rung.number}" Type="N">${comment}\n          <Text>${escapeXml(rung.text)}</Text>\n        </Rung>`
    }).join('\n')
    return `<RLLContent>\n${rungs}\n            </RLLContent>`
  }
  if (body.language === 'ST') {
    // Studio refuses a <Line> that spans lines, so each source line is its own CDATA.
    const lines = body.code.split(/\r?\n/u).filter(line => line.trim() !== '')
      .map((line, index) => `<Line Number="${index}"><![CDATA[${line.replace(/\]\]>/gu, ']]]]><![CDATA[>')}]]></Line>`).join('')
    return `<STContent>${lines}</STContent>`
  }
  const sheet = ' SheetSize="Letter - 8.5 x 11 in" SheetOrientation="Landscape"'
  return body.language === 'FBD' ? `<FBDContent${sheet}>${body.content}</FBDContent>` : `<SFCContent${sheet}>${body.content}</SFCContent>`
}

/**
 * Build the minimal L5X document the viewer draws.
 *
 * @param title - Document and controller name.
 * @param body - The routine the document carries.
 * @returns L5X text.
 */
export function previewDocumentOf(title: string, body: PreviewBody): string {
  const name = escapeAttribute(title)
  const lane = ' Use="Target"'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetName="${name}" TargetType="Controller" ContainsContext="true" Owner="AryaCode" ExportDate="Preview">
  <Controller Use="Target" Name="${name}" ProcessorType="1756-L83E" MajorRev="37" MinorRev="11" TimeSlice="20" ProjectCreationDate="Preview">
    <Programs>
      <Program${lane} Name="Preview" MainRoutineName="MainRoutine" Description="Logic composed in chat">
        <Tags/>
        <Routines>
          <Routine${lane} Name="MainRoutine" Type="${body.language}" Description="Composed ${body.language}">
            ${contentOf(body)}
          </Routine>
        </Routines>
      </Program>
    </Programs>
    <Tasks/>
    <Modules/>
    <DataTypes/>
    <AddOnInstructionDefinitions/>
  </Controller>
</RSLogix5000Content>
`
}

/**
 * Build a preview document of ladder rungs.
 *
 * @param title - Document and controller name.
 * @param rungs - Validated rungs.
 * @returns L5X text.
 */
export function previewDocument(title: string, rungs: readonly PreviewRung[]): string {
  return previewDocumentOf(title, { language: 'RLL', rungs })
}

/** A file-name-safe slug for a preview document. */
export function previewSlug(title: string): string {
  return title.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'Preview'
}
