/**
 * A whole display from one description.
 *
 * Scaffolding fixed the chrome, but a screen still costs one call per object and
 * a review round per geometry mistake: the field session spent 43 `draft_object_*`
 * calls and 28 PowerShell patches on screens like these. This module expands a
 * short screen description - cards of label/value and label/lamp rows plus a
 * navigation row - into every object the display needs, using the scaffold's
 * slots so nothing is placed by guesswork.
 *
 * @module dsh-engineering-ftview/edit/screen
 */

import { scaffoldLayout, type ScaffoldObject, type ScaffoldTheme, type Slot } from './scaffold.ts'

/** One row inside a card: a value readout or a state lamp. */
export type ScreenRow =
  | { readonly kind: 'value'; readonly label: string; readonly tag: string }
  | { readonly kind: 'lamp'; readonly label: string; readonly tag: string }

/** One card: a titled box holding rows. */
export interface ScreenCard {
  readonly title: string
  readonly rows: readonly ScreenRow[]
}

/** One navigation button. */
export interface ScreenNav {
  readonly label: string
  readonly display: string
}

/** What a screen description must provide. */
export interface ScreenSpec {
  readonly width: number
  readonly height: number
  readonly title: string
  readonly subtitle?: string
  readonly footer?: string
  readonly cards?: readonly ScreenCard[]
  readonly nav?: readonly ScreenNav[]
  readonly theme?: Partial<ScaffoldTheme>
}

/** One object to stage, in z-order. */
export interface ScreenObject {
  readonly type: string
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly caption?: string
  readonly connections?: Readonly<Record<string, string>>
  readonly states?: readonly { readonly stateId: string; readonly backColor: string; readonly caption?: string }[]
}

/** A laid-out screen: every object, and the boxes the caller may still use. */
export interface ScreenLayout {
  readonly objects: readonly ScreenObject[]
  readonly slots: {
    readonly body: Slot
    readonly cards: readonly Slot[]
    readonly nav: Slot | undefined
    readonly navButtons: readonly Slot[]
  }
}

/** Gap between cards and around the navigation row. */
const GAP = 20

/** Inner padding of a card. */
const CARD_PAD = 14

/** Height of one row inside a card. */
const ROW = 36

/** Navigation row height. */
const NAV = 56

/** Most cards one screen may describe. */
export const MAX_CARDS = 4

/** Most navigation buttons one row may hold. */
export const MAX_NAV = 4

/** Convert a slot to the attribute map the export writes. */
function box(slot: Slot): Record<string, string> {
  return {
    left: String(Math.round(slot.left)),
    top: String(Math.round(slot.top)),
    width: String(Math.round(slot.width)),
    height: String(Math.round(slot.height)),
  }
}

/** Shared text chrome. */
function textChrome(color: string): Record<string, string> {
  return {
    visible: 'true',
    wallpaper: 'false',
    isReferenceObject: 'false',
    backStyle: 'transparent',
    foreColor: color,
    wordWrap: 'false',
    sizeToFit: 'false',
    alignment: 'middleLeft',
  }
}

/**
 * Lay out a whole screen.
 *
 * @param spec - The screen description.
 * @returns Every object in z-order plus the free boxes.
 * @throws Error when the description cannot fit the display.
 */
