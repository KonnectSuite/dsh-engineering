import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { renderDisplay, parseXml, evaluate, responsiveSvg, detectArtifact } from '../src/index.ts'

const DISPLAY = `<?xml version="1.0"?>
<display width="800" height="600" backColor="#C6C6C6">
  <objects>
    <panel name="Header" left="0" top="0" width="800" height="60" backColor="#002952" borderStyle="none"/>
    <text name="Title" left="20" top="10" width="400" height="40" caption="Line overview" fontFamily="Arial" fontSize="20" bold="true">
      <caption caption="Line overview" fontFamily="Arial" fontSize="20" bold="true" color="white" alignment="middleLeft"/>
    </text>
    <group name="G" left="100" top="100">
      <momentaryButton name="Start" left="0" top="0" width="120" height="50" backStyle="solid" borderStyle="raised" borderWidth="2" currentStateId="0">
        <states>
          <state stateId="0" backColor="#B0B0B0" borderColor="silver">
            <caption caption="Start" fontFamily="Arial" fontSize="12" color="black" alignment="middleCenter"/>
          </state>
        </states>
      </momentaryButton>
    </group>
    <numericDisplay name="Speed" left="300" top="200" width="120" height="30" expression="LineSpeed" backColor="white" borderStyle="solid"/>
    <image name="Logo" left="600" top="500" width="100" height="50" imageName="logo.bmp"/>
  </objects>
</display>`

test('parses the display tree', () => {
  const display = parseXml(DISPLAY)
  assert.equal(display.tag, 'display')
  assert.equal(display.attributes.width, '800')
  const objects = display.children.find(child => child.tag === 'objects')
  assert.ok(objects)
  assert.equal(objects.children.length, 5)
})

test('renders background, captions, groups and state colours', () => {
  const svg = renderDisplay(DISPLAY)
  assert.match(svg, /^<svg xmlns=/u)
  assert.match(svg, /viewBox="0 0 800 600"/u)
  assert.match(svg, /fill="#c6c6c6"/u)
  assert.match(svg, />Line overview</u)
  assert.match(svg, />Start</u)
  assert.match(svg, /fill="#b0b0b0"/u)
  assert.match(svg, /translate\(100,100\)/u)
  assert.match(svg, /data-ftv-type="momentaryButton"/u)
  assert.match(svg, /data-ftv-name="Start"/u)
})

test('draws an image from the export by default and a placeholder when it cannot resolve', () => {
  const svg = renderDisplay(DISPLAY)
  assert.match(svg, /<image [^>]*href="Images\/logo\.bmp"/u)
  const placeholder = renderDisplay(DISPLAY, { imageHref: () => undefined })
  assert.match(placeholder, /image logo\.bmp/u)
  const withHref = renderDisplay(DISPLAY, { imageHref: name => `data:image/bmp;base64,${name}` })
  assert.match(withHref, /<image [^>]*href="data:image\/bmp;base64,logo\.bmp"/u)
})

test('renders a tag value instead of the placeholder', () => {
  const svg = renderDisplay(DISPLAY, { tagValues: { LineSpeed: 42.5 } })
  assert.match(svg, />42\.5</u)
})

const GRAPHS = `<?xml version="1.0"?>
<gfx><displaySettings width="400" height="200"/>
<barGraph name="Bar" left="10" top="10" width="200" height="20" backColor="#001C38" borderStyle="line" borderWidth="1" fillColor="#10EB10" minValue="0" maxValue="100" fillDirection="leftToRight" numberOfThresholds="1">
  <connections><connection name="Value" expression="Speed"/></connections>
  <thresh1Value>80</thresh1Value>
</barGraph>
<gauge name="G" left="10" top="50" width="100" height="100" minValue="0" maxValue="100">
  <connections><connection name="Value" expression="Speed"/></connections>
</gauge>
<trend name="T" left="220" top="50" width="150" height="80" backColor="white"/>
<listSelector name="L" left="220" top="140" width="150" height="30" backColor="white" borderStyle="line"><states><state stateId="0"><caption caption="Recipes" alignment="middleLeft"/></state></states></listSelector>
</gfx>`

test('fills a bar graph in proportion to its value and draws its threshold', () => {
  const empty = renderDisplay(GRAPHS)
  assert.match(empty, /<rect x="10" y="10" width="200" height="20" fill="#001c38"/u)
  const half = renderDisplay(GRAPHS, { tagValues: { Speed: 50 } })
  assert.match(half, /<rect x="10" y="10" width="100" height="20" fill="#10eb10"/u)
  assert.match(half, /<line x1="170" y1="10" x2="170" y2="30" stroke="#ff0000"/u)
})

test('draws a gauge needle, a trend grid and a list selector label', () => {
  const svg = renderDisplay(GRAPHS, { tagValues: { Speed: 50 } })
  assert.match(svg, /<path d="M [^"]+" fill="none" stroke="#808080"/u)
  assert.match(svg, /<line x1="60" y1="100"/u)
  assert.match(svg, />trend</u)
  assert.match(svg, />Recipes</u)
  assert.match(svg, /<line x1="220" y1="70" x2="370" y2="70" stroke="#b0b0b0"/u)
})

