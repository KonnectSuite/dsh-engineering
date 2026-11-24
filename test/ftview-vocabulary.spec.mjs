/**
 * The display vocabulary a FactoryTalk View ME draft is written against.
 *
 * This is the gate on the defect that made the owner's complaint: the object
 * list the drafting tools accepted was kept by hand, and it had drifted — it
 * offered eight element names no ME schema declares (`trend`, `recipe`,
 * `numericInput`, `stringInput`, `listSelector`, `maintainButton`,
 * `globalObject`, `referenceObject`) and refused sixty-five real ones, so an
 * agent discovered the mistake in Studio, at import, after the draft was built.
 * The vocabulary now comes from the schema: this host's installed `Gfx-ME*.xsd`
 * when Studio is here, the snapshot committed beside the payload otherwise.
 *
 * Four things this checks:
 *
 *   1. the resolver reads a schema the way the vendor writes one, proved against
 *      a miniature schema written to exercise each of the four shapes a naive
 *      XSD walk gets wrong (test/fixtures/vocabulary/Gfx-ME99.xsd);
 *   2. the committed snapshot carries the real ME element names and none of the
 *      eight invented ones, and the craft hints name vocabulary it declares;
 *   3. a host with no Studio falls back to the snapshot instead of refusing to
 *      draft, because reads and drafts must work without the vendor software;
 *   4. the replay: 2,555 attribute pairs and the child sets harvested from 125
 *      Rockwell-authored display files — every ME demo application installed on
 *      this host, as ftview_export wrote them — are refused nowhere by the
 *      draft-time check (test/fixtures/vocabulary/vendor-usage.json); the check
 *      that stops a bad draft must never stop a vendor-shaped one.
 *
 * Run with: node --import tsx --test test/ftview-vocabulary.spec.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { bundledSchema, defaultSchemaVersion, schemaDirectory, vocabulary } from '../packages/ftview/lib/schema.js'
import { PHANTOM_HINTS } from '../packages/ftview/lib/catalog.js'
import { checkDraftChild, checkDraftCombos, checkDraftObject, checkStateFaces, displayType, faceFieldHome, nearNames, objectFamily, parseSchemaModel, stateIdAllowed } from '../packages/ftview/lib/xsd.js'

/** The eight names that were offered and do not exist in any ME schema. */
const PHANTOMS = ['globalObject', 'listSelector', 'maintainButton', 'numericInput', 'recipe', 'referenceObject', 'stringInput', 'trend']

const fixture = readFileSync(fileURLToPath(new URL('../packages/ftview/test/fixtures/vocabulary/Gfx-ME99.xsd', import.meta.url)), 'utf8')
const vendorUsage = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/ftview/test/fixtures/vocabulary/vendor-usage.json', import.meta.url)), 'utf8'))

