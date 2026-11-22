/**
 * Help-page HTML -> readable text.
 *
 * The installed help these tools read ships in two shapes: Oxygen WebHelp for
 * Studio 5000 / FactoryTalk View and CHM topics for the older tools. Both wrap
 * the topic in navigation chrome, both declare the topic body under the same
 * `wh_topic_body` marker, and both escape their text. This module owns the one
 * generic conversion so every product adapter gets the same readable page:
 * cut to the topic body when the page names one, decode entities, keep
 * paragraph breaks, collapse everything else.
 *
 * Product adapters may clean their own vendor pages further; nothing here
 * knows a product name.
 *
 * @module dsh-engineering-knowledge/html
 */

/** The marker Oxygen WebHelp and CHM pages put on the topic body container. */
const TOPIC_BODY_MARKER = 'wh_topic_body'

/** The entities vendor help actually uses, plus the handful of typographic ones. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  laquo: '\u00ab',
  raquo: '\u00bb',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  middot: '\u00b7',
  bull: '\u2022',
  deg: '\u00b0',
  plusmn: '\u00b1',
  times: '\u00d7',
  divide: '\u00f7',
  micro: '\u00b5',
  para: '\u00b6',
  sect: '\u00a7',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
}

/** Options for {@link htmlToText}. */
export interface HtmlTextOptions {
  /** Cut to `wh_topic_body` when the page carries it. Defaults to true. */
  readonly cutAtTopicBody?: boolean
  /** Hard cap on the returned characters; a cut here is not marked. */
  readonly maxChars?: number
}

/**
 * Decode the HTML character references vendor help uses.
 *
 * Numeric references are decoded as code points; named references are decoded
 * from the table above. An unknown reference is left exactly as written, which
 * is what a reader would want from a page that honestly says `&foo;`.
 *
 * @param text - Text that may contain character references.
 * @returns The same text with known references decoded.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/gu, (match, body: string) => {
    if (body.startsWith('#')) {
      const hexadecimal = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
      // Invalid code points, and lone surrogates, stay as written.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match
      return String.fromCodePoint(code)
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named === undefined ? match : named
  })
}

/**
 * Remove every tag, joining the text they wrapped.
 *
 * Block boundaries must already have been turned into line breaks by the
 * caller: removing an inline tag such as `<b>` must not invent a space inside
 * the word it wrapped.
 *
 * @param html - Markup with comments and skipped elements already removed.
 * @returns The text between the tags.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/gu, '')
}

/**
 * Collapse whitespace while keeping paragraph breaks.
 *
 * Runs of spaces and tabs become one space, trailing spaces leave each line,
 * and three or more line breaks become the two that mark one paragraph break.
 * Non-breaking and zero-width characters are normalised here because vendor
 * help uses them as layout.
 *
 * @param text - Text with arbitrary whitespace.
 * @returns The collapsed text, trimmed.
 */
export function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/gu, '\n')
    .replace(/[\ufeff\u200b]/gu, '')
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/gu, ' ')
    .replace(/[ \t\f\v]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

/**
 * Whether a page's content carries markup worth converting.
 *
 * @param text - Page content as returned by an adapter.
 * @returns True when at least one tag is present.
 */
export function hasHtmlMarkup(text: string): boolean {
  return /<[a-zA-Z!/][^>]*>/u.test(text)
}

/**
 * Remove the "jump to main content" link every Oxygen WebHelp page starts with.
 *
 * That anchor carries `href="#wh_topic_body"`, so its opening tag names the
 * topic-body marker before the real container does. It is navigation, not the
 * topic; leaving it in makes the cut-and-later marker scan land on the skip
 * link and return the whole header and table of contents.
 */
function removeSkipLinks(source: string): string {
  return source.replace(/<a\b[^>]*href\s*=\s*["']#wh_topic_body["'][^>]*>[\s\S]*?<\/a\s*>/giu, ' ')
}

/**
 * Cut away everything before the topic body container, when the page has one.
 *
 * The container is the element whose `id` is `wh_topic_body`; the skip-link
 * removal above means a plain marker scan can then serve as the fallback for
 * older CHM output that does not use an id attribute.
 */
function cutToTopicBody(source: string): string {
  const container = /<[a-zA-Z][a-zA-Z0-9:-]*\b[^>]*\bid\s*=\s*["']wh_topic_body["'][^>]*>/iu.exec(source)
  if (container !== null) return source.slice(container.index)
  const marker = source.toLowerCase().indexOf(TOPIC_BODY_MARKER)
  if (marker === -1) return source
  const tagStart = source.lastIndexOf('<', marker)
  return source.slice(tagStart === -1 ? marker : tagStart)
}

/**
 * Convert one vendor help page to readable text.
 *
 * The conversion is generic: script, style, head and template content is
 * dropped; the page is cut at the `wh_topic_body` container when present;
 * block elements become paragraph breaks; entities are decoded; everything
 * else is whitespace-collapsed. A plain-text page passes through the same
 * normalisation and comes out clean.
 *
 * @param html - Page content, HTML or plain text.
 * @param options - Whether to cut at the topic body, and a hard character cap.
 * @returns Readable text with paragraph breaks.
 */
export function htmlToText(html: string, options: HtmlTextOptions = {}): string {
  let source = String(html ?? '')
  if (source === '') return ''

  source = source.replace(/<!--[\s\S]*?-->/gu, ' ')
  source = source.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
  source = source.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/giu, ' ')
  source = source.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/giu, ' ')
  source = removeSkipLinks(source)

  if (options.cutAtTopicBody !== false) source = cutToTopicBody(source)

  source = source.replace(/<\s*br\s*\/?>/giu, '\n')
  source = source.replace(/<\s*\/\s*(td|th)\b[^>]*>/giu, ' | ')
  source = source.replace(
    /<\s*\/?\s*(p|div|section|article|header|footer|main|nav|aside|h[1-6]|li|ul|ol|dl|dt|dd|tr|table|thead|tbody|tfoot|pre|blockquote|figure|figcaption|form|fieldset|hr|address)\b[^>]*>/giu,
    '\n\n',
  )

  let text = collapseWhitespace(decodeEntities(stripHtml(source)))
  // A table row's trailing cell separator reads as noise on its own line.
  text = text.replace(/\s*\|\s*$/gmu, '')
  if (options.maxChars !== undefined && text.length > options.maxChars) text = text.slice(0, options.maxChars)
  return text
}
