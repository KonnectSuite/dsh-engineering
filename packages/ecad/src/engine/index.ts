/**
 * The ECAD engine: a plain Node library over `@mlightcad/data-model`.
 *
 * Every entry point takes and returns JSON-shaped values (or DXF bytes), so the
 * same functions serve the bundle's tools, its `ecad` service and the tests.
 * The only class that crosses the boundary is the database handle inside an
 * {@link OpenedSheet}, which is what the edit path needs.
 *
 * There is no default export: a caller imports exactly what it uses.
 *
 * @module dsh-engineering-ecad/engine
 */

// Errors.
export { EcadError, isEcadError } from './errors.ts'
export type { EcadErrorCode } from './errors.ts'

// Parsing.
export { DEFAULT_MAX_FILE_BYTES, fileStem, hasDxfEof, isDxfBytes, openSheet, sha256 } from './parse.ts'
export type { OpenSheetInput, OpenedSheet } from './parse.ts'

// The render model.
export {
  buildSheetModel,
  DEFAULT_MAX_ENTITIES_PER_LAYOUT,
  DEFAULT_MAX_INSERT_DEPTH,
  entityBounds,
  unionBounds
} from './model.ts'
export type { BuildSheetModelOptions } from './model.ts'

// Title blocks and index sheets.
export {
  detectTitleBlock,
  extractInsertAttributes,
  fieldOfLabel,
  isOpenedSheet,
  pairTitleBlockValues,
  TITLE_BLOCK_FIELDS
} from './titleblock.ts'
export type {
  DetectTitleBlockOptions,
  InsertAttributeRow,
  InsertRecord,
  TitleBlockBlank,
  TitleBlockLabel,
  TitleBlockPairing,
  TitleBlockSource
} from './titleblock.ts'
export { detectIndexSheet } from './index-sheet.ts'
export type { DetectIndexSheetOptions } from './index-sheet.ts'

// Profiles.
export {
  DEFAULT_DEVICE_TAG_PATTERN,
  DEFAULT_SHEET_REFERENCE_PATTERN,
  DEFAULT_WIRE_LABEL_PATTERN,
  defaultProfile,
  inferProfile,
  isEcadProfile,
  loadProfile,
  serializeProfile,
  validateProfile
} from './profile.ts'
export type { InferProfileOptions, InferProfileSheet, ProfileValidation } from './profile.ts'

// Cross-reference, checks and diff.
export { crossReference } from './crossref.ts'
export type { CrossrefModel, CrossrefOptions } from './crossref.ts'
export { numericSuffix, profileFields, runChecks } from './checks.ts'
export type { EcadCheckSheet, EcadChecksInput, EcadChecksOptions } from './checks.ts'
export { diffSheetModels } from './diff.ts'
export type { DiffSheetModelsOptions } from './diff.ts'

// Rendering.
export { renderLayoutSvg, renderStackSvg } from './render.ts'
export type { RenderOptions, RenderStackItem, RenderStackOptions } from './render.ts'

// Writing and write verification.
export { dxfBytes, verifyWritten, writeAndVerify } from './dxf.ts'
export type { VerifyExpected, VerifyOptions } from './dxf.ts'

// Small helpers the panel and the tools share.
export { aciPaletteCss, aciToCss, aciToRgb, rgbToCss } from './palette.ts'
export type { EcadRgb } from './palette.ts'
export { decodeDxfText, decodeMText, normalizeLabel, singleLine, textWidthEm } from './text.ts'

// The contract types, re-exported so consumers import from one place.
export type * from './types.ts'
export type { AcDbDatabase } from '@mlightcad/data-model'