export function screenLayout(spec: ScreenSpec): ScreenLayout {
  const scaffold = scaffoldLayout({
    width: spec.width,
    height: spec.height,
    title: spec.title,
    ...(spec.subtitle === undefined ? {} : { subtitle: spec.subtitle }),
    ...(spec.footer === undefined ? {} : { footer: spec.footer }),
    ...(spec.theme === undefined ? {} : { theme: spec.theme }),
  })
  const theme: ScaffoldTheme = scaffold.theme
  const body = scaffold.slots.body
  const cards = spec.cards ?? []
  const nav = spec.nav ?? []
  if (cards.length > MAX_CARDS) throw new Error(`${cards.length} cards exceed the ${MAX_CARDS} this layout holds`)
  if (nav.length > MAX_NAV) throw new Error(`${nav.length} navigation buttons exceed the ${MAX_NAV} this layout holds`)
  if (cards.length === 0 && nav.length === 0) throw new Error('describe at least one card or one navigation button')

  const objects: ScreenObject[] = scaffold.objects.map(object => ({ ...object }) as ScreenObject)
  const cardSlots: Slot[] = []
  const navSlot: Slot | undefined = nav.length === 0 ? undefined : { left: body.left, top: body.top + body.height - NAV, width: body.width, height: NAV }
  const usable = navSlot === undefined ? body.height : body.height - NAV - GAP
  const columns = cards.length <= 1 ? 1 : 2
  const rowsOfCards = cards.length === 0 ? 0 : Math.ceil(cards.length / columns)
  const cardWidth = cards.length === 0 ? 0 : Math.floor((body.width - GAP * (columns - 1)) / columns)
  const cardHeight = rowsOfCards === 0 ? 0 : Math.floor((usable - GAP * (rowsOfCards - 1)) / rowsOfCards)
  if (cards.length > 0 && (cardWidth < 180 || cardHeight < 120)) {
    throw new Error(`display ${spec.width}x${spec.height} leaves no room for ${cards.length} card(s) at a readable size`)
  }

  cards.forEach((card, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const slot: Slot = {
      left: body.left + column * (cardWidth + GAP),
      top: body.top + row * (cardHeight + GAP),
      width: cardWidth,
      height: cardHeight,
    }
    cardSlots.push(slot)
    const name = `Card${index + 1}`
    objects.push({ type: 'panel', name, attributes: { ...box(slot), backColor: theme.surface, borderStyle: 'line', borderColor: '#2C4557' } })
    objects.push({
      type: 'text',
      name: `${name}Title`,
      attributes: { ...box({ left: slot.left + CARD_PAD, top: slot.top + 12, width: slot.width - CARD_PAD * 2, height: 22 }), ...textChrome('#FFFFFF'), fontFamily: 'Arial Unicode MS', fontSize: '13', bold: 'true', caption: card.title },
    })
    const rowTop = slot.top + 44
    card.rows.forEach((item, rowIndex) => {
      const top = rowTop + rowIndex * ROW
      if (top + ROW > slot.top + slot.height) throw new Error(`card ${JSON.stringify(card.title)} has more rows than fit: ${card.rows.length}`)
      objects.push({
        type: 'text',
        name: `${name}Row${rowIndex + 1}Label`,
        attributes: { ...box({ left: slot.left + CARD_PAD, top, width: Math.floor((slot.width - CARD_PAD * 2) * 0.45), height: ROW - 6 }), ...textChrome('#CFE0EA'), fontFamily: 'Arial Unicode MS', fontSize: '11', caption: item.label },
      })
      const valueLeft = slot.left + CARD_PAD + Math.floor((slot.width - CARD_PAD * 2) * 0.45)
      const valueWidth = slot.width - CARD_PAD * 2 - Math.floor((slot.width - CARD_PAD * 2) * 0.45)
      if (item.kind === 'value') {
        objects.push({
          type: 'numericDisplay',
          name: `${name}Row${rowIndex + 1}Value`,
          attributes: { ...box({ left: valueLeft, top, width: valueWidth, height: ROW - 6 }), backColor: '#0B1620', foreColor: '#E2E8F0', borderStyle: 'none' },
          connections: { Value: item.tag },
        })
        return
      }
      objects.push({
        type: 'multistateIndicator',
        name: `${name}Row${rowIndex + 1}Lamp`,
        attributes: { ...box({ left: valueLeft + 8, top: top + 4, width: 26, height: 26 }), borderStyle: 'none' },
        connections: { Indicator: item.tag },
        states: [
          { stateId: '0', backColor: '#E5484D' },
          { stateId: '1', backColor: '#30A46C' },
        ],
      })
    })
  })

  const navButtons: Slot[] = []
  if (navSlot !== undefined) {
    const buttonWidth = Math.floor((body.width - GAP * (nav.length - 1)) / nav.length)
    nav.forEach((button, index) => {
      const slot: Slot = { left: body.left + index * (buttonWidth + GAP), top: navSlot.top + 8, width: buttonWidth, height: navSlot.height - 16 }
      navButtons.push(slot)
      objects.push({
        type: 'gotoButton',
        name: `Nav${index + 1}`,
        attributes: { ...box(slot), backColor: '#DCE4EC', borderStyle: 'line', borderColor: '#2F5A73', display: button.display },
        caption: button.label,
      })
    })
  }

  return { objects, slots: { body, cards: cardSlots, nav: navSlot, navButtons } }
}
