/**
 * Regenerate the committed DXF fixtures.
 *
 * Run from the repository root with:
 *   node packages/ecad/test/fixtures/generate.mjs
 *
 * The fixtures are built with the same data-model version the engine parses, so
 * a fixture is always a file the engine can read. Customer drawings are never
 * copied here; these are synthetic drawings shaped like the real ones.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AcCmColor,
  AcDbArc,
  AcDbAttribute,
  AcDbAttributeDefinition,
  AcDbBlockReference,
  AcDbBlockTableRecord,
  AcDbCircle,
  AcDbDatabase,
  AcDbEllipse,
  AcDbHatch,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbMText,
  AcDbPoint,
  AcDbPolyline,
  AcDbRay,
  AcDbSolid,
  AcDbText,
  AcGePolyline2d,
  AcGePoint2d,
  AcGePoint3d
} from '@mlightcad/data-model'

const here = dirname(fileURLToPath(import.meta.url))

/** Write one drawing to `<name>.dxf`. */
function write(name, db) {
  const text = db.dxfOut(undefined, 16, 'AC1032')
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text
  writeFileSync(join(here, `${name}.dxf`), bytes)
  console.log(`${name}.dxf`, bytes.byteLength, 'bytes')
}

/** Add a layer with an ACI colour. */
function layer(db, name, colorIndex) {
  const record = new AcDbLayerTableRecord({ name })
  const color = new AcCmColor()
  color.colorIndex = colorIndex
  record.color = color
  db.tables.layerTable.add(record)
  return record
}

/** Add a block definition and return its record. */
function block(db, name) {
  const record = new AcDbBlockTableRecord({ name })
  db.tables.blockTable.add(record)
  return record
}

/** Add an ATTDEF to a block definition. */
function attdef(record, tag, text, position, height = 0.1, hidden = false) {
  const definition = new AcDbAttributeDefinition()
  definition.tag = tag
  definition.textString = text
  definition.position = position
  definition.height = height
  definition.isInvisible = hidden
  record.appendEntity(definition)
  return definition
}

/** Add a simple TEXT to a block table record. */
function text(record, value, x, y, height = 0.1, layerName = '0', rotation = 0) {
  const entity = new AcDbText()
  entity.textString = value
  entity.position = new AcGePoint3d(x, y, 0)
  entity.height = height
  entity.rotation = rotation
  entity.layer = layerName
  record.appendEntity(entity)
  return entity
}

/** The WD_M drawing-properties block, with the attributes the profile reads. */
function wdM(db) {
  const record = block(db, 'WD_M')
  const values = [
    ['WIRELAYS', 'WIRES'],
    ['WIREFIXED_LAY', 'WIREFIXED'],
    ['XREF_LAY', 'XREF'],
    ['LOC_LAY', 'LOC'],
    ['TAG_LAY', 'TAGS'],
    ['TAGFMT', '%F%N'],
    ['XREFFMT', '%N'],
    ['PLC_STYLE', '1'],
    ['WIREFMT', '%N'],
    ['WIRENO_LAY', 'WIRENO']
  ]
  values.forEach(([tag, value], index) => {
    attdef(record, tag, value, new AcGePoint3d(0, -index * 0.2, 0), 0.1, true)
  })
  const insert = new AcDbBlockReference('WD_M')
  insert.position = new AcGePoint3d(0, 0, 0)
  db.tables.blockTable.modelSpace.appendEntity(insert)
  values.forEach(([tag, value], index) => {
    const attribute = new AcDbAttribute()
    attribute.tag = tag
    attribute.textString = value
    attribute.position = new AcGePoint3d(0, -index * 0.2, 0)
    attribute.height = 0.1
    attribute.isInvisible = true
    insert.appendAttributes(attribute)
  })
  return record
}

