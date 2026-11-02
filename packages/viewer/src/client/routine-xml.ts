/**
 * One routine's XML, so a diagram can leave the pane in the form it was composed in.
 *
 * A function block diagram and a chart have no NeutralText: Studio pastes ladder and Structured Text as
 * text, and the furniture of an FBD sheet or a chart is XML. Copying the routine element is therefore
 * the honest equivalent for those two languages — it is what the composer wrote, and it can be pasted
 * into an export or compared against one.
 *
 * @module dsh-engineering-l5x-viewer/routine-xml
 */

/** Escape a routine name for use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * The `<Routine>` element of one named routine.
 *
 * @param xml - The whole export text.
 * @param name - Routine name as the organizer prints it.
 * @returns The routine element as written, or undefined when the export does not carry it.
 */
export function extractRoutineXml(xml: string, name: string): string | undefined {
  if (name === '') return undefined
  // The name attribute is not always the first attribute, so match it anywhere in the open tag.
  const open = new RegExp(`<Routine\\b[^>]*\\bName="${escapeRegExp(name)}"`, 'u')
  const start = xml.search(open)
  if (start < 0) return undefined
  const close = xml.indexOf('</Routine>', start)
  if (close < 0) return undefined
  return xml.slice(start, close + '</Routine>'.length)
}
