window.__ModuleLoader__.load({
  id: "@aryacode/dsh-engineering-ecad",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/ecad/src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react3 = require("react");

// src/remote/ecad-contract.js
var ECAD_PACKAGE = "@aryacode/dsh-engineering";
var ECAD_NAMESPACE = "ecad";
var ECAD_CONTRACT_VERSION = 1;
function jsonCodec(typeSymbol, accept, jsonSchema, description) {
  return {
    mode: "strict",
    typeSymbol,
    create() {
      return {
        parse(value) {
          if (accept(value) !== true) throw new TypeError(`${typeSymbol}: unexpected wire value`);
          return value;
        }
      };
    },
    jsonSchema,
    ...description === void 0 ? {} : { description }
  };
}
var nonEmptyString = (value) => typeof value === "string" && value.length > 0;
var finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
var jsonObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var jsonArray = (value) => Array.isArray(value);
function parameter(name, description, accept, jsonSchema) {
  return { name, wire: name, description, source: "json", accept, jsonSchema };
}
var ECAD_METHODS = [
  {
    method: "open",
    description: "Open a drawing (DXF, or DWG through the embedded converter) from the session workspace, cache its render model under .ecad/previews, and return the model path the panel reads.",
    signature: "async open(sessionId: string, path: string): Promise<EcadOpenResult>",
    parameters: [
      parameter("sessionId", "the session whose workspace holds the drawing", nonEmptyString, { type: "string" }),
      parameter("path", "workspace-relative path of the drawing (a .dxf file)", nonEmptyString, { type: "string" })
    ],
    result: parameter("result", "the open result: version, model path and a short summary", jsonObject, { type: "object" })
  },
  {
    method: "apply",
    description: "Apply a staged draft to a NEW drawing beside the source (same format, never overwriting it), re-read the written file and return the verification.",
    signature: "async apply(sessionId: string, path: string, baseVersion: string, ops: readonly EcadOp[]): Promise<EcadApplyResult>",
    parameters: [
      parameter("sessionId", "the session whose workspace holds the drawing", nonEmptyString, { type: "string" }),
      parameter("path", "workspace-relative path of the source drawing", nonEmptyString, { type: "string" }),
      parameter("baseVersion", "SHA-256 of the source bytes the draft was staged against", nonEmptyString, { type: "string" }),
      parameter("ops", "the staged operations, in application order", jsonArray, { type: "array" })
    ],
    result: parameter("result", "the apply result: output path, version and verification", jsonObject, { type: "object" })
  },
  {
    method: "sheets",
    description: "List the drawings (DXF, and DWG when the converter is available) in the session workspace, optionally enriched from the cached .ecad index.",
    signature: "async sheets(sessionId: string, limit?: number): Promise<EcadSheetsResult>",
    parameters: [
      parameter("sessionId", "the session whose workspace is scanned", nonEmptyString, { type: "string" }),
      parameter("limit", "most drawings to return (default 500)", finiteNumber, { type: "number" })
    ],
    result: parameter("result", "the drawing list", jsonObject, { type: "object" })
  },
  {
    method: "capabilities",
    description: "Report the ECAD surface: contract version, whether writes are enabled, engine limits and the DWG converter state.",
    signature: "async capabilities(sessionId: string): Promise<EcadCapabilitiesResult>",
    parameters: [
      parameter("sessionId", "the session to report the workspace for", nonEmptyString, { type: "string" })
    ],
    result: parameter("result", "the capability report", jsonObject, { type: "object" })
  }
];
var descriptorTypeSymbol = (method) => `${ECAD_PACKAGE}#${ECAD_NAMESPACE}/${method.method}`;
function buildHostDescriptor(method) {
  const base = descriptorTypeSymbol(method);
  return {
    id: `${ECAD_PACKAGE}#${ECAD_NAMESPACE}/${method.method}`,
    service: ECAD_NAMESPACE,
    namespace: ECAD_NAMESPACE,
    method: method.method,
    description: method.description,
    invocation: { kind: "direct" },
    parameters: method.parameters.map((meta, index) => ({
      name: meta.name,
      wire: meta.wire,
      description: meta.description,
      source: "json",
      codec: jsonCodec(`${base}:parameter:${index}`, meta.accept, meta.jsonSchema)
    })),
    result: jsonCodec(`${base}:result`, method.result.accept, method.result.jsonSchema, method.result.description),
    sourceLocation: { file: "src/remote/ecad-contract.js", line: 1, column: 1 }
  };
}
function buildClientContribution() {
  return {
    package: ECAD_PACKAGE,
    descriptors: ECAD_METHODS.map((method) => {
      const host = buildHostDescriptor(method);
      return {
        id: host.id,
        service: host.service,
        namespace: host.namespace,
        method: host.method,
        description: host.description,
        invocation: host.invocation,
        parameters: host.parameters,
        result: host.result
      };
    })
  };
}

// packages/ecad/src/client/EcadBody.tsx
var import_react2 = require("react");

// packages/ecad/src/client/artifacts.ts
var PREVIEW_CHUNK = 1024 * 1024;
var PREVIEW_LIMIT = 64 * 1024 * 1024;
function sourceFormatOf(summary) {
  const format = summary?.format;
  return typeof format === "string" && format !== "" ? format.toLowerCase() : "dxf";
}
function conversionOf(converted) {
  const warnings = converted?.warnings;
  const warningTexts = Array.isArray(warnings) ? warnings.filter((warning) => typeof warning === "string") : [];
  const count = typeof warnings === "number" && Number.isFinite(warnings) ? Math.max(0, Math.trunc(warnings)) : warningTexts.length;
  return {
    ...typeof converted?.converter === "string" && converted.converter !== "" ? { converter: converted.converter } : {},
    ...typeof converted?.version === "string" && converted.version !== "" ? { version: converted.version } : {},
    warnings: count,
    warningTexts
  };
}
var EcadArtifactError = class extends Error {
  /** Machine-readable failure class. */
  code;
  /** What the reader should do. */
  fix;
  /**
   * @param code - machine-readable failure class.
   * @param message - what went wrong.
   * @param fix - what the reader should do instead.
   */
  constructor(code, message, fix) {
    super(message);
    this.name = "EcadArtifactError";
    this.code = code;
    this.fix = fix;
  }
};
async function readWorkspaceText(read, sessionId, path, signal, chunk = PREVIEW_CHUNK) {
  const chunks = [];
  let offset = 0;
  let version;
  let total = 0;
  while (true) {
    signal.throwIfAborted();
    const result = await read(sessionId, path, { range: { offset, length: chunk } }, signal);
    if (!result.ok) throw new EcadArtifactError("ECAD_PREVIEW_READ", result.error.message, "Reload the drawing; the preview artifact could not be read.");
    const page = result.value;
    if (version !== void 0 && page.version !== void 0 && version !== page.version) {
      throw new EcadArtifactError("ECAD_PREVIEW_CHANGED", `"${path}" changed while the preview was being read`, "Reload the drawing so the preview is rebuilt from the current source.");
    }
    version = page.version;
    total += page.data.length;
    if (total > PREVIEW_LIMIT || page.bytes !== void 0 && page.bytes > PREVIEW_LIMIT) {
      throw new EcadArtifactError("ECAD_PREVIEW_TOO_LARGE", `"${path}" is larger than ${PREVIEW_LIMIT} bytes`, "Open the drawing in the drawing tools instead; the pane will not read a preview this large.");
    }
    chunks.push(page.data);
    offset += page.data.length;
    if (page.eof) break;
    if (page.data.length === 0) {
      throw new EcadArtifactError("ECAD_PREVIEW_READ", `"${path}" returned an empty page before its end`, "Reload the drawing; the preview artifact is incomplete.");
    }
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  for (const part of chunks) text += decoder.decode(part, { stream: true });
  text += decoder.decode();
  return { text, version };
}
function parsePreviewArtifact(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new EcadArtifactError("ECAD_PREVIEW_INVALID", "the cached preview is not valid JSON", "Reload the drawing so the host writes the preview again.");
  }
  const payload = parsed !== null && typeof parsed === "object" ? parsed : void 0;
  const model = payload?.model;
  if (payload?.schema !== 1 || model === null || typeof model !== "object") {
    throw new EcadArtifactError("ECAD_PREVIEW_INVALID", "the cached preview is not a schema-1 sheet model", "Reload the drawing so the host writes the preview again.");
  }
  const sheet = model;
  if (typeof sheet.path !== "string" || !Array.isArray(sheet.layouts) || sheet.layouts.length === 0 || sheet.stats === void 0 || !Array.isArray(sheet.layers)) {
    throw new EcadArtifactError("ECAD_PREVIEW_INVALID", "the cached preview is missing the model fields the pane draws", "Reload the drawing so the host writes the preview again.");
  }
  return {
    model: sheet,
    ...typeof payload.version === "string" ? { version: payload.version } : {},
    ...typeof payload.generatedAt === "string" ? { generatedAt: payload.generatedAt } : {}
  };
}
async function readPreviewArtifact(read, sessionId, path, signal) {
  const { text } = await readWorkspaceText(read, sessionId, path, signal);
  return parsePreviewArtifact(text);
}

// packages/ecad/src/client/palette.ts
var LEVELS = [255, 165, 127, 76, 38];
var FIXED = /* @__PURE__ */ new Map([
  [0, [0, 0, 0]],
  [1, [255, 0, 0]],
  [2, [255, 255, 0]],
  [3, [0, 255, 0]],
  [4, [0, 255, 255]],
  [5, [0, 0, 255]],
  [6, [255, 0, 255]],
  [7, [255, 255, 255]],
  [8, [128, 128, 128]],
  [9, [192, 192, 192]],
  [250, [51, 51, 51]],
  [251, [80, 80, 80]],
  [252, [105, 105, 105]],
  [253, [130, 130, 130]],
  [254, [190, 190, 190]],
  [255, [255, 255, 255]],
  [256, [255, 255, 255]]
]);
function hsv(hue, saturation, value) {
  const h = (hue % 360 + 360) % 360;
  const c = value * saturation;
  const hp = h / 60;
  const x = c * (1 - Math.abs(hp % 2 - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = value - c;
  return [Math.floor(r + m + 1e-9), Math.floor(g + m + 1e-9), Math.floor(b + m + 1e-9)];
}
var TABLE = (() => {
  const table = new Array(257);
  for (const [index, rgb] of FIXED) table[index] = rgb;
  for (let hueGroup = 0; hueGroup < 24; hueGroup += 1) {
    const hue = hueGroup * 15;
    for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex += 1) {
      const value = LEVELS[levelIndex];
      const base = 10 + hueGroup * 10 + levelIndex * 2;
      table[base] = hsv(hue, 1, value);
      table[base + 1] = hsv(hue, 0.5, value);
    }
  }
  for (let index = 0; index < table.length; index += 1) {
    if (!table[index]) table[index] = [0, 0, 0];
  }
  return table;
})();
function aciToRgb(index) {
  const i = Number.isFinite(index) ? Math.trunc(index) : 256;
  if (i <= 0) return TABLE[0];
  if (i >= 256) return TABLE[256];
  return TABLE[i];
}
function hex2(value) {
  const v = Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
  return v.toString(16).padStart(2, "0").toUpperCase();
}
function rgbToHex(rgb) {
  return `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`;
}
function aciHex(index) {
  return rgbToHex(aciToRgb(index));
}
function isAutoColor(index) {
  return index === 0 || index === 7 || index === 256;
}
var AUTO_INK = "var(--ecad-ink)";
var INK_TINT = "var(--ecad-ink-tint, 55%)";
function tintedInk(hex) {
  return `color-mix(in srgb, ${hex} ${INK_TINT}, var(--ecad-ink))`;
}
function inkFor(color, rgb, layer) {
  if (rgb !== void 0) return tintedInk(rgbToHex(rgb));
  const index = Number.isFinite(color) ? Math.trunc(color) : 256;
  if (index === 7 || index === 0 || index === 256) {
    if (index !== 7 && layer !== void 0) {
      if (layer.rgb !== void 0) return tintedInk(rgbToHex(layer.rgb));
      const layerIndex = Number.isFinite(layer.color) ? Math.trunc(layer.color) : 7;
      if (!isAutoColor(layerIndex)) return tintedInk(aciHex(layerIndex));
    }
    return AUTO_INK;
  }
  return tintedInk(aciHex(index));
}

// packages/ecad/src/client/scene.ts
function fmt(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
function formatPoint(point) {
  if (point === void 0) return "";
  return `${fmt(point[0])}, ${fmt(point[1])}`;
}
function textWidthEm(text) {
  let em = 0;
  for (const character of text) {
    if (character === "\n") continue;
    em += character.charCodeAt(0) > 11903 ? 1 : 0.6;
  }
  return em;
}
function extend(box, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  box.minX = Math.min(box.minX, x);
  box.minY = Math.min(box.minY, y);
  box.maxX = Math.max(box.maxX, x);
  box.maxY = Math.max(box.maxY, y);
  box.empty = false;
}
function entityBounds(entity) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, empty: true };
  switch (entity.k) {
    case "line":
    case "polyline":
    case "spline":
    case "solid":
    case "hatch":
    case "leader": {
      for (const point of entity.pts ?? []) extend(box, point[0], point[1]);
      break;
    }
    case "circle":
    case "arc": {
      if (entity.c === void 0) return void 0;
      const radius = entity.r ?? 0;
      if (entity.k === "circle") {
        extend(box, entity.c[0] - radius, entity.c[1] - radius);
        extend(box, entity.c[0] + radius, entity.c[1] + radius);
        break;
      }
      const a0 = entity.a0 ?? 0;
      let a1 = entity.a1 ?? 0;
      if (a1 < a0) a1 += Math.PI * 2;
      extend(box, entity.c[0] + radius * Math.cos(a0), entity.c[1] + radius * Math.sin(a0));
      extend(box, entity.c[0] + radius * Math.cos(a1), entity.c[1] + radius * Math.sin(a1));
      for (let turn = 0; turn < 4; turn += 1) {
        const angle = turn * Math.PI / 2;
        if (angle > a0 && angle < a1) extend(box, entity.c[0] + radius * Math.cos(angle), entity.c[1] + radius * Math.sin(angle));
      }
      break;
    }
    case "ellipse": {
      if (entity.c === void 0) return void 0;
      const rx = entity.rx ?? 0;
      const ry = entity.ry ?? 0;
      const rotation = entity.rot ?? 0;
      for (let index = 0; index < 16; index += 1) {
        const angle = index / 16 * Math.PI * 2;
        const x = rx * Math.cos(angle);
        const y = ry * Math.sin(angle);
        extend(box, entity.c[0] + x * Math.cos(rotation) - y * Math.sin(rotation), entity.c[1] + x * Math.sin(rotation) + y * Math.cos(rotation));
      }
      break;
    }
    case "text":
    case "mtext": {
      if (entity.p === void 0) return void 0;
      const height = Math.max(entity.h ?? 0, 0);
      const referenceWidth = entity.w ?? 0;
      const width = entity.k === "mtext" && referenceWidth > 0 ? referenceWidth : textWidthEm(entity.t ?? "") * height;
      const rotation = entity.rot ?? 0;
      const ha = entity.ha ?? 0;
      const left = ha === 1 ? -width / 2 : ha === 2 ? -width : 0;
      for (const [dx, dy] of [[left, 0], [left + width, 0], [left, height], [left + width, height]]) {
        extend(box, entity.p[0] + dx * Math.cos(rotation) - dy * Math.sin(rotation), entity.p[1] + dx * Math.sin(rotation) + dy * Math.cos(rotation));
      }
      break;
    }
    case "point": {
      if (entity.p === void 0) return void 0;
      extend(box, entity.p[0], entity.p[1]);
      break;
    }
    case "viewport": {
      if (entity.p === void 0) return void 0;
      extend(box, entity.p[0] - (entity.w ?? 0) / 2, entity.p[1] - (entity.h ?? 0) / 2);
      extend(box, entity.p[0] + (entity.w ?? 0) / 2, entity.p[1] + (entity.h ?? 0) / 2);
      break;
    }
    case "dimension": {
      for (const point of entity.pts ?? []) extend(box, point[0], point[1]);
      if (entity.p !== void 0) extend(box, entity.p[0], entity.p[1]);
      break;
    }
    case "insert":
    case "unsupported":
      return void 0;
  }
  if (!Number.isFinite(box.minX) || !Number.isFinite(box.minY) || !Number.isFinite(box.maxX) || !Number.isFinite(box.maxY)) return void 0;
  return { min: [box.minX, box.minY], max: [box.maxX, box.maxY] };
}
function unionBounds(a, b) {
  if (a === void 0) return b;
  if (b === void 0) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])]
  };
}
function sanitiseBox(box) {
  const min = Number.isFinite(box.min[0]) && Number.isFinite(box.min[1]) ? box.min : [0, 0];
  const max = Number.isFinite(box.max[0]) && Number.isFinite(box.max[1]) ? box.max : [min[0] + 1, min[1] + 1];
  if (max[0] - min[0] <= 0 && max[1] - min[1] <= 0) return { min, max: [min[0] + 1, min[1] + 1] };
  return { min, max };
}
function fitBox(bounds, width, height, margin) {
  const box = sanitiseBox(bounds);
  const spanX = box.max[0] - box.min[0];
  const spanY = box.max[1] - box.min[1];
  const usableWidth = Math.max(1, width - margin * 2);
  const usableHeight = Math.max(1, height - margin * 2);
  let scale = 1;
  if (spanX > 1e-12 && spanY > 1e-12) scale = Math.min(usableWidth / spanX, usableHeight / spanY);
  else if (spanX > 1e-12) scale = usableWidth / spanX;
  else if (spanY > 1e-12) scale = usableHeight / spanY;
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  return {
    scale,
    translateX: (width - scale * spanX) / 2 - scale * box.min[0],
    translateY: (height + scale * spanY) / 2 + scale * box.min[1]
  };
}
function layersOf(model) {
  const map = /* @__PURE__ */ new Map();
  for (const layer of model.layers) {
    if (!map.has(layer.name.toUpperCase())) map.set(layer.name.toUpperCase(), layer);
  }
  return map;
}
function layerCounts(entities) {
  const counts = /* @__PURE__ */ new Map();
  for (const entity of entities) {
    const key = entity.layer.toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
function primitivesOf(entity, layers, pointRadius) {
  const base = {
    id: entity.id,
    kind: entity.k,
    layer: entity.layer,
    approx: entity.approx === true,
    ink: inkFor(entity.color, entity.rgb, layers.get(entity.layer.toUpperCase()))
  };
  const point = () => entity.p ?? entity.c;
  switch (entity.k) {
    case "line": {
      const [a, b] = entity.pts ?? [];
      if (a === void 0 || b === void 0) return [];
      return [{ ...base, geometry: { t: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, text: [] }];
    }
    case "polyline":
    case "spline": {
      const points = entity.pts ?? [];
      if (points.length < 2) return [];
      return [{ ...base, geometry: { t: "path", d: pathOf(points, entity.closed === true), fill: false, hatch: false }, text: [] }];
    }
    case "hatch":
    case "solid": {
      const points = entity.pts ?? [];
      if (points.length < 3) return [];
      return [{ ...base, geometry: { t: "path", d: pathOf(points, true), fill: true, hatch: entity.k === "hatch" }, text: [] }];
    }
    case "arc": {
      if (entity.c === void 0) return [];
      const radius = entity.r ?? 0;
      const a0 = entity.a0 ?? 0;
      let a1 = entity.a1 ?? 0;
      if (a1 < a0) a1 += Math.PI * 2;
      const start = [entity.c[0] + radius * Math.cos(a0), entity.c[1] + radius * Math.sin(a0)];
      const end = [entity.c[0] + radius * Math.cos(a1), entity.c[1] + radius * Math.sin(a1)];
      const large = a1 - a0 > Math.PI ? 1 : 0;
      return [{
        ...base,
        geometry: { t: "path", d: `M ${fmt(start[0])} ${fmt(start[1])} A ${fmt(radius)} ${fmt(radius)} 0 ${large} 1 ${fmt(end[0])} ${fmt(end[1])}`, fill: false, hatch: false },
        text: []
      }];
    }
    case "circle": {
      if (entity.c === void 0) return [];
      return [{ ...base, geometry: { t: "circle", cx: entity.c[0], cy: entity.c[1], r: Math.abs(entity.r ?? 0) }, text: [] }];
    }
    case "ellipse": {
      if (entity.c === void 0) return [];
      const rx = Math.abs(entity.rx ?? 0);
      const ry = Math.abs(entity.ry ?? 0);
      const rotation = entity.rot ?? 0;
      const a0 = entity.a0 ?? 0;
      const a1 = entity.a1 ?? 0;
      const full = entity.closed === true || Math.abs(Math.abs(a1 - a0) - Math.PI * 2) <= 1e-6;
      if (full) {
        return [{ ...base, geometry: { t: "ellipse", cx: entity.c[0], cy: entity.c[1], rx, ry, degrees: rotation * 180 / Math.PI }, text: [] }];
      }
      let end = a1;
      if (end < a0) end += Math.PI * 2;
      const start = ellipsePoint(entity.c, rx, ry, rotation, a0);
      const finish = ellipsePoint(entity.c, rx, ry, rotation, end);
      const large = end - a0 > Math.PI ? 1 : 0;
      return [{
        ...base,
        geometry: {
          t: "path",
          d: `M ${fmt(start[0])} ${fmt(start[1])} A ${fmt(rx)} ${fmt(ry)} ${fmt(rotation * 180 / Math.PI)} ${large} 1 ${fmt(finish[0])} ${fmt(finish[1])}`,
          fill: false,
          hatch: false
        },
        text: []
      }];
    }
    case "point": {
      const at = point();
      if (at === void 0) return [];
      return [{ ...base, geometry: { t: "dot", cx: at[0], cy: at[1], r: pointRadius }, text: [] }];
    }
    case "viewport": {
      const at = point();
      if (at === void 0) return [];
      const width = Math.abs(entity.w ?? 0);
      const height = Math.abs(entity.h ?? 0);
      if (width <= 0 || height <= 0) {
        return [{ ...base, geometry: { t: "dot", cx: at[0], cy: at[1], r: pointRadius }, text: [] }];
      }
      return [{ ...base, geometry: { t: "rect", x: at[0] - width / 2, y: at[1] - height / 2, width, height, dashed: true }, text: [] }];
    }
    case "text":
    case "mtext": {
      const lines = textLines(entity);
      if (lines.length === 0) return [];
      return [{ ...base, geometry: { t: "none" }, text: lines }];
    }
    case "dimension": {
      const points = entity.pts ?? [];
      const lines = entity.p !== void 0 && entity.t !== void 0 ? textLines({ ...entity, k: "text" }) : [];
      if (points.length === 0 && lines.length === 0) return [];
      return [{
        ...base,
        geometry: points.length >= 2 ? { t: "path", d: pathOf(points, false), fill: false, hatch: false } : { t: "none" },
        text: lines
      }];
    }
    case "leader": {
      const points = entity.pts ?? [];
      if (points.length < 2) return [];
      return [{ ...base, geometry: { t: "path", d: pathOf(points, false), fill: false, hatch: false }, text: [] }];
    }
    case "insert":
    case "unsupported":
      return [];
  }
}
function pathOf(points, closed) {
  const parts = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    parts.push(`${index === 0 ? "M" : "L"} ${fmt(point[0])} ${fmt(point[1])}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}
function ellipsePoint(center, rx, ry, rotation, angle) {
  const x = rx * Math.cos(angle);
  const y = ry * Math.sin(angle);
  return [center[0] + x * Math.cos(rotation) - y * Math.sin(rotation), center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)];
}
function textLines(entity) {
  if (entity.p === void 0 || entity.t === void 0 || entity.t.length === 0) return [];
  const height = entity.h !== void 0 && entity.h > 0 ? entity.h : 1;
  const rotation = entity.rot ?? 0;
  const ha = entity.ha ?? 0;
  const va = entity.va ?? 0;
  const anchor = ha === 1 || ha === 4 ? "middle" : ha === 2 ? "end" : "start";
  const baseline = va === 1 ? "text-after-edge" : va === 2 ? "middle" : va === 3 ? "text-before-edge" : "alphabetic";
  const degrees = rotation * 180 / Math.PI;
  const lines = [];
  const step = height * 1.4;
  for (const [index, text] of entity.t.split("\n").entries()) {
    if (text.length === 0) continue;
    const offset = index * step;
    lines.push({
      text,
      x: entity.p[0] + offset * Math.sin(rotation),
      y: entity.p[1] - offset * Math.cos(rotation),
      height,
      degrees,
      anchor,
      baseline
    });
  }
  return lines;
}
function sceneOf(layout, layers, hiddenLayers) {
  const drawable = [];
  let undrawn = 0;
  let hiddenByLayer = 0;
  for (const entity of layout.entities) {
    if (entity.k === "insert" || entity.k === "unsupported") {
      undrawn += 1;
      continue;
    }
    if (hiddenLayers.has(entity.layer.toUpperCase())) {
      hiddenByLayer += 1;
      continue;
    }
    if (entityBounds(entity) === void 0) {
      undrawn += 1;
      continue;
    }
    drawable.push(entity);
  }
  let bounds;
  for (const entity of drawable) bounds = unionBounds(bounds, entityBounds(entity));
  const fitted = sanitiseBox(bounds ?? layout.extents);
  const span = Math.max(fitted.max[0] - fitted.min[0], fitted.max[1] - fitted.min[1]);
  const pointRadius = Math.max(span * 15e-4, 1e-6);
  const primitives = [];
  for (const entity of drawable) {
    const produced = primitivesOf(entity, layers, pointRadius);
    if (produced.length === 0) undrawn += 1;
    for (const primitive of produced) primitives.push(primitive);
  }
  return { primitives, bounds: fitted, undrawn, hiddenByLayer, total: layout.entities.length };
}
function factsOf(entity) {
  const point = entity.p ?? entity.c ?? entity.pts?.[0];
  return {
    id: entity.id,
    kind: entity.k,
    layer: entity.layer,
    ...entity.t === void 0 || entity.t === "" ? {} : { text: entity.t },
    ...point === void 0 ? {} : { point },
    ...entity.pts === void 0 ? {} : { points: entity.pts.length },
    ...entity.block === void 0 ? {} : { block: entity.block },
    approximate: entity.approx === true,
    ...entity.src === void 0 ? {} : { source: entity.src }
  };
}
function coverageOf(model) {
  const unsupported = Object.entries(model.stats.unsupported ?? {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    entities: model.stats.entities,
    approximate: model.stats.approximate,
    unsupportedTotal: unsupported.reduce((total, [, count]) => total + count, 0),
    unsupported,
    truncated: model.stats.truncated === true
  };
}
function layerInk(layer) {
  if (layer.rgb !== void 0) return inkFor(layer.color, layer.rgb, void 0);
  return isAutoColor(layer.color) ? AUTO_INK : inkFor(layer.color, void 0, void 0);
}
function layerNameOf(model, name) {
  const match = model.layers.find((layer) => layer.name.toUpperCase() === name.toUpperCase());
  return match?.name ?? name;
}
var UNIT_LABELS = {
  1: "in",
  2: "ft",
  3: "mi",
  4: "mm",
  5: "cm",
  6: "m",
  7: "km",
  8: "\uFFFDin",
  9: "mil",
  10: "yd",
  11: "\uFFFD",
  12: "nm",
  13: "\uFFFDm",
  14: "dm",
  15: "dam",
  16: "hm"
};
function unitLabel(units) {
  return Number.isFinite(units) ? UNIT_LABELS[Math.trunc(units)] : void 0;
}

// packages/ecad/src/client/edits.ts
function worldAt(screen, fit, view) {
  const scale = fit.scale * view.zoom;
  if (!Number.isFinite(scale) || scale === 0) return [0, 0];
  const fittedX = (screen.x - view.panX) / view.zoom;
  const fittedY = (screen.y - view.panY) / view.zoom;
  return [roundCoord((fittedX - fit.translateX) / fit.scale), roundCoord((fit.translateY - fittedY) / fit.scale)];
}
function worldDelta(delta, fit, view) {
  const scale = fit.scale * view.zoom;
  if (!Number.isFinite(scale) || scale === 0) return [0, 0];
  return [roundCoord(delta.x / scale), roundCoord(-delta.y / scale)];
}
function roundCoord(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}
function editableEntityId(id) {
  return id.length > 0 && !id.includes("/");
}
function stageText(key, layout, point, text, height, layer, rotation) {
  const op = {
    op: "addText",
    layout,
    p: [roundCoord(point[0]), roundCoord(point[1])],
    text,
    height: roundCoord(height),
    ...layer === void 0 || layer === "" ? {} : { layer },
    ...rotation === void 0 ? {} : { rotation }
  };
  return { key, op, layout };
}
function stageMove(key, layout, id, dx, dy) {
  const op = { op: "move", layout, ids: [id], dx: roundCoord(dx), dy: roundCoord(dy) };
  return { key, op, layout };
}
function stageErase(key, layout, id) {
  const op = { op: "erase", layout, ids: [id] };
  return { key, op, layout };
}
function draftCounts(staged) {
  let addText = 0;
  let move = 0;
  let erase = 0;
  for (const item of staged) {
    if (item.op.op === "addText") addText += 1;
    else if (item.op.op === "move") move += 1;
    else if (item.op.op === "erase") erase += 1;
  }
  return { addText, move, erase };
}
function draftOps(staged) {
  return staged.map((item) => item.op);
}
function draftPreview(staged) {
  const adds = [];
  const moves = [];
  const erases = /* @__PURE__ */ new Set();
  for (const item of staged) {
    const op = item.op;
    if (op.op === "addText") {
      adds.push({ key: item.key, point: op.p, text: op.text, height: op.height, rotation: op.rotation ?? 0, layer: op.layer });
    } else if (op.op === "move") {
      for (const id of op.ids) moves.push({ key: item.key, id, delta: [op.dx, op.dy] });
    } else if (op.op === "erase") {
      for (const id of op.ids) erases.add(id);
    }
  }
  return { adds, moves, erases };
}
function defaultTextHeight(bounds, layout) {
  const heights = (layout?.entities ?? []).filter((entity) => (entity.k === "text" || entity.k === "mtext") && entity.h !== void 0 && entity.h > 0).map((entity) => entity.h).sort((a, b) => a - b);
  if (heights.length > 0) {
    return roundCoord(heights[Math.floor(heights.length / 2)]);
  }
  const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]);
  if (!Number.isFinite(span) || span <= 0) return 1;
  return Math.max(roundCoord(span * 0.01), 1e-6);
}
function defaultLayer(model, layout) {
  const names = model.layers.map((layer) => layer.name);
  const exact = names.find((name) => name === "0");
  if (exact !== void 0) return exact;
  const firstEntityLayer = layout?.entities.find((entity) => entity.layer !== "")?.layer;
  if (firstEntityLayer !== void 0) return firstEntityLayer;
  return names[0];
}
function parseNumberField(raw) {
  const trimmed = raw.trim();
  if (trimmed === "") return void 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : void 0;
}

// packages/ecad/src/client/EcadDraft.tsx
var import_react = require("react");

var css = "/* The ECAD drawing pane.\n *\n * Tokens only: every surface, label, border and accent comes from the theme's\n * --dsw-alias-* set, so the pane follows light and dark without a second palette.\n * The drawing sheet is a local surface pair because a CAD sheet is its own\n * ground: its ink and paper follow the theme, and a layer colour is tinted\n * toward the theme ink by the renderer (see palette.ts) so linework stays\n * readable on either ground.\n */\n\n._0qoF0J_root {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--dsw-font-family, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);\n  font-size: 12px;\n  line-height: 1.45;\n  container-type: inline-size;\n  /* The drawing's ground and ink. The sheet surface is a theme layer, never a\n     literal paper colour: dark mode gets a dark sheet, not a white flash. */\n  --ecad-paper: var(--dsw-alias-bg-layer-1);\n  --ecad-ink: var(--dsw-alias-label-primary);\n  --ecad-ink-tint: 55%;\n  --ecad-accent: var(--dsw-alias-state-business-primary);\n}\n\n/* Toolbar: one quiet row of view controls, the drawing's own status, and the\n   one action that leaves the pane. No product chrome \u2014 the document preview\n   header above already owns the path, reload and renderer controls. */\n._0qoF0J_toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  min-height: 40px;\n  box-sizing: border-box;\n  padding: 5px 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow: hidden;\n}\n\n._0qoF0J_toolbarGroup {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n}\n\n._0qoF0J_coverage {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n}\n\n._0qoF0J_toolbarSpacer {\n  flex: 1;\n  min-width: 0;\n}\n\n/* Badges carry a text label as well as the accent colour, so state never rides\n   on colour alone and the label can be localized. */\n._0qoF0J_badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n  height: 18px;\n  padding: 0 6px;\n  box-sizing: border-box;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  white-space: nowrap;\n}\n\n._0qoF0J_badgeWarn {\n  border-color: var(--dsw-alias-state-warn-primary);\n  color: var(--dsw-alias-state-warn-label);\n}\n\n._0qoF0J_badgeDot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: currentColor;\n  corner-shape: round;\n}\n\n._0qoF0J_button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  box-sizing: border-box;\n  min-width: 24px;\n  min-height: 24px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n}\n\n._0qoF0J_button:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._0qoF0J_button[aria-pressed='true'] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_iconButton {\n  width: 24px;\n  padding: 0;\n}\n\n._0qoF0J_primaryButton {\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_button:focus-visible,\n._0qoF0J_primaryButton:focus-visible,\n._0qoF0J_layoutTab:focus-visible,\n._0qoF0J_layerToggle:focus-visible,\n._0qoF0J_canvasWrap:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n._0qoF0J_icon {\n  display: block;\n  width: 14px;\n  height: 14px;\n  flex: none;\n}\n\n/* Layout tabs: only for a multi-layout drawing, printed the way a drawing\n   application prints them, above the sheet. */\n._0qoF0J_layoutTabs {\n  display: flex;\n  align-items: stretch;\n  gap: 2px;\n  flex: none;\n  min-height: 28px;\n  padding: 0 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow-x: auto;\n  overflow-y: hidden;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_layoutTab {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  box-sizing: border-box;\n  padding: 0 9px;\n  min-height: 27px;\n  border: 0;\n  border-bottom: 2px solid transparent;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n._0qoF0J_layoutTabActive {\n  border-bottom-color: var(--ecad-accent);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_tabCount {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* The stage holds the sheet and the panels. The sheet keeps every spare pixel;\n   the panels give way first on a narrow preview tab. */\n._0qoF0J_stage {\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  min-width: 0;\n  position: relative;\n}\n\n._0qoF0J_canvasWrap {\n  position: relative;\n  flex: 1;\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  background: var(--ecad-paper);\n  cursor: grab;\n  touch-action: none;\n}\n\n._0qoF0J_canvasWrap:focus-visible {\n  outline-offset: -2px;\n}\n\n._0qoF0J_panning {\n  cursor: grabbing;\n}\n\n._0qoF0J_canvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n._0qoF0J_primitive {\n  pointer-events: visiblePainted;\n}\n\n._0qoF0J_hovered {\n  cursor: pointer;\n}\n\n/* A selection is drawn as a paper-coloured halo under an accent stroke, so it\n   reads as a highlight state on top of any layer colour and never as a colour\n   the drawing itself uses. */\n._0qoF0J_selectionHalo {\n  fill: none;\n  stroke: var(--ecad-paper);\n  stroke-width: 5;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n._0qoF0J_selection {\n  fill: none;\n  stroke: var(--ecad-accent);\n  stroke-width: 2.5;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n/* Quiet state surfaces: the same centered rhythm the document previewers use\n   for loading, empty and failure states. */\n._0qoF0J_state {\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 24px;\n  text-align: center;\n}\n\n._0qoF0J_stateTitle {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_stateBody {\n  margin: 0;\n  max-width: 54ch;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_stateCode {\n  margin: 0;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-tertiary);\n  font-family: var(--dsh-font-family-code, ui-monospace, 'SF Mono', Consolas, monospace);\n  font-size: 10px;\n}\n\n._0qoF0J_stateActions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 2px;\n}\n\n._0qoF0J_spinner {\n  width: 18px;\n  height: 18px;\n  box-sizing: border-box;\n  border: 2px solid var(--dsw-alias-border-l2);\n  border-top-color: var(--dsw-alias-state-business-primary);\n  border-radius: 50%;\n  corner-shape: round;\n  animation: spin 900ms linear infinite;\n}\n\n@keyframes spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n/* Floating notice over the sheet: truncation and approximation are warnings the\n   reader must see, so they sit on the sheet's top edge, on an elevated surface. */\n._0qoF0J_notice {\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  right: 8px;\n  z-index: 2;\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 6px 9px;\n  border: 0.5px solid var(--dsw-alias-state-warn-primary);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-state-warn-tertiary);\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n  line-height: 1.4;\n  box-shadow: var(--dsw-elevation-panel);\n  pointer-events: none;\n}\n\n._0qoF0J_noticeText {\n  overflow-wrap: anywhere;\n}\n\n/* Side panel: layers, the selected primitive, and the title block. Quiet\n   neutral surface, hairline divider, long lists scroll inside themselves. */\n._0qoF0J_sidePanel {\n  display: flex;\n  flex-direction: column;\n  flex: none;\n  width: 228px;\n  min-height: 0;\n  border-left: 0.5px solid var(--dsw-alias-border-l2);\n  overflow: hidden;\n}\n\n._0qoF0J_sidePanelHidden {\n  display: none;\n}\n\n._0qoF0J_panelSection {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n}\n\n._0qoF0J_layersSection {\n  flex: none;\n  max-height: 46%;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_inspectorSection {\n  flex: 1;\n  min-height: 0;\n}\n\n._0qoF0J_panelHeading {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  padding: 8px 10px 4px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n._0qoF0J_panelHeadingSpacer {\n  flex: 1;\n}\n\n/* The column layout is dismissed from the toolbar; only the overlay needs its\n   own close control. */\n._0qoF0J_panelClose {\n  display: none;\n}\n\n._0qoF0J_panelHeadingButton {\n  min-height: 20px;\n  height: 20px;\n  padding: 0 4px;\n  font-size: 10px;\n  letter-spacing: 0;\n  text-transform: none;\n  font-weight: 400;\n}\n\n._0qoF0J_layerList {\n  min-height: 0;\n  overflow: auto;\n  padding: 0 4px 8px;\n}\n\n._0qoF0J_layerToggle {\n  display: grid;\n  grid-template-columns: 20px 12px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 5px;\n  width: 100%;\n  box-sizing: border-box;\n  min-height: 24px;\n  padding: 0 4px;\n  border: 0;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n._0qoF0J_layerToggle[aria-pressed='false'] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._0qoF0J_layerToggle[aria-pressed='false'] ._0qoF0J_layerName {\n  text-decoration: line-through;\n}\n\n._0qoF0J_layerEye {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: inherit;\n}\n\n._0qoF0J_swatch {\n  width: 10px;\n  height: 10px;\n  box-sizing: border-box;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: 2px;\n}\n\n._0qoF0J_layerName {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11px;\n}\n\n._0qoF0J_layerCount {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* Inspector: key/value rows with the label quiet and the value readable. */\n._0qoF0J_inspector {\n  min-height: 0;\n  overflow: auto;\n  padding: 2px 10px 12px;\n}\n\n._0qoF0J_inspectorHint {\n  margin: 4px 0 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_propertyRow {\n  display: grid;\n  grid-template-columns: 74px minmax(0, 1fr);\n  gap: 8px;\n  align-items: baseline;\n  padding: 3px 0;\n  font-size: 11px;\n}\n\n._0qoF0J_propertyLabel {\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_propertyValue {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_mono {\n  font-family: var(--dsh-font-family-code, ui-monospace, 'SF Mono', Consolas, monospace);\n  font-size: 10px;\n}\n\n._0qoF0J_approxNote {\n  margin: 8px 0 0;\n  padding: 6px 8px;\n  border-left: 2px solid var(--dsw-alias-state-warn-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-tertiary) 55%, transparent);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_inspectorActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-top: 10px;\n}\n\n._0qoF0J_inspectorActions ._0qoF0J_button {\n  border: 0.5px solid var(--dsw-alias-border-l3);\n}\n\n/* The title block summary is read, not operated: rows only, no controls. */\n._0qoF0J_sheetSection {\n  flex: none;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_sheetRows {\n  padding: 0 10px 8px;\n}\n\n._0qoF0J_sheetValue {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* The coverage sentence is read, not scanned: wrap it instead of clipping it. */\n._0qoF0J_sheetValueWrap {\n  white-space: normal;\n  overflow-wrap: anywhere;\n  line-height: 1.4;\n}\n\n/* Hover and press feedback belongs to pointers that have hover. */\n@media (hover: hover) {\n  ._0qoF0J_button:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_primaryButton:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n\n  ._0qoF0J_layoutTab:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_layerToggle:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n}\n\n._0qoF0J_button:active:not(:disabled),\n._0qoF0J_layerToggle:active,\n._0qoF0J_layoutTab:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n/* The sheet outranks the coverage text first. */\n@container (max-width: 720px) {\n  ._0qoF0J_coverage {\n    display: none;\n  }\n}\n\n/* Only a genuinely narrow preview pane gives the panel the overlay treatment:\n   above this width the panel keeps its own column and never covers the sheet. */\n@container (max-width: 520px) {\n  ._0qoF0J_sidePanel {\n    position: absolute;\n    top: 0;\n    right: 0;\n    bottom: 0;\n    z-index: 3;\n    width: min(260px, 82%);\n    background: var(--dsw-alias-bg-document-preview);\n    border-left: 0.5px solid var(--dsw-alias-border-l2);\n    box-shadow: var(--dsw-elevation-panel);\n  }\n\n  ._0qoF0J_toolbarLabel {\n    display: none;\n  }\n\n  ._0qoF0J_panelClose {\n    display: inline-flex;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._0qoF0J_spinner {\n    animation: none;\n    border-top-color: var(--dsw-alias-border-l2);\n    border-left-color: var(--dsw-alias-state-business-primary);\n  }\n}\n\n/* The ECAD drawing pane \u2014 editing additions.\n *\n * Appended as one block so the review can read the M4 surface on its own: the\n * view/edit switch, the edit action row, the staged-change panel and the\n * written-drawing banner. Tokens only, like the reading pane above.\n */\n\n/* View/edit switch: a two-state segmented control, quiet until it is needed. */\n._0qoF0J_modeSwitch {\n  display: inline-flex;\n  align-items: center;\n  flex: none;\n  gap: 2px;\n  padding: 2px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n}\n\n._0qoF0J_modeButton {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 40px;\n  min-height: 22px;\n  padding: 0 7px;\n  border: 0;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n}\n\n._0qoF0J_modeButtonActive {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_editBar {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex: none;\n  min-height: 36px;\n  box-sizing: border-box;\n  padding: 4px 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-interactive-bg-hover);\n  overflow-x: auto;\n  overflow-y: hidden;\n  white-space: nowrap;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_editBarGroup {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n}\n\n._0qoF0J_editBarMeta {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n}\n\n._0qoF0J_applyLabelLong {\n  display: inline;\n}\n\n/* Narrow panes keep the primary action readable: the short label wins. */\n._0qoF0J_applyLabelShort {\n  display: none;\n}\n\n/* The armed tool keeps a filled state; the label says what it does. */\n._0qoF0J_toolArmed {\n  border-color: var(--dsw-alias-state-business-primary) !important;\n  background: var(--dsw-alias-interactive-bg-hover) !important;\n  color: var(--dsw-alias-label-primary) !important;\n}\n\n._0qoF0J_applyButton {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  box-sizing: border-box;\n  min-height: 26px;\n  padding: 0 12px;\n  border: 0.5px solid var(--dsw-alias-button-primary-fill);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-button-primary-fill);\n  color: var(--dsw-alias-label-primary-foreground);\n  font: inherit;\n  font-size: 11px;\n  font-weight: 600;\n  cursor: pointer;\n}\n\n._0qoF0J_applyButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._0qoF0J_modeButton:focus-visible,\n._0qoF0J_applyButton:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n/* The staged-change section keeps its list scrolling inside the panel. */\n._0qoF0J_draftSection {\n  flex: none;\n  max-height: 46%;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow: auto;\n}\n\n/* While a draft is open the layer list keeps its own share of the panel. */\n._0qoF0J_draftSection ~ ._0qoF0J_layersSection {\n  max-height: 30%;\n}\n\n._0qoF0J_draftList {\n  min-height: 0;\n  max-height: 132px;\n  overflow: auto;\n  padding: 0 6px 4px;\n}\n\n._0qoF0J_draftItem {\n  display: grid;\n  grid-template-columns: minmax(52px, auto) minmax(0, 1fr) 22px;\n  align-items: center;\n  gap: 6px;\n  min-height: 24px;\n  padding: 0 2px;\n  border-radius: var(--dsw-radius-xs);\n  font-size: 11px;\n}\n\n._0qoF0J_draftKind {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  text-transform: lowercase;\n}\n\n._0qoF0J_draftSummary {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._0qoF0J_draftHint {\n  margin: 2px 10px 6px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_draftCounts {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  padding: 0 10px 8px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n}\n\n._0qoF0J_draftActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  padding: 2px 10px 8px;\n}\n\n/* The annotation form: three labelled fields, then stage/cancel. */\n._0qoF0J_placementForm {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  padding-bottom: 6px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  margin-bottom: 6px;\n}\n\n._0qoF0J_formRow {\n  display: grid;\n  grid-template-columns: 62px minmax(0, 1fr);\n  align-items: center;\n  gap: 6px;\n  padding: 0 10px;\n  font-size: 11px;\n}\n\n._0qoF0J_formLabel {\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_formInput {\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 24px;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 11px;\n}\n\n._0qoF0J_formInput:focus-visible,\n._0qoF0J_formActions button:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n._0qoF0J_formError {\n  margin: 0 10px;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 10px;\n}\n\n._0qoF0J_formActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  padding: 2px 10px 0;\n}\n\n/* The apply outcome: written path, counters, verification and DWG round trip. */\n._0qoF0J_applyOutcome {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  margin: 0 6px 8px;\n  padding: 6px 8px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-bg-document-preview);\n  font-size: 11px;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_applyOk {\n  border-color: var(--dsw-alias-state-success-primary);\n}\n\n._0qoF0J_applyWarn {\n  border-color: var(--dsw-alias-state-warn-primary);\n}\n\n._0qoF0J_applyFailed {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n._0qoF0J_outputPath {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_outputPath code {\n  font-family: var(--dsh-font-family-code, ui-monospace, 'SF Mono', Consolas, monospace);\n  font-size: 10px;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_applySummary {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.4;\n}\n\n._0qoF0J_counterGroup {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  padding: 4px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n}\n\n._0qoF0J_counterRow {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 8px;\n  font-size: 10px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_counterValue {\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n._0qoF0J_okText {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n._0qoF0J_warnText {\n  color: var(--dsw-alias-state-warn-label);\n}\n\n._0qoF0J_warnBlock {\n  padding: 4px 6px;\n  border-left: 2px solid var(--dsw-alias-state-warn-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-tertiary) 45%, transparent);\n  border-radius: 0 var(--dsw-radius-xs) var(--dsw-radius-xs) 0;\n}\n\n._0qoF0J_warnTitle {\n  display: block;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 600;\n}\n\n._0qoF0J_warnList {\n  margin: 3px 0 0;\n  padding-left: 14px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.4;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_noteBlock {\n  padding: 4px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n}\n\n/* The written drawing's banner sits over the sheet's top edge like the\n   truncation notice, and offers the way back. */\n._0qoF0J_writtenBanner {\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  right: 8px;\n  z-index: 3;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 5px 9px;\n  border: 0.5px solid var(--dsw-alias-state-success-primary);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n  box-shadow: var(--dsw-elevation-panel);\n  overflow-wrap: anywhere;\n}\n\n/* Draft ghosts and the erase fade: the staged state is visible on the sheet\n   without ever claiming the source changed. */\n._0qoF0J_ghostGroup {\n  pointer-events: none;\n}\n\n._0qoF0J_ghostText {\n  fill: var(--ecad-accent);\n  opacity: 0.9;\n}\n\n._0qoF0J_placementMarker {\n  stroke: var(--ecad-accent);\n  stroke-width: 1;\n  fill: none;\n  opacity: 0.9;\n}\n\n/* The annotation tool changes the sheet's cursor and nothing else. */\n._0qoF0J_placingText {\n  cursor: crosshair;\n}\n\n/* A truncation notice under the written-drawing banner keeps both readable. */\n._0qoF0J_noticeBelowBanner {\n  top: 46px;\n}\n\n._0qoF0J_faded {\n  opacity: 0.3;\n}\n\n/* The inspector's edit block: delta fields above the stage actions. */\n._0qoF0J_editActionsBlock {\n  display: flex;\n  flex-direction: column;\n}\n\n/* Editing copy: a hint under the inspector actions, quiet like the rest. */\n._0qoF0J_editHint {\n  margin: 8px 0 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_moveFields {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  gap: 6px;\n  margin-top: 8px;\n}\n\n._0qoF0J_moveField {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  font-size: 10px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_moveField input {\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 24px;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 11px;\n}\n\n._0qoF0J_moveField input:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n@media (hover: hover) {\n  ._0qoF0J_modeButton:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_applyButton:hover:not(:disabled) {\n    background: var(--dsw-alias-button-primary-hover);\n    border-color: var(--dsw-alias-button-primary-hover);\n  }\n\n  ._0qoF0J_draftItem:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._0qoF0J_writtenBanner {\n    box-shadow: none;\n  }\n}\n\n@container (max-width: 520px) {\n  ._0qoF0J_editBarMeta {\n    display: none;\n  }\n\n  ._0qoF0J_editBar {\n    gap: 6px;\n    padding: 4px 8px;\n  }\n\n  /* These rules follow the base declaration, so the cascade keeps them. */\n  ._0qoF0J_applyLabelLong {\n    display: none;\n  }\n\n  ._0qoF0J_applyLabelShort {\n    display: inline;\n  }\n}\n";
var tagId = "@aryacode/dsh-engineering-ecad/EcadBody.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@aryacode/dsh-engineering-ecad";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var classes = {
  "root": "_0qoF0J_root",
  "toolbar": "_0qoF0J_toolbar",
  "toolbarGroup": "_0qoF0J_toolbarGroup",
  "coverage": "_0qoF0J_coverage",
  "toolbarSpacer": "_0qoF0J_toolbarSpacer",
  "badge": "_0qoF0J_badge",
  "badgeWarn": "_0qoF0J_badgeWarn",
  "badgeDot": "_0qoF0J_badgeDot",
  "button": "_0qoF0J_button",
  "iconButton": "_0qoF0J_iconButton",
  "primaryButton": "_0qoF0J_primaryButton",
  "layoutTab": "_0qoF0J_layoutTab",
  "layerToggle": "_0qoF0J_layerToggle",
  "canvasWrap": "_0qoF0J_canvasWrap",
  "icon": "_0qoF0J_icon",
  "layoutTabs": "_0qoF0J_layoutTabs",
  "layoutTabActive": "_0qoF0J_layoutTabActive",
  "tabCount": "_0qoF0J_tabCount",
  "stage": "_0qoF0J_stage",
  "panning": "_0qoF0J_panning",
  "canvas": "_0qoF0J_canvas",
  "primitive": "_0qoF0J_primitive",
  "hovered": "_0qoF0J_hovered",
  "selectionHalo": "_0qoF0J_selectionHalo",
  "selection": "_0qoF0J_selection",
  "state": "_0qoF0J_state",
  "stateTitle": "_0qoF0J_stateTitle",
  "stateBody": "_0qoF0J_stateBody",
  "stateCode": "_0qoF0J_stateCode",
  "stateActions": "_0qoF0J_stateActions",
  "spinner": "_0qoF0J_spinner",
  "notice": "_0qoF0J_notice",
  "noticeText": "_0qoF0J_noticeText",
  "sidePanel": "_0qoF0J_sidePanel",
  "sidePanelHidden": "_0qoF0J_sidePanelHidden",
  "panelSection": "_0qoF0J_panelSection",
  "layersSection": "_0qoF0J_layersSection",
  "inspectorSection": "_0qoF0J_inspectorSection",
  "panelHeading": "_0qoF0J_panelHeading",
  "panelHeadingSpacer": "_0qoF0J_panelHeadingSpacer",
  "panelClose": "_0qoF0J_panelClose",
  "panelHeadingButton": "_0qoF0J_panelHeadingButton",
  "layerList": "_0qoF0J_layerList",
  "layerName": "_0qoF0J_layerName",
  "layerEye": "_0qoF0J_layerEye",
  "swatch": "_0qoF0J_swatch",
  "layerCount": "_0qoF0J_layerCount",
  "inspector": "_0qoF0J_inspector",
  "inspectorHint": "_0qoF0J_inspectorHint",
  "propertyRow": "_0qoF0J_propertyRow",
  "propertyLabel": "_0qoF0J_propertyLabel",
  "propertyValue": "_0qoF0J_propertyValue",
  "mono": "_0qoF0J_mono",
  "approxNote": "_0qoF0J_approxNote",
  "inspectorActions": "_0qoF0J_inspectorActions",
  "sheetSection": "_0qoF0J_sheetSection",
  "sheetRows": "_0qoF0J_sheetRows",
  "sheetValue": "_0qoF0J_sheetValue",
  "sheetValueWrap": "_0qoF0J_sheetValueWrap",
  "toolbarLabel": "_0qoF0J_toolbarLabel",
  "modeSwitch": "_0qoF0J_modeSwitch",
  "modeButton": "_0qoF0J_modeButton",
  "modeButtonActive": "_0qoF0J_modeButtonActive",
  "editBar": "_0qoF0J_editBar",
  "editBarGroup": "_0qoF0J_editBarGroup",
  "editBarMeta": "_0qoF0J_editBarMeta",
  "applyLabelLong": "_0qoF0J_applyLabelLong",
  "applyLabelShort": "_0qoF0J_applyLabelShort",
  "toolArmed": "_0qoF0J_toolArmed",
  "applyButton": "_0qoF0J_applyButton",
  "draftSection": "_0qoF0J_draftSection",
  "draftList": "_0qoF0J_draftList",
  "draftItem": "_0qoF0J_draftItem",
  "draftKind": "_0qoF0J_draftKind",
  "draftSummary": "_0qoF0J_draftSummary",
  "draftHint": "_0qoF0J_draftHint",
  "draftCounts": "_0qoF0J_draftCounts",
  "draftActions": "_0qoF0J_draftActions",
  "placementForm": "_0qoF0J_placementForm",
  "formRow": "_0qoF0J_formRow",
  "formLabel": "_0qoF0J_formLabel",
  "formInput": "_0qoF0J_formInput",
  "formActions": "_0qoF0J_formActions",
  "formError": "_0qoF0J_formError",
  "applyOutcome": "_0qoF0J_applyOutcome",
  "applyOk": "_0qoF0J_applyOk",
  "applyWarn": "_0qoF0J_applyWarn",
  "applyFailed": "_0qoF0J_applyFailed",
  "outputPath": "_0qoF0J_outputPath",
  "applySummary": "_0qoF0J_applySummary",
  "counterGroup": "_0qoF0J_counterGroup",
  "counterRow": "_0qoF0J_counterRow",
  "counterValue": "_0qoF0J_counterValue",
  "okText": "_0qoF0J_okText",
  "warnText": "_0qoF0J_warnText",
  "warnBlock": "_0qoF0J_warnBlock",
  "warnTitle": "_0qoF0J_warnTitle",
  "warnList": "_0qoF0J_warnList",
  "noteBlock": "_0qoF0J_noteBlock",
  "writtenBanner": "_0qoF0J_writtenBanner",
  "ghostGroup": "_0qoF0J_ghostGroup",
  "ghostText": "_0qoF0J_ghostText",
  "placementMarker": "_0qoF0J_placementMarker",
  "placingText": "_0qoF0J_placingText",
  "noticeBelowBanner": "_0qoF0J_noticeBelowBanner",
  "faded": "_0qoF0J_faded",
  "editActionsBlock": "_0qoF0J_editActionsBlock",
  "editHint": "_0qoF0J_editHint",
  "moveFields": "_0qoF0J_moveFields",
  "moveField": "_0qoF0J_moveField"
};
var EcadBody_default = classes;

// packages/ecad/src/client/EcadDraft.tsx
function PlusIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M8 3.5v9M3.5 8h9" })
  );
}
function DismissIcon({ size = 12 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M4 4l8 8M12 4l-8 8" })
  );
}
function CheckIcon({ size = 12 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M3.2 8.6 6.4 11.8 12.8 4.6" })
  );
}
function EditModeToggle({ mode, onChange, t }) {
  return (0, import_react.createElement)(
    "div",
    { className: EcadBody_default.modeSwitch, role: "group", "aria-label": t("editBarLabel"), "data-ecad-mode-switch": "true" },
    (0, import_react.createElement)("button", {
      type: "button",
      className: `${EcadBody_default.modeButton}${mode === "view" ? ` ${EcadBody_default.modeButtonActive}` : ""}`,
      "aria-pressed": mode === "view",
      onClick: () => {
        onChange("view");
      },
      title: t("viewMode")
    }, t("viewMode")),
    (0, import_react.createElement)(
      "button",
      {
        type: "button",
        className: `${EcadBody_default.modeButton}${mode === "edit" ? ` ${EcadBody_default.modeButtonActive}` : ""}`,
        "aria-pressed": mode === "edit",
        onClick: () => {
          onChange("edit");
        },
        title: t("editModeHint")
      },
      t("editMode")
    )
  );
}
function EditBar({ t, tool, onToggleText, stagedCount, applying, canApply, applyDisabledReason, onApply, onClear }) {
  return (0, import_react.createElement)(
    "div",
    { className: EcadBody_default.editBar, role: "group", "aria-label": t("editBarLabel") },
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.editBarGroup },
      (0, import_react.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.primaryButton}${tool === "text" ? ` ${EcadBody_default.toolArmed}` : ""}`,
        "aria-pressed": tool === "text",
        title: t("addTextToolHint"),
        onClick: onToggleText
      }, (0, import_react.createElement)(PlusIcon, {}), t("addTextTool"))
    ),
    (0, import_react.createElement)(
      "span",
      { className: EcadBody_default.editBarMeta },
      stagedCount === 0 ? t("noDraft") : t("stagedCount", { count: stagedCount })
    ),
    (0, import_react.createElement)("span", { className: EcadBody_default.toolbarSpacer }),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.editBarGroup },
      (0, import_react.createElement)("button", {
        type: "button",
        className: EcadBody_default.button,
        disabled: stagedCount === 0 || applying,
        onClick: onClear
      }, t("clearDraft")),
      (0, import_react.createElement)(
        "button",
        {
          type: "button",
          className: EcadBody_default.applyButton,
          disabled: !canApply || applying,
          title: applyDisabledReason,
          onClick: onApply,
          "data-ecad-apply": "true"
        },
        (0, import_react.createElement)("span", { className: EcadBody_default.applyLabelLong }, applying ? t("applying") : t("apply")),
        (0, import_react.createElement)("span", { className: EcadBody_default.applyLabelShort }, applying ? t("applying") : t("applyShort"))
      )
    )
  );
}
function PlacementForm({ t, value, layers, invalidHeight, onChange, onStage, onCancel }) {
  return (0, import_react.createElement)(
    "form",
    {
      className: EcadBody_default.placementForm,
      onSubmit: (event) => {
        event.preventDefault();
        onStage();
      },
      "data-ecad-placement-form": "true"
    },
    (0, import_react.createElement)("div", { className: EcadBody_default.panelHeading }, t("pendingPlacement", { point: `${value.point[0]}, ${value.point[1]}` })),
    (0, import_react.createElement)(
      "label",
      { className: EcadBody_default.formRow },
      (0, import_react.createElement)("span", { className: EcadBody_default.formLabel }, t("text")),
      (0, import_react.createElement)("input", {
        className: EcadBody_default.formInput,
        type: "text",
        value: value.text,
        placeholder: t("text"),
        "aria-label": t("text"),
        onChange: (event) => {
          onChange("text", event.target.value);
        },
        autoFocus: true,
        "data-ecad-placement-text": "true"
      })
    ),
    (0, import_react.createElement)(
      "label",
      { className: EcadBody_default.formRow },
      (0, import_react.createElement)("span", { className: EcadBody_default.formLabel }, t("height")),
      (0, import_react.createElement)("input", {
        className: EcadBody_default.formInput,
        type: "text",
        inputMode: "decimal",
        value: value.height,
        "aria-label": t("height"),
        "aria-invalid": invalidHeight,
        onChange: (event) => {
          onChange("height", event.target.value);
        },
        "data-ecad-placement-height": "true"
      })
    ),
    (0, import_react.createElement)(
      "label",
      { className: EcadBody_default.formRow },
      (0, import_react.createElement)("span", { className: EcadBody_default.formLabel }, t("layer")),
      (0, import_react.createElement)("select", {
        className: EcadBody_default.formInput,
        value: value.layer,
        "aria-label": t("layer"),
        onChange: (event) => {
          onChange("layer", event.target.value);
        },
        "data-ecad-placement-layer": "true"
      }, layers.map((name) => (0, import_react.createElement)("option", { key: name, value: name }, name)))
    ),
    invalidHeight ? (0, import_react.createElement)("p", { className: EcadBody_default.formError, role: "alert" }, t("heightHint")) : null,
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.formActions },
      (0, import_react.createElement)("button", { type: "submit", className: EcadBody_default.applyButton, disabled: value.text.trim() === "" || invalidHeight || value.layer === "" }, t("stagePlacement")),
      (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onCancel }, t("cancel"))
    )
  );
}
function ApplyOutcomePanel({ t, outcome, onDismiss, onOpenWritten, onBackToSource }) {
  if (outcome.kind === "failed") {
    const error = outcome.error;
    return (0, import_react.createElement)(
      "div",
      { className: `${EcadBody_default.applyOutcome} ${EcadBody_default.applyFailed}`, role: "alert", "data-ecad-apply-outcome": "failed" },
      (0, import_react.createElement)("div", { className: EcadBody_default.panelHeading }, t("applyFailedTitle")),
      error === void 0 ? null : (0, import_react.createElement)("code", { className: EcadBody_default.stateCode }, `${t("errorCode")}: ${error.code}`),
      error === void 0 ? null : (0, import_react.createElement)("p", { className: EcadBody_default.stateBody }, error.message),
      error === void 0 ? null : (0, import_react.createElement)("p", { className: EcadBody_default.stateBody }, `${t("errorFix")}: ${error.fix}`),
      (0, import_react.createElement)("div", { className: EcadBody_default.draftActions }, (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onDismiss }, t("dismissResult")))
    );
  }
  const result = outcome.result;
  if (result === void 0) return (0, import_react.createElement)("div", { className: EcadBody_default.applyOutcome }, (0, import_react.createElement)("div", { className: EcadBody_default.panelHeading }, t("appliedTitle")));
  const verification = result.verification;
  const roundTrip = result.dwgRoundTrip;
  const changeTotal = Object.values(result.changes ?? {}).reduce((total, count) => total + count, 0);
  const problems = verification?.problems ?? [];
  const notes = [...result.notes ?? [], ...verification?.notes ?? []];
  return (0, import_react.createElement)(
    "div",
    { className: `${EcadBody_default.applyOutcome} ${verification?.ok === true ? EcadBody_default.applyOk : EcadBody_default.applyWarn}`, "data-ecad-apply-outcome": "applied" },
    (0, import_react.createElement)("div", { className: EcadBody_default.panelHeading }, t("appliedTitle")),
    (0, import_react.createElement)("p", { className: EcadBody_default.outputPath, title: result.outputPath }, t("outputPath"), ": ", (0, import_react.createElement)("code", {}, result.outputPath)),
    (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, t("applyNetSummary", {
      changes: t(changeTotal === 1 ? "changeOne" : "changeMany", { count: changeTotal }),
      verified: verification?.ok === true ? t("verified") : t("notVerified")
    })),
    verification === void 0 ? null : (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.counterGroup, "aria-label": t("verification") },
      (0, import_react.createElement)(
        "div",
        { className: EcadBody_default.counterRow },
        (0, import_react.createElement)("span", {}, t("verification")),
        (0, import_react.createElement)("span", { className: EcadBody_default.counterValue }, `${Object.values(verification.applied ?? {}).reduce((total, count) => total + count, 0)} / ${Object.values(verification.expected ?? {}).reduce((total, count) => total + count, 0)}`)
      ),
      ...Object.entries(verification.dropped ?? {}).map(([kind, count]) => (0, import_react.createElement)(
        "div",
        { key: `drop-${kind}`, className: EcadBody_default.counterRow },
        (0, import_react.createElement)("span", {}, `${t("verificationDropped")}: ${kind}`),
        (0, import_react.createElement)("span", { className: EcadBody_default.counterValue }, String(count))
      )),
      problems.length === 0 ? null : (0, import_react.createElement)(
        "div",
        { className: EcadBody_default.warnBlock, role: "status" },
        (0, import_react.createElement)("span", { className: EcadBody_default.warnTitle }, t("verificationProblems")),
        (0, import_react.createElement)("ul", { className: EcadBody_default.warnList }, problems.map((problem) => (0, import_react.createElement)("li", { key: problem }, problem)))
      ),
      notes.length === 0 ? null : (0, import_react.createElement)(
        "div",
        { className: EcadBody_default.noteBlock },
        (0, import_react.createElement)("span", { className: EcadBody_default.warnTitle }, t("verificationNotes")),
        (0, import_react.createElement)("ul", { className: EcadBody_default.warnList }, notes.map((note) => (0, import_react.createElement)("li", { key: note }, note)))
      )
    ),
    roundTrip === void 0 ? null : (0, import_react.createElement)(
      "div",
      { className: `${EcadBody_default.counterGroup} ${roundTrip.ok ? "" : EcadBody_default.warnBlock}`, "data-ecad-dwg-round-trip": "true" },
      (0, import_react.createElement)(
        "div",
        { className: EcadBody_default.counterRow },
        (0, import_react.createElement)("span", {}, t("dwgRoundTrip")),
        (0, import_react.createElement)("span", { className: `${EcadBody_default.counterValue} ${roundTrip.ok ? EcadBody_default.okText : EcadBody_default.warnText}` }, roundTrip.ok ? (0, import_react.createElement)(CheckIcon, {}) : t("notVerified"))
      ),
      (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, roundTrip.ok ? t("roundTripOk") : t("roundTripDiff", { added: roundTrip.added, removed: roundTrip.removed, changed: roundTrip.changed })),
      roundTrip.truncated ? (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, t("roundTripTruncated")) : null,
      roundTrip.warnings.length === 0 ? null : (0, import_react.createElement)(
        "details",
        { className: EcadBody_default.warnBlock },
        (0, import_react.createElement)("summary", {}, t("roundTripWarnings", { count: roundTrip.warnings.length })),
        (0, import_react.createElement)("ul", { className: EcadBody_default.warnList }, roundTrip.warnings.map((warning) => (0, import_react.createElement)("li", { key: warning }, warning)))
      )
    ),
    outcome.writtenNote === void 0 ? null : (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, outcome.writtenNote),
    outcome.hasWritten === true && outcome.showingWritten !== true ? (0, import_react.createElement)("div", { className: EcadBody_default.draftActions }, (0, import_react.createElement)("button", {
      type: "button",
      className: EcadBody_default.applyButton,
      onClick: onOpenWritten,
      "data-ecad-open-written": "true"
    }, t("openWritten"))) : null,
    outcome.showingWritten === true ? (0, import_react.createElement)("div", { className: EcadBody_default.draftActions }, (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onBackToSource }, t("backToSource"))) : null,
    (0, import_react.createElement)("div", { className: EcadBody_default.draftActions }, (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onDismiss }, t("dismissResult")))
  );
}
function DraftPanel({ t, staged, counts, layoutName, placement, layers, invalidHeight, onPlacementChange, onStagePlacement, onCancelPlacement, onRemove, outcome, onDismissOutcome, onOpenWritten, onBackToSource }) {
  const summarize = (item) => {
    const op = item.op;
    if (op.op === "addText") return t("stageTextSummary", { text: op.text, point: `${op.p[0]}, ${op.p[1]}` });
    if (op.op === "move") return t("stageMoveSummary", { id: op.ids[0] ?? "", dx: op.dx, dy: op.dy });
    if (op.op === "erase") return t("stageEraseSummary", { id: op.ids[0] ?? "" });
    return op.op;
  };
  const kindLabel = (kind) => kind === "addText" ? t("opAddText") : kind === "move" ? t("opMove") : t("opErase");
  return (0, import_react.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.draftSection}`, "data-ecad-draft": "true" },
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.panelHeading },
      t("stagedOps"),
      (0, import_react.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
      staged.length === 0 ? null : (0, import_react.createElement)("span", { className: EcadBody_default.tabCount }, t("stagedCount", { count: staged.length }))
    ),
    placement === void 0 ? null : (0, import_react.createElement)(PlacementForm, {
      t,
      value: placement,
      layers,
      invalidHeight,
      onChange: onPlacementChange,
      onStage: onStagePlacement,
      onCancel: onCancelPlacement
    }),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.draftList, role: "list", "aria-label": t("stagedOps") },
      staged.length === 0 ? (0, import_react.createElement)("p", { className: EcadBody_default.inspectorHint }, t("noDraft")) : staged.map((item) => {
        const summary = summarize(item);
        return (0, import_react.createElement)(
          "div",
          { key: item.key, className: EcadBody_default.draftItem, role: "listitem" },
          (0, import_react.createElement)("span", { className: EcadBody_default.draftKind }, kindLabel(item.op.op)),
          (0, import_react.createElement)("span", { className: EcadBody_default.draftSummary, title: summary }, summary),
          (0, import_react.createElement)("button", {
            type: "button",
            className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`,
            title: t("removeOp", { summary }),
            "aria-label": t("removeOp", { summary }),
            onClick: () => {
              onRemove(item.key);
            }
          }, (0, import_react.createElement)(DismissIcon, {}))
        );
      })
    ),
    (0, import_react.createElement)("p", { className: EcadBody_default.draftHint }, layoutName === "" ? t("draftSeveralLayouts") : t("draftLayoutHint", { layout: layoutName })),
    staged.length === 0 ? null : (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.draftCounts },
      counts.addText === 0 ? null : (0, import_react.createElement)("span", {}, `${counts.addText} ${t("addTextTool")}`),
      counts.move === 0 ? null : (0, import_react.createElement)("span", {}, `${counts.move} ${t("moveAction")}`),
      counts.erase === 0 ? null : (0, import_react.createElement)("span", {}, `${counts.erase} ${t("eraseAction")}`)
    ),
    outcome === void 0 ? null : (0, import_react.createElement)(ApplyOutcomePanel, {
      t,
      outcome,
      onDismiss: onDismissOutcome,
      onOpenWritten,
      onBackToSource
    })
  );
}
function WrittenBanner({ t, path, onBackToSource }) {
  return (0, import_react.createElement)(
    "div",
    { className: EcadBody_default.writtenBanner, role: "status", "data-ecad-written-banner": "true" },
    (0, import_react.createElement)(CheckIcon, {}),
    (0, import_react.createElement)("span", { className: EcadBody_default.noticeText }, t("viewingWritten", { path })),
    (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onBackToSource }, t("backToSource"))
  );
}