// ---------------------------------------------------------------------------
// tiny.dxf — one of every supported kind, a block insert, an unsupported RAY.
// ---------------------------------------------------------------------------
{
  const db = new AcDbDatabase()
  db.createDefaultData()
  layer(db, 'TITLE_BLOCK', 7)
  layer(db, 'WIRES', 5)
  layer(db, 'TEXT', 2)
  const model = db.tables.blockTable.modelSpace

  text(model, 'TINY %%d SHEET %%p1 %%c3 %%uUNDER', 1, 9, 0.25, 'TITLE_BLOCK')
  text(model, 'MICRO', 1, 8.6, 0.02, '0')
  text(model, 'ROTATED', 1, 8, 0.2, 'TEXT', Math.PI / 2)

  const line = new AcDbLine(new AcGePoint3d(0, 0, 0), new AcGePoint3d(10, 0, 0))
  model.appendEntity(line)
  const diagonal = new AcDbLine(new AcGePoint3d(0, 0, 0), new AcGePoint3d(3, 4, 0))
  diagonal.layer = 'WIRES'
  model.appendEntity(diagonal)

  const polyline = new AcDbPolyline()
  polyline.addVertexAt(0, new AcGePoint2d(0, 2), 0)
  polyline.addVertexAt(1, new AcGePoint2d(2, 2), 0)
  polyline.addVertexAt(2, new AcGePoint2d(2, 4), 0.4)
  polyline.closed = true
  polyline.layer = 'WIRES'
  model.appendEntity(polyline)

  const circle = new AcDbCircle()
  circle.center = new AcGePoint3d(5, 5, 0)
  circle.radius = 1.5
  model.appendEntity(circle)

  const arc = new AcDbArc()
  arc.center = new AcGePoint3d(8, 5, 0)
  arc.radius = 2
  arc.startAngle = 0.2
  arc.endAngle = 2.4
  model.appendEntity(arc)

  const ellipse = new AcDbEllipse(new AcGePoint3d(12, 5, 0), new AcGePoint3d(0, 0, 1), new AcGePoint3d(1, 0, 0), 2, 0.8, 0, Math.PI * 2)
  model.appendEntity(ellipse)

  const partialEllipse = new AcDbEllipse(new AcGePoint3d(12, 8, 0), new AcGePoint3d(0, 0, 1), new AcGePoint3d(0, 1, 0), 1.5, 0.5, 0, 2)
  model.appendEntity(partialEllipse)

  const point = new AcDbPoint()
  point.position = new AcGePoint3d(15, 2, 0)
  model.appendEntity(point)

  const solid = new AcDbSolid()
  solid.setPointAt(0, new AcGePoint3d(16, 0, 0))
  solid.setPointAt(1, new AcGePoint3d(17, 0, 0))
  solid.setPointAt(2, new AcGePoint3d(17, 1, 0))
  solid.setPointAt(3, new AcGePoint3d(16, 0, 0))
  model.appendEntity(solid)

  const hatch = new AcDbHatch()
  hatch.isSolidFill = true
  const loop = new AcGePolyline2d([new AcGePoint2d(18, 0), new AcGePoint2d(20, 0), new AcGePoint2d(20, 2), new AcGePoint2d(18, 2)], true)
  hatch.add(loop)
  model.appendEntity(hatch)

  const mtext = new AcDbMText()
  mtext.contents = 'MTEXT {\\fArial|b1;bold} line\\Psecond \\S1/2; %%d'
  mtext.location = new AcGePoint3d(1, 6, 0)
  mtext.height = 0.3
  mtext.width = 4
  model.appendEntity(mtext)

  // A block definition with geometry and an attribute definition, then a rotated
  // insert of it with an attribute value.
  const symbol = block(db, 'MOTOR')
  const box = new AcDbPolyline()
  box.addVertexAt(0, new AcGePoint2d(0, 0), 0)
  box.addVertexAt(1, new AcGePoint2d(1, 0), 0)
  box.addVertexAt(2, new AcGePoint2d(1, 1), 0)
  box.addVertexAt(3, new AcGePoint2d(0, 1), 0)
  box.closed = true
  symbol.appendEntity(box)
  // A line inside the block proves flattened linework is transformed into world
  // coordinates like every other primitive.
  symbol.appendEntity(new AcDbLine(new AcGePoint3d(0.5, 0.5, 0), new AcGePoint3d(0.5, 1.5, 0)))
  text(symbol, 'M', 0.2, 0.2, 0.2)
  attdef(symbol, 'TAG', 'M1', new AcGePoint3d(0.2, 1.2, 0), 0.15)
  const insert = new AcDbBlockReference('MOTOR')
  insert.position = new AcGePoint3d(22, 4, 0)
  insert.rotation = Math.PI / 6
  insert.layer = 'TITLE_BLOCK'
  model.appendEntity(insert)
  const tagAttribute = new AcDbAttribute()
  tagAttribute.tag = 'TAG'
  tagAttribute.textString = 'M7'
  tagAttribute.position = new AcGePoint3d(0.2, 1.2, 0)
  tagAttribute.height = 0.15
  insert.appendAttributes(tagAttribute)

  wdM(db)

  // An unsupported entity type: a RAY is not in the supported list.
  const ray = new AcDbRay()
  ray.basePoint = new AcGePoint3d(0, 0, 0)
  ray.unitDir = new AcGePoint3d(1, 1, 0)
  model.appendEntity(ray)

  write('tiny', db)
}