describe('the schema resolver reads a vendor schema as written', () => {
  const model = parseSchemaModel('Gfx-ME99.xsd', fixture)

  it('takes the display vocabulary from the root element inline complexType', () => {
    // A walk of the top-level elements finds only `gfx`: the object elements are
    // declared inside the root's own anonymous complexType, which is where the
    // first version of this resolver looked and found nothing.
    assert.deepEqual(model.displayChildren, ['activeX', 'key', 'label', 'listIndicator', 'navButton', 'polygon', 'pressButton', 'symbol'])
    assert.equal(model.elements.pressButton, 'pressButtonType')
    assert.equal(model.elements.displaySettings, undefined)
    assert.equal(model.version, 99)
    assert.equal(model.schema, 'Gfx-ME99.xsd')
  })

  it('merges the base chain, the attribute group and the global refs', () => {
    const press = displayType(model, 'pressButton')
    assert.ok(press !== undefined)
    // The base chain supplies the geometry every display object carries.
    for (const name of ['name', 'left', 'top', 'width', 'height']) assert.ok(press.attributes[name] !== undefined, name)
    // The attribute group supplies the rest.
    for (const name of ['color', 'fontFamily']) assert.ok(press.attributes[name] !== undefined, name)
    assert.equal(press.attributes.highlightColor.type, 'string')
    // A requirement written on the ref, not on the global declaration, survives
    // the merge: this is the only way activeX's classId becomes mandatory.
    assert.equal(displayType(model, 'activeX').attributes.classId.required, true)
    assert.equal(press.attributes.classId, undefined)
    assert.equal(press.attributes.name.required, true)
  })

  it('resolves allowed values from a named type and an inline restriction', () => {
    const press = displayType(model, 'pressButton')
    assert.deepEqual(press.attributes.buttonAction.values, ['normallyOpen', 'normallyClosed', 'value'])
    assert.equal(press.attributes.buttonAction.default, 'normallyOpen')
    // The key's values live in an inline restriction on a global declaration.
    assert.deepEqual(displayType(model, 'key').attributes.keyAction.values, ['unassigned', 'F1', 'F2'])
  })

  it('honours a pattern facet, which is how the vendor spells a hex colour', () => {
    // The vendor's colorType is a union of a `#rrggbb` pattern and 147 named
    // colours. A resolver that reads only the enumeration refuses every colour
    // written in a Rockwell-authored display, which is what this test guards.
    const color = displayType(model, 'pressButton').attributes.color
    assert.deepEqual(color.patterns, ['#[a-fA-F0-9]*'])
    assert.deepEqual(color.values, ['white', 'black', 'red'])
    const kinds = (element, attributes) => checkDraftObject(model, element, attributes, [], { requireAll: false }).map(finding => `${finding.kind}:${finding.name}`)
    assert.deepEqual(kinds('pressButton', [['color', '#002952']]), [])
    assert.deepEqual(kinds('pressButton', [['color', '#FFF']]), [])
    assert.deepEqual(kinds('pressButton', [['color', 'white']]), [])
    assert.deepEqual(kinds('pressButton', [['color', 'not a colour']]), ['invalid-value:color'])
  })

  it('descends nested containers for children and their types', () => {
    const press = displayType(model, 'pressButton')
    assert.deepEqual(press.children, ['states', 'connections'])
    assert.equal(press.childTypes.states, 'pushStateListType')
    assert.equal(press.childTypes.connections, 'connectionListType')
    // Three levels deep, the way the vendor spells a push button: the list holds
    // the face type, and the face type names its own caption type.
    assert.equal(model.types[press.childTypes.states].childTypes.state, 'pushStateType')
    assert.equal(model.types.pushStateType.childTypes.caption, 'pushFaceCaptionType')
    // The state-id domain is two levels below the object, and it is a union: an
    // enumeration half (`Error`) and a bounded number half.
    const family = objectFamily(model, 'pressButton')
    assert.equal(family.states, true)
    assert.equal(family.connections, true)
    assert.deepEqual(family.stateId.values, ['Error'])
    assert.equal(family.stateId.max, 1)
    assert.equal(stateIdAllowed(family, 'Error'), true)
    assert.equal(stateIdAllowed(family, '1'), true)
    assert.equal(stateIdAllowed(family, '7'), false)
  })

  it('separates the parts from the objects, which is what a hand-count confused', () => {
    for (const part of ['caption', 'connections', 'states']) assert.ok(model.parts.includes(part), part)
    for (const element of model.displayChildren) assert.equal(model.parts.includes(element), false)
  })

  it('chooses the caption shape from the schema, not from a rule of thumb', () => {
    // A navigation button carries its words in a <caption> child and declares no
    // caption attribute; a label is the other way round. The hand-kept lists got
    // both of these wrong for dozens of types.
    const nav = objectFamily(model, 'navButton')
    assert.equal(nav.captionChild, true)
    assert.equal(nav.captionAttribute, false)
    assert.equal(nav.states, false)
    const label = objectFamily(model, 'label')
    assert.equal(label.captionAttribute, true)
    assert.equal(label.captionChild, false)
    assert.equal(label.states, false)
  })

  it('refuses what the fixture forbids and nothing else', () => {
    const kinds = findings => checkDraftObject(model, findings.element, findings.attributes, findings.children, { requireAll: false }).map(finding => `${finding.kind}:${finding.name}`)
    assert.deepEqual(kinds({ element: 'pressButton', attributes: [['higlightColor', '#FFFFFF']], children: [] }), ['unknown-attribute:higlightColor'])
    assert.deepEqual(kinds({ element: 'pressButton', attributes: [['buttonAction', 'set']], children: [] }), ['invalid-value:buttonAction'])
    assert.deepEqual(kinds({ element: 'label', attributes: [], children: ['states'] }), ['unknown-child:states'])
    assert.deepEqual(kinds({ element: 'navButton', attributes: [['caption', 'Next']], children: [] }), ['unknown-attribute:caption'])
    // A clean object of each family answers nothing at all.
    assert.deepEqual(kinds({ element: 'pressButton', attributes: [['buttonAction', 'value'], ['color', 'white']], children: ['states', 'connections'] }), [])
    assert.deepEqual(kinds({ element: 'label', attributes: [['caption', 'Hello']], children: [] }), [])
    // The required attribute only appears to a caller that asks for the whole set:
    // a draft may carry a partial object the engineer means to finish, so the
    // draft path does not block on it and the vendor gate at apply does.
    assert.deepEqual(
      checkDraftObject(model, 'activeX', [['name', 'Web']], [], { requireAll: true }).map(finding => finding.name),
      ['classId'],
    )
    assert.deepEqual(checkDraftObject(model, 'activeX', [['name', 'Web']], [], { requireAll: false }), [])
  })

  it('says nothing about an element the schema does not declare', () => {
    // An older export keeps its displays in a <display> document whose objects
    // are generic elements the ME schema never described: the file's own shape
    // is the contract there, so the checker stays quiet and the writer defers.
    assert.deepEqual(checkDraftObject(model, 'Object', [['anything', '1']], []), [])
    assert.equal(displayType(model, 'Object'), undefined)
    assert.equal(objectFamily(model, 'Object'), undefined)
  })

  it('routes each state-face field to the element this control declares it on', () => {
    // The tool used to write one push-button face onto every control. The vendor
    // refused it on the four list and control selectors and on the symbol, so the
    // face is now assembled per control: each field goes where THIS type declares
    // it, and a field it declares nowhere is left out rather than invented.
    const list = objectFamily(model, 'listIndicator')
    assert.equal(list.states, true)
    assert.equal(faceFieldHome(list, 'stateId')?.where, 'state')
    assert.equal(faceFieldHome(list, 'value')?.where, 'state')
    assert.equal(faceFieldHome(list, 'caption')?.where, 'caption')
    // This caption child declares two attributes and an alignment of
    // left|center|right: the font size, the colours and the blink the writer used
    // to blanket onto every face have no home here, and writing them was the error.
    for (const field of ['fontSize', 'color', 'backColor', 'borderColor', 'blink']) {
      assert.equal(faceFieldHome(list, field), undefined, `${field} has nowhere to go on a list indicator`)
    }
    // A symbol's face carries an <imageSettings> and no caption at all.
    const symbol = objectFamily(model, 'symbol')
    assert.equal(symbol.faceCaptionType, undefined, 'the schema gives a symbol face no <caption> child')
    assert.equal(symbol.faceImageType !== undefined, true)
    assert.equal(faceFieldHome(symbol, 'caption'), undefined)
    assert.equal(faceFieldHome(symbol, 'color')?.where, 'image')
    // The fixture's press-button face declares a caption child and nothing else.
    const press = objectFamily(model, 'pressButton')
    assert.equal(press.faceCaptionType !== undefined, true)
    assert.equal(faceFieldHome(press, 'caption')?.where, 'caption')
  })

  it('reports a face field the control does not declare, before anything is written', () => {
    // The refusal that used to arrive from Studio at import now arrives from
    // ftview_draft_object_add, and names the face so the caller can find it.
    const list = objectFamily(model, 'listIndicator')
    const named = faces => checkStateFaces(list, faces).map(finding => `${finding.kind}:${finding.name}`)
    assert.deepEqual(
      named([{ stateId: '0', caption: 'Item', fontSize: 14, color: 'white', backColor: '#24384A' }]),
      ['unknown-attribute:state[0].fontSize', 'unknown-attribute:state[0].color', 'unknown-attribute:state[0].backColor'],
    )
    // What this face does declare answers nothing, and a value outside its domain
    // is still refused.
    assert.deepEqual(named([{ stateId: '0', caption: 'Item', value: 3 }]), [])
    assert.deepEqual(named([{ stateId: '9', caption: 'Item' }]), ['invalid-value:state[0].stateId'])
    // Words on a face that carries none: the symbol case.
    assert.deepEqual(checkStateFaces(objectFamily(model, 'symbol'), [{ stateId: '0', caption: 'No' }]).map(finding => finding.name), ['state[0].caption'])
    // A control with no state faces at all cannot be given them.
    assert.deepEqual(checkStateFaces(objectFamily(model, 'label'), [{ stateId: '0' }]).map(finding => `${finding.kind}:${finding.name}`), ['unknown-child:states'])
  })

  it('names a required part the draft omits, which is how polyPolygon was unauthorable', () => {
    // The fixture's polygon declares one child with no minOccurs, which XSD reads
    // as required — the shape of polyPolygon's <innerPolygon>. Until the tool could
    // write a part, this object could not be drafted at all: the writer had no way
    // to satisfy the content model, so the vendor validator refused every attempt.
    assert.deepEqual(displayType(model, 'polygon').requiredChildren, ['innerPart'])
    const kinds = children => checkDraftObject(model, 'polygon', [['name', 'Shape']], children, { requireAll: false }).map(finding => `${finding.kind}:${finding.name}`)
    assert.deepEqual(kinds([]), ['missing-child:innerPart'])
    assert.deepEqual(kinds(['innerPart']), [])
    // An optional child stays silent, so the check cannot block an ordinary object.
    assert.deepEqual(checkDraftObject(model, 'pressButton', [['name', 'Go']], [], { requireAll: false }), [])
    // A part the type declares no such child for is refused where the draft is
    // staged, and naming it does not answer the required part: both findings come
    // back, because the object is still missing the content the schema demands.
    assert.deepEqual(kinds(['notAChild']), ['unknown-child:notAChild', 'missing-child:innerPart'])
    // The part's own attributes are checked against the type the parent declares.
    assert.deepEqual(
      checkDraftChild(model, 'polygon', 'innerPart', [['polygon', '0,0 100,0 100,100'], ['bogus', 'x']]).map(finding => `${finding.kind}:${finding.name}`),
      ['unknown-attribute:innerPart.bogus'],
    )
    assert.deepEqual(checkDraftChild(model, 'polygon', 'innerPart', [['polygon', '0,0 100,0 100,100']]), [])
  })

  it('suggests the name that was probably meant', () => {
    // The eight invented names each have a real ME counterpart an agent reaches
    // for by mistake; the refusal has to name it or the next call repeats them.
    assert.deepEqual(nearNames('maintainButton', ['maintainedButton', 'latchedButton', 'text']), ['maintainedButton'])
    assert.deepEqual(nearNames('numericInput', ['numericInputEnable', 'numericInputCursorPoint', 'numericDisplay']), ['numericInputEnable', 'numericInputCursorPoint'])
    assert.deepEqual(nearNames('tred', ['trendPauseButton']), [])
  })
})