test('renders the real Laminator display when the export is present', () => {
  const file = 'C:/Users/Admin/AppData/Local/Temp/ftvx_laminator_v2_20261027/Displays/Main Screen.xml'
  if (!existsSync(file)) return
  const svg = renderDisplay(readFileSync(file, 'utf8'))
  assert.ok(svg.length > 5000, `expected a populated SVG, got ${svg.length} bytes`)
  assert.ok(svg.includes('</svg>'))
  const captions = svg.match(/<text /gu)?.length ?? 0
  assert.ok(captions > 10, `expected captions, got ${captions}`)
})

test('evaluates animation comparisons without inventing unknown tags', () => {
  assert.equal(evaluate('{Current_Screen} = 6', { Current_Screen: 6 }), true)
  assert.equal(evaluate('{Current_Screen} = 6', { Current_Screen: 2 }), false)
  assert.equal(evaluate('{Speed} > 100 AND {Run} = 1', { Speed: 120, Run: 1 }), true)
  assert.equal(evaluate('{Speed} > 100', {}), undefined)
})

const REFERENCE = `<gfx><displaySettings width="400" height="200"/>
<group name="Nav" left="10" top="10" isReferenceObject="true" linkBaseObject="Header_Footer.Group3"/>
<panel name="Marker" left="0" top="150" width="20" height="20" backColor="#123456">
  <animations><animateVisibility expression="{Current_Screen}=1" expressionTrueState="visible"/></animations>
</panel></gfx>`

test('resolves a reference object against Global Objects and hides it by animation', () => {
  const base = parseXml('<gfx><group name="Group3"><panel name="BasePanel" left="0" top="0" width="50" height="50" backColor="#abcdef"/></group></gfx>').children[0]
  const hidden = renderDisplay(REFERENCE, { globals: { 'Header_Footer.Group3': base }, tagValues: { Current_Screen: 2 } })
  assert.match(hidden, /fill="#abcdef"/u)
  assert.doesNotMatch(hidden, /fill="#123456"/u)
  const shown = renderDisplay(REFERENCE, { globals: { 'Header_Footer.Group3': base }, tagValues: { Current_Screen: 1 } })
  assert.match(shown, /fill="#123456"/u)
  const unknown = renderDisplay(REFERENCE, { globals: { 'Header_Footer.Group3': base } })
  assert.match(unknown, /fill="#123456"/u, 'an unknown tag leaves the base state visible')
})
test('responsiveSvg overrides the intrinsic size but keeps the viewBox', () => {
  const svg = renderDisplay(DISPLAY)
  const fitted = responsiveSvg(svg)
  assert.match(fitted, /<svg style="width:100%;height:100%;display:block"/u)
  assert.match(fitted, /preserveAspectRatio="xMidYMid meet"/u)
  assert.match(fitted, /viewBox="0 0 800 600"/u)
})
test('draws a circular multistateButton as an ellipse', () => {
  const display = `<gfx><displaySettings width="100" height="100"/><multistateButton name="Lamp" left="10" top="10" width="20" height="20" shape="circle" currentStateId="1" backColor="#00ff00" borderStyle="line" borderWidth="2"><states><state stateId="1" backColor="#00ff00"/></states></multistateButton></gfx>`
  const svg = renderDisplay(display)
  assert.match(svg, /<ellipse [^>]*rx="10" ry="10"/u)
})
test('renders a multistateIndicator banner in its current state', () => {
  const display = `<gfx><displaySettings width="400" height="100"/><multistateIndicator name="Banner" left="0" top="0" width="400" height="40" currentStateId="0" backStyle="solid" borderStyle="line" borderWidth="2"><states><state stateId="Error" backColor="#001C38"/><state stateId="0" backColor="#F5E11B"><caption caption="MANUAL" fontFamily="Arial" fontSize="16" color="black" alignment="topCenter"/></state></states></multistateIndicator></gfx>`
  const svg = renderDisplay(display)
  assert.match(svg, /data-ftv-type="multistateIndicator"/u)
  assert.match(svg, /fill="#f5e11b"/u)
  assert.match(svg, />MANUAL</u)
})
test('detects alarms, tag CSV and batch import files instead of calling them displays', () => {
  const alarms = '<?xml version="1.0"?><alarms version="1.0" id="Alarms"><alarm name="A"/><alarm name="B"/></alarms>'
  assert.equal(detectArtifact(alarms).kind, 'alarms')
  assert.deepEqual(detectArtifact(alarms).details, ['2 alarm definition(s)', 'id: Alarms', 'schema version 1.0'])

  const tags = ';Tag Type, Tag Name\n"D","AutoManual","x"\n"A","Speed","y"'
  assert.equal(detectArtifact(tags).kind, 'tags')
  assert.deepEqual(detectArtifact(tags).details, ['2 tag row(s)'])

  const batch = '<gfxImport><import importFile="A.xml" importType="create" display="A"/></gfxImport>'
  assert.equal(detectArtifact(batch).kind, 'batch')

  assert.equal(detectArtifact('<gfx><displaySettings width="10" height="10"/></gfx>').kind, 'display')
  assert.equal(detectArtifact('hello').kind, 'unknown')
})