/**
 * The minimal L5X document the project viewer draws for proposed rungs.
 *
 * Two tools need the same document: `l5x_rung_preview`, when the caller asks to see rungs, and the
 * composer, so that composing a rung produces something the chat can draw without a second call.
 * It is scratch output - a controller, a program and one ladder routine, with no tags - and is never
 * an importable project.
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

/**
 * Build the minimal L5X document the viewer draws.
 *
 * @param title - Document and controller name.
 * @param rungs - Validated rungs.
 * @returns L5X text.
 */
export function previewDocument(title: string, rungs: readonly PreviewRung[]): string {
  const name = escapeAttribute(title)
  const body = rungs.map(rung => {
    const comment = rung.comment === undefined || rung.comment === ''
      ? ''
      : `\n          <Comment>${escapeXml(rung.comment)}</Comment>`
    return `        <Rung Number="${rung.number}" Type="N">${comment}\n          <Text>${escapeXml(rung.text)}</Text>\n        </Rung>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetName="${name}" TargetType="Controller" ContainsContext="true" Owner="AryaCode" ExportDate="Preview">
  <Controller Use="Target" Name="${name}" ProcessorType="1756-L83E" MajorRev="37" MinorRev="11" TimeSlice="20" ProjectCreationDate="Preview">
    <Programs>
      <Program Use="Target" Name="Preview" MainRoutineName="MainRoutine" Description="Rungs proposed in chat">
        <Tags/>
        <Routines>
          <Routine Use="Target" Name="MainRoutine" Type="RLL" Description="Preview rungs">
            <RLLContent>
${body}
            </RLLContent>
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

/** A file-name-safe slug for a preview document. */
export function previewSlug(title: string): string {
  return title.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'Preview'
}