describe('the committed snapshot', () => {
  const snapshot = bundledSchema()

  it('is readable and names a real ME schema', () => {
    assert.ok(snapshot !== undefined, 'packages/ftview/schema/me-schema.json must ship with the payload')
    assert.match(snapshot.schema, /^Gfx-ME\d+\.xsd$/u)
    assert.ok(snapshot.version >= 15, `snapshot version ${snapshot.version}`)
  })

  it('declares the element names the vendor really uses and none of the invented ones', () => {
    // The types the shipped BlockMachine Demo actually carries, including the
    // ones the hand-kept list refused.
    for (const name of ['closeButton', 'macroButton', 'maintainedButton', 'interlockedButton', 'numericInputEnable', 'stringInputEnable', 'displayListSelector', 'controlListSelector', 'pilotedControlListSelector', 'recipePlusTable', 'scale', 'listIndicator', 'alarmList', 'activeX']) {
      assert.ok(snapshot.displayChildren.includes(name), `${name} is missing from the vocabulary`)
    }
    for (const phantom of PHANTOMS) assert.equal(snapshot.displayChildren.includes(phantom), false, `${phantom} is not an ME element`)
    // ME16 declares 91 display elements; a regeneration must not lose any.
    assert.ok(snapshot.displayChildren.length >= 91, `only ${snapshot.displayChildren.length} display elements`)
  })

  it('answers the invented names with vocabulary the schema declares', () => {
    assert.deepEqual(Object.keys(PHANTOM_HINTS).sort(), [...PHANTOMS].sort())
    // A hint redirects to an element name — except for referenceObject, whose
    // mechanism is real but lives in ATTRIBUTES (isReferenceObject, linkBaseObject),
    // so the hint names those instead.
    const attributes = new Set()
    for (const type of Object.values(snapshot.types)) for (const name of Object.keys(type.attributes)) attributes.add(name)
    for (const [phantom, hint] of Object.entries(PHANTOM_HINTS)) {
      const named = snapshot.displayChildren.filter(name => hint.includes(name)).length
      const namedAttributes = [...attributes].filter(name => hint.includes(name)).length
      assert.ok(named + namedAttributes > 0, `${phantom} hint names nothing the schema declares: ${hint}`)
      assert.equal(snapshot.displayChildren.includes(phantom), false)
    }
  })

  it('carries the caption and state-face facts the craft guide claims', () => {
    // These four claims were wrong in the hand-written guide and each one is a
    // display Studio would have refused or silently re-written.
    const text = objectFamily(snapshot, 'text')
    assert.equal(text.captionAttribute, true)
    assert.equal(text.captionChild, false)
    for (const name of ['gotoButton', 'closeButton', 'macroButton', 'rampButton']) {
      const family = objectFamily(snapshot, name)
      assert.equal(family.captionChild, true, `${name} carries a <caption> child`)
      assert.equal(family.states, false, `${name} carries no <states>`)
    }
    for (const name of ['momentaryButton', 'maintainedButton', 'multistateButton', 'interlockedButton']) {
      assert.equal(objectFamily(snapshot, name).states, true, `${name} carries <states>`)
    }
    // The one schema-mandatory attribute among the display objects.
    assert.equal(displayType(snapshot, 'activeX').attributes.classId.required, true)
  })

  it('keeps the state-face domains per family, which a blanket rule got wrong', () => {
    const push = objectFamily(snapshot, 'momentaryButton')
    assert.equal(stateIdAllowed(push, 'Error'), true)
    assert.equal(stateIdAllowed(push, '1'), true)
    assert.equal(stateIdAllowed(push, '2'), false, 'a push button has one face pair, not three')
    const multi = objectFamily(snapshot, 'multistateButton')
    assert.equal(stateIdAllowed(multi, '200'), true, 'a multistate button takes far more than three faces')
    const interlocked = objectFamily(snapshot, 'interlockedButton')
    assert.equal(stateIdAllowed(interlocked, 'Error'), false, 'the schema forbids an Error face here')
  })

  it('writes each face where the installed schema declares it', () => {
    // The measured failure: the writer emitted one push-button face for every
    // control, and the installed editor refused the four list and control
    // selectors and the symbol — 141 of the 142 errors it reported for a draft of
    // the whole object library. These are the shapes that caused it, read from the
    // vendor schema on this host, and the face the writer now builds per control.
    const pushFace = [{ stateId: '0', caption: 'Start', value: 0, fontSize: 14, color: 'white', backColor: '#24384A', borderColor: '#0E1620', blink: false }]
    const push = objectFamily(snapshot, 'momentaryButton')
    assert.deepEqual(checkStateFaces(push, pushFace), [], 'a push-button face is legal on a push button, so nothing is reported')
    assert.ok(push.faceCaptionType.attributes.fontFamily, 'its caption does declare the font set')
    assert.ok(push.faceCaptionType.attributes.fontSize)
    assert.ok(push.faceCaptionType.attributes.alignment.values.includes('middleCenter'), 'and this alignment')
    assert.equal(push.faceImageType !== undefined, true)
    // A list indicator's face is a different shape entirely: two attributes on the
    // state, and a caption that declares no font at all and only three alignments.
    const list = objectFamily(snapshot, 'listIndicator')
    assert.deepEqual(Object.keys(list.stateType.attributes), ['value', 'stateId'])
    assert.deepEqual(list.faceCaptionType.attributes.alignment.values, ['left', 'center', 'right'])
    for (const name of ['caption', 'blink', 'color', 'backColor', 'backStyle']) {
      assert.ok(list.faceCaptionType.attributes[name], `its caption declares ${name}`)
    }
    for (const name of ['fontFamily', 'fontSize']) {
      assert.equal(list.faceCaptionType.attributes[name], undefined, `its caption declares no ${name}`)
    }
    // So the same face that is legal on a push button is refused here, and the two
    // fields with nowhere to go are named before anything is written.
    assert.deepEqual(
      checkStateFaces(list, pushFace).map(finding => `${finding.kind}:${finding.name}`),
      ['unknown-attribute:state[0].fontSize', 'unknown-attribute:state[0].borderColor'],
    )
    // A symbol's faces carry an <imageSettings> and no caption, so words cannot go
    // there at all — the vendor said so with "expected: 'imageSettings'". Its state
    // does take borderColor, and its imageSettings takes the colours and the blink,
    // so only the caption and the font size have nowhere to go.
    const symbol = objectFamily(snapshot, 'symbol')
    assert.equal(symbol.faceCaptionType, undefined)
    assert.equal(symbol.faceImageType !== undefined, true)
    assert.deepEqual(checkStateFaces(symbol, pushFace).map(finding => finding.name), ['state[0].caption', 'state[0].fontSize'])
  })

  it('records required children, which is how polyPolygon was unauthorable', () => {
    // polyPolygon declares <innerPolygon> with no minOccurs, so XSD reads it as
    // required, and the tool had no way to write a part: every draft of it was
    // incomplete content the vendor validator refused. The same field now says a
    // gauge's <threshold> is optional, which keeps that check from blocking an
    // object that is fine without it.
    assert.deepEqual(displayType(snapshot, 'polyPolygon').requiredChildren, ['innerPolygon'])
    assert.equal(displayType(snapshot, 'gauge').requiredChildren.includes('threshold'), false)
  })
})

