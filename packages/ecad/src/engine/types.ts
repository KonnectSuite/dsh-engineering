/**
 * JSON types shared by the ECAD host engine, its tools and the browser panel.
 *
 * Everything here is plain JSON: the panel receives a sheet model written under
 * `<workspace>/.ecad/previews/` and read back with the read-only workspace file
 * API, so no class instance or data-model object crosses this boundary.
 *
 * @module dsh-engineering-ecad/engine/types
 */

/** A 2D point in drawing units (WCS). */
export type EcadPoint = readonly [number, number]

/** The primitive kinds the render model carries. */
export type EcadEntityKind =
  | 'line'
  | 'polyline'
  | 'arc'
  | 'circle'
  | 'ellipse'
  | 'spline'
  | 'point'
  | 'text'
  | 'mtext'
  | 'insert'
  | 'hatch'
  | 'solid'
  | 'dimension'
  | 'leader'
  | 'viewport'
  | 'unsupported'

/**
 * One drawable primitive in world coordinates.
 *
 * Insert contents are flattened into their layout, and `g` records the owning
 * block reference so the panel can disable direct edits on geometry that lives
 * inside a symbol definition. Angles are radians, as `data-model` stores them.
 */
export interface EcadEntity {
  /** Stable identity: the source object handle, plus a path suffix for flattened block content. */
  readonly id: string
  readonly k: EcadEntityKind
  readonly layer: string
  /** Resolved ACI colour index (0 = by-block, 256 = by-layer); `rgb` wins when present. */
  readonly color: number
  /** True colour, when the source carries one. */
  readonly rgb?: readonly [number, number, number]
  /** Source linetype name, `ByLayer`/`ByBlock` when inherited. */
  readonly lt?: string
  /** Lineweight in 1/100 mm; -1 is by-layer. */
  readonly lw?: number
  /** Owning INSERT id when this primitive came out of a block reference. */
  readonly g?: string
  /** Polyline/line/spline/solid/leader points. */
  readonly pts?: readonly EcadPoint[]
  readonly closed?: boolean
  /** Circle/arc/ellipse centre. */
  readonly c?: EcadPoint
  /** Circle/arc radius. */
  readonly r?: number
  /** Start/end angle for arcs and ellipses. */
  readonly a0?: number
  readonly a1?: number
  /** Ellipse major/minor radius; `majorAxis` rotation is folded into `rot`. */
  readonly rx?: number
  readonly ry?: number
  /** Rotation in radians for text, inserts and ellipses. */
  readonly rot?: number
  /** Placement point for text/mtext/point/insert/viewport. */
  readonly p?: EcadPoint
  /** Text content, with the DXF percent control codes decoded. */
  readonly t?: string
  /** Text height (drawing units). */
  readonly h?: number
  /** MText reference width. */
  readonly w?: number
  /** Text alignment modes for the panel's anchor maths. */
  readonly ha?: number
  readonly va?: number
  /** Referenced block name and scale for an insert. */
  readonly block?: string
  readonly scale?: EcadPoint
  /** True when the geometry is an approximation (spline tessellation, hatch outline, placeholder dimension). */
  readonly approx?: boolean
  /** Source entity type when `k` is `unsupported` or when the geometry is approximate. */
  readonly src?: string
}

/** Axis-aligned bounds in drawing units. */
export interface EcadBox {
  readonly min: EcadPoint
  readonly max: EcadPoint
}

/** One symbol-table layer. */
export interface EcadLayer {
  readonly name: string
  /** Resolved ACI colour index; `rgb` wins when present. */
  readonly color: number
  readonly rgb?: readonly [number, number, number]
  readonly visible: boolean
  readonly frozen?: boolean
  readonly locked?: boolean
}

/** One layout: model space or a paper-space layout. */
export interface EcadLayout {
  /** `Model` or the layout name as DXF carries it. */
  readonly id: string
  readonly name: string
  readonly kind: 'model' | 'paper'
  readonly extents: EcadBox
  readonly entities: readonly EcadEntity[]
}

/** One block table record summarised for the panel's block list. */
export interface EcadBlockSummary {
  readonly name: string
  readonly entities: number
  readonly external: boolean
}

/** Coverage counters for one sheet. */
export interface EcadModelStats {
  readonly entities: number
  readonly byKind: Readonly<Record<string, number>>
  /** Entity type → count for entities drawn as a placeholder or not drawn at all. */
  readonly unsupported: Readonly<Record<string, number>>
  /** Primitives drawn from approximate geometry. */
  readonly approximate: number
  /** True when an entity cap truncated the layout. */
  readonly truncated: boolean
}

/** The render model for one drawing file, consumed by the panel. */
export interface EcadSheetModel {
  readonly schema: 1
  /** Path as handed to the engine (workspace-relative or absolute). */
  readonly path: string
  /** SHA-256 of the source bytes when the model was built. */
  readonly version: string
  readonly dxfVersion: string
  readonly units: number
  readonly layouts: readonly EcadLayout[]
  readonly layers: readonly EcadLayer[]
  readonly blocks: readonly EcadBlockSummary[]
  readonly stats: EcadModelStats
}

/** Title-block fields the profile can recognise. */
export type EcadTitleBlockField =
  | 'sheetNumber'
  | 'sheetCount'
  | 'title'
  | 'revision'
  | 'date'
  | 'scale'
  | 'project'
  | 'customer'
  | 'drawnBy'
  | 'checkedBy'

