/**
 * Browser half: show a FactoryTalk View ME display export as the display it
 * describes instead of its XML source.
 *
 * The Host half of this package analyses exports through the Python engine.
 * This half is presentation only: it decodes the export the document preview
 * already read, renders every graphic object at its exported geometry, and
 * falls back to the raw source for XML that is not a display export.
 *
 * `Gfx-ME*.xsd` fixes the meaning of every attribute read here; nothing is
 * inferred from a filename, and no value is invented for an attribute the
 * export omits.
 */
window.__ModuleLoader__.load({
  id: 'dsh-engineering-ftview-viewer',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useMemo, useRef, useEffect, useCallback } = React

    /** Implementation name, also the keyed document slot key. */
    const ID = 'dsh-engineering-ftview-viewer/display'
    /** Copy namespace for the document toolbar's implementation label. */
    const NS = 'factorytalkView'

    const en = {
      title: 'FactoryTalk View display',
      fit: 'Fit',
      actual: '1:1',
      tags: 'Tags',
      objects: 'objects',
      notDisplay: 'This XML is not a FactoryTalk View ME display export.',
      notDisplayHint: 'A display export has a <gfx> root with a <displaySettings> child. The source is shown instead.',
      parseFailed: 'This file is not well-formed XML.',
      cut: 'Only the start of this file was read, so the XML is incomplete and cannot be drawn.',
      truncated: 'Only the first 200000 characters are shown.',
    }
    const zh = {
      title: 'FactoryTalk View 画面',
      fit: '适应',
      actual: '1:1',
      tags: '标签',
      objects: '个对象',
      notDisplay: '此 XML 不是 FactoryTalk View ME 画面导出文件。',
      notDisplayHint: '画面导出文件应以 <gfx> 为根元素并包含 <displaySettings> 子元素。此处显示原始源码。',
      parseFailed: '此文件不是格式正确的 XML。',
      cut: '仅读取了此文件的开头部分，XML 不完整，无法绘制。',
      truncated: '仅显示前 200000 个字符。',
    }

    // ---------------------------------------------------------------------
    // Palette and metrics
    // ---------------------------------------------------------------------

    /** FTView named colors whose CSS name differs or that CSS does not define. */
    const NAMED_COLORS = {
      silver: '#C0C0C0',
      gray: '#808080',
      grey: '#808080',
      teal: '#008080',
      aqua: '#00FFFF',
      lime: '#00FF00',
      fuchsia: '#FF00FF',
      maroon: '#800000',
      navy: '#000080',
      olive: '#808000',
      purple: '#800080',
    }

    /**
     * Resolve an exported color token.
     * @param value - the attribute value, `#RRGGBB`, a CSS name, or empty.
     * @param fallback - color used when the export omits or empties the attribute.
     * @returns a CSS color.
     */
    function color(value, fallback) {
      if (value === null || value === undefined) return fallback
      const token = String(value).trim()
      if (!token) return fallback
      return NAMED_COLORS[token.toLowerCase()] ?? token
    }

    /** Points to device pixels at the 96 dpi a ME display is authored at. */
    const POINTS_TO_PIXELS = 4 / 3

    /**
     * Derive the rendered text metrics of a graphic object.
     *
     * An export states either `fontSize` (points) or `charHeight`/`charWidth`
     * (authored device pixels per character cell). `charHeight` is the line
     * box, so the glyph size is a fraction of it.
     * @param el - the graphic object element.
     * @param lines - number of caption lines, used to size text with neither metric.
     * @returns CSS `fontSize` and `lineHeight` in pixels.
     */
    function textMetrics(el, lines) {
      const size = Number(el.getAttribute('fontSize'))
      if (Number.isFinite(size) && size > 0) {
        const pixels = size * POINTS_TO_PIXELS
        return { fontSize: `${pixels.toFixed(2)}px`, lineHeight: `${(pixels * 1.34).toFixed(2)}px` }
      }
      const cell = Number(el.getAttribute('charHeight'))
      if (Number.isFinite(cell) && cell > 0) {
        return { fontSize: `${(cell * 0.625).toFixed(2)}px`, lineHeight: `${cell}px` }
      }
      const height = Number(el.getAttribute('height'))
      const rows = Math.max(1, lines)
      const box = Number.isFinite(height) && height > 0 ? height / rows : 16
      return { fontSize: `${(box * 0.72).toFixed(2)}px`, lineHeight: `${box.toFixed(2)}px` }
    }

    /**
     * Map an exported alignment token to flexbox placement.
     * @param value - `middleCenter`, `topLeft`, and so on.
     * @returns flex and text alignment.
     */
    function alignment(value) {
      const token = value || 'middleCenter'
      const vertical = token.startsWith('top') ? 'flex-start'
        : token.startsWith('bottom') ? 'flex-end'
          : 'center'
      const horizontal = token.endsWith('Left') ? 'flex-start'
        : token.endsWith('Right') ? 'flex-end'
          : 'center'
      const text = horizontal === 'flex-start' ? 'left' : horizontal === 'flex-end' ? 'right' : 'center'
      return { justifyContent: horizontal, alignItems: vertical, textAlign: text }
    }

    /**
     * Build the CSS `border` an object's exported border settings describe.
     * @param el - the graphic object element.
     * @returns a CSS border value, or `null` when the object has no border.
     */
    function border(el) {
      const style = el.getAttribute('borderStyle')
      if (!style || style === 'none') return null
      const width = Number(el.getAttribute('borderWidth')) || 1
      const stroke = el.getAttribute('borderUsesBackColor') === 'true'
        ? el.getAttribute('backColor')
        : el.getAttribute('borderColor')
      const css = style === 'inset' ? 'inset' : style === 'raised' || style === 'raisedInset' ? 'outset' : 'solid'
      return `${width}px ${css} ${color(stroke, '#808080')}`
    }

    /**
     * Read the fill a graphic object's `backStyle` asks for.
     * @param el - the graphic object element.
     * @returns a CSS background, or `undefined` for a transparent object.
     */
    function fill(el) {
      return el.getAttribute('backStyle') === 'transparent'
        ? undefined
        : color(el.getAttribute('backColor'), undefined)
    }

    // ---------------------------------------------------------------------
    // Export reading
    // ---------------------------------------------------------------------

    /** Direct child elements of an element, ignoring text and comments. */
    function children(el, tag) {
      const found = []
      for (const child of el.children) {
        if (tag === undefined || child.localName === tag) found.push(child)
      }
      return found
    }

    /** First direct child element with the given name. */
    function child(el, tag) {
      return children(el, tag)[0] ?? null
    }

    /**
     * Read an object's `connections`.
     * @param el - the graphic object element.
     * @returns the connection name to exported expression, braces removed.
     */
    function connections(el) {
      const block = child(el, 'connections')
      if (!block) return {}
      const found = {}
      for (const entry of children(block, 'connection')) {
        const name = entry.getAttribute('name') || 'Value'
        const expression = (entry.getAttribute('expression') || '').trim()
        if (expression) found[name] = expression.replace(/^\{|\}$/g, '')
      }
      return found
    }

    /**
     * Select the state an object is drawing.
     *
     * `currentStateId` records the state the export was saved with, which is
     * what a static preview must show. A `stateId` is a name for the alarm
     * states and a number otherwise; multistate objects also carry `value`.
     * @param el - the stateful graphic object element.
     * @returns the selected `<state>`, or `null` when the object has none.
     */
    function stateOf(el) {
      const block = child(el, 'states')
      if (!block) return null
      const states = children(block, 'state')
      if (states.length === 0) return null
      const wanted = el.getAttribute('currentStateId')
      if (wanted !== null && wanted !== '') {
        const exact = states.find(state => state.getAttribute('stateId') === wanted)
        if (exact) return exact
        const byValue = states.find(state => state.getAttribute('value') === wanted)
        if (byValue) return byValue
      }
      return states.find(state => state.getAttribute('stateId') === '1')
        ?? states.find(state => state.getAttribute('stateId') === '0')
        ?? states[0]
    }

    /** Expand the newlines a caption stores as XML character references. */
    function captionText(node) {
      const raw = node?.getAttribute('caption')
      if (raw === null || raw === undefined) return ''
      return raw.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
    }

    /**
     * Placeholder a `numericDisplay` reserves for its runtime value.
     * @param el - the numeric display element.
     * @returns the digit template, padded as `fillLeftWith` asks.
     */
    function numericTemplate(el) {
      const digits = Number(el.getAttribute('numberOfDigits')) || 0
      const decimals = Number(el.getAttribute('decimalPlaces')) || 0
      if (digits <= 0) return decimals > 0 ? `0.${'0'.repeat(decimals)}` : '0'
      let text = decimals > 0 ? `0.${'0'.repeat(decimals)}` : '0'
      if (text.length > digits) return text.slice(0, digits)
      const pad = digits - text.length
      if (pad <= 0) return text
      return (el.getAttribute('fillLeftWith') === 'zeros' ? '0' : ' ').repeat(pad) + text
    }

    /**
     * Label of the encoding a byte-order mark names.
     * @param bytes - raw file bytes.
     * @returns a TextDecoder label, or undefined when no mark is present.
     */
    function markedEncoding(bytes) {
      if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8'
      if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le'
      if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be'
      return undefined
    }

    /**
     * Label of the encoding an XML declaration names.
     * @param bytes - raw file bytes.
     * @returns a TextDecoder label, or undefined when the declaration is absent or unreadable.
     */
    function declaredEncoding(bytes) {
      const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 200))
      const declared = /<\?xml[^>]*encoding\s*=\s*["']([\w.-]+)["']/.exec(head)
      return declared ? declared[1] : undefined
    }

    /**
     * Decode an export's bytes, honoring a byte-order mark before the declared encoding.
     *
     * FactoryTalk View Studio writes most displays as UTF-8, but emits some generated
     * exports, such as the batch-import manifests, as UTF-16 with a byte-order mark.
     * @param bytes - raw file bytes.
     * @returns the decoded export source.
     */
    function decodeSource(bytes) {
      const label = markedEncoding(bytes) || declaredEncoding(bytes) || 'utf-8'
      try {
        return new TextDecoder(label).decode(bytes)
      } catch {
        return new TextDecoder('utf-8').decode(bytes)
      }
    }

    /**
     * Read one ME display export.
     * @param text - decoded export source.
     * @returns the display settings, its graphic objects, or why it is not a display.
     */
    function readDisplay(text) {
      let doc
      try {
        doc = new DOMParser().parseFromString(text, 'text/xml')
      } catch {
        return { kind: 'invalid' }
      }
      const root = doc.documentElement
      if (!root || root.localName === 'parsererror' || doc.getElementsByTagName('parsererror').length > 0) {
        return { kind: 'invalid' }
      }
      if (root.localName !== 'gfx') return { kind: 'other', root: root.localName }
      const settings = child(root, 'displaySettings')
      if (!settings) return { kind: 'other', root: root.localName }
      const width = Number(settings.getAttribute('width')) || 0
      const height = Number(settings.getAttribute('height')) || 0
      if (width <= 0 || height <= 0) return { kind: 'other', root: root.localName }
      return {
        kind: 'display',
        settings: {
          width,
          height,
          backColor: color(settings.getAttribute('backColor'), '#E0E0E0'),
          displayType: settings.getAttribute('displayType') || 'replace',
          gradient: settings.getAttribute('useGradientStyle') === 'true',
        },
        objects: children(root).filter(node => node !== settings),
      }
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------

    /**
     * Absolute placement every graphic object carries.
     * @param el - the graphic object element.
     * @returns CSS for its exported box and visibility.
     */
    function box(el) {
      return {
        left: `${Number(el.getAttribute('left')) || 0}px`,
        top: `${Number(el.getAttribute('top')) || 0}px`,
        width: `${Number(el.getAttribute('width')) || 0}px`,
        height: `${Number(el.getAttribute('height')) || 0}px`,
      }
    }

    /**
     * Draw one caption.
     * @param source - the `<caption>` or `<text>` element carrying the text.
     * @param el - the owning graphic object, for its box and text metrics.
     * @returns a positioned text node, or `null` when the caption is empty.
     */
    function drawCaption(source, el) {
      const text = captionText(source)
      if (!text) return null
      const lines = text.split('\n').length
      const metrics = textMetrics(el, lines)
      return h('div', {
        key: 'caption',
        className: 'ftv-obj ftv-txt',
        style: {
          ...box(el),
          ...alignment(source.getAttribute('alignment')),
          ...metrics,
          fontFamily: source.getAttribute('fontFamily') || 'Arial Unicode MS, sans-serif',
          fontWeight: source.getAttribute('bold') === 'true' ? 700 : 400,
          fontStyle: source.getAttribute('italic') === 'true' ? 'italic' : 'normal',
          textDecoration: [
            source.getAttribute('underline') === 'true' ? 'underline' : '',
            source.getAttribute('strikethrough') === 'true' ? 'line-through' : '',
          ].filter(Boolean).join(' ') || 'none',
          color: color(source.getAttribute('color'), color(el.getAttribute('foreColor'), '#000000')),
          background: fill(source),
          whiteSpace: source.getAttribute('wordWrap') === 'false' ? 'pre' : 'pre-wrap',
          pointerEvents: 'none',
        },
      }, text)
    }

    /**
     * Draw an object that has no exported artwork, naming what the export asks for.
     * @param el - the graphic object element.
     * @param name - the exported graphic name.
     * @returns a placeholder box.
     */
    function placeholder(el, name) {
      return h('div', {
        key: 'placeholder',
        className: 'ftv-obj ftv-placeholder',
        style: box(el),
        title: name,
      }, h('span', null, name))
    }

    /**
     * Draw a `line` object as its own SVG so document order still decides depth.
     * @param el - the line element.
     * @returns a positioned SVG, or a placeholder when the export omits coordinates.
     */
    function drawLine(el) {
      const numbers = (el.getAttribute('line') || '').trim().split(/\s+/).map(Number)
      if (numbers.length < 4 || numbers.some(value => !Number.isFinite(value))) {
        return placeholder(el, el.getAttribute('name') || 'line')
      }
      const [x1, y1, x2, y2] = numbers
      const left = Number(el.getAttribute('left')) || 0
      const top = Number(el.getAttribute('top')) || 0
      const width = Number(el.getAttribute('width')) || 1
      const height = Number(el.getAttribute('height')) || 1
      return h('svg', {
        key: 'line',
        className: 'ftv-obj',
        style: box(el),
        viewBox: `${left} ${top} ${width} ${height}`,
        preserveAspectRatio: 'none',
      }, h('line', {
        x1, y1, x2, y2,
        stroke: color(el.getAttribute('foreColor'), '#000000'),
        strokeWidth: Number(el.getAttribute('lineWidth')) || 1,
        strokeDasharray: el.getAttribute('lineStyle') === 'dash' ? '4 3' : undefined,
      }))
    }

    /** Draw an `arc` object as its outlined or filled ellipse. */
    function drawArc(el) {
      const left = Number(el.getAttribute('left')) || 0
      const top = Number(el.getAttribute('top')) || 0
      const width = Number(el.getAttribute('width')) || 0
      const height = Number(el.getAttribute('height')) || 0
      if (width <= 0 || height <= 0) return placeholder(el, el.getAttribute('name') || 'arc')
      const solid = el.getAttribute('backStyle') !== 'transparent'
      return h('svg', {
        key: 'arc',
        className: 'ftv-obj',
        style: box(el),
        viewBox: `${left} ${top} ${width} ${height}`,
      }, h('ellipse', {
        cx: left + width / 2,
        cy: top + height / 2,
        rx: Math.max(0, width / 2 - 1),
        ry: Math.max(0, height / 2 - 1),
        fill: solid ? color(el.getAttribute('backColor'), 'none') : 'none',
        stroke: color(el.getAttribute('foreColor'), '#555555'),
        strokeWidth: Number(el.getAttribute('lineWidth')) || 1,
      }))
    }

    /** Draw a panel: a filled, bordered rectangle behind later objects. */
    function drawPanel(el) {
      return h('div', {
        key: 'panel',
        className: 'ftv-obj',
        style: {
          ...box(el),
          background: fill(el) ?? 'transparent',
          border: border(el) ?? undefined,
        },
      })
    }

    /**
     * Draw a `text` object.
     * @param el - the text element.
     * @returns its caption in the exported box.
     */
    function drawText(el) {
      const text = captionText(el)
      if (!text) return null
      const lines = text.split('\n').length
      return h('div', {
        key: 'text',
        className: 'ftv-obj ftv-txt',
        style: {
          ...box(el),
          ...alignment(el.getAttribute('alignment')),
          ...textMetrics(el, lines),
          fontFamily: el.getAttribute('fontFamily') || 'Arial Unicode MS, sans-serif',
          fontWeight: el.getAttribute('bold') === 'true' ? 700 : 400,
          fontStyle: el.getAttribute('italic') === 'true' ? 'italic' : 'normal',
          textDecoration: [
            el.getAttribute('underline') === 'true' ? 'underline' : '',
            el.getAttribute('strikethrough') === 'true' ? 'line-through' : '',
          ].filter(Boolean).join(' ') || 'none',
          color: color(el.getAttribute('foreColor'), '#000000'),
          background: fill(el),
          whiteSpace: el.getAttribute('wordWrap') === 'false' ? 'pre' : 'pre-wrap',
        },
      }, text)
    }

    /** Draw an `image` object as the name of the graphic the project stores elsewhere. */
    function drawImage(el) {
      const name = el.getAttribute('imageName') || el.getAttribute('name') || ''
      if (!name) return null
      return placeholder(el, name)
    }

    /**
     * Draw a button, indicator, or other stateful object.
     * @param el - the graphic object element.
     * @returns the selected state's artwork with its caption.
     */
    function drawStateful(el) {
      const state = stateOf(el)
      if (!state) {
        return h('div', {
          key: 'stateful',
          className: 'ftv-obj',
          style: {
            ...box(el),
            background: fill(el) ?? 'transparent',
            border: border(el) ?? undefined,
            borderRadius: el.getAttribute('shape') === 'circle' ? '50%' : undefined,
          },
        })
      }
      const overlay = child(state, 'caption')
      const image = child(state, 'imageSettings')
      const imageName = image?.getAttribute('imageName') || ''
      return h('div', {
        key: 'stateful',
        className: 'ftv-obj',
        style: {
          ...box(el),
          background: color(state.getAttribute('backColor'), undefined),
          border: border({ getAttribute: name => state.getAttribute(name) ?? el.getAttribute(name) }) ?? undefined,
          borderRadius: el.getAttribute('shape') === 'circle' ? '50%' : undefined,
        },
      },
      imageName ? placeholder(el, imageName) : null,
      overlay ? drawCaption(overlay, el) : null)
    }

    /** Draw a `numericDisplay`: its exported digit template, not a live value. */
    function drawNumericDisplay(el) {
      return h('div', {
        key: 'numeric',
        className: 'ftv-obj ftv-txt',
        style: {
          ...box(el),
          ...alignment(el.getAttribute('alignment')),
          ...textMetrics(el, 1),
          fontFamily: el.getAttribute('fontFamily') || 'Arial Unicode MS, sans-serif',
          fontWeight: el.getAttribute('bold') === 'true' ? 700 : 400,
          color: color(el.getAttribute('foreColor'), '#000000'),
          background: fill(el),
          border: border(el) ?? undefined,
          whiteSpace: 'pre',
        },
      }, numericTemplate(el))
    }

    /** Draw a `numericInputEnable`: its caption over its entry field. */
    function drawNumericInput(el) {
      const overlay = child(el, 'caption')
      return h('div', {
        key: 'numericInput',
        className: 'ftv-obj',
        style: {
          ...box(el),
          background: fill(el) ?? 'transparent',
          border: border(el) ?? undefined,
        },
      }, overlay ? drawCaption(overlay, el) : null)
    }

    /**
     * Draw an alarm, diagnostic, or information list.
     * @param el - the list element.
     * @returns its exported header over empty rows the runtime fills.
     */
    function drawList(el) {
      const title = el.getAttribute('titleActiveAlarmsMode')
        || el.getAttribute('caption')
        || el.getAttribute('name')
        || ''
      return h('div', {
        key: 'list',
        className: 'ftv-obj ftv-list',
        style: {
          ...box(el),
          background: color(el.getAttribute('backColor'), '#FFFFFF'),
          border: border(el) ?? `1px solid ${color(el.getAttribute('borderColor'), '#555555')}`,
        },
      },
      title ? h('div', {
        className: 'ftv-list-title',
        style: {
          background: color(el.getAttribute('headerBackColor'), color(el.getAttribute('backColor'), '#0B3B6B')),
          color: color(el.getAttribute('headerForeColor'), '#FFFFFF'),
        },
      }, title) : null)
    }

    /**
     * Draw a bar graph as its framed, empty plot area.
     * @param el - the bar graph element.
     * @returns the graph frame.
     */
    function drawBarGraph(el) {
      return h('div', {
        key: 'barGraph',
        className: 'ftv-obj',
        style: {
          ...box(el),
          background: fill(el) ?? 'transparent',
          border: border(el) ?? `1px solid ${color(el.getAttribute('foreColor'), '#555555')}`,
        },
      })
    }

    /**
     * Draw one graphic object.
     * @param el - the graphic object element.
     * @param index - position among its siblings, for the React key.
     * @returns the drawn object, or `null` for an object the export hides.
     */
    function drawObject(el, index) {
      if (el.getAttribute('visible') === 'false') return null
      switch (el.localName) {
        case 'panel': {
          const panel = drawPanel(el)
          return h(React.Fragment, { key: `panel-${index}` }, panel)
        }
        case 'text':
          return withKey(drawText(el), `text-${index}`)
        case 'line':
          return withKey(drawLine(el), `line-${index}`)
        case 'arc':
          return withKey(drawArc(el), `arc-${index}`)
        case 'image':
          return withKey(drawImage(el), `image-${index}`)
        case 'barGraph':
          return withKey(drawBarGraph(el), `bar-${index}`)
        case 'numericDisplay':
          return withKey(drawNumericDisplay(el), `numeric-${index}`)
        case 'numericInputEnable':
          return withKey(drawNumericInput(el), `numericInput-${index}`)
        case 'alarmList':
        case 'alarmStatusList':
        case 'diagnosticList':
        case 'informationMessageDisplay':
          return withKey(drawList(el), `list-${index}`)
        case 'gotoButton':
        case 'closeButton':
        case 'momentaryButton':
        case 'maintainedButton':
        case 'multistateButton':
        case 'multistateIndicator':
        case 'acknowledgeAlarmButton':
        case 'silenceAlarmsButton':
        case 'clearAlarmBannerButton':
        case 'diagnosticsClearButton':
        case 'diagnosticsClearAllButton':
        case 'informationAckButton':
        case 'moveUpKey':
        case 'moveDownKey':
        case 'moveLeftKey':
        case 'moveRightKey':
          return withKey(drawStateful(el), `stateful-${index}`)
        case 'group':
          return h(React.Fragment, { key: `group-${index}` }, children(el).map(drawObject))
        default:
          return null
      }
    }

    /** React needs a key on every sibling; give a drawn node its own. */
    function withKey(node, key) {
      if (!node) return null
      return h(React.Fragment, { key }, node)
    }

    /**
     * Collect the tag bindings a display declares, in document order.
     * @param objects - the display's graphic objects.
     * @returns one entry per connected object.
     */
    function readBindings(objects) {
      const found = []
      for (const object of objects) {
        for (const el of [object, ...object.querySelectorAll('*')]) {
          const bound = connections(el)
          const names = Object.keys(bound)
          if (names.length === 0) continue
          found.push({
            name: el.getAttribute('name') || el.localName,
            type: el.localName,
            left: Number(el.getAttribute('left')) || 0,
            top: Number(el.getAttribute('top')) || 0,
            tags: names.map(key => `${key}: ${bound[key]}`),
          })
        }
      }
      return found
    }

    // ---------------------------------------------------------------------
    // Component
    // ---------------------------------------------------------------------

    /**
     * Render one FactoryTalk View ME display export from its decoded source.
     * @param props - the decoded source, the file address, copy, and whether the
     *   surrounding pane already names the file.
     * @returns the display, its raw source, or why neither is available.
     */
    function Display(props) {
      const { source, address, t, embedded, cut } = props
      const say = useCallback(key => (typeof t === 'function' ? t(key) : en[key]), [t])
      const [mode, setMode] = useState('fit')
      const [showTags, setShowTags] = useState(false)
      const [scale, setScale] = useState(1)
      const scrollRef = useRef(null)

      const model = useMemo(() => (source === null ? null : readDisplay(source)), [source])
      const bindings = useMemo(
        () => (model?.kind === 'display' ? readBindings(model.objects) : []),
        [model],
      )

      const displayWidth = model?.kind === 'display' ? model.settings.width : 0

      useEffect(() => {
        if (model?.kind !== 'display') return undefined
        const host = scrollRef.current
        if (!host) return undefined
        const measure = () => {
          const available = host.clientWidth - 16
          setScale(mode === 'actual' ? 1 : Math.min(1, Math.max(0.05, available / displayWidth)))
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(host)
        return () => observer.disconnect()
      }, [mode, displayWidth, model])

      if (source === null) return null

      if (model.kind === 'invalid') {
        return h('div', { className: 'ftv-fallback' },
          h('p', { className: 'ftv-note' }, say(cut ? 'cut' : 'parseFailed')),
          h('pre', { className: 'ftv-pre' }, source.slice(0, 200000)))
      }

      if (model.kind === 'other') {
        return h('div', { className: 'ftv-fallback' },
          h('p', { className: 'ftv-note' },
            `${say('notDisplay')} ${say('notDisplayHint')}`),
          h('pre', { className: 'ftv-pre' }, source.slice(0, 200000)),
          source.length > 200000 ? h('p', { className: 'ftv-note' }, say('truncated')) : null)
      }

      const fileName = (address || '').split(/[\\/]/).pop() || ''
      const { width, height, backColor } = model.settings
      const count = model.objects.filter(node => node.getAttribute('visible') !== 'false').length

      return h('div', { className: 'ftv-root' },
        h('div', { className: 'ftv-bar' },
          embedded ? null : h('span', { className: 'ftv-name', title: fileName }, fileName),
          h('span', { className: 'ftv-dim' }, `${width}×${height}`),
          h('span', { className: 'ftv-dim' }, `${count} ${say('objects')}`),
          h('span', { className: 'ftv-spacer' }),
          h('button', {
            type: 'button',
            className: 'ftv-btn',
            'data-on': mode === 'fit',
            onClick: () => setMode('fit'),
          }, say('fit')),
          h('button', {
            type: 'button',
            className: 'ftv-btn',
            'data-on': mode === 'actual',
            onClick: () => setMode('actual'),
          }, say('actual')),
          h('button', {
            type: 'button',
            className: 'ftv-btn',
            'data-on': showTags,
            onClick: () => setShowTags(value => !value),
          }, say('tags'))),
        h('div', { className: 'ftv-scroll', ref: scrollRef },
          h('div', {
            className: 'ftv-frame',
            style: { width: `${(width * scale).toFixed(2)}px`, height: `${(height * scale).toFixed(2)}px` },
          },
          h('div', {
            className: 'ftv-stage',
            style: {
              width: `${width}px`,
              height: `${height}px`,
              background: backColor,
              transform: `scale(${scale})`,
            },
          },
          model.objects.map(drawObject),
          showTags ? bindings.map((binding, index) => h('div', {
            key: `tag-${index}`,
            className: 'ftv-tag',
            style: { left: `${binding.left}px`, top: `${binding.top}px` },
            title: `${binding.type} ${binding.name}`,
          }, binding.tags.join('  '))) : null))))
    }

    /**
     * Document-body entry: decode the bytes the document preview read.
     * @param props - document body props: the loaded bytes, the file address, copy.
     * @returns the rendered display once its bytes have arrived.
     */
    function FtViewBody(props) {
      const { content, resourceAddress, t } = props
      const source = useMemo(() => {
        if (!content || content.kind !== 'bytes') return null
        return decodeSource(content.data)
      }, [content])
      if (source === null) return null
      return h(Display, { source, address: resourceAddress, t })
    }

    /**
     * The better-sidebar file viewer's component, fed by that plugin's
     * `fsRead` strategy, which hands over the source as text.
     * @param t - copy lookup bound to this plugin's namespace.
     * @returns a viewer component for an exported display.
     */
    function fileViewer(t) {
      return function FtViewFile(props) {
        if (typeof props.content !== 'string') return null
        return h(Display, {
          source: props.content,
          address: props.path,
          t,
          embedded: true,
          cut: props.truncated === true,
        })
      }
    }

    // ---------------------------------------------------------------------
    // Plugin
    // ---------------------------------------------------------------------

    /** Stylesheet for the display surface, injected once per client module load. */
    const CSS = `
.ftv-root{display:flex;flex-direction:column;height:100%;min-height:0;font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:inherit}
.ftv-bar{display:flex;align-items:center;gap:6px;flex:none;padding:4px 8px;font-size:11px;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent)}
.ftv-name{font-weight:600;max-width:16em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ftv-dim{opacity:.6;font-variant-numeric:tabular-nums;white-space:nowrap}
.ftv-spacer{flex:1}
.ftv-btn{font:inherit;font-size:11px;padding:1px 6px;border-radius:4px;cursor:pointer;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 24%,transparent)}
.ftv-btn[data-on="true"]{background:color-mix(in srgb,currentColor 18%,transparent);border-color:color-mix(in srgb,currentColor 40%,transparent)}
.ftv-scroll{flex:1;min-height:0;overflow:auto;padding:8px;background:color-mix(in srgb,currentColor 4%,transparent)}
.ftv-frame{position:relative}
.ftv-stage{position:absolute;top:0;left:0;transform-origin:top left;overflow:hidden;box-shadow:0 0 0 1px color-mix(in srgb,currentColor 22%,transparent),0 2px 10px rgba(0,0,0,.28)}
.ftv-obj{position:absolute;box-sizing:border-box;overflow:hidden}
.ftv-txt{display:flex;overflow:hidden;word-break:break-word}
.ftv-placeholder{display:flex;align-items:center;justify-content:center;border:1px dashed color-mix(in srgb,#888 70%,transparent);background:repeating-linear-gradient(45deg,rgba(128,128,128,.10) 0 6px,rgba(128,128,128,.18) 6px 12px);color:#555;font-size:10px;text-align:center;padding:2px}
.ftv-list{display:flex;flex-direction:column}
.ftv-list-title{flex:none;padding:2px 6px;font-weight:600;font-size:11px}
.ftv-tag{position:absolute;z-index:20;padding:0 3px;border-radius:2px;background:rgba(0,0,0,.82);color:#7DFF9B;font:9px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;pointer-events:none}
.ftv-fallback{height:100%;overflow:auto;padding:12px 14px}
.ftv-note{margin:0 0 10px;padding:6px 9px;border-radius:4px;font-size:11px;border:1px solid color-mix(in srgb,currentColor 24%,transparent)}
.ftv-pre{margin:0;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre;tab-size:2}
`

    /**
     * Register the display viewer for `.xml`.
     *
     * Two consumers can claim a `.xml` file in the right sidebar.
     * `documentPreviews` is the Host's own document tab. `betterSidebar` is the
     * file-viewer registry behind that plugin's editor tab, which is where an
     * export opened from the file tree lands, so it is the one a reader
     * normally sees. Both are registered. `betterSidebar` is optional: a
     * profile without that plugin keeps the Host preview and skips this one.
     * @param ctx - client context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'factorytalk-view-use: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.documentPreviews.register({
        id: ID,
        extensions: ['xml'],
        priority: 'extension',
        title: () => t('title'),
        loading: 'bytes-complete',
      }), 'factorytalk-view-use: document viewer')
      ctx.inject(['betterSidebar'], scope => scope.effect(() => scope.betterSidebar.registerFileViewer({
        id: ID,
        title: () => t('title'),
        exts: ['xml'],
        priority: 0,
        fetchStrategy: 'fsRead',
        component: fileViewer(t),
      }), 'factorytalk-view-use: sidebar file viewer'))
      ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
        { name: 'sidebar.right.tab.document', key: ID, locale: NS }, FtViewBody,
      )), 'factorytalk-view-use: document body')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.append(style)
        return () => style.remove()
      }, 'factorytalk-view-use: styles')
    }

    return {
      inject: ['slots', 'locale', 'documentPreviews'],
      apply,
    }
  },
})