describe('a host with no Studio still drafts', () => {
  const previous = process.env.FTVIEW_SCHEMA_DIR
  try {
    process.env.FTVIEW_SCHEMA_DIR = fileURLToPath(new URL('../packages/ftview/test/fixtures/vocabulary/nope', import.meta.url))
    const fallback = vocabulary()
    it('falls back to the snapshot and says so', () => {
      assert.equal(fallback.source, 'bundled')
      assert.equal(fallback.model.schema, bundledSchema().schema)
      assert.match(defaultSchemaVersion(), /^\d+$/u)
    })
    it('refuses an invented element against the fallback, before anything is written', () => {
      assert.equal(fallback.model.displayChildren.includes('trend'), false)
      assert.ok(nearNames('maintainButton', fallback.model.displayChildren).includes('maintainedButton'))
    })
  } finally {
    if (previous === undefined) delete process.env.FTVIEW_SCHEMA_DIR
    else process.env.FTVIEW_SCHEMA_DIR = previous
  }

  it('prefers the vendor schema when this host has one', () => {
    // The vendor software is the authority for what it will accept, so an
    // installed schema outranks the snapshot; on a machine without Studio the
    // block above is the path that runs.
    if (schemaDirectory() === undefined) return
    const installed = vocabulary()
    assert.equal(installed.source, 'installed')
    assert.notEqual(installed.model, bundledSchema())
  })
})

