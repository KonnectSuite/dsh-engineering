/**
 * Controller-level elements shared by the readers that scan the export.
 *
 * A reader asks for the controller element or for the program elements under
 * it; the two navigation steps live here so the readers do not each restate
 * where the export keeps programs and controller-scoped tags.
 */

import { firstChild, elementChildren, nodeText, presentAttribute, type XmlElement } from './xml.ts'
import { L5xParseError } from './errors.ts'

/** The root element's tag name in a Studio 5000 export. */
export const L5X_ROOT_TAG = 'RSLogix5000Content'

/**
 * The `<Controller>` element of a parsed export.
 *
 * @param root - The document element.
 * @returns The controller element.
 * @throws L5xParseError When the document has no controller.
 */
export function controllerElement(root: XmlElement): XmlElement {
  const controller = firstChild(root, 'Controller')
  if (controller === undefined) throw new L5xParseError('No <Controller> element found')
  return controller
}

/**
 * The `<Program>` elements the controller owns.
 *
 * @param controller - The controller element.
 * @returns Program elements, in written order.
 */
export function programElements(controller: XmlElement): readonly XmlElement[] {
  const programs = firstChild(controller, 'Programs')
  return programs === undefined ? [] : elementChildren(programs, 'Program')
}

/**
 * A tag element's description: the `Description` attribute if it is non-empty,
 * otherwise the `<Description>` child element's trimmed text.
 *
 * The attribute wins because the reference parser reads it first, and an empty
 * attribute is treated as absent so a simplified export that writes the child
 * form still yields its text.
 *
 * @param element - The element carrying the description.
 * @returns The description, or an empty string when there is none.
 */
export function descriptionOf(element: XmlElement): string {
  const declared = presentAttribute(element, 'Description')
  if (declared !== undefined) return declared
  const child = firstChild(element, 'Description')
  if (child === undefined) return ''
  return (nodeText(child) ?? '').trim()
}