// ---------------------------------------------------------------------------
// titleblock.dxf — label/value text shaping the title block, plus an attribute
// block whose tags carry two fields directly.
// ---------------------------------------------------------------------------
{
  const db = new AcDbDatabase()
  db.createDefaultData()
  layer(db, 'TITLE_BLOCK', 7)
  layer(db, 'TEXT', 2)
  const model = db.tables.blockTable.modelSpace

  const label = (value, x, y) => text(model, value, x, y, 0.08, 'TITLE_BLOCK')
  const field = (value, x, y) => text(model, value, x, y, 0.15, 'TITLE_BLOCK')

  label('TITLE', 8, 4)
  field('PUMP STATION', 8.1, 3.4)
  label('SHEET NUMBER:', 12, 1.4)
  field('007', 12.6, 1.0)
  label('REVISION LEVEL:', 8, 1.4)
  label('RELEASE DATE:', 12, 0.9)
  field('2026-01-02', 12.4, 0.5)
  label('SCALE:', 8, 0.9)
  field('1:1', 8.4, 0.5)
  label('CHECKED BY:', 16, 1.4)
  field('AB', 16.5, 1.0)

  // The attribute-block shape: a title block block whose attribute tags are
  // SHEET_NUMBER and TITLE.
  const titleBlock = block(db, 'TB')
  attdef(titleBlock, 'SHEET_NUMBER', '', new AcGePoint3d(0, 0, 0), 0.15)
  attdef(titleBlock, 'TITLE', '', new AcGePoint3d(0, -0.4, 0), 0.15)
  const insert = new AcDbBlockReference('TB')
  insert.position = new AcGePoint3d(30, 10, 0)
  model.appendEntity(insert)
  const number = new AcDbAttribute()
  number.tag = 'SHEET_NUMBER'
  number.textString = 'ACME-007'
  number.height = 0.15
  insert.appendAttributes(number)
  const title = new AcDbAttribute()
  title.tag = 'TITLE'
  title.textString = 'PUMP STATION'
  title.height = 0.15
  insert.appendAttributes(title)

  wdM(db)

  write('titleblock', db)
}

// ---------------------------------------------------------------------------
// review.dxf — a set-shaped sheet for the tool specs: a readable title block,
// device tags and wire labels (one duplicate, one one-sided), a sheet reference
// no file in the fixture set resolves, and text below a typical minimum height.
// ---------------------------------------------------------------------------
{
  const db = new AcDbDatabase()
  db.createDefaultData()
  layer(db, 'TITLE_BLOCK', 7)
  layer(db, 'TAGS', 2)
  layer(db, 'WIRES', 5)
  const model = db.tables.blockTable.modelSpace

  // Title block, label/value pairing on the TITLE_BLOCK layer.
  text(model, 'TITLE', 8, 4, 0.08, 'TITLE_BLOCK')
  text(model, 'PUMP STATION', 8.1, 3.4, 0.15, 'TITLE_BLOCK')
  text(model, 'SHEET NUMBER:', 12, 1.4, 0.08, 'TITLE_BLOCK')
  text(model, 'ACME-007', 12.6, 1.0, 0.15, 'TITLE_BLOCK')
  text(model, 'REVISION LEVEL:', 8, 1.4, 0.08, 'TITLE_BLOCK')
  text(model, 'A', 8.4, 1.0, 0.15, 'TITLE_BLOCK')
  text(model, 'RELEASE DATE:', 12, 0.9, 0.08, 'TITLE_BLOCK')
  text(model, '2026-02-03', 12.4, 0.5, 0.15, 'TITLE_BLOCK')
  text(model, 'SCALE:', 8, 0.9, 0.08, 'TITLE_BLOCK')
  text(model, '1:1', 8.4, 0.5, 0.15, 'TITLE_BLOCK')

  // Cross-reference candidates.
  text(model, 'M1', 2, 2, 0.125, 'TAGS')
  text(model, 'M1', 4, 2, 0.125, 'TAGS')
  text(model, 'CR2', 2, 4, 0.125, 'TAGS')
  text(model, '12', 2, 6, 0.125, 'WIRES')
  text(model, '12', 5, 6, 0.125, 'WIRES')
  text(model, '13', 2, 8, 0.125, 'WIRES')
  text(model, 'SEE SHEET 2', 2, 10, 0.125, '0')

  // Below the profile minimum text height, for the checks rule.
  text(model, 'tiny', 2, 12, 0.01, '0')

  wdM(db)

  write('review', db)
}

// ---------------------------------------------------------------------------
// index.dxf — a SHEET INDEX heading and table rows, with the title block text
// deliberately far away so a parser that ignores columns is caught.
// ---------------------------------------------------------------------------
{
  const db = new AcDbDatabase()
  db.createDefaultData()
  layer(db, 'TITLE_BLOCK', 7)
  const model = db.tables.blockTable.modelSpace

  text(model, 'SHEET INDEX', 21, 8, 0.2, '0')
  const rowY = (index) => 7 - index * 0.25
  // Number column (x 20), drawing number column (x 22), title column (x 24).
  const row = (index, drawingNumber, titleValue) => {
    const y = rowY(index)
    text(model, String(index), 20, y, 0.125, '0')
    if (drawingNumber) text(model, drawingNumber, 22, y, 0.125, '0')
    if (titleValue) text(model, titleValue, 24, y, 0.125, '0')
  }
  row(1, '21036-001', 'POWER DISTRIBUTION')
  row(2, '21036-002', 'MOTOR CONTROL CENTER')
  row(3, '21036-007', 'PUMP STATION')
  row(4, undefined, 'SPARE SHEET')
  row(5, undefined, undefined)
  row(6, undefined, undefined)

  // Title block text at the same y positions but far away in x, so column-based
  // parsing is required to exclude it.
  text(model, 'TITLE', 40, 6.75, 0.08, 'TITLE_BLOCK')
  text(model, 'SHEET NUMBER:', 40, 6.5, 0.08, 'TITLE_BLOCK')
  text(model, 'SYNTH-001', 41, 6.25, 0.15, 'TITLE_BLOCK')

  write('index', db)
}
