/**
 * Compose a modal popup: size, message, and its buttons.
 *
 * Real Machine Edition popups are small `onTop` displays with a wrapped message
 * and a row of buttons; this lays one out so nothing has to be positioned by hand.
 *
 * @module dsh-engineering-ftview/edit/popup
 */

/** One button on the popup. */
export interface PopupButton {
  /** Caption shown on the button, for example "YES". */
  readonly label: string
  /** What the button does; defaults to closing the popup. */
  readonly action?: 'close' | 'goto'
  /** Display to open when `action` is `goto`. */
  readonly display?: string
  /** Button colour, for example "#B91C1C". */
  readonly backColor?: string
}

/** One popup to build. */
export interface PopupSpec {
  /** Optional heading above the message. */
  readonly title?: string
  /** Message text; `\n` starts a new line. */
  readonly message: string
  /** One to three buttons. */
  readonly buttons: readonly PopupButton[]
  /** Popup width in pixels; defaults to 395. */
  readonly width?: number
  /** Popup height in pixels; defaults to 190. */
  readonly height?: number
  /** Screen position when it opens. */
  readonly positionX?: number
  /** Screen position when it opens. */
  readonly positionY?: number
  /** Background colour; defaults to the Machine Edition grey. */
  readonly backColor?: string
  /** Draw a frame panel behind the content. */
  readonly frame?: boolean
}

/** One object the popup needs. */
export interface PopupObject {
  readonly type: string
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly caption?: string
  readonly connections?: Readonly<Record<string, string>>
}

/** Everything the popup needs on the display and inside it. */
export interface PopupLayout {
  readonly width: number
  readonly height: number
  /** Display settings beyond size and colour. */
  readonly settings: Readonly<Record<string, string>>
  readonly objects: readonly PopupObject[]
}

/** Popup defaults taken from the exports this plugin has seen. */
export const POPUP = {
  width: 395,
  height: 190,
  margin: 12,
  gap: 10,
  button: 40,
  titleHeight: 24,
  backColor: '#A0A0A4',
  titleColor: '#111827',
  messageColor: '#1F2937',
  buttonColor: '#1E3A5F',
  maxButtons: 3,
} as const

/**
 * Lay out one popup.
 *
 * @param spec - Message, buttons and optional geometry.
 * @returns Size, extra display settings, and the objects to add.
 */
export function popupLayout(spec: PopupSpec): PopupLayout {
  const width = spec.width ?? POPUP.width
  const height = spec.height ?? POPUP.height
  if (width < 200 || height < 120) {
    throw new Error(`A popup of ${width}x${height} is too small for a message and a button row.`)
  }
  if (spec.message.trim() === '') throw new Error('The popup needs a message.')
  const buttons = spec.buttons ?? []
  if (buttons.length === 0) throw new Error('The popup needs at least one button.')
  if (buttons.length > POPUP.maxButtons) throw new Error(`A popup takes at most ${POPUP.maxButtons} buttons.`)

  const objects: PopupObject[] = []
  if (spec.frame === true) {
    objects.push({
      type: 'panel',
      name: 'PopupFrame',
      attributes: {
        left: '0',
        top: '0',
        width: String(width),
        height: String(height),
        backColor: spec.backColor ?? POPUP.backColor,
        borderStyle: 'line',
        borderWidth: '1',
      },
    })
  }

  let top = POPUP.margin
  if (spec.title !== undefined && spec.title !== '') {
    objects.push({
      type: 'text',
      name: 'PopupTitle',
      attributes: {
        left: String(POPUP.margin),
        top: String(top),
        width: String(width - POPUP.margin * 2),
        height: String(POPUP.titleHeight),
        fontFamily: 'Arial Unicode MS',
        fontSize: '14',
        bold: 'true',
        foreColor: POPUP.titleColor,
        backStyle: 'transparent',
        wordWrap: 'true',
        sizeToFit: 'true',
        alignment: 'middleLeft',
      },
      caption: spec.title,
    })
    top += POPUP.titleHeight + 6
  }

  const buttonsTop = height - POPUP.margin - POPUP.button
  const messageHeight = Math.max(POPUP.button, buttonsTop - top - 8)
  objects.push({
    type: 'text',
    name: 'PopupMessage',
    attributes: {
      left: String(POPUP.margin),
      top: String(top),
      width: String(width - POPUP.margin * 2),
      height: String(messageHeight),
      fontFamily: 'Arial Unicode MS',
      fontSize: '12',
      foreColor: POPUP.messageColor,
      backStyle: 'transparent',
      wordWrap: 'true',
      sizeToFit: 'false',
      alignment: 'middleCenter',
    },
    caption: spec.message,
  })

  const count = buttons.length
  const available = width - POPUP.margin * 2 - POPUP.gap * (count - 1)
  const buttonWidth = Math.floor(available / count)
  buttons.forEach((button, index) => {
    const left = POPUP.margin + index * (buttonWidth + POPUP.gap)
    const attributes: Record<string, string> = {
      left: String(left),
      top: String(buttonsTop),
      width: String(buttonWidth),
      height: String(POPUP.button),
      backStyle: 'solid',
      backColor: button.backColor ?? POPUP.buttonColor,
      borderStyle: 'line',
      borderWidth: '1',
    }
    if (button.action === 'goto') {
      if (button.display === undefined) throw new Error(`Button ${JSON.stringify(button.label)} goes to a display but names none.`)
      objects.push({
        type: 'gotoButton',
        name: `PopupButton${index + 1}`,
        attributes: { ...attributes, display: button.display },
        caption: button.label,
      })
      return
    }
    objects.push({
      type: 'closeButton',
      name: `PopupButton${index + 1}`,
      attributes,
      caption: button.label,
    })
  })

  return {
    width,
    height,
    settings: {
      displayType: 'onTop',
      cannotBeReplaced: 'false',
      backColor: spec.backColor ?? POPUP.backColor,
      titleBar: 'false',
      ...(spec.positionX === undefined ? {} : { positionX: String(spec.positionX) }),
      ...(spec.positionY === undefined ? {} : { positionY: String(spec.positionY) }),
    },
    objects,
  }
}