describe('the vendor replay', () => {
  const snapshot = bundledSchema()
  const pairs = object => [
    ...object.names.map(name => [name, '1']),
    ...Object.entries(object.values).flatMap(([name, values]) => values.map(value => [name, value])),
  ]

  it('carries a vendor sample for the elements the vendor really ships', () => {
    // 75 of the 91 declared elements appear in Rockwell's own demo applications.
    // The remaining 16 — gauge, symbol, wedge, latchedButton, backspaceKey,
    // timeAndDateDisplay, localMessageDisplay, the alarm-status and print objects,
    // the two list selectors, sortAlarmsButton, resetAlarmStatusButton,
    // displayPrintButton — are exercised by the Studio probe pass instead, which
    // drafts them and imports them into the real editor.
    for (const object of vendorUsage.objects) {
      assert.ok(snapshot.displayChildren.includes(object.type), `${object.type} is not a declared display element`)
      assert.ok(object.objects > 0, `${object.type} carries no object sample`)
    }
    assert.ok(vendorUsage.objects.length >= 70, `only ${vendorUsage.objects.length} element types have a vendor sample`)
  })

  it('refuses nothing Rockwell-authored', () => {
    // 2,555 attribute pairs and the child sets harvested from 125 display files:
    // the Displays folder of every ME demo application installed on this host,
    // as ftview_export wrote them. The draft-time check is only safe because this
    // holds: it stops a mistaken name and lets through anything a vendor tool
    // actually wrote.
    let checked = 0
    const findings = []
    for (const object of vendorUsage.objects) {
      const found = checkDraftObject(snapshot, object.type, pairs(object), object.children, { requireAll: false })
      checked += pairs(object).length
      for (const finding of found) findings.push(`${object.type} ${finding.kind} ${finding.name}: ${finding.message}`)
    }
    assert.ok(checked >= 2500, `only ${checked} attribute pairs replayed`)
    assert.deepEqual(findings, [])
  })

  it('still refuses a wrong value on a type the vendor uses', () => {
    // The replay must not have blinded the value check: the vendor's own value
    // for an enumerated attribute is accepted, and the neighbour is not.
    const text = vendorUsage.objects.find(object => object.type === 'text')
    const declared = displayType(snapshot, 'text').attributes
    const enumerated = Object.keys(declared).find(name => declared[name].values !== undefined && (text.values[name]?.length ?? 0) > 0)
    assert.ok(enumerated !== undefined, 'no enumerated attribute to replay on text')
    const legal = text.values[enumerated][0]
    assert.deepEqual(checkDraftObject(snapshot, 'text', [[enumerated, legal]], [], { requireAll: false }), [])
    const wrong = checkDraftObject(snapshot, 'text', [[enumerated, 'definitely-not-a-value']], [], { requireAll: false })
    assert.deepEqual(wrong.map(finding => finding.kind), ['invalid-value'])
  })
})