// packages/ecad/src/client/vendor/workspace-path.ts
var FILE_ADDRESS_PREFIX = "dsh-resource://file/";
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ":");
}
function encodePath(path) {
  return path.split("/").map(encodeSegment).join("/");
}
function isDriveSegment(segment) {
  return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
}
function sessionFileAddress(sessionId, path) {
  const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
}
function parseFileAddress(address) {
  try {
    if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
    const end = address.search(/[?#]/);
    const [scope, ...rest] = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? void 0 : end).split("/");
    if (scope === "session") {
      const [id, ...segments] = rest;
      if (id === void 0 || id === "" || segments.length === 0) return void 0;
      return { scope, sessionId: decodeURIComponent(id), path: segments.map(decodeURIComponent).join("/") };
    }
    if (scope === "absolute") {
      const unc = rest[0] === "" && rest.length > 1;
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
      if (segments.length === 0 || segments[0] === "") return void 0;
      if (unc) return { scope, path: `//${segments.join("/")}` };
      return { scope, path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}` };
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function isWindowsStylePath(value) {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
}
function isAbsoluteWorkspacePath(path) {
  return path.startsWith("/") || isWindowsStylePath(path);
}
function fileAddressFor(sessionId, cwd, path) {
  const normalized = path.replace(/\\/g, "/");
  if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
  const root = cwd === void 0 ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
  if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
  return sessionFileAddress(sessionId, normalized);
}

// packages/ecad/src/client/EcadBody.tsx
var MIN_ZOOM = 0.25;
var MAX_ZOOM = 60;
var FIT_MARGIN = 24;
var PAN_STEP = 40;
var DRAG_THRESHOLD = 3;
function EyeIcon({ size = 14 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z" }),
    (0, import_react2.createElement)("circle", { cx: 8, cy: 8, r: 1.9 })
  );
}
function EyeOffIcon({ size = 14 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M2 2l12 12" }),
    (0, import_react2.createElement)("path", { d: "M6.3 4.4A7.4 7.4 0 0 1 8 4.2c4.1 0 6.5 3.8 6.5 3.8a12 12 0 0 1-2.4 2.9M4 6.2A12.3 12.3 0 0 0 1.5 8S3.9 11.8 8 11.8c.9 0 1.7-.2 2.4-.4" })
  );
}
function PlusIcon2({ size = 14 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M8 3.5v9M3.5 8h9" })
  );
}
function MinusIcon({ size = 14 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M3.5 8h9" })
  );
}
function FitIcon({ size = 14 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" }),
    (0, import_react2.createElement)("rect", { x: 5.5, y: 5.5, width: 5, height: 5, rx: 0.5 })
  );
}
function LayersIcon({ size = 14 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M8 2.2 14 5.3 8 8.4 2 5.3 8 2.2Z" }),
    (0, import_react2.createElement)("path", { d: "M2 8.4l6 3.1 6-3.1M2 11.2l6 3.1 6-3.1" })
  );
}
function LockIcon({ size = 12 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react2.createElement)("rect", { x: 3.5, y: 7.5, width: 9, height: 6.5, rx: 1 }),
    (0, import_react2.createElement)("path", { d: "M5.5 7.5V5.6a2.5 2.5 0 0 1 5 0v1.9" })
  );
}
function WarningIcon({ size = 13 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M8 2.4 14.4 13H1.6L8 2.4Z" }),
    (0, import_react2.createElement)("path", { d: "M8 6.4v3.1M8 11.5v.1" })
  );
}
function ChatIcon({ size = 14 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M13.5 8.6a5.7 5.7 0 0 1-6 5.5 6.6 6.6 0 0 1-1.9-.3L2.5 14.5l.7-2.7a5.3 5.3 0 0 1-1-3.2 5.7 5.7 0 0 1 6-5.5 5.7 5.7 0 0 1 5.3 5.5Z" })
  );
}
function CloseIcon({ size = 13 }) {
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react2.createElement)("path", { d: "M4 4l8 8M12 4l-8 8" })
  );
}
function useElementSize(element) {
  const [size, setSize] = (0, import_react2.useState)({ width: 0, height: 0 });
  (0, import_react2.useEffect)(() => {
    if (element === null) return;
    const measure = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return size;
}
function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
function zoomAt(view, factor, cx, cy) {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === view.zoom) return view;
  const ratio = zoom / view.zoom;
  return { zoom, panX: cx - ratio * (cx - view.panX), panY: cy - ratio * (cy - view.panY) };
}
function paintOf(primitive, selected, forFill) {
  const dash = primitive.approx ? "4 2" : void 0;
  if (forFill) {
    return {
      fill: primitive.ink,
      fillOpacity: primitive.geometry.t === "path" && primitive.geometry.hatch ? 0.22 : 0.9,
      stroke: selected ? "var(--ecad-accent)" : "none",
      strokeWidth: selected ? 1.5 : 0
    };
  }
  return {
    fill: "none",
    stroke: selected ? "var(--ecad-accent)" : primitive.ink,
    strokeWidth: selected ? 2.5 : 1,
    ...dash === void 0 ? {} : { strokeDasharray: dash }
  };
}
function SceneShape({ geometry, paint, className }) {
  const shared = {
    className,
    style: paint,
    vectorEffect: "non-scaling-stroke",
    strokeLinejoin: "round",
    strokeLinecap: "round",
    "aria-hidden": true
  };
  switch (geometry.t) {
    case "line":
      return (0, import_react2.createElement)("line", { ...shared, x1: geometry.x1, y1: geometry.y1, x2: geometry.x2, y2: geometry.y2 });
    case "path":
      return (0, import_react2.createElement)("path", { ...shared, d: geometry.d });
    case "rect":
      return (0, import_react2.createElement)("rect", { ...shared, x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, rx: 0 });
    case "circle":
      return (0, import_react2.createElement)("circle", { ...shared, cx: geometry.cx, cy: geometry.cy, r: geometry.r });
    case "ellipse":
      return (0, import_react2.createElement)("ellipse", {
        ...shared,
        cx: geometry.cx,
        cy: geometry.cy,
        rx: geometry.rx,
        ry: geometry.ry,
        transform: `rotate(${Number(geometry.degrees.toFixed(4))} ${geometry.cx} ${geometry.cy})`
      });
    case "dot":
      return (0, import_react2.createElement)("circle", {
        ...shared,
        cx: geometry.cx,
        cy: geometry.cy,
        r: geometry.r,
        style: { fill: paint.stroke ?? paint.fill ?? "var(--ecad-ink)", stroke: "none" }
      });
    case "none":
      return null;
    default:
      return null;
  }
}
function textRuns(primitive, fill, underline) {
  return primitive.text.map((line, index) => (0, import_react2.createElement)(
    "text",
    {
      key: `${primitive.id}:text:${index}`,
      x: 0,
      y: 0,
      transform: `translate(${line.x} ${line.y}) scale(1 -1) rotate(${Number((-line.degrees).toFixed(4))})`,
      fontSize: line.height,
      textAnchor: line.anchor,
      dominantBaseline: line.baseline,
      fill,
      fontFamily: "inherit",
      ...underline ? { textDecoration: "underline" } : {},
      "aria-hidden": true
    },
    line.text
  ));
}
function ScenePrimitiveView({ primitive, selected, hovered, faded, onSelect, onHover, onEditPointerDown }) {
  const filled = primitive.geometry.t === "path" && (primitive.geometry.fill || primitive.geometry.hatch);
  const interaction = {
    onClick: (event) => {
      event.stopPropagation();
      onSelect(primitive.id, event);
    },
    onPointerEnter: () => {
      onHover(primitive.id);
    },
    onPointerLeave: () => {
      onHover(void 0);
    },
    ...onEditPointerDown === void 0 ? {} : {
      onPointerDown: (event) => {
        onEditPointerDown(primitive.id, event);
      }
    }
  };
  return (0, import_react2.createElement)(
    "g",
    {
      ...interaction,
      className: [EcadBody_default.primitive, hovered ? EcadBody_default.hovered : "", faded ? EcadBody_default.faded : ""].filter(Boolean).join(" ") || void 0,
      "data-ecad-id": primitive.id,
      "data-ecad-kind": primitive.kind,
      "data-ecad-layer": primitive.layer,
      ...primitive.approx ? { "data-ecad-approx": "true" } : {},
      ...selected ? { "data-ecad-selected": "true" } : {},
      ...faded ? { "data-ecad-faded": "true" } : {}
    },
    primitive.geometry.t === "none" ? null : (0, import_react2.createElement)(SceneShape, { geometry: primitive.geometry, paint: paintOf(primitive, selected, filled) }),
    // A filled primitive already carries the accent on its outline; an unfilled
    // one gets a paper halo under an accent stroke so the highlight reads over
    // any layer colour the drawing uses.
    selected && primitive.geometry.t !== "none" && !filled ? (0, import_react2.createElement)(SceneShape, { geometry: primitive.geometry, paint: { fill: "none", stroke: "var(--ecad-paper)", strokeWidth: 5 }, className: EcadBody_default.selectionHalo }) : null,
    selected && primitive.geometry.t !== "none" && !filled ? (0, import_react2.createElement)(SceneShape, { geometry: primitive.geometry, paint: { fill: "none", stroke: "var(--ecad-accent)", strokeWidth: 2.5 }, className: EcadBody_default.selection }) : null,
    textRuns(primitive, selected ? "var(--ecad-accent)" : primitive.ink, selected)
  );
}
var MemoPrimitive = (0, import_react2.memo)(ScenePrimitiveView);
function SceneView({ scene, fit, view, selectedId, hoveredId, onSelect, onHover, onEditPointerDown, label, fadedIds, ghostMoves, ghostTexts, pendingPoint }) {
  const byId = (0, import_react2.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const primitive of scene.primitives) map.set(primitive.id, primitive);
    return map;
  }, [scene]);
  const span = Math.max(scene.bounds.max[0] - scene.bounds.min[0], scene.bounds.max[1] - scene.bounds.min[1]);
  const marker = Math.max(span * 0.012, 1e-6);
  const ghosts = (ghostMoves ?? []).flatMap((move) => {
    const primitive = byId.get(move.id);
    if (primitive === void 0) return [];
    return [{ move, primitive }];
  });
  return (0, import_react2.createElement)(
    "svg",
    { className: EcadBody_default.canvas, role: "img", "aria-label": label, "data-ecad-canvas": "true" },
    (0, import_react2.createElement)(
      "g",
      { transform: `translate(${view.panX} ${view.panY}) scale(${view.zoom})` },
      (0, import_react2.createElement)(
        "g",
        { transform: `translate(${fit.translateX} ${fit.translateY}) scale(${fit.scale} ${-fit.scale})` },
        scene.primitives.map((primitive) => (0, import_react2.createElement)(MemoPrimitive, {
          key: primitive.id,
          primitive,
          selected: primitive.id === selectedId,
          hovered: primitive.id === hoveredId,
          faded: fadedIds?.has(primitive.id) === true,
          onSelect,
          onHover,
          onEditPointerDown
        })),
        ...ghosts.map(({ move, primitive }) => (0, import_react2.createElement)(
          "g",
          {
            key: `ghost-${move.key}-${move.id}`,
            transform: `translate(${move.delta[0]} ${move.delta[1]})`,
            className: EcadBody_default.ghostGroup,
            "data-ecad-ghost": move.id,
            "aria-hidden": true,
            style: { pointerEvents: "none" }
          },
          primitive.geometry.t === "none" ? null : (0, import_react2.createElement)(SceneShape, {
            geometry: primitive.geometry,
            paint: { fill: "none", stroke: "var(--ecad-accent)", strokeWidth: 1.5, strokeDasharray: "5 3" }
          }),
          textRuns(primitive, "var(--ecad-accent)", false)
        )),
        (ghostTexts ?? []).flatMap((ghost) => {
          const runs = textLines({ id: `ghost-${ghost.key}`, k: "text", layer: "", color: 7, p: ghost.point, t: ghost.text, h: ghost.height, rot: ghost.rotation });
          return runs.map((line, index) => (0, import_react2.createElement)(
            "text",
            {
              key: `ghost-text-${ghost.key}-${index}`,
              x: 0,
              y: 0,
              transform: `translate(${line.x} ${line.y}) scale(1 -1) rotate(${Number((-line.degrees).toFixed(4))})`,
              fontSize: line.height,
              textAnchor: line.anchor,
              dominantBaseline: line.baseline,
              className: EcadBody_default.ghostText,
              fontFamily: "inherit",
              "aria-hidden": true
            },
            line.text
          ));
        }),
        pendingPoint === void 0 ? null : (0, import_react2.createElement)(
          "g",
          { key: "placement-marker", "aria-hidden": true, style: { pointerEvents: "none" }, "data-ecad-placement": `${pendingPoint[0]},${pendingPoint[1]}` },
          (0, import_react2.createElement)("line", { className: EcadBody_default.placementMarker, x1: pendingPoint[0] - marker, y1: pendingPoint[1], x2: pendingPoint[0] + marker, y2: pendingPoint[1] }),
          (0, import_react2.createElement)("line", { className: EcadBody_default.placementMarker, x1: pendingPoint[0], y1: pendingPoint[1] - marker, x2: pendingPoint[0], y2: pendingPoint[1] + marker }),
          (0, import_react2.createElement)("circle", { className: EcadBody_default.placementMarker, cx: pendingPoint[0], cy: pendingPoint[1], r: marker * 0.45 })
        )
      )
    )
  );
}
function LayerPanel({ model, layoutEntities, hidden, onToggle, onShowAll, t }) {
  const counts = (0, import_react2.useMemo)(() => layerCounts(layoutEntities), [layoutEntities]);
  const anyHidden = model.layers.some((layer) => hidden.has(layer.name.toUpperCase()));
  return (0, import_react2.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.layersSection}` },
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.panelHeading },
      t("layers"),
      (0, import_react2.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
      anyHidden ? (0, import_react2.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.panelHeadingButton}`,
        onClick: onShowAll
      }, t("layersShowAll")) : null
    ),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.layerList, role: "group", "aria-label": t("layers") },
      model.layers.map((layer) => {
        const key = layer.name.toUpperCase();
        const visible = !hidden.has(key);
        return (0, import_react2.createElement)(
          "button",
          {
            key: layer.name,
            type: "button",
            className: EcadBody_default.layerToggle,
            "aria-pressed": visible,
            title: `${visible ? t("layerHide", { layer: layer.name }) : t("layerShow", { layer: layer.name })}${layer.frozen === true ? ` \xB7 ${t("layerFrozen")}` : ""}${layer.locked === true ? ` \xB7 ${t("layerLocked")}` : ""}`,
            onClick: () => {
              onToggle(layer.name);
            }
          },
          (0, import_react2.createElement)("span", { className: EcadBody_default.layerEye }, (0, import_react2.createElement)(visible ? EyeIcon : EyeOffIcon, {})),
          (0, import_react2.createElement)("span", { className: EcadBody_default.swatch, style: { background: layerInk(layer) } }),
          (0, import_react2.createElement)("span", { className: EcadBody_default.layerName }, layer.name),
          (0, import_react2.createElement)("span", { className: EcadBody_default.layerCount }, String(counts.get(key) ?? 0))
        );
      })
    )
  );
}
function EditActions({ entity, editing, moveDx, moveDy, onMoveDx, onMoveDy, onStageMove, onStageErase, t }) {
  if (entity === void 0 || !editing) return null;
  if (!editableEntityId(entity.id)) return (0, import_react2.createElement)("p", { className: EcadBody_default.editHint }, t("editFlattened"));
  const dx = parseNumberField(moveDx);
  const dy = parseNumberField(moveDy);
  const canMove = dx !== void 0 && dy !== void 0 && (dx !== 0 || dy !== 0);
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.editActionsBlock, "data-ecad-edit-actions": "true" },
    (0, import_react2.createElement)("p", { className: EcadBody_default.editHint }, t("editEntityHint")),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.moveFields },
      (0, import_react2.createElement)(
        "label",
        { className: EcadBody_default.moveField },
        (0, import_react2.createElement)("span", {}, t("moveDx")),
        (0, import_react2.createElement)("input", {
          type: "text",
          inputMode: "decimal",
          value: moveDx,
          "aria-label": t("moveDx"),
          onChange: (event) => {
            onMoveDx(event.target.value);
          },
          "data-ecad-move-dx": "true"
        })
      ),
      (0, import_react2.createElement)(
        "label",
        { className: EcadBody_default.moveField },
        (0, import_react2.createElement)("span", {}, t("moveDy")),
        (0, import_react2.createElement)("input", {
          type: "text",
          inputMode: "decimal",
          value: moveDy,
          "aria-label": t("moveDy"),
          onChange: (event) => {
            onMoveDy(event.target.value);
          },
          "data-ecad-move-dy": "true"
        })
      )
    ),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.inspectorActions },
      (0, import_react2.createElement)("button", {
        type: "button",
        className: EcadBody_default.applyButton,
        disabled: !canMove,
        onClick: onStageMove,
        "data-ecad-stage-move": "true"
      }, t("moveAction")),
      (0, import_react2.createElement)("button", {
        type: "button",
        className: EcadBody_default.button,
        onClick: onStageErase,
        "data-ecad-stage-erase": "true"
      }, t("eraseAction"))
    )
  );
}
function Inspector({ entity, model, chatUnavailable, editing, moveDx, moveDy, onMoveDx, onMoveDy, onStageMove, onStageErase, onAsk, onClear, t }) {
  if (entity === void 0) {
    return (0, import_react2.createElement)(
      "section",
      { className: `${EcadBody_default.panelSection} ${EcadBody_default.inspectorSection}` },
      (0, import_react2.createElement)("div", { className: EcadBody_default.panelHeading }, t("inspector")),
      (0, import_react2.createElement)("div", { className: EcadBody_default.inspector }, (0, import_react2.createElement)("p", { className: EcadBody_default.inspectorHint }, editing ? t("editNoEntity") : t("noSelection")))
    );
  }
  const facts = factsOf(entity);
  const rows = [
    { label: t("kind"), value: facts.kind, mono: true },
    { label: t("layer"), value: layerNameOf(model, facts.layer) },
    ...facts.text === void 0 ? [] : [{ label: t("text"), value: facts.text }],
    ...facts.point === void 0 ? [] : [{ label: t("position"), value: formatPoint(facts.point), mono: true }],
    ...facts.points === void 0 ? [] : [{ label: t("points"), value: String(facts.points), mono: true }],
    ...facts.block === void 0 ? [] : [{ label: t("block"), value: facts.block }],
    { label: t("entityId"), value: facts.id, mono: true }
  ];
  return (0, import_react2.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.inspectorSection}` },
    (0, import_react2.createElement)("div", { className: EcadBody_default.panelHeading }, t("inspector")),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.inspector },
      rows.map((row) => (0, import_react2.createElement)(
        "div",
        { key: row.label, className: EcadBody_default.propertyRow },
        (0, import_react2.createElement)("span", { className: EcadBody_default.propertyLabel }, row.label),
        (0, import_react2.createElement)("span", { className: `${EcadBody_default.propertyValue}${row.mono === true ? ` ${EcadBody_default.mono}` : ""}` }, row.value)
      )),
      facts.approximate ? (0, import_react2.createElement)("p", { className: EcadBody_default.approxNote }, facts.source === void 0 ? t("approximateNoteGeneric") : t("approximateNote", { src: facts.source })) : null,
      (0, import_react2.createElement)(
        "div",
        { className: EcadBody_default.inspectorActions },
        (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: () => {
          onAsk(entity);
        } }, (0, import_react2.createElement)(ChatIcon, {}), t("askAboutEntity")),
        (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onClear }, t("clearSelection"))
      ),
      chatUnavailable ? (0, import_react2.createElement)("p", { className: EcadBody_default.inspectorHint }, t("askUnavailable")) : null,
      (0, import_react2.createElement)(EditActions, { entity, editing, moveDx, moveDy, onMoveDx, onMoveDy, onStageMove, onStageErase, t })
    )
  );
}
var TITLE_BLOCK_ROWS = [
  { field: "sheetNumber", key: "sheetNumber" },
  { field: "revision", key: "revision" },
  { field: "date", key: "date" },
  { field: "title", key: "sheetTitle" },
  { field: "scale", key: "scale" },
  { field: "project", key: "project" },
  { field: "customer", key: "customer" },
  { field: "drawnBy", key: "drawnBy" },
  { field: "checkedBy", key: "checkedBy" }
];
function SheetSection({ titleBlock, coverage, coverageText, coverageTitle, format, conversion, dxfVersion, units, version, t }) {
  const unit = unitLabel(units);
  const fields = titleBlock?.fields ?? {};
  const rows = [];
  for (const row of TITLE_BLOCK_ROWS) {
    const value = fields[row.field]?.value;
    if (value !== void 0 && value !== "") rows.push({ label: t(row.key), value });
  }
  const converted = conversionLabel(conversion);
  rows.push({ label: t("coverageLabel"), value: coverageText, wrap: true, ...coverageTitle === void 0 ? {} : { title: coverageTitle } });
  if (coverage.truncated) rows.push({ label: t("truncatedBadge"), value: t("truncated"), wrap: true });
  rows.push({
    label: t("format"),
    value: format.toUpperCase(),
    ...format === "dwg" ? { title: t("dwgSupport") } : {}
  });
  if (converted !== void 0) rows.push({ label: t("converted"), value: converted });
  if (conversion.warnings > 0) {
    rows.push({
      label: t("conversionWarningsShort"),
      value: String(conversion.warnings),
      title: conversion.warningTexts.length > 0 ? conversion.warningTexts.join("\n") : t("conversionWarningsHint")
    });
  }
  rows.push({ label: t("dxfVersionLabel"), value: dxfVersion });
  rows.push({ label: t("units"), value: unit ?? t("unitsUnset") });
  rows.push({ label: t("version"), value: version.slice(0, 12) });
  return (0, import_react2.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.sheetSection}` },
    (0, import_react2.createElement)("div", { className: EcadBody_default.panelHeading }, t("sheet")),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.sheetRows },
      rows.map((row) => (0, import_react2.createElement)(
        "div",
        { key: row.label, className: EcadBody_default.propertyRow, title: row.value },
        (0, import_react2.createElement)("span", { className: EcadBody_default.propertyLabel }, row.label),
        (0, import_react2.createElement)("span", { className: `${EcadBody_default.propertyValue} ${row.wrap === true ? EcadBody_default.sheetValueWrap : EcadBody_default.sheetValue}` }, row.value)
      ))
    )
  );
}
function DrawingToolbar({ coverage, coverageText, coverageTitle, ready, format, conversion, writes, editable, mode, onModeChange, panelsOpen, chatUnavailable, onFit, onZoom, onTogglePanels, onAsk, t }) {
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.toolbar },
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.toolbarGroup },
      ready && format !== void 0 ? (0, import_react2.createElement)("span", { className: EcadBody_default.badge, title: formatTitleOf(format, conversion, t) }, format.toUpperCase()) : null,
      ready && !writes ? (0, import_react2.createElement)("span", { className: EcadBody_default.badge, title: t("readOnlyHint") }, (0, import_react2.createElement)(LockIcon, {}), t("readOnly")) : null,
      ready && coverage.truncated ? (0, import_react2.createElement)("span", { className: `${EcadBody_default.badge} ${EcadBody_default.badgeWarn}` }, (0, import_react2.createElement)(WarningIcon, {}), t("truncatedBadge")) : null,
      ready && coverage.approximate > 0 ? (0, import_react2.createElement)("span", { className: EcadBody_default.badge, title: t("approximateHint", { count: coverage.approximate }) }, (0, import_react2.createElement)("span", { className: EcadBody_default.badgeDot }), t("approximateBadge")) : null
    ),
    ready ? (0, import_react2.createElement)("span", { className: EcadBody_default.coverage, title: coverageTitle }, coverageText) : (0, import_react2.createElement)("span", { className: EcadBody_default.coverage }),
    (0, import_react2.createElement)("span", { className: EcadBody_default.toolbarSpacer }),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.toolbarGroup },
      editable ? (0, import_react2.createElement)(EditModeToggle, { mode, onChange: onModeChange, t }) : null,
      (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("fit"), "aria-label": t("fit"), disabled: !ready, onClick: onFit }, (0, import_react2.createElement)(FitIcon, {})),
      (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomOut"), "aria-label": t("zoomOut"), disabled: !ready, onClick: () => {
        onZoom(1 / 1.3);
      } }, (0, import_react2.createElement)(MinusIcon, {})),
      (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomIn"), "aria-label": t("zoomIn"), disabled: !ready, onClick: () => {
        onZoom(1.3);
      } }, (0, import_react2.createElement)(PlusIcon2, {})),
      (0, import_react2.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`,
        title: t("panels"),
        "aria-label": t("panels"),
        "aria-pressed": panelsOpen,
        disabled: !ready,
        onClick: onTogglePanels
      }, (0, import_react2.createElement)(LayersIcon, {})),
      (0, import_react2.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.primaryButton}`,
        title: chatUnavailable ? t("askUnavailable") : t("ask"),
        disabled: !ready || chatUnavailable,
        onClick: onAsk
      }, (0, import_react2.createElement)(ChatIcon, {}), (0, import_react2.createElement)("span", { className: EcadBody_default.toolbarLabel }, t("ask")))
    )
  );
}
function LoadingState({ label }) {
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.state, role: "status" },
    (0, import_react2.createElement)("span", { className: EcadBody_default.spinner }),
    (0, import_react2.createElement)("p", { className: EcadBody_default.stateBody }, label)
  );
}
function FailureState({ error, onRetry, onAsk, chatUnavailable, t }) {
  const unavailable = error.code === "ECAD_DISABLED";
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.state, role: "alert" },
    (0, import_react2.createElement)("h3", { className: EcadBody_default.stateTitle }, unavailable ? t("unavailable") : t("errorTitle")),
    (0, import_react2.createElement)("code", { className: EcadBody_default.stateCode }, `${t("errorCode")}: ${error.code}`),
    (0, import_react2.createElement)("p", { className: EcadBody_default.stateBody }, error.message),
    (0, import_react2.createElement)("p", { className: EcadBody_default.stateBody }, `${t("errorFix")}: ${unavailable ? t("unavailableFix") : error.fix}`),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.stateActions },
      (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onRetry }, t("retry")),
      (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, disabled: chatUnavailable, onClick: onAsk }, (0, import_react2.createElement)(ChatIcon, {}), t("ask"))
    ),
    chatUnavailable ? (0, import_react2.createElement)("p", { className: EcadBody_default.stateBody }, t("askUnavailable")) : null
  );
}
function EcadBody(props) {
  const { resourceAddress, content, t, open, apply: apply2, ask } = props;
  const request = content?.kind === "renderer" ? content : void 0;
  const revision = request?.revision ?? 0;
  const [localRevision, setLocalRevision] = (0, import_react2.useState)(0);
  const [state, setState] = (0, import_react2.useState)({ phase: "loading" });
  const [layoutId, setLayoutId] = (0, import_react2.useState)(void 0);
  const [hidden, setHidden] = (0, import_react2.useState)(/* @__PURE__ */ new Set());
  const [selectedId, setSelectedId] = (0, import_react2.useState)(void 0);
  const [hoveredId, setHoveredId] = (0, import_react2.useState)(void 0);
  const [panelsOpen, setPanelsOpen] = (0, import_react2.useState)(true);
  const panelsTouchedRef = (0, import_react2.useRef)(false);
  const [chatUnavailable, setChatUnavailable] = (0, import_react2.useState)(false);
  const [view, setView] = (0, import_react2.useState)({ zoom: 1, panX: 0, panY: 0 });
  const [panning, setPanning] = (0, import_react2.useState)(false);
  const [mode, setMode] = (0, import_react2.useState)("view");
  const [tool, setTool] = (0, import_react2.useState)(void 0);
  const [placement, setPlacement] = (0, import_react2.useState)(void 0);
  const [staged, setStaged] = (0, import_react2.useState)([]);
  const [dragGhost, setDragGhost] = (0, import_react2.useState)(void 0);
  const [moveDx, setMoveDx] = (0, import_react2.useState)("0");
  const [moveDy, setMoveDy] = (0, import_react2.useState)("0");
  const [applying, setApplying] = (0, import_react2.useState)(false);
  const [outcome, setOutcome] = (0, import_react2.useState)(void 0);
  const [written, setWritten] = (0, import_react2.useState)(void 0);
  const [writtenCandidate, setWrittenCandidate] = (0, import_react2.useState)(void 0);
  const draftKeyRef = (0, import_react2.useRef)(0);
  const editDragRef = (0, import_react2.useRef)(void 0);
  const applyAbortRef = (0, import_react2.useRef)(void 0);
  const [canvasElement, setCanvasElement] = (0, import_react2.useState)(null);
  const dragRef = (0, import_react2.useRef)(void 0);
  const suppressClickRef = (0, import_react2.useRef)(false);
  const size = useElementSize(canvasElement);
  (0, import_react2.useEffect)(() => {
    if (panelsTouchedRef.current) return;
    const paneWidth = canvasElement?.parentElement?.clientWidth ?? 0;
    if (paneWidth === 0) return;
    if (paneWidth <= 520) setPanelsOpen(false);
  }, [canvasElement, size.width]);
  const retry = (0, import_react2.useCallback)(() => {
    if (request !== void 0) request.reload();
    else setLocalRevision((value) => value + 1);
    setState({ phase: "loading" });
  }, [request]);
  (0, import_react2.useEffect)(() => {
    if (resourceAddress === "") return;
    const controller = new AbortController();
    applyAbortRef.current?.abort();
    applyAbortRef.current = void 0;
    setState({ phase: "loading" });
    setSelectedId(void 0);
    setHoveredId(void 0);
    setView({ zoom: 1, panX: 0, panY: 0 });
    setHidden(/* @__PURE__ */ new Set());
    setLayoutId(void 0);
    setMode("view");
    setTool(void 0);
    setPlacement(void 0);
    setStaged([]);
    setApplying(false);
    setOutcome(void 0);
    setWritten(void 0);
    setWrittenCandidate(void 0);
    setDragGhost(void 0);
    setMoveDx("0");
    setMoveDy("0");
    void open(resourceAddress, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setState({ phase: "ready", summary: result.summary, model: result.model, ...result.capabilities === void 0 ? {} : { capabilities: result.capabilities } });
        request?.loaded(result.summary.version);
      } else {
        setState({ phase: "error", error: result.error });
        request?.failed();
      }
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setState({
        phase: "error",
        error: {
          code: "ECAD_DISABLED",
          message: error instanceof Error ? error.message : String(error),
          fix: t("unavailableFix")
        }
      });
      request?.failed();
    });
    return () => {
      controller.abort();
      applyAbortRef.current?.abort();
    };
  }, [resourceAddress, revision, localRevision, open, t]);
  const model = state.phase === "ready" ? state.model : void 0;
  const summary = state.phase === "ready" ? state.summary : void 0;
  const capabilities = state.phase === "ready" ? state.capabilities : void 0;
  const displayModel = written?.model ?? model;
  const format = summary === void 0 ? void 0 : sourceFormatOf(summary);
  const conversion = summary === void 0 ? void 0 : conversionOf(summary.converted);
  const formatLabel = format === void 0 ? "ECAD" : format.toUpperCase();
  const writesAuthoritative = state.phase === "ready" ? capabilities?.writes ?? state.summary.writes : false;
  const editable = state.phase === "ready" && writesAuthoritative && written === void 0;
  const editing = editable && mode === "edit";
  const layers = (0, import_react2.useMemo)(() => displayModel === void 0 ? /* @__PURE__ */ new Map() : layersOf(displayModel), [displayModel]);
  const activeLayout = (0, import_react2.useMemo)(() => {
    if (displayModel === void 0) return void 0;
    return displayModel.layouts.find((layout) => layout.id === layoutId) ?? displayModel.layouts.find((layout) => layout.kind === "model") ?? displayModel.layouts[0];
  }, [displayModel, layoutId]);
  const activeLayoutId = activeLayout?.id;
  const scene = (0, import_react2.useMemo)(
    () => activeLayout === void 0 ? void 0 : sceneOf(activeLayout, layers, hidden),
    [activeLayout, layers, hidden]
  );
  const coverage = (0, import_react2.useMemo)(() => displayModel === void 0 ? void 0 : coverageOf(displayModel), [displayModel]);
  const coverageText = coverage === void 0 ? "" : coverage.unsupportedTotal > 0 ? t("coverage", { entities: coverage.entities.toLocaleString(), approximate: coverage.approximate, unsupported: coverage.unsupportedTotal }) : t("coverageClean", { entities: coverage.entities.toLocaleString() });
  const coverageTitle = coverage === void 0 || coverage.unsupportedTotal === 0 ? void 0 : t("coverageUndrawn", { list: coverage.unsupported.map(([kind, count]) => `${kind} \xD7${count}`).join(", ") });
  const selected = (0, import_react2.useMemo)(
    () => activeLayout === void 0 || selectedId === void 0 ? void 0 : activeLayout.entities.find((entity) => entity.id === selectedId),
    [activeLayout, selectedId]
  );
  const fit = (0, import_react2.useMemo)(() => {
    if (scene === void 0) return { scale: 1, translateX: 0, translateY: 0 };
    return fitBox(scene.bounds, Math.max(size.width, 1), Math.max(size.height, 1), FIT_MARGIN);
  }, [scene, size.width, size.height]);
  const counts = (0, import_react2.useMemo)(() => draftCounts(staged), [staged]);
  const preview = (0, import_react2.useMemo)(() => draftPreview(staged), [staged]);
  const draftLayoutName = (0, import_react2.useMemo)(() => {
    const ids = [...new Set(staged.map((item) => item.layout))];
    if (ids.length === 0) return activeLayout?.name ?? "";
    if (ids.length > 1) return "";
    return displayModel?.layouts.find((layout) => layout.id === ids[0])?.name ?? ids[0];
  }, [activeLayout, displayModel, staged]);
  const placementLayers = (0, import_react2.useMemo)(() => (displayModel?.layers ?? []).map((layer) => layer.name), [displayModel]);
  const defaultAnnotationHeight = activeLayout === void 0 ? 1 : defaultTextHeight(scene?.bounds ?? activeLayout.extents, activeLayout);
  const defaultAnnotationLayer = displayModel === void 0 ? void 0 : defaultLayer(displayModel, activeLayout) ?? placementLayers[0];
  const ghostMoves = (0, import_react2.useMemo)(() => {
    const moves = [...preview.moves];
    if (dragGhost !== void 0) moves.push({ key: "drag", id: dragGhost.id, delta: [dragGhost.dx, dragGhost.dy] });
    return moves;
  }, [preview.moves, dragGhost]);
  const ghostTexts = (0, import_react2.useMemo)(() => {
    const texts = preview.adds.map((add) => ({
      key: add.key,
      point: add.point,
      text: add.text,
      height: add.height,
      rotation: add.rotation
    }));
    if (placement !== void 0) {
      const height = parseNumberField(placement.height);
      texts.push({
        key: "placement",
        point: placement.point,
        text: placement.text,
        height: height !== void 0 && height > 0 ? height : defaultAnnotationHeight,
        rotation: 0
      });
    }
    return texts;
  }, [preview.adds, placement, defaultAnnotationHeight]);
  const pendingPoint = placement?.point;
  const canStageMove = parseNumberField(moveDx) !== void 0 && parseNumberField(moveDy) !== void 0;
  const applyDisabledReason = staged.length === 0 ? t("applyDisabledEmpty") : !editable ? t("readOnlyHint") : void 0;
  const applyView = (0, import_react2.useCallback)((next) => {
    setView(next);
  }, []);
  const zoomBy = (0, import_react2.useCallback)((factor) => {
    applyView((current) => zoomAt(current, factor, size.width / 2, size.height / 2));
  }, [applyView, size.width, size.height]);
  const fitView = (0, import_react2.useCallback)(() => {
    applyView(() => ({ zoom: 1, panX: 0, panY: 0 }));
  }, [applyView]);
  (0, import_react2.useEffect)(() => {
    const element = canvasElement;
    if (element === null) return;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((current) => zoomAt(current, factor, event.clientX - rect.left, event.clientY - rect.top));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
    };
  }, [canvasElement]);
  const addStaged = (0, import_react2.useCallback)((item) => {
    setStaged((current) => [...current, item]);
  }, []);
  const nextDraftKey = (0, import_react2.useCallback)(() => {
    draftKeyRef.current += 1;
    return `draft-${draftKeyRef.current}`;
  }, []);
  const placeAnnotation = (0, import_react2.useCallback)((screen) => {
    const element = canvasElement;
    if (element === null || !editing || tool !== "text") return;
    const rect = element.getBoundingClientRect();
    const point = worldAt({ x: screen.x - rect.left, y: screen.y - rect.top }, fit, view);
    setPlacement((current) => ({
      point,
      text: current?.text ?? "",
      height: current?.height ?? String(Number(defaultAnnotationHeight.toFixed(4))),
      layer: current?.layer ?? defaultAnnotationLayer ?? ""
    }));
  }, [canvasElement, defaultAnnotationHeight, defaultAnnotationLayer, editing, fit, tool, view]);
  const handleSelect = (0, import_react2.useCallback)((id, event) => {
    if (suppressClickRef.current) return;
    if (editing && tool === "text") {
      placeAnnotation({ x: event.clientX, y: event.clientY });
      return;
    }
    setSelectedId(id);
  }, [editing, placeAnnotation, tool]);
  const changeMode = (0, import_react2.useCallback)((next) => {
    setMode(next);
    if (next === "view") {
      setTool(void 0);
      setPlacement(void 0);
      setDragGhost(void 0);
    }
  }, []);
  const toggleTextTool = (0, import_react2.useCallback)(() => {
    if (!editing) return;
    setTool((current) => current === "text" ? void 0 : "text");
    setPlacement(void 0);
  }, [editing]);
  const changePlacement = (0, import_react2.useCallback)((field, value) => {
    setPlacement((current) => current === void 0 ? current : { ...current, [field]: value });
  }, []);
  const cancelPlacement = (0, import_react2.useCallback)(() => {
    setPlacement(void 0);
    setTool(void 0);
  }, []);
  const stagePlacement = (0, import_react2.useCallback)(() => {
    if (!editing || placement === void 0 || activeLayout === void 0) return;
    const text = placement.text.trim();
    const height = parseNumberField(placement.height);
    if (text === "" || height === void 0 || height <= 0) return;
    addStaged(stageText(
      nextDraftKey(),
      activeLayout.id,
      placement.point,
      text,
      height,
      placement.layer === "" ? void 0 : placement.layer
    ));
    setPlacement(void 0);
  }, [activeLayout, addStaged, editing, nextDraftKey, placement]);
  const stageMoveNow = (0, import_react2.useCallback)(() => {
    if (!editing || activeLayout === void 0 || selected === void 0 || !editableEntityId(selected.id)) return;
    const dx = parseNumberField(moveDx);
    const dy = parseNumberField(moveDy);
    if (dx === void 0 || dy === void 0 || dx === 0 && dy === 0) return;
    addStaged(stageMove(nextDraftKey(), activeLayout.id, selected.id, dx, dy));
    setMoveDx("0");
    setMoveDy("0");
  }, [activeLayout, addStaged, editing, moveDx, moveDy, nextDraftKey, selected]);
  const stageEraseNow = (0, import_react2.useCallback)(() => {
    if (!editing || activeLayout === void 0 || selected === void 0 || !editableEntityId(selected.id)) return;
    addStaged(stageErase(nextDraftKey(), activeLayout.id, selected.id));
  }, [activeLayout, addStaged, editing, nextDraftKey, selected]);
  const removeStaged = (0, import_react2.useCallback)((key) => {
    setStaged((current) => current.filter((item) => item.key !== key));
  }, []);
  const clearDraft = (0, import_react2.useCallback)(() => {
    setStaged([]);
    setPlacement(void 0);
    setTool(void 0);
  }, []);
  const dismissOutcome = (0, import_react2.useCallback)(() => {
    setOutcome(void 0);
  }, []);
  const backToSource = (0, import_react2.useCallback)(() => {
    setWritten(void 0);
    setSelectedId(void 0);
    setHoveredId(void 0);
    setLayoutId(void 0);
    setView({ zoom: 1, panX: 0, panY: 0 });
    setOutcome((current) => current?.kind === "applied" ? { ...current, showingWritten: false } : current);
  }, []);
  const openWritten = (0, import_react2.useCallback)(() => {
    if (writtenCandidate === void 0) return;
    setWritten(writtenCandidate);
    setSelectedId(void 0);
    setHoveredId(void 0);
    setLayoutId(void 0);
    setView({ zoom: 1, panX: 0, panY: 0 });
    setOutcome((current) => current?.kind === "applied" ? { ...current, showingWritten: true } : current);
  }, [writtenCandidate]);
  const applyNow = (0, import_react2.useCallback)(() => {
    if (!editable || applying || staged.length === 0 || summary === void 0) return;
    const controller = new AbortController();
    applyAbortRef.current?.abort();
    applyAbortRef.current = controller;
    setApplying(true);
    setOutcome(void 0);
    const ops = draftOps(staged);
    void apply2(resourceAddress, summary.version, ops, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setApplying(false);
      if (!result.ok) {
        setOutcome({ kind: "failed", error: result.error });
        return;
      }
      setStaged([]);
      setPlacement(void 0);
      setTool(void 0);
      if (result.written !== void 0) {
        setWrittenCandidate({ path: result.result.outputPath, model: result.written.model, version: result.written.version });
        setOutcome({ kind: "applied", result: result.result, hasWritten: true });
      } else {
        setOutcome({ kind: "applied", result: result.result, ...result.writtenError === void 0 ? {} : { writtenNote: result.writtenError.message } });
      }
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setApplying(false);
      setOutcome({
        kind: "failed",
        error: {
          code: "ECAD_DISABLED",
          message: error instanceof Error ? error.message : String(error),
          fix: t("applyFailureFix")
        }
      });
    });
  }, [apply2, applying, editable, resourceAddress, staged, summary, t]);
  (0, import_react2.useEffect)(() => {
    if (!editable && mode === "edit") setMode("view");
  }, [editable, mode]);
  (0, import_react2.useEffect)(() => {
    if (placement === void 0 || panelsOpen) return;
    panelsTouchedRef.current = true;
    setPanelsOpen(true);
  }, [placement, panelsOpen]);
  (0, import_react2.useEffect)(() => {
    if (!editing || tool === void 0 && placement === void 0) return;
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      setPlacement(void 0);
      setTool(void 0);
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [editing, placement, tool]);
  const interactiveTarget = (target) => {
    const element = target;
    if (element === null || typeof element?.closest !== "function") return false;
    return element.closest("button, a, input, select, textarea, form, summary") !== null;
  };
  const beginPan = (0, import_react2.useCallback)((event) => {
    if (event.button !== 0) return;
    if (interactiveTarget(event.target)) return;
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = { x: event.clientX, y: event.clientY, panX: view.panX, panY: view.panY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPanning(true);
  }, [view.panX, view.panY]);
  const movePan = (0, import_react2.useCallback)((event) => {
    const editDrag = editDragRef.current;
    if (editDrag !== void 0) {
      const dxPx = event.clientX - editDrag.startX;
      const dyPx = event.clientY - editDrag.startY;
      if (!editDrag.moved && Math.abs(dxPx) < DRAG_THRESHOLD && Math.abs(dyPx) < DRAG_THRESHOLD) return;
      editDrag.moved = true;
      const [dx2, dy2] = worldDelta({ x: dxPx, y: dyPx }, fit, view);
      editDrag.dx = dx2;
      editDrag.dy = dy2;
      setDragGhost({ id: editDrag.id, dx: dx2, dy: dy2 });
      return;
    }
    const drag = dragRef.current;
    if (drag === void 0) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    setView((current) => ({ zoom: current.zoom, panX: drag.panX + dx, panY: drag.panY + dy }));
  }, [fit, view]);
  const endPan = (0, import_react2.useCallback)(() => {
    const editDrag = editDragRef.current;
    if (editDrag !== void 0) {
      editDragRef.current = void 0;
      setDragGhost(void 0);
      if (editDrag.moved && (editDrag.dx !== 0 || editDrag.dy !== 0) && activeLayout !== void 0) {
        addStaged(stageMove(nextDraftKey(), activeLayout.id, editDrag.id, editDrag.dx, editDrag.dy));
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      return;
    }
    const drag = dragRef.current;
    dragRef.current = void 0;
    setPanning(false);
    if (drag !== void 0 && drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  }, [activeLayout, addStaged, nextDraftKey]);
  const beginEditDrag = (0, import_react2.useCallback)((id, event) => {
    if (!editing || tool !== void 0 || !editableEntityId(id)) return;
    event.stopPropagation();
    event.preventDefault?.();
    editDragRef.current = { id, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, moved: false, dx: 0, dy: 0 };
    canvasElement?.setPointerCapture?.(event.pointerId);
    setSelectedId(id);
  }, [canvasElement, editing, tool]);
  const onKeyDown = (0, import_react2.useCallback)((event) => {
    switch (event.key) {
      case "Escape":
        if (placement !== void 0) {
          setPlacement(void 0);
          setTool(void 0);
        } else if (tool !== void 0) {
          setTool(void 0);
        } else {
          setSelectedId(void 0);
          setHoveredId(void 0);
        }
        break;
      case "Enter":
        if (editing && tool === "text") {
          event.preventDefault();
          placeAnnotation({ x: size.width / 2, y: size.height / 2 });
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        applyView((current) => ({ ...current, panX: current.panX + PAN_STEP }));
        break;
      case "ArrowRight":
        event.preventDefault();
        applyView((current) => ({ ...current, panX: current.panX - PAN_STEP }));
        break;
      case "ArrowUp":
        event.preventDefault();
        applyView((current) => ({ ...current, panY: current.panY + PAN_STEP }));
        break;
      case "ArrowDown":
        event.preventDefault();
        applyView((current) => ({ ...current, panY: current.panY - PAN_STEP }));
        break;
      case "+":
      case "=":
        event.preventDefault();
        zoomBy(1.3);
        break;
      case "-":
      case "_":
        event.preventDefault();
        zoomBy(1 / 1.3);
        break;
      default:
        break;
    }
  }, [applyView, editing, placement, placeAnnotation, size.height, size.width, tool, zoomBy]);
  const askReview = (0, import_react2.useCallback)(() => {
    const told = ask(resourceAddress, t("askReview", { format: formatLabel, path: pathOf2(resourceAddress) }));
    setChatUnavailable(!told);
  }, [ask, formatLabel, resourceAddress, t]);
  const askEntity = (0, import_react2.useCallback)((entity) => {
    const told = ask(resourceAddress, t("askEntity", {
      id: entity.id,
      kind: entity.k,
      layer: entity.layer,
      format: formatLabel,
      path: pathOf2(resourceAddress)
    }));
    setChatUnavailable(!told);
  }, [ask, formatLabel, resourceAddress, t]);
  const hover = (0, import_react2.useCallback)((id) => {
    setHoveredId(id);
  }, []);
  const clearSelection = (0, import_react2.useCallback)(() => {
    setSelectedId(void 0);
  }, []);
  const toggleLayer = (0, import_react2.useCallback)((name) => {
    const key = name.toUpperCase();
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelectedId((current) => {
      if (current === void 0) return current;
      const entity = activeLayout?.entities.find((candidate) => candidate.id === current);
      return entity !== void 0 && entity.layer.toUpperCase() === key ? void 0 : current;
    });
  }, [activeLayout]);
  const showAllLayers = (0, import_react2.useCallback)(() => {
    setHidden(/* @__PURE__ */ new Set());
  }, []);
  const layouts = displayModel?.layouts ?? [];
  const layoutTabs = layouts.length > 1 ? (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.layoutTabs, role: "tablist", "aria-label": t("layout") },
    layouts.map((layout) => (0, import_react2.createElement)(
      "button",
      {
        key: layout.id,
        type: "button",
        role: "tab",
        "aria-selected": layout.id === activeLayoutId,
        title: t("layoutTab", { name: layout.name }),
        className: `${EcadBody_default.layoutTab}${layout.id === activeLayoutId ? ` ${EcadBody_default.layoutTabActive}` : ""}`,
        onClick: () => {
          setLayoutId(layout.id);
          setSelectedId(void 0);
          setHoveredId(void 0);
          setView({ zoom: 1, panX: 0, panY: 0 });
        }
      },
      layout.kind === "model" ? t("modelSpace") : layout.name,
      (0, import_react2.createElement)("span", { className: EcadBody_default.tabCount }, String(layout.entities.length))
    ))
  ) : null;
  let stage;
  if (state.phase === "loading") {
    stage = (0, import_react2.createElement)(LoadingState, { label: t("loading") });
  } else if (state.phase === "error") {
    stage = (0, import_react2.createElement)(FailureState, {
      error: state.error,
      onRetry: retry,
      onAsk: askReview,
      chatUnavailable,
      t
    });
  } else if (scene === void 0 || coverage === void 0 || summary === void 0) {
    stage = (0, import_react2.createElement)(LoadingState, { label: t("loadingModel") });
  } else if (scene.primitives.length === 0) {
    stage = (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.state, role: "status" },
      (0, import_react2.createElement)("h3", { className: EcadBody_default.stateTitle }, t("empty")),
      (0, import_react2.createElement)("p", { className: EcadBody_default.stateBody }, t("emptyHint", { entities: coverage.entities.toLocaleString() })),
      (0, import_react2.createElement)("div", { className: EcadBody_default.stateActions }, (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: retry }, t("retry")))
    );
  } else {
    const panelToggle = panelsOpen ? "" : ` ${EcadBody_default.sidePanelHidden}`;
    const canvasLabel = t("canvasLabel", { path: pathOf2(resourceAddress) });
    stage = (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.stage },
      (0, import_react2.createElement)(
        "div",
        {
          ref: setCanvasElement,
          className: `${EcadBody_default.canvasWrap}${panning ? ` ${EcadBody_default.panning}` : ""}${editing && tool === "text" ? ` ${EcadBody_default.placingText}` : ""}`,
          tabIndex: 0,
          role: "group",
          "aria-label": canvasLabel,
          title: editing && tool === "text" ? t("placementHint") : `${t("panHint")} \xB7 ${t("keyboardHint")}`,
          onKeyDown,
          onPointerDown: beginPan,
          onPointerMove: movePan,
          onPointerUp: endPan,
          onPointerCancel: endPan,
          onClick: (event) => {
            if (suppressClickRef.current) return;
            if (interactiveTarget(event.target)) return;
            if (editing && tool === "text") {
              placeAnnotation({ x: event.clientX, y: event.clientY });
              return;
            }
            setSelectedId(void 0);
          }
        },
        // SceneView is a component, not an inlined helper: it owns hooks (the
        // ghost lookup memo), so it must be rendered through React.
        (0, import_react2.createElement)(SceneView, {
          scene,
          fit,
          view,
          selectedId,
          hoveredId,
          onSelect: handleSelect,
          onHover: hover,
          onEditPointerDown: beginEditDrag,
          label: canvasLabel,
          fadedIds: preview.erases,
          ghostMoves: editing ? ghostMoves : [],
          ghostTexts: editing ? ghostTexts : [],
          pendingPoint: editing ? pendingPoint : void 0
        }),
        written === void 0 ? null : (0, import_react2.createElement)(WrittenBanner, { t, path: written.path, onBackToSource: backToSource }),
        coverage.truncated ? (0, import_react2.createElement)(
          "div",
          { className: `${EcadBody_default.notice}${written === void 0 ? "" : ` ${EcadBody_default.noticeBelowBanner}`}`, role: "status" },
          (0, import_react2.createElement)(WarningIcon, {}),
          (0, import_react2.createElement)("span", { className: EcadBody_default.noticeText }, t("truncated"))
        ) : null
      ),
      (0, import_react2.createElement)(
        "div",
        { className: `${EcadBody_default.sidePanel}${panelToggle}` },
        (0, import_react2.createElement)(
          "div",
          { className: EcadBody_default.panelHeading },
          (0, import_react2.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
          (0, import_react2.createElement)("button", {
            type: "button",
            className: `${EcadBody_default.button} ${EcadBody_default.iconButton} ${EcadBody_default.panelClose}`,
            title: t("panels"),
            "aria-label": t("panels"),
            onClick: () => {
              panelsTouchedRef.current = true;
              setPanelsOpen(false);
            }
          }, (0, import_react2.createElement)(CloseIcon, {}))
        ),
        editing || outcome !== void 0 ? (0, import_react2.createElement)(DraftPanel, {
          t,
          staged,
          counts,
          layoutName: draftLayoutName,
          placement: editing ? placement : void 0,
          layers: placementLayers,
          invalidHeight: placement !== void 0 && (parseNumberField(placement.height) === void 0 || (parseNumberField(placement.height) ?? 0) <= 0),
          onPlacementChange: changePlacement,
          onStagePlacement: stagePlacement,
          onCancelPlacement: cancelPlacement,
          onRemove: removeStaged,
          outcome,
          onDismissOutcome: dismissOutcome,
          onOpenWritten: openWritten,
          onBackToSource: backToSource
        }) : null,
        (0, import_react2.createElement)(LayerPanel, {
          model: displayModel ?? state.model,
          layoutEntities: activeLayout?.entities ?? [],
          hidden,
          onToggle: toggleLayer,
          onShowAll: showAllLayers,
          t
        }),
        (0, import_react2.createElement)(Inspector, {
          entity: selected,
          model: displayModel ?? state.model,
          chatUnavailable,
          editing,
          moveDx,
          moveDy,
          onMoveDx: setMoveDx,
          onMoveDy: setMoveDy,
          onStageMove: stageMoveNow,
          onStageErase: stageEraseNow,
          onAsk: askEntity,
          onClear: clearSelection,
          t
        }),
        // The sheet's identity gives way to the draft while the pane is editing:
        // the panel has no room for both, and the read state returns in view mode.
        editing || outcome !== void 0 ? null : (0, import_react2.createElement)(SheetSection, {
          titleBlock: summary.titleBlock,
          coverage: coverage ?? { entities: 0, approximate: 0, unsupportedTotal: 0, unsupported: [], truncated: false },
          coverageText,
          coverageTitle,
          format: format ?? "dxf",
          conversion: conversion ?? { warnings: 0, warningTexts: [] },
          dxfVersion: summary.dxfVersion,
          units: summary.units,
          version: summary.version,
          t
        })
      )
    );
  }
  return (0, import_react2.createElement)(
    "div",
    {
      className: EcadBody_default.root,
      "data-ecad-pane": "drawing",
      "data-ecad-state": state.phase,
      ...format === void 0 ? {} : { "data-ecad-format": format },
      ...editable ? { "data-ecad-editable": "true" } : {},
      ...editing ? { "data-ecad-editing": "true" } : {}
    },
    (0, import_react2.createElement)(DrawingToolbar, {
      coverage: coverage ?? { entities: 0, approximate: 0, unsupportedTotal: 0, unsupported: [], truncated: false },
      coverageText,
      coverageTitle,
      ready: state.phase === "ready" && coverage !== void 0,
      format,
      conversion,
      writes: writesAuthoritative,
      editable,
      mode,
      onModeChange: changeMode,
      panelsOpen,
      chatUnavailable,
      onFit: fitView,
      onZoom: zoomBy,
      onTogglePanels: () => {
        panelsTouchedRef.current = true;
        setPanelsOpen((value) => !value);
      },
      onAsk: askReview,
      t
    }),
    layoutTabs,
    editing ? (0, import_react2.createElement)(EditBar, {
      t,
      tool,
      onToggleText: toggleTextTool,
      stagedCount: staged.length,
      applying,
      canApply: staged.length > 0 && !applying,
      applyDisabledReason,
      onApply: applyNow,
      onClear: clearDraft
    }) : null,
    stage
  );
}
function conversionLabel(conversion) {
  if (conversion.converter === void 0) return conversion.warnings > 0 ? "converted" : void 0;
  return conversion.version === void 0 ? conversion.converter : `${conversion.converter} ${conversion.version}`;
}
function formatTitleOf(format, conversion, t) {
  const parts = [format.toUpperCase()];
  const converted = conversion === void 0 ? void 0 : conversionLabel(conversion);
  if (converted !== void 0) parts.push(t("convertedVia", { converter: converted }));
  if (conversion !== void 0 && conversion.warnings > 0) parts.push(t("conversionWarnings", { count: conversion.warnings }));
  if (format === "dwg") parts.push(t("dwgSupport"));
  return parts.join(" \xB7 ");
}
function pathOf2(address) {
  return parseFileAddress(address)?.path ?? address;
}

// packages/ecad/src/client/locales.ts
var en = {
  title: "ECAD drawing",
  loading: "Reading drawing\u2026",
  loadingModel: "Drawing the sheet\u2026",
  invalid: "The preview artifact for this drawing could not be read.",
  retry: "Retry",
  unavailable: "The ECAD service is unavailable in this composition.",
  unavailableFix: "Open this drawing in a full AryaCode profile with the engineering bundle mounted.",
  errorTitle: "Could not open this drawing",
  errorCode: "Code",
  errorFix: "What to do",
  drawingChanged: "The drawing changed while the preview was being read. Reload it.",
  drawingTooLarge: "The preview artifact for this drawing is larger than this pane will read.",
  invalidArtifact: "The cached preview is not a readable sheet model.",
  modelSpace: "Model",
  paperSpace: "Paper",
  layout: "Layout",
  layoutTab: "Show layout {name}",
  entities: "entities",
  entityCount: "{count} entities",
  coverage: "{entities} entities \xB7 {approximate} approximate \xB7 {unsupported} undrawn",
  coverageClean: "{entities} entities \xB7 all drawn as carried geometry",
  coverageUndrawn: "Undrawn source types: {list}",
  coverageLabel: "Coverage",
  truncatedBadge: "Truncated",
  truncated: "The sheet model was truncated at the entity cap; some geometry is not shown.",
  approximateBadge: "Approximate",
  approximateHint: "{count} primitives are drawn from approximate geometry (tessellated splines, hatch outlines, placeholder dimensions).",
  readOnly: "Read-only",
  readOnlyHint: "ECAD writes are switched off for this row. Enable writes under Plugins \u2192 Engineering \u2192 ECAD to edit; the drawing can still be reviewed here.",
  writes: "Writes enabled",
  layers: "Layers",
  layersShowAll: "Show every layer",
  layerShow: "Show layer {layer}",
  layerHide: "Hide layer {layer}",
  layerFrozen: "Frozen in the drawing",
  layerLocked: "Locked in the drawing",
  layerCount: "{count}",
  layerHidden: "hidden",
  inspector: "Entity",
  noSelection: "Click a primitive to inspect it.",
  kind: "Kind",
  layer: "Layer",
  text: "Text",
  position: "Position",
  points: "Points",
  block: "Block",
  approximation: "Approximation",
  approximateNote: "Approximate geometry carried from {src}.",
  approximateNoteGeneric: "Approximate geometry carried from the source drawing.",
  entityId: "Entity id",
  selection: "Selected",
  clearSelection: "Clear selection",
  askAboutEntity: "Ask Arya about this entity",
  sheet: "Sheet",
  sheetNumber: "Sheet",
  sheetCount: "of",
  sheetTitle: "Title",
  revision: "Revision",
  date: "Date",
  scale: "Scale",
  project: "Project",
  customer: "Customer",
  drawnBy: "Drawn by",
  checkedBy: "Checked by",
  version: "File version",
  ask: "Ask Arya",
  askUnavailable: "Arya chat is unavailable in this session.",
  askReview: "Review this {format} drawing at {path}. Check the layers, the title block and any unsupported or approximate geometry; list what needs an engineer.",
  askEntity: "Explain entity {id} ({kind} on layer {layer}) in the {format} drawing at {path}, and say whether it is likely to be modified or ignored by a review.",
  fit: "Fit",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  panels: "Show or hide the drawing panels",
  panHint: "Drag to pan \xB7 wheel to zoom",
  keyboardHint: "Arrow keys pan, + and \u2212 zoom, Escape clears the selection when the drawing is focused.",
  canvasLabel: "Drawing canvas for {path}",
  empty: "This drawing has no drawable entities.",
  emptyHint: "The sheet model carries {entities} entities and none of them is geometry this preview draws.",
  dxfVersion: "DXF {version}",
  dxfVersionLabel: "DXF version",
  format: "Format",
  converted: "Converted via",
  convertedVia: "Converted via {converter}",
  conversionWarnings: "{count} conversion warnings",
  conversionWarningsShort: "Conversion warnings",
  conversionWarningsHint: "The embedded converter reported warnings for this drawing; review the converted geometry before relying on it.",
  dwgSupport: "DWG is supported through the embedded converter. The host reports the conversion provenance and any warnings; this preview does not claim fidelity beyond them.",
  units: "Units",
  unitsUnset: "Units unset",
  viewMode: "View",
  editMode: "Edit",
  editModeHint: "Edit mode stages changes and writes them as a new drawing. The source drawing is never changed.",
  editBarLabel: "Editing",
  addTextTool: "Add text annotation",
  addTextToolHint: "Click the sheet to place the annotation, then fill in its text and height.",
  pendingPlacement: "New annotation at {point}",
  placementHint: "Click the sheet to place the annotation.",
  stagePlacement: "Stage annotation",
  opAddText: "Text",
  opMove: "Move",
  opErase: "Erase",
  height: "Height",
  heightHint: "Height must be a positive number in drawing units.",
  cancel: "Cancel",
  stagedOps: "Staged changes",
  stagedCount: "{count} staged",
  noDraft: "No staged changes yet.",
  removeOp: "Remove {summary}",
  clearDraft: "Clear all",
  stageTextSummary: "Annotation \u201C{text}\u201D at {point}",
  stageMoveSummary: "Move entity {id} by {dx}, {dy}",
  stageEraseSummary: "Erase entity {id}",
  apply: "Apply as new drawing",
  applyShort: "Apply",
  applyFailedTitle: "Apply failed",
  applying: "Applying\u2026",
  applyDisabledEmpty: "Stage at least one change to apply it.",
  applyFailureFix: "Reload the drawing and apply again; the source drawing was not changed.",
  applyInvalid: "the Host did not report the written drawing",
  writtenUnreadable: "The drawing was written, but its preview could not be read here; reload it to view it.",
  applyNetSummary: "{changes} \xB7 {verified}",
  changeOne: "{count} change",
  changeMany: "{count} changes",
  verified: "verified",
  notVerified: "not verified",
  verification: "Verification",
  verificationProblems: "Reported problems",
  verificationDropped: "Dropped source objects",
  verificationNotes: "Host notes",
  appliedTitle: "Written drawing",
  viewingWritten: "Showing the written drawing at {path}",
  backToSource: "Back to source",
  openWritten: "Open written drawing",
  draftSeveralLayouts: "This draft targets several layouts.",
  outputPath: "Output",
  dismissResult: "Dismiss",
  dwgRoundTrip: "DWG round trip",
  roundTripOk: "The DWG round trip matched the written drawing.",
  roundTripDiff: "added {added} \xB7 removed {removed} \xB7 changed {changed}",
  roundTripTruncated: "The round-trip comparison was truncated.",
  roundTripWarnings: "{count} converter warnings",
  moveAction: "Stage move",
  moveDx: "Move X",
  moveDy: "Move Y",
  eraseAction: "Stage erase",
  editEntityHint: "Edits move and erase the entity as the drawing stores it.",
  editFlattened: "This entity comes from a block definition and cannot be edited in place.",
  editNoEntity: "Select an entity to move or erase it.",
  draftLayoutHint: "Changes target the {layout} layout."
};
var zh = {
  title: "ECAD \u56FE\u7EB8",
  loading: "\u6B63\u5728\u8BFB\u53D6\u56FE\u7EB8\u2026",
  loadingModel: "\u6B63\u5728\u7ED8\u5236\u56FE\u7EB8\u2026",
  invalid: "\u65E0\u6CD5\u8BFB\u53D6\u6B64\u56FE\u7EB8\u7684\u9884\u89C8\u6587\u4EF6\u3002",
  retry: "\u91CD\u8BD5",
  unavailable: "\u6B64\u7EC4\u5408\u4E2D\u6CA1\u6709\u53EF\u7528\u7684 ECAD \u670D\u52A1\u3002",
  unavailableFix: "\u8BF7\u5728\u5B8C\u6574\u6302\u8F7D\u5DE5\u7A0B\u63D2\u4EF6\u7684 AryaCode \u914D\u7F6E\u4E2D\u6253\u5F00\u6B64\u56FE\u7EB8\u3002",
  errorTitle: "\u65E0\u6CD5\u6253\u5F00\u6B64\u56FE\u7EB8",
  errorCode: "\u9519\u8BEF\u7801",
  errorFix: "\u5904\u7406\u5EFA\u8BAE",
  drawingChanged: "\u8BFB\u53D6\u9884\u89C8\u65F6\u56FE\u7EB8\u53D1\u751F\u53D8\u5316\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u3002",
  drawingTooLarge: "\u6B64\u56FE\u7EB8\u7684\u9884\u89C8\u6587\u4EF6\u8D85\u8FC7\u6B64\u9762\u677F\u53EF\u8BFB\u53D6\u7684\u5927\u5C0F\u3002",
  invalidArtifact: "\u7F13\u5B58\u7684\u9884\u89C8\u6587\u4EF6\u4E0D\u662F\u53EF\u8BFB\u53D6\u7684\u56FE\u7EB8\u6A21\u578B\u3002",
  modelSpace: "\u6A21\u578B",
  paperSpace: "\u56FE\u7EB8",
  layout: "\u5E03\u5C40",
  layoutTab: "\u663E\u793A\u5E03\u5C40 {name}",
  entities: "\u4E2A\u56FE\u5143",
  entityCount: "{count} \u4E2A\u56FE\u5143",
  coverage: "{entities} \u4E2A\u56FE\u5143 \xB7 {approximate} \u4E2A\u8FD1\u4F3C \xB7 {unsupported} \u4E2A\u672A\u7ED8\u5236",
  coverageClean: "{entities} \u4E2A\u56FE\u5143 \xB7 \u5168\u90E8\u6309\u539F\u6709\u51E0\u4F55\u7ED8\u5236",
  coverageUndrawn: "\u672A\u7ED8\u5236\u7684\u6E90\u7C7B\u578B\uFF1A{list}",
  coverageLabel: "\u8986\u76D6\u8303\u56F4",
  truncatedBadge: "\u5DF2\u622A\u65AD",
  truncated: "\u56FE\u7EB8\u6A21\u578B\u5728\u5B9E\u4F53\u4E0A\u9650\u5904\u88AB\u622A\u65AD\uFF0C\u90E8\u5206\u51E0\u4F55\u672A\u663E\u793A\u3002",
  approximateBadge: "\u8FD1\u4F3C",
  approximateHint: "{count} \u4E2A\u56FE\u5143\u7531\u8FD1\u4F3C\u51E0\u4F55\u7ED8\u5236\uFF08\u6837\u6761\u7EC6\u5206\u3001\u586B\u5145\u8F6E\u5ED3\u3001\u5360\u4F4D\u6807\u6CE8\uFF09\u3002",
  readOnly: "\u53EA\u8BFB",
  readOnlyHint: "\u6B64\u884C\u7684 ECAD \u5199\u5165\u5DF2\u5173\u95ED\u3002\u8BF7\u5728\u201C\u63D2\u4EF6 \u2192 \u5DE5\u7A0B \u2192 ECAD\u201D\u4E2D\u542F\u7528\u5199\u5165\u540E\u518D\u7F16\u8F91\uFF1B\u4ECD\u53EF\u5728\u6B64\u67E5\u770B\u56FE\u7EB8\u3002",
  writes: "\u5199\u5165\u5DF2\u542F\u7528",
  layers: "\u56FE\u5C42",
  layersShowAll: "\u663E\u793A\u6240\u6709\u56FE\u5C42",
  layerShow: "\u663E\u793A\u56FE\u5C42 {layer}",
  layerHide: "\u9690\u85CF\u56FE\u5C42 {layer}",
  layerFrozen: "\u56FE\u7EB8\u4E2D\u5DF2\u51BB\u7ED3",
  layerLocked: "\u56FE\u7EB8\u4E2D\u5DF2\u9501\u5B9A",
  layerCount: "{count}",
  layerHidden: "\u5DF2\u9690\u85CF",
  inspector: "\u56FE\u5143",
  noSelection: "\u5355\u51FB\u56FE\u5143\u4EE5\u67E5\u770B\u5176\u4FE1\u606F\u3002",
  kind: "\u7C7B\u578B",
  layer: "\u56FE\u5C42",
  text: "\u6587\u5B57",
  position: "\u4F4D\u7F6E",
  points: "\u70B9\u6570",
  block: "\u5757",
  approximation: "\u8FD1\u4F3C",
  approximateNote: "\u8FD1\u4F3C\u51E0\u4F55\uFF0C\u6E90\u81EA {src}\u3002",
  approximateNoteGeneric: "\u8FD1\u4F3C\u51E0\u4F55\uFF0C\u6E90\u81EA\u6E90\u56FE\u7EB8\u3002",
  entityId: "\u56FE\u5143 ID",
  selection: "\u5DF2\u9009\u4E2D",
  clearSelection: "\u6E05\u9664\u9009\u62E9",
  askAboutEntity: "\u8BE2\u95EE Arya \u6B64\u56FE\u5143",
  sheet: "\u56FE\u7EB8\u4FE1\u606F",
  sheetNumber: "\u56FE\u53F7",
  sheetCount: "\u5171",
  sheetTitle: "\u6807\u9898",
  revision: "\u7248\u672C",
  date: "\u65E5\u671F",
  scale: "\u6BD4\u4F8B",
  project: "\u9879\u76EE",
  customer: "\u5BA2\u6237",
  drawnBy: "\u7ED8\u5236",
  checkedBy: "\u5BA1\u6838",
  version: "\u6587\u4EF6\u7248\u672C",
  format: "\u683C\u5F0F",
  converted: "\u8F6C\u6362\u65B9\u5F0F",
  convertedVia: "\u8F6C\u6362\u65B9\u5F0F\uFF1A{converter}",
  conversionWarnings: "{count} \u6761\u8F6C\u6362\u8B66\u544A",
  conversionWarningsShort: "\u8F6C\u6362\u8B66\u544A",
  conversionWarningsHint: "\u5185\u5D4C\u8F6C\u6362\u5668\u4E3A\u6B64\u56FE\u7EB8\u62A5\u544A\u4E86\u8B66\u544A\uFF1B\u5728\u4F9D\u8D56\u8F6C\u6362\u540E\u7684\u51E0\u4F55\u524D\u8BF7\u5148\u5BA1\u6838\u3002",
  dwgSupport: "DWG \u901A\u8FC7\u5185\u5D4C\u8F6C\u6362\u5668\u63D0\u4F9B\u652F\u6301\u3002\u4E3B\u673A\u62A5\u544A\u8F6C\u6362\u6765\u6E90\u548C\u8B66\u544A\uFF1B\u6B64\u9884\u89C8\u4E0D\u4F1A\u8D85\u51FA\u8FD9\u4E9B\u4FE1\u606F\u4F5C\u51FA\u4FDD\u8BC1\u3002",
  ask: "\u8BE2\u95EE Arya",
  askUnavailable: "\u6B64\u4F1A\u8BDD\u4E2D\u65E0\u6CD5\u4F7F\u7528 Arya \u804A\u5929\u3002",
  askReview: "\u8BF7\u5BA1\u9605\u4F4D\u4E8E {path} \u7684 {format} \u56FE\u7EB8\uFF0C\u68C0\u67E5\u56FE\u5C42\u3001\u6807\u9898\u680F\u4EE5\u53CA\u4E0D\u53D7\u652F\u6301\u6216\u8FD1\u4F3C\u7684\u51E0\u4F55\uFF0C\u5E76\u5217\u51FA\u9700\u8981\u5DE5\u7A0B\u5E08\u5904\u7406\u7684\u5185\u5BB9\u3002",
  askEntity: "\u8BF7\u89E3\u91CA\u4F4D\u4E8E {path} \u7684 {format} \u56FE\u7EB8\u4E2D\u7684\u56FE\u5143 {id}\uFF08{kind}\uFF0C\u56FE\u5C42 {layer}\uFF09\uFF0C\u5E76\u8BF4\u660E\u5BA1\u9605\u65F6\u5B83\u53EF\u80FD\u88AB\u4FEE\u6539\u8FD8\u662F\u5FFD\u7565\u3002",
  fit: "\u9002\u5E94",
  zoomIn: "\u653E\u5927",
  zoomOut: "\u7F29\u5C0F",
  panels: "\u663E\u793A\u6216\u9690\u85CF\u56FE\u7EB8\u9762\u677F",
  panHint: "\u62D6\u52A8\u5E73\u79FB \xB7 \u6EDA\u8F6E\u7F29\u653E",
  keyboardHint: "\u56FE\u7EB8\u83B7\u5F97\u7126\u70B9\u65F6\uFF0C\u65B9\u5411\u952E\u5E73\u79FB\uFF0C+ \u548C \u2212 \u7F29\u653E\uFF0CEsc \u6E05\u9664\u9009\u62E9\u3002",
  canvasLabel: "{path} \u7684\u7ED8\u56FE\u753B\u5E03",
  empty: "\u6B64\u56FE\u7EB8\u6CA1\u6709\u53EF\u7ED8\u5236\u7684\u56FE\u5143\u3002",
  emptyHint: "\u56FE\u7EB8\u6A21\u578B\u5305\u542B {entities} \u4E2A\u56FE\u5143\uFF0C\u4F46\u6CA1\u6709\u6B64\u9884\u89C8\u53EF\u7ED8\u5236\u7684\u51E0\u4F55\u3002",
  dxfVersion: "DXF {version}",
  dxfVersionLabel: "DXF \u7248\u672C",
  units: "\u5355\u4F4D",
  unitsUnset: "\u672A\u8BBE\u7F6E\u5355\u4F4D",
  viewMode: "\u67E5\u770B",
  editMode: "\u7F16\u8F91",
  editModeHint: "\u7F16\u8F91\u6A21\u5F0F\u4F1A\u6682\u5B58\u66F4\u6539\u5E76\u5199\u5165\u65B0\u56FE\u7EB8\uFF0C\u6E90\u56FE\u7EB8\u4E0D\u4F1A\u88AB\u4FEE\u6539\u3002",
  editBarLabel: "\u7F16\u8F91",
  addTextTool: "\u6DFB\u52A0\u6587\u5B57\u6CE8\u91CA",
  addTextToolHint: "\u5355\u51FB\u56FE\u7EB8\u653E\u7F6E\u6CE8\u91CA\uFF0C\u7136\u540E\u586B\u5199\u6587\u5B57\u548C\u5B57\u9AD8\u3002",
  pendingPlacement: "\u4F4D\u4E8E {point} \u7684\u65B0\u6CE8\u91CA",
  placementHint: "\u5355\u51FB\u56FE\u7EB8\u653E\u7F6E\u6CE8\u91CA\u3002",
  stagePlacement: "\u6682\u5B58\u6CE8\u91CA",
  opAddText: "\u6587\u5B57",
  opMove: "\u79FB\u52A8",
  opErase: "\u5220\u9664",
  height: "\u5B57\u9AD8",
  heightHint: "\u5B57\u9AD8\u5FC5\u987B\u662F\u56FE\u7EB8\u5355\u4F4D\u4E2D\u7684\u6B63\u6570\u3002",
  cancel: "\u53D6\u6D88",
  stagedOps: "\u6682\u5B58\u7684\u66F4\u6539",
  stagedCount: "\u5DF2\u6682\u5B58 {count} \u9879",
  noDraft: "\u5C1A\u672A\u6682\u5B58\u4EFB\u4F55\u66F4\u6539\u3002",
  removeOp: "\u79FB\u9664 {summary}",
  clearDraft: "\u5168\u90E8\u6E05\u9664",
  stageTextSummary: "\u6CE8\u91CA\u201C{text}\u201D\u4F4D\u4E8E {point}",
  stageMoveSummary: "\u79FB\u52A8\u56FE\u5143 {id}\uFF0C\u504F\u79FB {dx}\u3001{dy}",
  stageEraseSummary: "\u5220\u9664\u56FE\u5143 {id}",
  apply: "\u5E94\u7528\u4E3A\u65B0\u56FE\u7EB8",
  applyShort: "\u5E94\u7528",
  applyFailedTitle: "\u5E94\u7528\u5931\u8D25",
  applying: "\u6B63\u5728\u5E94\u7528\u2026",
  applyDisabledEmpty: "\u8BF7\u81F3\u5C11\u6682\u5B58\u4E00\u9879\u66F4\u6539\u518D\u5E94\u7528\u3002",
  applyFailureFix: "\u8BF7\u91CD\u65B0\u52A0\u8F7D\u56FE\u7EB8\u540E\u518D\u5E94\u7528\uFF1B\u6E90\u56FE\u7EB8\u672A\u88AB\u4FEE\u6539\u3002",
  applyInvalid: "\u4E3B\u673A\u672A\u62A5\u544A\u5199\u5165\u540E\u7684\u56FE\u7EB8",
  writtenUnreadable: "\u56FE\u7EB8\u5DF2\u5199\u5165\uFF0C\u4F46\u6B64\u9762\u677F\u65E0\u6CD5\u8BFB\u53D6\u5176\u9884\u89C8\uFF1B\u8BF7\u91CD\u65B0\u52A0\u8F7D\u4EE5\u67E5\u770B\u3002",
  applyNetSummary: "{changes} \xB7 {verified}",
  changeOne: "{count} \u9879\u66F4\u6539",
  changeMany: "{count} \u9879\u66F4\u6539",
  verified: "\u5DF2\u9A8C\u8BC1",
  notVerified: "\u672A\u9A8C\u8BC1",
  verification: "\u6821\u9A8C",
  verificationProblems: "\u62A5\u544A\u7684\u95EE\u9898",
  verificationDropped: "\u4E22\u5F03\u7684\u6E90\u5BF9\u8C61",
  verificationNotes: "\u4E3B\u673A\u8BF4\u660E",
  appliedTitle: "\u5DF2\u5199\u5165\u7684\u56FE\u7EB8",
  viewingWritten: "\u6B63\u5728\u663E\u793A\u4F4D\u4E8E {path} \u7684\u5DF2\u5199\u5165\u56FE\u7EB8",
  backToSource: "\u8FD4\u56DE\u6E90\u56FE\u7EB8",
  openWritten: "\u6253\u5F00\u5DF2\u5199\u5165\u7684\u56FE\u7EB8",
  draftSeveralLayouts: "\u6B64\u8349\u7A3F\u6D89\u53CA\u591A\u4E2A\u5E03\u5C40\u3002",
  outputPath: "\u8F93\u51FA",
  dismissResult: "\u5173\u95ED",
  dwgRoundTrip: "DWG \u5F80\u8FD4\u6821\u9A8C",
  roundTripOk: "DWG \u5F80\u8FD4\u7ED3\u679C\u4E0E\u5199\u5165\u7684\u56FE\u7EB8\u4E00\u81F4\u3002",
  roundTripDiff: "\u65B0\u589E {added} \xB7 \u79FB\u9664 {removed} \xB7 \u66F4\u6539 {changed}",
  roundTripTruncated: "\u5F80\u8FD4\u6BD4\u8F83\u5DF2\u622A\u65AD\u3002",
  roundTripWarnings: "{count} \u6761\u8F6C\u6362\u5668\u8B66\u544A",
  moveAction: "\u6682\u5B58\u79FB\u52A8",
  moveDx: "\u79FB\u52A8 X",
  moveDy: "\u79FB\u52A8 Y",
  eraseAction: "\u6682\u5B58\u5220\u9664",
  editEntityHint: "\u7F16\u8F91\u4F1A\u6309\u56FE\u7EB8\u5B58\u50A8\u7684\u65B9\u5F0F\u79FB\u52A8\u6216\u5220\u9664\u56FE\u5143\u3002",
  editFlattened: "\u6B64\u56FE\u5143\u6765\u81EA\u5757\u5B9A\u4E49\uFF0C\u65E0\u6CD5\u5C31\u5730\u7F16\u8F91\u3002",
  editNoEntity: "\u9009\u62E9\u56FE\u5143\u4EE5\u79FB\u52A8\u6216\u5220\u9664\u3002",
  draftLayoutHint: "\u66F4\u6539\u76EE\u6807\u662F {layout} \u5E03\u5C40\u3002"
};

// packages/ecad/src/client/index.tsx
var ID = "dsh-engineering-ecad/drawing";
var NS = "sidebarEcad";
var MOUNT_TIMEOUT_MS = 15e3;
var READ_CHUNK = 1024 * 1024;
var inject = ["slots", "locale", "documentPreviews", "remote", "remote.workspaceFiles"];
function hostFileOf(address) {
  const parsed = parseFileAddress(address);
  if (parsed === void 0 || parsed.scope !== "session" || parsed.sessionId === void 0) {
    throw new EcadArtifactError("ECAD_NO_SESSION", `not a session file address "${address}"`, "Open the drawing from the conversation whose workspace holds it.");
  }
  return { sessionId: parsed.sessionId, path: parsed.path };
}
function failureOf(value, fallback) {
  if (value !== null && typeof value === "object") {
    const record = value;
    if (typeof record.code === "string" && typeof record.message === "string") {
      return {
        code: record.code,
        message: record.message,
        fix: typeof record.fix === "string" ? record.fix : fallback.fix
      };
    }
  }
  return {
    code: fallback.code,
    message: typeof value === "string" && value !== "" ? value : fallback.code,
    fix: fallback.fix
  };
}
function apply(ctx) {
  let draft = () => false;
  ctx.inject(["sessions", "conversation"], (scope) => {
    const sessions = scope.sessions;
    const conversation = scope.conversation;
    if (sessions === void 0 || conversation === void 0) return;
    draft = (address, context) => {
      let file;
      try {
        file = hostFileOf(address);
      } catch {
        return false;
      }
      const session = sessions.scope(file.sessionId);
      if (session === void 0) return false;
      const input = conversation.input.for(session);
      const existing = input.state.getSnapshot().draft;
      const prompt = context.trim() === "" ? `Review the drawing at ${file.path}.` : context.trim();
      input.setDraft(existing === "" ? prompt : `${existing}
