/**
 * Viewer support for the DXF/DWG drawing preview.
 *
 * The drawing product row was retired: the bundle no longer registers ECAD tools,
 * a skill or a row configuration. What stays is the drawing engine below the
 * preview face — the DXF/DWG readers, the sheet model and the DWG converter the
 * viewer's Remote service loads on demand. This module is the package's public
 * surface for that support code; it is not a plugin and registers nothing.
 *
 * @module @aryacode/dsh-engineering-ecad
 */

/** The default ceiling the drawing reader applies to one file. */
export const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024

export {
  EcadSession,
  MAX_CACHED_SHEETS,
  DOCUMENT_DIR,
  ECAD_DIR,
  INDEX_FILE,
  PREVIEW_DIR,
  PROFILE_FILE,
  RENDER_DIR,
  baseNameOf,
  engine,
  joinPath,
  parentOf,
  sha256,
  stemOf,
} from './session.ts'
export type {
  DiffDocument,
  EcadSessionOptions,
  SheetTitleBlock,
  SheetView,
  WorkspaceIndexState,
  WorkspaceProfile,
} from './session.ts'

export {
  RECOGNISED_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  extensionOf,
  formatLabel,
  formatOfPath,
  isRecognisedDrawingPath,
  isSupportedDrawingPath,
  readDrawing,
  unsupportedDrawingFormat,
  writeDrawing,
} from './drawings.ts'
export type {
  ConversionInfo,
  DrawingFormat,
  DrawingOutput,
  ReadDrawing,
  WriteDrawingOptions,
  WrittenDrawing,
} from './drawings.ts'

export {
  EngineeringError,
  asFsService,
  errorEnvelope,
  lossless,
  success,
} from './core.ts'
export type {
  ErrorEnvelope,
  ExecContext,
  FsService,
  FsTarget,
  SandboxPolicy,
  ToolDefinition,
  ToolOutput,
} from './core.ts'
