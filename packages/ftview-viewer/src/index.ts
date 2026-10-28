/**
 * The FactoryTalk View ME display renderer in source.
 *
 * The original client face was a committed closure bundle with no source. This
 * package now owns the renderer: a pure XML reader and SVG renderer that the
 * browser face, the snapshot tests and the headless screenshot harness all use.
 *
 * @module dsh-engineering-ftview-viewer
 */

export { parseXml, child, children, attribute, numberAttribute } from './xml.ts'
export type { XmlNode } from './xml.ts'
export { renderDisplay, colourOf, responsiveSvg } from './render.ts'
export { evaluate, referencesOf } from './expression.ts'
export type { TagValues } from './expression.ts'
export type { RenderOptions } from './render.ts'

/** Host entry: this package is browser-only, so the server half has nothing to do. */
export function apply(): void {}