/** One extracted title-block value and where it came from. */
export interface EcadTitleBlockValue {
  readonly value: string
  readonly source: 'text' | 'attribute' | 'filename' | 'index' | 'inferred'
  /** The label text or attribute tag the value was paired with. */
  readonly label?: string
  /** 0–1, lower when the pairing is positional rather than labelled. */
  readonly confidence: number
}

/** Title-block extraction for one sheet. */
export interface EcadTitleBlock {
  readonly layout?: string
  readonly fields: Readonly<Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>>>
}

/**
 * The workspace ECAD profile: the conventions a set of prints follows. Inferred
 * from the drawing contents and the ACADE `WD_M` attributes, then confirmed by
 * a person before checks or cross-reference rely on it.
 */
export interface EcadProfile {
  readonly schema: 1
  /** Layer(s) that carry the visible title block. */
  readonly titleBlockLayers: readonly string[]
  /** Field → label texts observed for that field (for example `SHEET NUMBER:`). */
  readonly titleBlockLabels: Readonly<Partial<Record<EcadTitleBlockField, readonly string[]>>>
  readonly wireLayers: readonly string[]
  readonly tagLayers: readonly string[]
  readonly xrefLayers: readonly string[]
  readonly locLayers: readonly string[]
  /** Regex sources applied to candidate text values. */
  readonly deviceTagPattern: string
  readonly wireLabelPattern: string
  readonly sheetReferencePattern: string
  /** Smallest acceptable title-block/annotation text height in drawing units; 0 disables the rule. */
  readonly minTextHeight: number
  /** Layer standard for the profile; layers outside it produce a warning, never an error. */
  readonly standardLayers: readonly string[]
  /** Drawing units declared by the set (`$INSUNITS`), 0 when unset. */
  readonly units: number
}

/** Result of inferring a profile from drawings. */
export interface EcadProfileInference {
  readonly profile: EcadProfile
  /** Evidence rows explaining each detected convention. */
  readonly evidence: readonly string[]
  /** Some conventions are guesses; the skill says to confirm them with the user. */
  readonly confidence: number
}

/** One row of an index sheet's list. */
export interface EcadIndexEntry {
  readonly raw: string
  readonly sheetNumber?: string
  readonly title?: string
}

/** A detected sheet-index sheet. */
export interface EcadIndexSheet {
  readonly layout: string
  readonly heading: string
  readonly entries: readonly EcadIndexEntry[]
}

/** One sheet's summary in the workspace index. */
export interface EcadSheetSummary {
  readonly path: string
  readonly sha256: string
  readonly set?: string
  readonly sheetNumber?: string
  readonly title?: string
  readonly revision?: string
  readonly titleBlock: EcadTitleBlock
  readonly layers: readonly string[]
  readonly blockCount: number
  readonly entityCount: number
  readonly unsupported: Readonly<Record<string, number>>
  readonly index?: EcadIndexSheet
}

/** The workspace drawing index written to `.ecad/index.json`. */
export interface EcadWorkspaceIndex {
  readonly schema: 1
  readonly scannedAt: string
  readonly sheets: readonly EcadSheetSummary[]
  readonly sets: Readonly<Record<string, readonly string[]>>
  readonly skipped: readonly { readonly path: string; readonly reason: string }[]
}

/** A cross-reference candidate: the same value seen once or several times. */
export interface EcadCrossReferenceRow {
  readonly kind: 'device-tag' | 'wire-label' | 'sheet-reference'
  readonly value: string
  readonly sheets: readonly {
    readonly path: string
    readonly layout: string
    readonly layer: string
    readonly entityId: string
    readonly position?: EcadPoint
    readonly text?: string
  }[]
  readonly status: 'ok' | 'duplicate' | 'one-sided' | 'unresolved'
  readonly confidence: number
  readonly note?: string
}

/** One review finding. */
export interface EcadFinding {
  readonly rule: string
  readonly severity: 'info' | 'warning' | 'critical'
  readonly message: string
  readonly sheet?: string
  readonly layout?: string
  readonly entityId?: string
  readonly layer?: string
  readonly text?: string
  readonly fix?: string
}

/** One normalised entity change between two drawings. */
export interface EcadEntityChange {
  readonly kind: 'added' | 'removed' | 'changed'
  readonly layout: string
  readonly entityKind: EcadEntityKind
  readonly layer: string
  readonly before?: EcadEntity
  readonly after?: EcadEntity
  readonly reason: string
}

/** A comparison of two drawings. */
export interface EcadDiff {
  readonly a: { readonly path: string; readonly version: string }
  readonly b: { readonly path: string; readonly version: string }
  readonly added: readonly EcadEntityChange[]
  readonly removed: readonly EcadEntityChange[]
  readonly changed: readonly EcadEntityChange[]
  readonly truncated: boolean
}

/** What a verification observed after writing the new file. */
export interface EcadVerification {
  readonly ok: boolean
  /** Per operation kind, the number of changes the caller expected. */
  readonly expected: Readonly<Record<string, number>>
  /** The same counters read back from the written file. */
  readonly applied: Readonly<Record<string, number>>
  /** Entity types the writer could not carry (proxy/custom objects), with counts. */
  readonly dropped: Readonly<Record<string, number>>
  /** Findings that keep `ok` false; empty when the write verified. */
  readonly problems: readonly string[]
  readonly notes: readonly string[]
}