${prompt}`);
      input.focus();
      return true;
    };
  });
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "ecad-preview: dictionaries");
  const t = ctx.locale.bind(NS);
  let invoke;
  let mountFailure;
  let settle;
  const ready = new Promise((resolve) => {
    settle = resolve;
  });
  const unavailable = (message) => ({
    code: "ECAD_DISABLED",
    message,
    fix: t("unavailableFix")
  });
  const remote = ctx.remote;
  if (remote === void 0 || typeof remote.$mount !== "function") {
    mountFailure = unavailable(t("unavailable"));
    settle?.(void 0);
  } else {
    const timer = setTimeout(() => {
      if (invoke !== void 0) return;
      mountFailure ??= unavailable(t("unavailable"));
      settle?.(void 0);
    }, MOUNT_TIMEOUT_MS);
    void (async () => {
      try {
        await remote.$mount(buildClientContribution());
        await new Promise((resolve, reject) => {
          try {
            ctx.inject(["remote.ecad"], (scope) => {
              const ecad = scope.remote?.ecad;
              if (ecad === void 0) {
                reject(new Error("the ecad Remote namespace did not appear after mounting its contribution"));
                return;
              }
              invoke = (method, ...args) => {
                const call = ecad[method];
                if (typeof call !== "function") return Promise.reject(new Error(`the ecad Remote namespace has no ${method} method`));
                return call(...args);
              };
              resolve();
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
        clearTimeout(timer);
        settle?.(invoke);
      } catch (error) {
        clearTimeout(timer);
        mountFailure = unavailable(error instanceof Error ? error.message : String(error));
        settle?.(void 0);
      }
    })();
  }
  const readBytes = async (sessionId, path, options, signal) => {
    const carrier = ctx.remote;
    if (carrier === void 0) return { ok: false, error: { message: t("unavailable") } };
    return carrier.workspaceFiles.readBytes(sessionId, path, options, signal);
  };
  const readCapabilities = async (call, sessionId, signal) => {
    try {
      signal.throwIfAborted();
      const payload = await call("capabilities", sessionId);
      const envelope = payload !== null && typeof payload === "object" ? payload : void 0;
      if (envelope?.ok !== true) return void 0;
      const dwgRecord = envelope.dwg !== null && typeof envelope.dwg === "object" ? envelope.dwg : void 0;
      const dwg = dwgRecord === void 0 ? void 0 : {
        available: dwgRecord.available === true,
        ...typeof dwgRecord.kind === "string" ? { kind: dwgRecord.kind } : {},
        ...typeof dwgRecord.version === "string" ? { version: dwgRecord.version } : {},
        ...Array.isArray(dwgRecord.versions) ? { versions: dwgRecord.versions.filter((value) => typeof value === "string") } : {}
      };
      return {
        writes: envelope.writes === true,
        ...typeof envelope.contractVersion === "number" ? { contractVersion: envelope.contractVersion } : {},
        ...typeof envelope.engine === "string" ? { engine: envelope.engine } : {},
        ...dwg === void 0 ? {} : { dwg },
        ...typeof envelope.profileSource === "string" ? { profileSource: envelope.profileSource } : {},
        ...typeof envelope.maxFileBytes === "number" ? { maxFileBytes: envelope.maxFileBytes } : {},
        ...typeof envelope.workspace === "string" ? { workspace: envelope.workspace } : {}
      };
    } catch {
      return void 0;
    }
  };
  const applyDraft = async (address, baseVersion, ops, signal) => {
    let file;
    try {
      file = hostFileOf(address);
    } catch (error) {
      return { ok: false, error: failureOf(error, { code: "ECAD_NO_SESSION", fix: t("unavailableFix") }) };
    }
    const call = await ready;
    if (call === void 0) return { ok: false, error: mountFailure ?? unavailable(t("unavailable")) };
    signal.throwIfAborted();
    let payload;
    try {
      payload = await call("apply", file.sessionId, file.path, baseVersion, ops);
    } catch (error) {
      return { ok: false, error: failureOf(error, { code: "ECAD_DISABLED", fix: t("applyFailureFix") }) };
    }
    const envelope = payload !== null && typeof payload === "object" ? payload : void 0;
    if (envelope === void 0 || envelope.ok !== true) {
      return { ok: false, error: failureOf(envelope?.error ?? payload, { code: "ECAD_INTERNAL", fix: t("applyFailureFix") }) };
    }
    const summary = envelope;
    if (summary.contractVersion !== void 0 && summary.contractVersion !== ECAD_CONTRACT_VERSION) {
      return {
        ok: false,
        error: {
          code: "ECAD_CONTRACT_MISMATCH",
          message: `the Host speaks ECAD contract ${summary.contractVersion}; this face speaks ${ECAD_CONTRACT_VERSION}`,
          fix: "Update the engineering bundle so both halves are the same release."
        }
      };
    }
    if (typeof summary.outputPath !== "string" || typeof summary.outputVersion !== "string") {
      return {
        ok: false,
        error: { code: "ECAD_APPLY_INVALID", message: t("applyInvalid"), fix: t("applyFailureFix") }
      };
    }
    let written;
    let writtenError;
    if (typeof summary.modelPath === "string" && summary.modelPath !== "") {
      try {
        const artifact = await readPreviewArtifact(readBytes, file.sessionId, summary.modelPath, signal);
        written = { model: artifact.model, version: summary.outputVersion };
      } catch (error) {
        if (signal.aborted) throw error;
        writtenError = failureOf(error, { code: "ECAD_PREVIEW_READ", fix: t("writtenUnreadable") });
      }
    } else {
      writtenError = { code: "ECAD_PREVIEW_READ", message: t("writtenUnreadable"), fix: t("writtenUnreadable") };
    }
    return { ok: true, result: summary, ...written === void 0 ? {} : { written }, ...writtenError === void 0 ? {} : { writtenError } };
  };
  const open = async (address, signal) => {
    let file;
    try {
      file = hostFileOf(address);
    } catch (error) {
      return { ok: false, error: failureOf(error, { code: "ECAD_NO_SESSION", fix: t("unavailableFix") }) };
    }
    const call = await ready;
    if (call === void 0) return { ok: false, error: mountFailure ?? unavailable(t("unavailable")) };
    signal.throwIfAborted();
    let payload;
    try {
      payload = await call("open", file.sessionId, file.path);
    } catch (error) {
      return { ok: false, error: failureOf(error, { code: "ECAD_DISABLED", fix: t("unavailableFix") }) };
    }
    const envelope = payload !== null && typeof payload === "object" ? payload : void 0;
    if (envelope === void 0 || envelope.ok !== true) {
      return { ok: false, error: failureOf(envelope?.error ?? payload, { code: "ECAD_INTERNAL", fix: t("unavailableFix") }) };
    }
    const summary = envelope;
    if (summary.contractVersion !== void 0 && summary.contractVersion !== ECAD_CONTRACT_VERSION) {
      return {
        ok: false,
        error: {
          code: "ECAD_CONTRACT_MISMATCH",
          message: `the Host speaks ECAD contract ${summary.contractVersion}; this face speaks ${ECAD_CONTRACT_VERSION}`,
          fix: "Update the engineering bundle so both halves are the same release."
        }
      };
    }
    if (typeof summary.modelPath !== "string" || !Array.isArray(summary.layouts) || typeof summary.version !== "string") {
      return {
        ok: false,
        error: { code: "ECAD_PREVIEW_INVALID", message: t("invalidArtifact"), fix: "Reload the drawing so the host writes the preview again." }
      };
    }
    try {
      const artifact = await readPreviewArtifact(readBytes, file.sessionId, summary.modelPath, signal);
      const capabilities = await readCapabilities(call, file.sessionId, signal);
      return { ok: true, summary, model: artifact.model, ...capabilities === void 0 ? {} : { capabilities } };
    } catch (error) {
      if (signal.aborted) throw error;
      return { ok: false, error: failureOf(error, { code: "ECAD_PREVIEW_READ", fix: "Reload the drawing; the preview artifact could not be read." }) };
    }
  };
  const injected = {
    open,
    apply: applyDraft,
    ask: (address, context) => draft(address, context)
  };
  function WorkspaceEcadBody(props) {
    const [revision, setRevision] = (0, import_react3.useState)(0);
    return (0, import_react3.createElement)(EcadBody, {
      resourceAddress: fileAddressFor(props.scope.sessionId, props.scope.cwd, props.path),
      content: {
        kind: "renderer",
        revision,
        loaded: () => {
        },
        failed: () => {
        },
        reload: () => {
          setRevision((value) => value + 1);
        }
      },
      scrollportRef: () => {
      },
      t,
      ...injected
    });
  }
  ctx.inject(["betterSidebar"], (scope) => {
    const sidebar = scope.betterSidebar;
    if (sidebar === void 0) return;
    scope.effect?.(() => sidebar.registerFileViewer({
      id: `${ID}:workspace-file`,
      title: () => t("title"),
      exts: ["dxf", "dwg"],
      priority: 20,
      fetchStrategy: "none",
      component: WorkspaceEcadBody
    }), "ecad-preview: sidebar file viewer");
  });
  ctx.effect(() => ctx.documentPreviews.register({
    id: ID,
    extensions: ["dxf", "dwg"],
    // DWG is binary and is converted by the host before the sheet model exists;
    // the shared reader must not offer it as plain text.
    binaryExtensions: ["dwg"],
    priority: "extension",
    title: () => t("title"),
    loading: "renderer",
    wrap: false
  }), "ecad-preview: document preview");
  ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
    name: "sidebar.right.tab.document",
    key: ID,
    locale: NS,
    inject: () => injected
  }, EcadBody)), "ecad-preview: document body");
}

    return module.exports
  },
})