describe('property combinations the editor refuses beyond the schema', () => {
  // A draft of all 91 object types validated clean against Gfx-ME16.xsd and
  // SEAddComponent still refused eleven properties and dropped one object while
  // importing it. These rules are each measured from that import: the vendor
  // line quoted, the boundary drawn where the import showed it holding.
  const snapshot = bundledSchema()
  const named = findings => findings.map(finding => `${finding.kind}:${finding.name}`)

  it('refuses cornerRadius on a square button and accepts it on a round one', () => {
    // Measured: the editor wrote "The 'cornerRadius' property cannot be set
    // while 'style' is set to 'rectangle'." for three drafted buttons and
    // dropped the property from a fourth with no message at all.
    assert.deepEqual(named(checkDraftCombos(snapshot, 'momentaryButton', [['shape', 'rectangle'], ['cornerRadius', '0']])), ['engine-constraint:cornerRadius'])
    assert.deepEqual(named(checkDraftCombos(snapshot, 'momentaryButton', [['shape', 'rounded rectangle'], ['cornerRadius', '8']])), [])
    // The XML attribute is shape; the editor calls it style in its own message.
    assert.match(checkDraftCombos(snapshot, 'momentaryButton', [['shape', 'rectangle'], ['cornerRadius', '0']])[0].message, /'shape' is set to 'rectangle'/u)
  })

  it('refuses a face value on a normally-open button, drafted or defaulted', () => {
    // Measured twice on momentaryButton: the refusal landed on the <state> lines
    // while the object carried buttonAction="normallyOpen". The schema defaults
    // that attribute to normallyOpen, so omitting it is the same editor state.
    const faces = [{ stateId: '0', value: 0 }, { stateId: '1', value: 1 }]
    assert.deepEqual(named(checkDraftCombos(snapshot, 'momentaryButton', [['buttonAction', 'normallyOpen']], [], faces)), ['engine-constraint:value'])
    assert.deepEqual(named(checkDraftCombos(snapshot, 'momentaryButton', [], [], faces)), ['engine-constraint:value'])
    assert.match(checkDraftCombos(snapshot, 'momentaryButton', [], [], faces)[0].message, /defaults to normallyOpen/u)
    assert.deepEqual(named(checkDraftCombos(snapshot, 'momentaryButton', [['buttonAction', 'normallyClosed']], [], faces)), [])
    // multistateButton faces carry value and the type declares no buttonAction,
    // so the rule must not reach it.
    assert.deepEqual(named(checkDraftCombos(snapshot, 'multistateButton', [], [], faces)), [])
  })

  it('refuses decimal-point properties while the point is implicit', () => {
    // Measured on numericInputEnable: both properties refused in one import.
    assert.deepEqual(
      named(checkDraftCombos(snapshot, 'numericInputEnable', [['decimalPoint', 'implicit'], ['digitsAfterDecimalPoint', '0'], ['fixedPosition', 'displayed']])),
      ['engine-constraint:digitsAfterDecimalPoint', 'engine-constraint:fixedPosition'],
    )
    // Without decimalPoint the editor sees its own default, and the properties
    // were accepted in the vendor-authored displays, so nothing is claimed.
    assert.deepEqual(named(checkDraftCombos(snapshot, 'numericInputEnable', [['digitsAfterDecimalPoint', '0']])), [])
  })

  it('refuses setLastStateId at or below the highest face, accepting above it', () => {
    // Measured boundary, not the vendor wording: five objects were refused at
    // setLastStateId=2 against faces 0,1,2 — equal refused — while 9 and 25
    // above the faces were accepted.
    const faces = [{ stateId: '0' }, { stateId: '1' }, { stateId: '2' }]
    assert.deepEqual(named(checkDraftCombos(snapshot, 'controlListSelector', [['setLastStateId', '2']], [], faces)), ['engine-constraint:setLastStateId'])
    assert.deepEqual(named(checkDraftCombos(snapshot, 'controlListSelector', [['setLastStateId', '1']], [], faces)), ['engine-constraint:setLastStateId'])
    assert.deepEqual(named(checkDraftCombos(snapshot, 'controlListSelector', [['setLastStateId', '9']], [], faces)), [])
    // A named face id such as Error has no numeric order to compare against.
    assert.deepEqual(named(checkDraftCombos(snapshot, 'momentaryButton', [['setLastStateId', '2']], [], [{ stateId: 'Error' }])), [])
  })

  it('refuses a polyPolygon the editor would drop for one inner polygon', () => {
    // The schema requires one <innerPolygon>; the editor required two and
    // dropped the whole object that carried one.
    assert.deepEqual(named(checkDraftCombos(snapshot, 'polyPolygon', [], ['innerPolygon'])), ['engine-constraint:innerPolygon'])
    assert.deepEqual(named(checkDraftCombos(snapshot, 'polyPolygon', [], ['innerPolygon', 'innerPolygon'])), [])
  })

  it('claims nothing on types that do not declare the properties', () => {
    // The rules are gated on the type declaring the properties, so a text
    // object carrying the same names is left to the attribute check alone.
    assert.deepEqual(named(checkDraftCombos(snapshot, 'text', [['shape', 'rectangle'], ['cornerRadius', '4'], ['buttonAction', 'normallyOpen'], ['decimalPoint', 'implicit'], ['setLastStateId', '2']])), [])
  })
})
