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
var import_react5 = require("react");

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
var import_react3 = require("react");

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
function unwrapRemoteValue(result) {
  if (result !== null && typeof result === "object") {
    const wrapper = result;
    if (wrapper.ok === true && "value" in wrapper) return wrapper.value;
  }
  return result;
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
var UNIT_LABELS = {
  1: "in",
  2: "ft",
  3: "mi",
  4: "mm",
  5: "cm",
  6: "m",
  7: "km",
  8: "\xB5in",
  9: "mil",
  10: "yd",
  11: "\xC5",
  12: "nm",
  13: "\xB5m",
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
function draftCounts(staged2) {
  let addText = 0;
  let move = 0;
  let erase = 0;
  for (const item of staged2) {
    if (item.op.op === "addText") addText += 1;
    else if (item.op.op === "move") move += 1;
    else if (item.op.op === "erase") erase += 1;
  }
  return { addText, move, erase };
}
function draftOps(staged2) {
  return staged2.map((item) => item.op);
}
function draftPreview(staged2) {
  const adds = [];
  const moves = [];
  const erases = /* @__PURE__ */ new Set();
  for (const item of staged2) {
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
function validLayerName(name) {
  return name.length > 0 && name.length <= 255 && !/[<>/\\":;?*|,=`]/u.test(name);
}
function parseNumberField(raw) {
  const trimmed = raw.trim();
  if (trimmed === "") return void 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : void 0;
}

// packages/ecad/src/client/cad.ts
var MIN_ZOOM = 0.25;
var MAX_ZOOM = 60;
var DRAG_THRESHOLD = 3;
function clampZoom(zoom) {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
function zoomAt(view, factor, cx, cy) {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === view.zoom || !Number.isFinite(cx) || !Number.isFinite(cy)) return view;
  const ratio = zoom / view.zoom;
  return { zoom, panX: cx - ratio * (cx - view.panX), panY: cy - ratio * (cy - view.panY) };
}
function toWorld(screen, fit, view) {
  return worldAt(screen, fit, view);
}
function toScreen(point, fit, view) {
  const scale = fit.scale * view.zoom;
  if (!Number.isFinite(scale) || scale === 0) return [0, 0];
  const fittedX = fit.translateX + point[0] * fit.scale;
  const fittedY = fit.translateY - point[1] * fit.scale;
  return [view.panX + fittedX * view.zoom, view.panY + fittedY * view.zoom];
}
function screenBoxOfPoints(a, b) {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y)
  };
}
function screenBoxHasPoint(box, point, pad = 0) {
  return point.x >= box.minX - pad && point.x <= box.maxX + pad && point.y >= box.minY - pad && point.y <= box.maxY + pad;
}
function roundValue(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}
function marqueeOf(start, end) {
  return { box: screenBoxOfPoints(start, end), mode: end.x >= start.x ? "window" : "crossing" };
}
var MAX_SAMPLES = 512;
var CURVE_SAMPLES = 32;
function samplePointsOf(entity) {
  switch (entity.k) {
    case "line":
    case "polyline":
    case "spline":
    case "solid":
    case "hatch":
    case "leader":
    case "dimension":
      return capSamples(entity.pts ?? []);
    case "circle": {
      if (entity.c === void 0) return [];
      const radius = Math.abs(entity.r ?? 0);
      return curvePoints(entity.c, radius, radius, 0, 0, Math.PI * 2);
    }
    case "arc": {
      if (entity.c === void 0) return [];
      const radius = Math.abs(entity.r ?? 0);
      const a0 = entity.a0 ?? 0;
      let a1 = entity.a1 ?? 0;
      if (a1 < a0) a1 += Math.PI * 2;
      return curvePoints(entity.c, radius, radius, 0, a0, a1);
    }
    case "ellipse": {
      if (entity.c === void 0) return [];
      const a0 = entity.a0 ?? 0;
      let a1 = entity.a1 ?? Math.PI * 2;
      if (a1 < a0) a1 += Math.PI * 2;
      return curvePoints(entity.c, Math.abs(entity.rx ?? 0), Math.abs(entity.ry ?? 0), entity.rot ?? 0, a0, a1);
    }
    case "text":
    case "mtext": {
      const box = entityBounds(entity);
      if (box === void 0) return entity.p === void 0 ? [] : [entity.p];
      return [[box.min[0], box.min[1]], [box.max[0], box.min[1]], [box.max[0], box.max[1]], [box.min[0], box.max[1]]];
    }
    case "point":
    case "insert":
    case "viewport": {
      if (entity.p !== void 0) return [entity.p];
      const box = entityBounds(entity);
      return box === void 0 ? [] : [[box.min[0], box.min[1]], [box.max[0], box.max[1]]];
    }
    case "unsupported":
      return [];
  }
}
function capSamples(points) {
  if (points.length <= MAX_SAMPLES) return points;
  const step = Math.ceil(points.length / MAX_SAMPLES);
  const kept = [];
  for (let index = 0; index < points.length; index += step) kept.push(points[index]);
  const last = points[points.length - 1];
  if (last !== void 0 && kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}
function curvePoints(center, rx, ry, rotation, a0, a1) {
  const span = Math.abs(a1 - a0);
  const count = Math.max(8, Math.min(CURVE_SAMPLES, Math.ceil(span / (Math.PI * 2) * CURVE_SAMPLES) + 1));
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = a0 + (a1 - a0) * index / count;
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    points.push([
      center[0] + x * Math.cos(rotation) - y * Math.sin(rotation),
      center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)
    ]);
  }
  return points;
}
function cellKey(column, row) {
  return `${column},${row}`;
}
function buildIndex(entities, cell) {
  const entries = [];
  let bounds;
  for (const entity of entities) {
    const box = entityBounds(entity);
    if (box === void 0) continue;
    bounds = bounds === void 0 ? box : {
      min: [Math.min(bounds.min[0], box.min[0]), Math.min(bounds.min[1], box.min[1])],
      max: [Math.max(bounds.max[0], box.max[0]), Math.max(bounds.max[1], box.max[1])]
    };
    entries.push({ id: entity.id, layer: entity.layer.toUpperCase(), entity, bounds: box, samples: samplePointsOf(entity) });
  }
  let size = cell;
  if (size === void 0 || !Number.isFinite(size) || size <= 0) {
    if (bounds === void 0) size = 1;
    else {
      const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]);
      size = Number.isFinite(span) && span > 0 ? span / 96 : 1;
    }
  }
  const cells = /* @__PURE__ */ new Map();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const fromX = Math.floor(entry.bounds.min[0] / size);
    const toX = Math.floor(entry.bounds.max[0] / size);
    const fromY = Math.floor(entry.bounds.min[1] / size);
    const toY = Math.floor(entry.bounds.max[1] / size);
    for (let column = fromX; column <= toX; column += 1) {
      for (let row = fromY; row <= toY; row += 1) {
        const key = cellKey(column, row);
        const list = cells.get(key);
        if (list === void 0) cells.set(key, [index]);
        else list.push(index);
      }
    }
  }
  return { cell: size, cells, entries };
}
function queryIndex(index, box, limit = 4096) {
  const size = index.cell;
  const fromX = Math.floor(box.min[0] / size);
  const toX = Math.floor(box.max[0] / size);
  const fromY = Math.floor(box.min[1] / size);
  const toY = Math.floor(box.max[1] / size);
  const seen = /* @__PURE__ */ new Set();
  const found = [];
  for (let column = fromX; column <= toX; column += 1) {
    for (let row = fromY; row <= toY; row += 1) {
      const list = index.cells.get(cellKey(column, row));
      if (list === void 0) continue;
      for (const entryIndex of list) {
        if (seen.has(entryIndex)) continue;
        seen.add(entryIndex);
        const entry = index.entries[entryIndex];
        if (entry === void 0) continue;
        if (entry.bounds.max[0] < box.min[0] || entry.bounds.min[0] > box.max[0]) continue;
        if (entry.bounds.max[1] < box.min[1] || entry.bounds.min[1] > box.max[1]) continue;
        found.push(entry);
        if (found.length >= limit) return found;
      }
    }
  }
  return found;
}
function pointSegmentDistanceSquared(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    const px = point[0] - a[0];
    const py = point[1] - a[1];
    return px * px + py * py;
  }
  const lengthSquared = dx * dx + dy * dy;
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - point[0];
  const y = a[1] + t * dy - point[1];
  return x * x + y * y;
}
function entryDistance(entry, point, tolerance) {
  const entity = entry.entity;
  const toleranceSquared = tolerance * tolerance;
  if (entity.k === "text" || entity.k === "mtext" || entity.k === "viewport" || entity.k === "dimension") {
    const box = entry.bounds;
    const inside = point[0] >= box.min[0] - tolerance && point[0] <= box.max[0] + tolerance && point[1] >= box.min[1] - tolerance && point[1] <= box.max[1] + tolerance;
    return inside ? 0 : Infinity;
  }
  if (entity.k === "point") {
    const at = entity.p;
    if (at === void 0) return Infinity;
    const dx = point[0] - at[0];
    const dy = point[1] - at[1];
    const distance2 = dx * dx + dy * dy;
    return distance2 <= toleranceSquared ? Math.sqrt(distance2) : Infinity;
  }
  if (entity.k === "circle") {
    if (entity.c === void 0) return Infinity;
    const dx = point[0] - entity.c[0];
    const dy = point[1] - entity.c[1];
    const distance2 = Math.abs(Math.sqrt(dx * dx + dy * dy) - Math.abs(entity.r ?? 0));
    return distance2 <= tolerance ? distance2 : Infinity;
  }
  let best = Infinity;
  for (let index = 1; index < entry.samples.length; index += 1) {
    const a = entry.samples[index - 1];
    const b = entry.samples[index];
    const distance2 = pointSegmentDistanceSquared(point, a, b);
    if (distance2 < best) best = distance2;
  }
  if (entry.samples.length === 1) {
    const only = entry.samples[0];
    const dx = point[0] - only[0];
    const dy = point[1] - only[1];
    best = dx * dx + dy * dy;
  }
  if (!Number.isFinite(best)) return Infinity;
  const distance = Math.sqrt(best);
  return distance <= tolerance ? distance : Infinity;
}
function pickEntity(index, point, tolerance, options = {}) {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(tolerance) || tolerance <= 0) return void 0;
  const box = {
    min: [point[0] - tolerance, point[1] - tolerance],
    max: [point[0] + tolerance, point[1] + tolerance]
  };
  const candidates = queryIndex(index, box);
  let bestId;
  let bestDistance = Infinity;
  for (const entry of candidates) {
    if (options.locked?.has(entry.layer) === true) continue;
    if (options.exclude?.has(entry.id) === true) continue;
    const distance = entryDistance(entry, point, tolerance);
    if (distance === Infinity) continue;
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestId = entry.id;
    }
  }
  return bestId;
}
function marqueeSelect(index, marquee, fit, view, options = {}) {
  const { box, mode } = marquee;
  if (box.maxX - box.minX < 0.5 || box.maxY - box.minY < 0.5) return [];
  const corners = [
    toWorld({ x: box.minX, y: box.minY }, fit, view),
    toWorld({ x: box.maxX, y: box.minY }, fit, view),
    toWorld({ x: box.maxX, y: box.maxY }, fit, view),
    toWorld({ x: box.minX, y: box.maxY }, fit, view)
  ];
  const world = {
    min: [Math.min(...corners.map((corner) => corner[0])), Math.min(...corners.map((corner) => corner[1]))],
    max: [Math.max(...corners.map((corner) => corner[0])), Math.max(...corners.map((corner) => corner[1]))]
  };
  const candidates = queryIndex(index, world, 2e4);
  const selected = [];
  for (const entry of candidates) {
    if (options.locked?.has(entry.layer) === true) continue;
    const screenSamples = entry.samples.map((sample) => toScreen(sample, fit, view));
    if (screenSamples.length === 0) continue;
    if (marqueeHits(screenSamples, box, mode)) selected.push(entry.id);
  }
  return selected;
}
function marqueeHits(samples, box, mode) {
  if (samples.length === 0) return false;
  if (mode === "window") {
    for (const sample of samples) {
      if (!screenBoxHasPoint(box, { x: sample[0], y: sample[1] })) return false;
    }
    return true;
  }
  for (const sample of samples) {
    if (screenBoxHasPoint(box, { x: sample[0], y: sample[1] })) return true;
  }
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1];
    const b = samples[index];
    if (segmentIntersectsBox(a, b, box)) return true;
  }
  return false;
}
function segmentIntersectsBox(a, b, box) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks = [
    [-dx, a[0] - box.minX],
    [dx, box.maxX - a[0]],
    [-dy, a[1] - box.minY],
    [dy, box.maxY - a[1]]
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}
var MAX_INTERSECTION_SEGMENTS = 128;
var MAX_INTERSECTION_POINTS = 64;
var INTERSECTION_DEDUPE_PX = 2;
function snapPriority(kind) {
  switch (kind) {
    case "endpoint":
      return 0;
    case "intersection":
      return 1;
    case "midpoint":
      return 2;
    case "center":
      return 3;
    case "nearest":
      return 4;
    case "grid":
      return 5;
  }
}
function straightSegmentsOf(entity) {
  if (entity.k !== "line" && entity.k !== "polyline") return [];
  const points = entity.pts ?? [];
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    segments.push([points[index - 1], points[index]]);
  }
  if (entity.closed === true && points.length > 2) segments.push([points[points.length - 1], points[0]]);
  return segments;
}
function segmentIntersectionPoint(a, b, c, d) {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return void 0;
  const qpx = c[0] - a[0];
  const qpy = c[1] - a[1];
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  const epsilon = 1e-9;
  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return void 0;
  return [a[0] + t * rx, a[1] + t * ry];
}
function intersectionSnapPoints(entries, cursorScreen, project, screenRadius) {
  if (!Number.isFinite(screenRadius) || screenRadius <= 0) return [];
  const candidates = [];
  const segments = [];
  for (const entry of entries) {
    for (const segment of straightSegmentsOf(entry.entity)) {
      if (segments.length >= MAX_INTERSECTION_SEGMENTS) break;
      const sa = project(segment[0]);
      const sb = project(segment[1]);
      const near = cursorScreen[0] >= Math.min(sa[0], sb[0]) - screenRadius && cursorScreen[0] <= Math.max(sa[0], sb[0]) + screenRadius && cursorScreen[1] >= Math.min(sa[1], sb[1]) - screenRadius && cursorScreen[1] <= Math.max(sa[1], sb[1]) + screenRadius;
      if (!near) continue;
      segments.push({ a: segment[0], b: segment[1], sa, sb });
    }
    if (segments.length >= MAX_INTERSECTION_SEGMENTS) break;
  }
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      if (candidates.length >= MAX_INTERSECTION_POINTS) break;
      const left = segments[first];
      const right = segments[second];
      const screen = segmentIntersectionPoint(left.sa, left.sb, right.sa, right.sb);
      if (screen === void 0) continue;
      const distance = Math.hypot(screen[0] - cursorScreen[0], screen[1] - cursorScreen[1]);
      if (distance > screenRadius) continue;
      const world = segmentIntersectionPoint(left.a, left.b, right.a, right.b);
      if (world === void 0) continue;
      if (candidates.some((candidate) => Math.hypot(candidate.screen[0] - screen[0], candidate.screen[1] - screen[1]) <= INTERSECTION_DEDUPE_PX)) continue;
      candidates.push({ screen: [screen[0], screen[1]], world: [roundValue(world[0]), roundValue(world[1])] });
    }
  }
  return candidates.map((candidate) => candidate.world);
}
function snapNear(index, point, radius, options = {}) {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(radius) || radius <= 0) return void 0;
  let best;
  const consider = (candidatePoint, kind, id) => {
    const dx = candidatePoint[0] - point[0];
    const dy = candidatePoint[1] - point[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > radius) return;
    if (best === void 0) {
      best = { point: [candidatePoint[0], candidatePoint[1]], kind, distance, ...id === void 0 ? {} : { id } };
      return;
    }
    const currentPriority = snapPriority(best.kind);
    const nextPriority = snapPriority(kind);
    if (nextPriority < currentPriority || nextPriority === currentPriority && distance < best.distance) {
      best = { point: [candidatePoint[0], candidatePoint[1]], kind, distance, ...id === void 0 ? {} : { id } };
    }
  };
  const box = { min: [point[0] - radius, point[1] - radius], max: [point[0] + radius, point[1] + radius] };
  const nearby = queryIndex(index, box, 2048);
  for (const entry of nearby) {
    if (options.locked?.has(entry.layer) === true) continue;
    const entity = entry.entity;
    const samples = entry.samples;
    const pointAt = (indexOf) => samples[indexOf];
    if (entity.k === "circle" || entity.k === "arc" || entity.k === "ellipse") {
      if (entity.c !== void 0) consider(entity.c, "center", entry.id);
      const first = pointAt(0);
      const last = pointAt(samples.length - 1);
      if (first !== void 0) consider(first, "endpoint", entry.id);
      if (last !== void 0) consider(last, "endpoint", entry.id);
      if (entity.k === "circle" && entity.c !== void 0) {
        const dx = point[0] - entity.c[0];
        const dy = point[1] - entity.c[1];
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const radius2 = Math.abs(entity.r ?? 0);
          consider([entity.c[0] + dx / length * radius2, entity.c[1] + dy / length * radius2], "nearest", entry.id);
        }
      }
      for (let index2 = 1; index2 < samples.length; index2 += 1) {
        const a = samples[index2 - 1];
        const b = samples[index2];
        if (index2 % 2 === 0) consider(midpointOf(a, b), "midpoint", entry.id);
        const projection = nearestOnSegment(point, a, b);
        if (projection !== void 0) consider(projection, "nearest", entry.id);
      }
      continue;
    }
    if (entity.k === "point" || entity.k === "insert" || entity.k === "text" || entity.k === "mtext" || entity.k === "viewport") {
      const at = entity.p ?? samples[0];
      if (at !== void 0) consider(at, "endpoint", entry.id);
      continue;
    }
    if (samples.length === 1) consider(samples[0], "endpoint", entry.id);
    for (let index2 = 0; index2 < samples.length; index2 += 1) {
      const at = samples[index2];
      consider(at, "endpoint", entry.id);
      if (index2 > 0) {
        const previous = samples[index2 - 1];
        consider(midpointOf(previous, at), "midpoint", entry.id);
        const projection = nearestOnSegment(point, previous, at);
        if (projection !== void 0) consider(projection, "nearest", entry.id);
      }
    }
  }
  if (options.project !== void 0 && options.screenRadius !== void 0) {
    const visible = options.locked === void 0 ? nearby : nearby.filter((entry) => options.locked?.has(entry.layer) !== true);
    for (const intersection of intersectionSnapPoints(visible, options.project(point), options.project, options.screenRadius)) {
      consider(intersection, "intersection");
    }
  }
  if (options.includeGrid === true && options.grid !== void 0 && Number.isFinite(options.grid) && options.grid > 0) {
    const gridPoint = [Math.round(point[0] / options.grid) * options.grid, Math.round(point[1] / options.grid) * options.grid];
    if (Math.abs(gridPoint[0] - point[0]) <= radius && Math.abs(gridPoint[1] - point[1]) <= radius) {
      const dx = gridPoint[0] - point[0];
      const dy = gridPoint[1] - point[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (best === void 0 || distance < best.distance) best = { point: [roundValue(gridPoint[0]), roundValue(gridPoint[1])], kind: "grid", distance };
    }
  }
  return best;
}
function midpointOf(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
function nearestOnSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return void 0;
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}
function orthoPoint(base, point) {
  const dx = Math.abs(point[0] - base[0]);
  const dy = Math.abs(point[1] - base[1]);
  return dx >= dy ? [point[0], base[1]] : [base[0], point[1]];
}
function pointAtDistance(base, cursor, distance) {
  const dx = cursor[0] - base[0];
  const dy = cursor[1] - base[1];
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 0 || length === 0) return [base[0] + distance, base[1]];
  return [base[0] + dx / length * distance, base[1] + dy / length * distance];
}
function angleDegrees(center, point) {
  const degrees = Math.atan2(point[1] - center[1], point[0] - center[0]) * 180 / Math.PI;
  return roundValue(degrees);
}
function niceGridStep(worldPerPixel, targetPixels = 28) {
  if (!Number.isFinite(worldPerPixel) || worldPerPixel <= 0) return 1;
  const raw = worldPerPixel * targetPixels;
  const exponent = Math.floor(Math.log10(raw));
  const mantissa = raw / 10 ** exponent;
  const nice = mantissa <= 1.5 ? 1 : mantissa <= 3.5 ? 2 : mantissa <= 7.5 ? 5 : 10;
  return nice * 10 ** exponent;
}
function gridLinesOf(fit, view, width, height, targetPixels = 28) {
  const scale = fit.scale * view.zoom;
  if (!Number.isFinite(scale) || scale <= 0 || width <= 0 || height <= 0) return { step: 1, xs: [], ys: [] };
  const step = niceGridStep(1 / scale, targetPixels);
  const [left, bottom] = toWorld({ x: 0, y: height }, fit, view);
  const [right, top] = toWorld({ x: width, y: 0 }, fit, view);
  const minX = Math.min(left, right);
  const maxX = Math.max(left, right);
  const minY = Math.min(bottom, top);
  const maxY = Math.max(bottom, top);
  const firstX = Math.ceil(minX / step) * step;
  const firstY = Math.ceil(minY / step) * step;
  const xs = [];
  const ys = [];
  const limit = 400;
  for (let x = firstX, count = 0; x <= maxX && count < limit; x += step, count += 1) xs.push(toScreen([x, 0], fit, view)[0]);
  for (let y = firstY, count = 0; y <= maxY && count < limit; y += step, count += 1) ys.push(toScreen([0, y], fit, view)[1]);
  return { step, xs, ys };
}
function viewForBox(box, fit, view, width, height, margin = 20) {
  const spanX = Math.max(box.maxX - box.minX, 0);
  const spanY = Math.max(box.maxY - box.minY, 0);
  if (spanX < 1 || spanY < 1) return view;
  const fittedSpanX = spanX / view.zoom;
  const fittedSpanY = spanY / view.zoom;
  const usableWidth = Math.max(1, width - margin * 2);
  const usableHeight = Math.max(1, height - margin * 2);
  const zoom = clampZoom(Math.min(usableWidth / fittedSpanX, usableHeight / fittedSpanY));
  if (!Number.isFinite(zoom) || zoom <= 0) return view;
  const centreFittedX = ((box.minX + box.maxX) / 2 - view.panX) / view.zoom;
  const centreFittedY = ((box.minY + box.maxY) / 2 - view.panY) / view.zoom;
  return {
    zoom,
    panX: width / 2 - zoom * centreFittedX,
    panY: height / 2 - zoom * centreFittedY
  };
}
function gripsOf(entity, maxVertices = 64) {
  const grips = [];
  const push = (point, kind, index) => {
    if (point === void 0) return;
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
    grips.push({ key: `${kind}:${index}`, point, kind, index });
  };
  switch (entity.k) {
    case "line": {
      const points = entity.pts ?? [];
      push(points[0], "endpoint", 0);
      push(points[1], "endpoint", 1);
      break;
    }
    case "polyline":
    case "spline":
    case "leader":
    case "solid":
    case "hatch": {
      const points = entity.pts ?? [];
      const step = Math.max(1, Math.ceil(points.length / maxVertices));
      for (let index = 0; index < points.length; index += step) push(points[index], "vertex", index);
      const last = points.length - 1;
      if (last > 0 && last % step !== 0) push(points[last], "vertex", last);
      break;
    }
    case "circle": {
      if (entity.c !== void 0) {
        push(entity.c, "center", 0);
        const radius = Math.abs(entity.r ?? 0);
        push([entity.c[0] + radius, entity.c[1]], "quadrant", 1);
        push([entity.c[0], entity.c[1] + radius], "quadrant", 2);
        push([entity.c[0] - radius, entity.c[1]], "quadrant", 3);
        push([entity.c[0], entity.c[1] - radius], "quadrant", 4);
      }
      break;
    }
    case "arc": {
      if (entity.c !== void 0) {
        const radius = Math.abs(entity.r ?? 0);
        const a0 = entity.a0 ?? 0;
        let a1 = entity.a1 ?? 0;
        if (a1 < a0) a1 += Math.PI * 2;
        push(entity.c, "center", 0);
        push([entity.c[0] + radius * Math.cos(a0), entity.c[1] + radius * Math.sin(a0)], "endpoint", 1);
        push([entity.c[0] + radius * Math.cos(a1), entity.c[1] + radius * Math.sin(a1)], "endpoint", 2);
      }
      break;
    }
    case "ellipse": {
      if (entity.c !== void 0) {
        push(entity.c, "center", 0);
        const rotation = entity.rot ?? 0;
        const rx = Math.abs(entity.rx ?? 0);
        const ry = Math.abs(entity.ry ?? 0);
        push([entity.c[0] + rx * Math.cos(rotation), entity.c[1] + rx * Math.sin(rotation)], "quadrant", 1);
        push([entity.c[0] - ry * Math.sin(rotation), entity.c[1] + ry * Math.cos(rotation)], "quadrant", 2);
      }
      break;
    }
    case "text":
    case "mtext":
    case "insert":
    case "point":
    case "viewport":
      push(entity.p ?? entity.c, "insert", 0);
      break;
    case "dimension": {
      const points = entity.pts ?? [];
      push(points[0], "endpoint", 0);
      push(points[1], "endpoint", 1);
      break;
    }
    case "unsupported":
      break;
  }
  return grips;
}
function gripRequestFor(entity, grip, to) {
  if (entity.k === "text" || entity.k === "mtext" || entity.k === "insert" || entity.k === "point" || entity.k === "viewport") {
    const at = entity.p ?? entity.c;
    if (at === void 0) return { kind: "engine", op: "move", payload: { id: entity.id } };
    return { kind: "move", dx: roundValue(to[0] - at[0]), dy: roundValue(to[1] - at[1]) };
  }
  if (entity.k === "line") {
    const points = entity.pts ?? [];
    const start = points[0] ?? [0, 0];
    const end = points[1] ?? [0, 0];
    const moved = [roundValue(to[0]), roundValue(to[1])];
    const slot = grip.kind === "endpoint" && grip.index === 1 ? 1 : 0;
    return {
      kind: "engine",
      op: "setLine",
      payload: { id: entity.id, a: slot === 0 ? moved : start, b: slot === 1 ? moved : end }
    };
  }
  if (entity.k === "polyline" || entity.k === "spline" || entity.k === "leader") {
    const points = (entity.pts ?? []).map((p) => [p[0], p[1]]);
    if (grip.index >= 0 && grip.index < points.length) points[grip.index] = [roundValue(to[0]), roundValue(to[1])];
    return { kind: "engine", op: "setPolyline", payload: { id: entity.id, pts: points } };
  }
  if (entity.k === "circle") {
    if (entity.c !== void 0 && grip.kind === "center") {
      return { kind: "move", dx: roundValue(to[0] - entity.c[0]), dy: roundValue(to[1] - entity.c[1]) };
    }
    const center = entity.c ?? [0, 0];
    return {
      kind: "engine",
      op: "setCircle",
      payload: {
        id: entity.id,
        center: [roundValue(center[0]), roundValue(center[1])],
        radius: roundValue(Math.hypot(to[0] - center[0], to[1] - center[1]))
      }
    };
  }
  if (entity.k === "arc") {
    const center = entity.c ?? [0, 0];
    const radius = Math.abs(entity.r ?? 0);
    const degrees = 180 / Math.PI;
    const start = (entity.a0 ?? 0) * degrees;
    const end = (entity.a1 ?? 0) * degrees;
    if (grip.kind === "center") {
      return { kind: "engine", op: "setArc", payload: { id: entity.id, center: [roundValue(to[0]), roundValue(to[1])], radius: roundValue(radius), startAngleDeg: roundValue(start), endAngleDeg: roundValue(end) } };
    }
    const movedAngle = angleDegrees(center, [to[0], to[1]]);
    const startAngleDeg = grip.index === 1 ? movedAngle : roundValue(start);
    const endAngleDeg = grip.index === 2 ? movedAngle : roundValue(end);
    return { kind: "engine", op: "setArc", payload: { id: entity.id, center: [roundValue(center[0]), roundValue(center[1])], radius: roundValue(radius), startAngleDeg, endAngleDeg } };
  }
  if (entity.k === "ellipse") {
    const center = entity.c ?? [0, 0];
    const rx = Math.abs(entity.rx ?? 0);
    const ry = Math.abs(entity.ry ?? 0);
    const rotationDeg = (entity.rot ?? 0) * 180 / Math.PI;
    if (grip.kind === "center") {
      return { kind: "engine", op: "setEllipse", payload: { id: entity.id, center: [roundValue(to[0]), roundValue(to[1])], rx: roundValue(rx), ry: roundValue(ry), rotDeg: roundValue(rotationDeg) } };
    }
    const distance = Math.hypot(to[0] - center[0], to[1] - center[1]);
    const rotDeg = grip.index === 1 ? angleDegrees(center, [to[0], to[1]]) : roundValue(rotationDeg);
    return {
      kind: "engine",
      op: "setEllipse",
      payload: {
        id: entity.id,
        center: [roundValue(center[0]), roundValue(center[1])],
        rx: grip.index === 2 ? roundValue(rx) : roundValue(distance),
        ry: grip.index === 2 ? roundValue(distance) : roundValue(ry),
        rotDeg
      }
    };
  }
  return { kind: "engine", op: "setGeometry", payload: { id: entity.id, point: [roundValue(to[0]), roundValue(to[1])] } };
}

// packages/ecad/src/client/cadTools.ts
var CAD_TOOLS = [
  { id: "select", group: "view", labelKey: "toolSelect", hintKey: "toolSelectHint", shortcut: "V", steps: 0, writes: false },
  { id: "pan", group: "view", labelKey: "toolPan", hintKey: "toolPanHint", shortcut: "H", steps: 0, writes: false },
  { id: "zoomWindow", group: "view", labelKey: "toolZoomWindow", hintKey: "toolZoomWindowHint", shortcut: "Z", steps: 0, writes: false },
  { id: "line", group: "draw", labelKey: "toolLine", hintKey: "toolLineHint", shortcut: "L", steps: 2, chain: true, numeric: "distance", op: "addLine", writes: true },
  { id: "polyline", group: "draw", labelKey: "toolPolyline", hintKey: "toolPolylineHint", shortcut: "P", steps: 0, numeric: "distance", op: "addPolyline", writes: true },
  { id: "rectangle", group: "draw", labelKey: "toolRectangle", hintKey: "toolRectangleHint", shortcut: "R", steps: 2, op: "addRectangle", writes: true },
  { id: "circle", group: "draw", labelKey: "toolCircle", hintKey: "toolCircleHint", shortcut: "C", steps: 2, numeric: "radius", op: "addCircle", writes: true },
  { id: "arc", group: "draw", labelKey: "toolArc", hintKey: "toolArcHint", shortcut: "A", steps: 3, op: "addArc", writes: true },
  { id: "revisionCloud", group: "draw", labelKey: "toolRevisionCloud", hintKey: "toolRevisionCloudHint", shortcut: "K", steps: 0, op: "addRevisionCloud", writes: true },
  { id: "leader", group: "draw", labelKey: "toolLeader", hintKey: "toolLeaderHint", shortcut: "D", steps: 0, op: "addLeader", writes: true },
  { id: "text", group: "draw", labelKey: "toolText", hintKey: "toolTextHint", shortcut: "T", steps: 0, op: "addText", writes: true },
  { id: "block", group: "draw", labelKey: "toolBlock", hintKey: "toolBlockHint", shortcut: "I", steps: 0, op: "addBlock", writes: true },
  { id: "move", group: "modify", labelKey: "toolMove", hintKey: "toolMoveHint", shortcut: "M", steps: 2, numeric: "distance", op: "move", writes: true },
  { id: "copy", group: "modify", labelKey: "toolCopy", hintKey: "toolCopyHint", shortcut: "Y", steps: 2, numeric: "distance", op: "copy", writes: true },
  { id: "rotate", group: "modify", labelKey: "toolRotate", hintKey: "toolRotateHint", shortcut: "Q", steps: 1, numeric: "angle", op: "rotate", writes: true },
  { id: "scale", group: "modify", labelKey: "toolScale", hintKey: "toolScaleHint", shortcut: "S", steps: 1, numeric: "factor", op: "scale", writes: true },
  { id: "mirror", group: "modify", labelKey: "toolMirror", hintKey: "toolMirrorHint", shortcut: "F", steps: 2, op: "mirror", writes: true },
  { id: "offset", group: "modify", labelKey: "toolOffset", hintKey: "toolOffsetHint", shortcut: "O", steps: 1, numeric: "distance", op: "offset", writes: true },
  { id: "trim", group: "modify", labelKey: "toolTrim", hintKey: "toolTrimHint", shortcut: "X", steps: 0, op: "trim", writes: true },
  { id: "extend", group: "modify", labelKey: "toolExtend", hintKey: "toolExtendHint", shortcut: "E", steps: 0, op: "extend", writes: true },
  { id: "erase", group: "modify", labelKey: "toolErase", hintKey: "toolEraseHint", shortcut: "Del", steps: 0, op: "erase", writes: true }
];
var TOOL_BY_ID = new Map(CAD_TOOLS.map((tool) => [tool.id, tool]));
function toolOf(id) {
  return TOOL_BY_ID.get(id);
}
function toolForShortcut(key) {
  const wanted = key.toUpperCase();
  const tool = CAD_TOOLS.find((candidate) => (candidate.shortcut ?? "").toUpperCase() === wanted && candidate.shortcut !== "Del");
  return tool?.id;
}
function toolAvailable(tool, editing) {
  return tool.writes ? editing : true;
}
var ENGINE_OPS_SUPPORTED = /* @__PURE__ */ new Set([
  "addText",
  "addLine",
  "addPolyline",
  "addRectangle",
  "addRevisionCloud",
  "addLeader",
  "addBlock",
  "addCircle",
  "addArc",
  "setText",
  "setAttribute",
  "setLayer",
  "move",
  "rotate",
  "copy",
  "scale",
  "mirror",
  "offset",
  "trim",
  "extend",
  "setLine",
  "setPolyline",
  "setCircle",
  "setArc",
  "setEllipse",
  "setColor",
  "erase",
  "addLayer",
  "setLayerColor",
  "renameLayer"
]);
function engineOpAvailable(op) {
  return ENGINE_OPS_SUPPORTED.has(op);
}
function asEcadOp(op) {
  return op;
}
function staged(key, layout, op) {
  return { key, layout, op: asEcadOp(op) };
}
function stagedLayer(key, op) {
  return { key, layout: "", op: asEcadOp(op) };
}
function stageAddBlock(key, layout, block, point, rotationDeg = 0, scale, layer) {
  return staged(key, layout, {
    op: "addBlock",
    layout,
    block,
    p: [roundCoord(point[0]), roundCoord(point[1])],
    ...rotationDeg === 0 ? {} : { rotation: rotationDeg },
    ...scale === void 0 ? {} : { scale },
    ...layer === void 0 ? {} : { layer }
  });
}
function stageSetText(key, layout, id, text) {
  return staged(key, layout, { op: "setText", layout, id, text });
}
function stageSetAttribute(key, layout, id, tag, value) {
  return staged(key, layout, { op: "setAttribute", layout, id, tag, value });
}
function stageSetLayer(key, layout, id, layer) {
  return staged(key, layout, { op: "setLayer", layout, id, layer });
}
function stageSetLayerMany(keyPrefix, layout, ids, layer) {
  return ids.map((id, index) => stageSetLayer(`${keyPrefix}-${index}`, layout, id, layer));
}
function stageMoveMany(key, layout, ids, dx, dy) {
  return staged(key, layout, { op: "move", layout, ids: [...ids], dx: roundCoord(dx), dy: roundCoord(dy) });
}
function stageRotate(key, layout, ids, center, angleDeg) {
  return staged(key, layout, { op: "rotate", layout, ids: [...ids], center: [roundCoord(center[0]), roundCoord(center[1])], angleDeg: roundCoord(angleDeg) });
}
function stageEraseMany(key, layout, ids) {
  return staged(key, layout, { op: "erase", layout, ids: [...ids] });
}
function stageTrim(key, layout, id, boundaryId, pick) {
  return staged(key, layout, {
    op: "trim",
    layout,
    id,
    boundaryId,
    ...pick === void 0 ? {} : { pick: [roundCoord(pick[0]), roundCoord(pick[1])] }
  });
}
function stageExtend(key, layout, id, boundaryId) {
  return staged(key, layout, { op: "extend", layout, id, boundaryId });
}
function stageSetColor(key, layout, ids, color) {
  return staged(key, layout, { op: "setColor", layout, ids: [...ids], color: Math.trunc(color) });
}
function stageAddLayer(key, name, color) {
  return stagedLayer(key, { op: "addLayer", name, ...color === void 0 ? {} : { color: Math.trunc(color) } });
}
function stageRenameLayer(key, from, to) {
  return stagedLayer(key, { op: "renameLayer", from, to });
}
function stageSetLayerColor(key, name, color) {
  return stagedLayer(key, { op: "setLayerColor", name, color: Math.trunc(color) });
}
function commandStart(tool) {
  const spec = toolOf(tool);
  if (spec === void 0) return void 0;
  if (tool === "select" || tool === "pan" || tool === "zoomWindow" || tool === "erase" || tool === "trim" || tool === "extend") return void 0;
  return { tool, points: [] };
}
function commandHover(command, cursor) {
  return { ...command, cursor };
}
function commandClick(command, point, context) {
  const rounded = [roundCoord(point[0]), roundCoord(point[1])];
  const spec = toolOf(command.tool);
  if (spec === void 0) return { kind: "rejected", reasonKey: "commandUnknown" };
  const points = [...command.points, rounded];
  if (command.tool === "text") {
    return points.length >= 1 ? { kind: "form", form: "text", point: rounded } : { kind: "pending", command: { ...command, points, cursor: rounded } };
  }
  if (command.tool === "block") {
    if (context.block === void 0 || context.block === "") return { kind: "rejected", reasonKey: "commandNeedsBlock" };
    return { kind: "form", form: "block", point: rounded };
  }
  if (spec.group === "modify") {
    if (command.tool === "rotate" || command.tool === "scale" || command.tool === "offset") {
      const first = points[0];
      if (points.length < 2) return { kind: "pending", command: { ...command, points, cursor: rounded } };
      switch (command.tool) {
        case "rotate":
          return finishRotate(points[0], angleDegrees(first, rounded), context);
        case "scale": {
          const base2 = points[0];
          const distance = Math.hypot(rounded[0] - base2[0], rounded[1] - base2[1]);
          return distance > 0 ? finishScale(base2, distance, context) : { kind: "pending", command: { ...command, points, cursor: rounded } };
        }
        case "offset":
          return { kind: "rejected", reasonKey: "commandNeedsDistance" };
        default:
          return { kind: "pending", command: { ...command, points, cursor: rounded } };
      }
    }
    if (context.selection.length === 0) return { kind: "rejected", reasonKey: "commandNeedsSelection" };
    if (points.length < 2) return { kind: "pending", command: { ...command, points, cursor: rounded } };
    const base = points[0];
    const target = points[1];
    const dx = target[0] - base[0];
    const dy = target[1] - base[1];
    if (command.tool === "move") return { kind: "complete", ops: [{ op: "move", layout: context.layout, ids: [...context.selection], dx: roundCoord(dx), dy: roundCoord(dy) }], command: void 0 };
    if (command.tool === "copy") return { kind: "complete", ops: [{ op: "copy", layout: context.layout, ids: [...context.selection], dx: roundCoord(dx), dy: roundCoord(dy) }], command: void 0 };
    if (command.tool === "mirror") return { kind: "complete", ops: [{ op: "mirror", layout: context.layout, ids: [...context.selection], axisA: [roundCoord(base[0]), roundCoord(base[1])], axisB: [roundCoord(target[0]), roundCoord(target[1])] }], command: void 0 };
    return { kind: "rejected", reasonKey: "commandUnknown" };
  }
  switch (command.tool) {
    case "line": {
      if (points.length < 2) return { kind: "pending", command: { ...command, points, cursor: rounded } };
      const a = points[0];
      const b = points[1];
      return { kind: "complete", ops: [{ op: "addLine", layout: context.layout, a: [roundCoord(a[0]), roundCoord(a[1])], b: [roundCoord(b[0]), roundCoord(b[1])], ...context.layer === void 0 ? {} : { layer: context.layer } }], command: { tool: "line", points: [rounded], cursor: rounded } };
    }
    case "rectangle": {
      if (points.length < 2) return { kind: "pending", command: { ...command, points, cursor: rounded } };
      const a = points[0];
      return {
        kind: "complete",
        ops: [{ op: "addRectangle", layout: context.layout, corner1: [roundCoord(a[0]), roundCoord(a[1])], corner2: [roundCoord(rounded[0]), roundCoord(rounded[1])], ...context.layer === void 0 ? {} : { layer: context.layer } }],
        command: void 0
      };
    }
    case "circle": {
      if (points.length < 2) return { kind: "pending", command: { ...command, points, cursor: rounded } };
      const center = points[0];
      const radius = Math.hypot(rounded[0] - center[0], rounded[1] - center[1]);
      return radius > 0 ? {
        kind: "complete",
        ops: [{ op: "addCircle", layout: context.layout, center: [roundCoord(center[0]), roundCoord(center[1])], radius: roundCoord(radius), ...context.layer === void 0 ? {} : { layer: context.layer } }],
        command: void 0
      } : { kind: "rejected", reasonKey: "commandNeedsRadius" };
    }
    case "arc": {
      if (points.length < 3) return { kind: "pending", command: { ...command, points, cursor: rounded } };
      const arc = arcThrough(points[0], points[1], points[2]);
      if (arc === void 0) return { kind: "rejected", reasonKey: "commandArcCollinear" };
      const degrees = 180 / Math.PI;
      return {
        kind: "complete",
        ops: [{
          op: "addArc",
          layout: context.layout,
          center: [roundCoord(arc.center[0]), roundCoord(arc.center[1])],
          radius: roundCoord(arc.radius),
          startAngleDeg: roundCoord(arc.a0 * degrees),
          endAngleDeg: roundCoord(arc.a1 * degrees),
          ...context.layer === void 0 ? {} : { layer: context.layer }
        }],
        command: void 0
      };
    }
    case "polyline":
    case "revisionCloud":
    case "leader":
      return { kind: "pending", command: { ...command, points, cursor: rounded } };
    default:
      return { kind: "rejected", reasonKey: "commandUnknown" };
  }
}
function commandFinish(command, context) {
  const points = command.points;
  switch (command.tool) {
    case "polyline":
      if (points.length < 2) return { kind: "rejected", reasonKey: "commandNeedsPoints" };
      return { kind: "complete", ops: [{ op: "addPolyline", layout: context.layout, pts: points.map((point) => [roundCoord(point[0]), roundCoord(point[1])]), ...context.layer === void 0 ? {} : { layer: context.layer } }], command: void 0 };
    case "revisionCloud":
      if (points.length < 3) return { kind: "rejected", reasonKey: "commandNeedsPoints" };
      return { kind: "complete", ops: [{ op: "addRevisionCloud", layout: context.layout, pts: points.map((point) => [roundCoord(point[0]), roundCoord(point[1])]), ...context.layer === void 0 ? {} : { layer: context.layer } }], command: void 0 };
    case "leader":
      if (points.length < 2) return { kind: "rejected", reasonKey: "commandNeedsPoints" };
      return { kind: "complete", ops: [{ op: "addLeader", layout: context.layout, pts: points.map((point) => [roundCoord(point[0]), roundCoord(point[1])]), ...context.layer === void 0 ? {} : { layer: context.layer } }], command: void 0 };
    default:
      return { kind: "complete", ops: [], command: void 0 };
  }
}
function commandNumeric(command, value, context) {
  if (!Number.isFinite(value)) return { kind: "rejected", reasonKey: "commandInvalidNumber" };
  const spec = toolOf(command.tool);
  if (spec === void 0) return { kind: "rejected", reasonKey: "commandUnknown" };
  const last = command.points[command.points.length - 1];
  const direction = command.cursor ?? (last === void 0 ? [1, 0] : [last[0] + 1, last[1]]);
  switch (command.tool) {
    case "line":
    case "polyline":
    case "leader":
    case "revisionCloud": {
      if (last === void 0) return { kind: "rejected", reasonKey: "commandNeedsPoint" };
      if (value <= 0) return { kind: "rejected", reasonKey: "commandInvalidNumber" };
      const next = pointAtDistance(last, direction, value);
      return commandClick(command, [roundValue(next[0]), roundValue(next[1])], context);
    }
    case "circle": {
      if (last === void 0) return { kind: "rejected", reasonKey: "commandNeedsPoint" };
      if (value <= 0) return { kind: "rejected", reasonKey: "commandNeedsRadius" };
      return {
        kind: "complete",
        ops: [{ op: "addCircle", layout: context.layout, center: [roundCoord(last[0]), roundCoord(last[1])], radius: roundCoord(value), ...context.layer === void 0 ? {} : { layer: context.layer } }],
        command: void 0
      };
    }
    case "rotate": {
      const center = command.points[0];
      if (center === void 0) return { kind: "rejected", reasonKey: "commandNeedsPoint" };
      return finishRotate(center, value, context);
    }
    case "scale": {
      const base = command.points[0];
      if (base === void 0) return { kind: "rejected", reasonKey: "commandNeedsPoint" };
      if (value <= 0) return { kind: "rejected", reasonKey: "commandInvalidNumber" };
      return finishScale(base, value, context);
    }
    case "offset": {
      if (command.points.length < 1) return { kind: "rejected", reasonKey: "commandNeedsPoint" };
      if (value <= 0) return { kind: "rejected", reasonKey: "commandInvalidNumber" };
      if (context.selection.length === 0) return { kind: "rejected", reasonKey: "commandNeedsSelection" };
      const side = command.points[0];
      return {
        kind: "complete",
        ops: context.selection.map((id) => ({ op: "offset", layout: context.layout, id, distance: roundCoord(value), side: [roundCoord(side[0]), roundCoord(side[1])] })),
        command: void 0
      };
    }
    case "move":
    case "copy": {
      const base = command.points[0];
      if (base === void 0) return { kind: "rejected", reasonKey: "commandNeedsPoint" };
      if (context.selection.length === 0) return { kind: "rejected", reasonKey: "commandNeedsSelection" };
      if (value <= 0) return { kind: "rejected", reasonKey: "commandInvalidNumber" };
      const target = pointAtDistance(base, direction, value);
      const dx = roundValue(target[0] - base[0]);
      const dy = roundValue(target[1] - base[1]);
      if (command.tool === "move") return { kind: "complete", ops: [{ op: "move", layout: context.layout, ids: [...context.selection], dx, dy }], command: void 0 };
      return { kind: "complete", ops: [{ op: "copy", layout: context.layout, ids: [...context.selection], dx, dy }], command: void 0 };
    }
    default:
      return { kind: "rejected", reasonKey: "commandNoNumeric" };
  }
}
function finishRotate(center, angle, context) {
  if (context.selection.length === 0) return { kind: "rejected", reasonKey: "commandNeedsSelection" };
  return { kind: "complete", ops: [{ op: "rotate", layout: context.layout, ids: [...context.selection], center: [roundCoord(center[0]), roundCoord(center[1])], angleDeg: roundCoord(angle) }], command: void 0 };
}
function finishScale(base, factor, context) {
  if (context.selection.length === 0) return { kind: "rejected", reasonKey: "commandNeedsSelection" };
  return {
    kind: "complete",
    ops: [{ op: "scale", layout: context.layout, ids: [...context.selection], center: [roundCoord(base[0]), roundCoord(base[1])], factor: roundCoord(factor) }],
    command: void 0
  };
}
function arcThrough(a, b, c) {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const cx = c[0];
  const cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return void 0;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const center = [ux, uy];
  const radius = Math.hypot(ax - ux, ay - uy);
  const angleOf = (point) => Math.atan2(point[1] - uy, point[0] - ux);
  const start = angleOf(a);
  const endAngle = angleOf(c);
  const normalise = (value) => (value % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let sweep = normalise(endAngle - start);
  const bSweep = normalise(angleOf(b) - start);
  if (bSweep > sweep) {
    sweep -= Math.PI * 2;
  }
  return { center: [roundCoord(ux), roundCoord(uy)], radius, a0: start, a1: start + sweep };
}
var HISTORY_LIMIT = 200;
var EMPTY_DRAFT_STATE = { ops: [], past: [], future: [] };
function draftCommit(state, next) {
  if (next === state.ops) return state;
  const past = [...state.past, state.ops];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { ops: next, past, future: [] };
}
function draftAddMany(state, ops) {
  if (ops.length === 0) return state;
  return draftCommit(state, [...state.ops, ...ops]);
}
function draftRemove(state, key) {
  const next = state.ops.filter((item) => item.key !== key);
  return next.length === state.ops.length ? state : draftCommit(state, next);
}
function draftClear(state) {
  if (state.ops.length === 0 && state.past.length === 0) return state;
  return { ops: [], past: [...state.past, state.ops].slice(-HISTORY_LIMIT), future: [] };
}
function draftUndo(state) {
  const previous = state.past[state.past.length - 1];
  if (previous === void 0) return state;
  return { ops: previous, past: state.past.slice(0, -1), future: [state.ops, ...state.future] };
}
function draftRedo(state) {
  const next = state.future[0];
  if (next === void 0) return state;
  return { ops: next, past: [...state.past, state.ops], future: state.future.slice(1) };
}
function draftCanUndo(state) {
  return state.past.length > 0;
}
function draftCanRedo(state) {
  return state.future.length > 0;
}
function draftReset() {
  return EMPTY_DRAFT_STATE;
}

// packages/ecad/src/client/EcadDraft.tsx
var import_react = require("react");

var css = "/* The ECAD drawing pane.\n *\n * Tokens only: every surface, label, border and accent comes from the theme's\n * --dsw-alias-* set, so the pane follows light and dark without a second palette.\n * The drawing sheet is a local surface pair because a CAD sheet is its own\n * ground: its ink and paper follow the theme, and a layer colour is tinted\n * toward the theme ink by the renderer (see palette.ts) so linework stays\n * readable on either ground.\n */\n\n._0qoF0J_root {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--dsw-font-family, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);\n  font-size: 12px;\n  line-height: 1.45;\n  container-type: inline-size;\n  /* The drawing's ground and ink. The sheet surface is a theme layer, never a\n     literal paper colour: dark mode gets a dark sheet, not a white flash. */\n  --ecad-paper: var(--dsw-alias-bg-layer-1);\n  --ecad-ink: var(--dsw-alias-label-primary);\n  --ecad-ink-tint: 55%;\n  --ecad-accent: var(--dsw-alias-state-business-primary);\n}\n\n/* Toolbar: one quiet row of view controls, the drawing's own status, and the\n   one action that leaves the pane. No product chrome \u2014 the document preview\n   header above already owns the path, reload and renderer controls. */\n._0qoF0J_toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  min-height: 40px;\n  box-sizing: border-box;\n  padding: 5px 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow: hidden;\n}\n\n._0qoF0J_toolbarGroup {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n}\n\n._0qoF0J_coverage {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n}\n\n._0qoF0J_toolbarSpacer {\n  flex: 1;\n  min-width: 0;\n}\n\n/* Badges carry a text label as well as the accent colour, so state never rides\n   on colour alone and the label can be localized. */\n._0qoF0J_badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n  height: 18px;\n  padding: 0 6px;\n  box-sizing: border-box;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  white-space: nowrap;\n}\n\n._0qoF0J_badgeWarn {\n  border-color: var(--dsw-alias-state-warn-primary);\n  color: var(--dsw-alias-state-warn-label);\n}\n\n._0qoF0J_badgeDot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: currentColor;\n  corner-shape: round;\n}\n\n._0qoF0J_button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  box-sizing: border-box;\n  min-width: 24px;\n  min-height: 24px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n}\n\n._0qoF0J_button:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._0qoF0J_button[aria-pressed='true'] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_iconButton {\n  width: 24px;\n  padding: 0;\n}\n\n._0qoF0J_primaryButton {\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_button:focus-visible,\n._0qoF0J_primaryButton:focus-visible,\n._0qoF0J_layoutTab:focus-visible,\n._0qoF0J_layerToggle:focus-visible,\n._0qoF0J_layerMiniButton:focus-visible,\n._0qoF0J_paletteButton:focus-visible,\n._0qoF0J_statusChip:focus-visible,\n._0qoF0J_contextMenuItem:focus-visible,\n._0qoF0J_canvasWrap:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n._0qoF0J_icon {\n  display: block;\n  width: 14px;\n  height: 14px;\n  flex: none;\n}\n\n/* Layout tabs: only for a multi-layout drawing, printed the way a drawing\n   application prints them, above the sheet. */\n._0qoF0J_layoutTabs {\n  display: flex;\n  align-items: stretch;\n  gap: 2px;\n  flex: none;\n  min-height: 28px;\n  padding: 0 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow-x: auto;\n  overflow-y: hidden;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_layoutTab {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  box-sizing: border-box;\n  padding: 0 9px;\n  min-height: 27px;\n  border: 0;\n  border-bottom: 2px solid transparent;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n._0qoF0J_layoutTabActive {\n  border-bottom-color: var(--ecad-accent);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_tabCount {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* The stage holds the sheet and the panels. The sheet keeps every spare pixel;\n   the panels give way first on a narrow preview tab. */\n._0qoF0J_stage {\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  min-width: 0;\n  position: relative;\n}\n\n._0qoF0J_canvasWrap {\n  position: relative;\n  flex: 1;\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  background: var(--ecad-paper);\n  cursor: grab;\n  touch-action: none;\n}\n\n._0qoF0J_canvasWrap:focus-visible {\n  outline-offset: -2px;\n}\n\n._0qoF0J_panning {\n  cursor: grabbing;\n}\n\n._0qoF0J_canvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n._0qoF0J_primitive {\n  pointer-events: none;\n}\n\n/* A selection is drawn as a paper-coloured halo under an accent stroke, so it\n   reads as a highlight state on top of any layer colour and never as a colour\n   the drawing itself uses. */\n._0qoF0J_selectionHalo {\n  fill: none;\n  stroke: var(--ecad-paper);\n  stroke-width: 5;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n._0qoF0J_selection {\n  fill: none;\n  stroke: var(--ecad-accent);\n  stroke-width: 2.5;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n/* Quiet state surfaces: the same centered rhythm the document previewers use\n   for loading, empty and failure states. */\n._0qoF0J_state {\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 24px;\n  text-align: center;\n}\n\n._0qoF0J_stateTitle {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_stateBody {\n  margin: 0;\n  max-width: 54ch;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_stateCode {\n  margin: 0;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-tertiary);\n  font-family: var(--dsh-font-family-code, ui-monospace, 'SF Mono', Consolas, monospace);\n  font-size: 10px;\n}\n\n._0qoF0J_stateActions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 2px;\n}\n\n._0qoF0J_spinner {\n  width: 18px;\n  height: 18px;\n  box-sizing: border-box;\n  border: 2px solid var(--dsw-alias-border-l2);\n  border-top-color: var(--dsw-alias-state-business-primary);\n  border-radius: 50%;\n  corner-shape: round;\n  animation: spin 900ms linear infinite;\n}\n\n@keyframes spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n/* Floating notice over the sheet: truncation and approximation are warnings the\n   reader must see, so they sit on the sheet's top edge, on an elevated surface. */\n._0qoF0J_notice {\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  right: 8px;\n  z-index: 2;\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 6px 9px;\n  border: 0.5px solid var(--dsw-alias-state-warn-primary);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-state-warn-tertiary);\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n  line-height: 1.4;\n  box-shadow: var(--dsw-elevation-panel);\n  pointer-events: none;\n}\n\n._0qoF0J_noticeText {\n  overflow-wrap: anywhere;\n}\n\n/* Side panel: layers, the selected primitive, and the title block. Quiet\n   neutral surface, hairline divider, long lists scroll inside themselves. */\n._0qoF0J_sidePanel {\n  display: flex;\n  flex-direction: column;\n  flex: none;\n  width: 228px;\n  min-height: 0;\n  border-left: 0.5px solid var(--dsw-alias-border-l2);\n  overflow-x: hidden;\n  overflow-y: auto;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_sidePanelHidden {\n  display: none;\n}\n\n._0qoF0J_panelSection {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n}\n\n._0qoF0J_layersSection {\n  flex: none;\n  max-height: 46%;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_inspectorSection {\n  /* The panel is the scroll container; sections keep their own height so an\n     outcome panel cannot squeeze one section over the next. */\n  flex: none;\n  min-height: 0;\n}\n\n._0qoF0J_panelHeading {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  padding: 8px 10px 4px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n._0qoF0J_panelHeadingSpacer {\n  flex: 1;\n}\n\n/* The column layout is dismissed from the toolbar; only the overlay needs its\n   own close control. */\n._0qoF0J_panelClose {\n  display: none;\n}\n\n._0qoF0J_panelHeadingButton {\n  min-height: 20px;\n  height: 20px;\n  padding: 0 4px;\n  font-size: 10px;\n  letter-spacing: 0;\n  text-transform: none;\n  font-weight: 400;\n}\n\n._0qoF0J_layerList {\n  min-height: 0;\n  overflow: auto;\n  padding: 0 4px 8px;\n}\n\n._0qoF0J_layerToggle {\n  display: grid;\n  grid-template-columns: 20px 12px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 5px;\n  width: 100%;\n  box-sizing: border-box;\n  min-height: 24px;\n  padding: 0 4px;\n  border: 0;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n._0qoF0J_layerToggle[aria-pressed='false'] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._0qoF0J_layerToggle[aria-pressed='false'] ._0qoF0J_layerName {\n  text-decoration: line-through;\n}\n\n._0qoF0J_layerEye {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: inherit;\n}\n\n._0qoF0J_swatch {\n  width: 10px;\n  height: 10px;\n  box-sizing: border-box;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: 2px;\n}\n\n._0qoF0J_layerName {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11px;\n}\n\n._0qoF0J_layerCount {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* Inspector: key/value rows with the label quiet and the value readable. */\n._0qoF0J_inspector {\n  min-height: 0;\n  overflow: auto;\n  padding: 2px 10px 12px;\n}\n\n._0qoF0J_inspectorHint {\n  margin: 4px 0 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_propertyRow {\n  display: grid;\n  grid-template-columns: 74px minmax(0, 1fr);\n  gap: 8px;\n  align-items: baseline;\n  padding: 3px 0;\n  font-size: 11px;\n}\n\n._0qoF0J_propertyLabel {\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_propertyValue {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_mono {\n  font-family: var(--dsh-font-family-code, ui-monospace, 'SF Mono', Consolas, monospace);\n  font-size: 10px;\n}\n\n._0qoF0J_approxNote {\n  margin: 8px 0 0;\n  padding: 6px 8px;\n  border-left: 2px solid var(--dsw-alias-state-warn-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-tertiary) 55%, transparent);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_inspectorActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-top: 10px;\n}\n\n._0qoF0J_inspectorActions ._0qoF0J_button {\n  border: 0.5px solid var(--dsw-alias-border-l3);\n}\n\n/* The title block summary is read, not operated: rows only, no controls. */\n._0qoF0J_sheetSection {\n  flex: none;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_sheetRows {\n  padding: 0 10px 8px;\n}\n\n._0qoF0J_sheetValue {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* The coverage sentence is read, not scanned: wrap it instead of clipping it. */\n._0qoF0J_sheetValueWrap {\n  white-space: normal;\n  overflow-wrap: anywhere;\n  line-height: 1.4;\n}\n\n/* Hover and press feedback belongs to pointers that have hover. */\n@media (hover: hover) {\n  ._0qoF0J_button:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_primaryButton:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n\n  ._0qoF0J_layoutTab:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_layerToggle:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n}\n\n._0qoF0J_button:active:not(:disabled),\n._0qoF0J_layerToggle:active,\n._0qoF0J_layoutTab:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n/* The sheet outranks the coverage text first. */\n@container (max-width: 720px) {\n  ._0qoF0J_coverage {\n    display: none;\n  }\n}\n\n/* Only a genuinely narrow preview pane gives the panel the overlay treatment:\n   above this width the panel keeps its own column and never covers the sheet. */\n@container (max-width: 520px) {\n  ._0qoF0J_sidePanel {\n    position: absolute;\n    top: 0;\n    right: 0;\n    bottom: 0;\n    z-index: 3;\n    width: min(260px, 82%);\n    background: var(--dsw-alias-bg-document-preview);\n    border-left: 0.5px solid var(--dsw-alias-border-l2);\n    box-shadow: var(--dsw-elevation-panel);\n  }\n\n  ._0qoF0J_toolbarLabel {\n    display: none;\n  }\n\n  ._0qoF0J_panelClose {\n    display: inline-flex;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._0qoF0J_spinner {\n    animation: none;\n    border-top-color: var(--dsw-alias-border-l2);\n    border-left-color: var(--dsw-alias-state-business-primary);\n  }\n}\n\n/* The ECAD drawing pane \u2014 editing additions.\n *\n * Appended as one block so the review can read the M4 surface on its own: the\n * view/edit switch, the edit action row, the staged-change panel and the\n * written-drawing banner. Tokens only, like the reading pane above.\n */\n\n/* View/edit switch: a two-state segmented control, quiet until it is needed. */\n._0qoF0J_modeSwitch {\n  display: inline-flex;\n  align-items: center;\n  flex: none;\n  gap: 2px;\n  padding: 2px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n}\n\n._0qoF0J_modeButton {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 40px;\n  min-height: 22px;\n  padding: 0 7px;\n  border: 0;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n}\n\n._0qoF0J_modeButtonActive {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_editBar {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex: none;\n  min-height: 36px;\n  box-sizing: border-box;\n  padding: 4px 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-interactive-bg-hover);\n  overflow-x: auto;\n  overflow-y: hidden;\n  white-space: nowrap;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_editBarGroup {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n}\n\n._0qoF0J_editBarMeta {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n}\n\n._0qoF0J_applyLabelLong {\n  display: inline;\n}\n\n/* Narrow panes keep the primary action readable: the short label wins. */\n._0qoF0J_applyLabelShort {\n  display: none;\n}\n\n/* The armed tool keeps a filled state; the label says what it does. */\n._0qoF0J_toolArmed {\n  border-color: var(--dsw-alias-state-business-primary) !important;\n  background: var(--dsw-alias-interactive-bg-hover) !important;\n  color: var(--dsw-alias-label-primary) !important;\n}\n\n._0qoF0J_applyButton {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  box-sizing: border-box;\n  min-height: 26px;\n  padding: 0 12px;\n  border: 0.5px solid var(--dsw-alias-button-primary-fill);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-button-primary-fill);\n  color: var(--dsw-alias-label-primary-foreground);\n  font: inherit;\n  font-size: 11px;\n  font-weight: 600;\n  cursor: pointer;\n}\n\n._0qoF0J_applyButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._0qoF0J_modeButton:focus-visible,\n._0qoF0J_applyButton:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n/* The staged-change section keeps its list scrolling inside the panel. */\n._0qoF0J_draftSection {\n  flex: none;\n  max-height: 46%;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow: auto;\n}\n\n/* While a draft is open the layer list keeps its own share of the panel. */\n._0qoF0J_draftSection ~ ._0qoF0J_layersSection {\n  max-height: 30%;\n}\n\n._0qoF0J_draftList {\n  min-height: 0;\n  max-height: 132px;\n  overflow: auto;\n  padding: 0 6px 4px;\n}\n\n._0qoF0J_draftItem {\n  display: grid;\n  grid-template-columns: minmax(52px, auto) minmax(0, 1fr) 22px;\n  align-items: center;\n  gap: 6px;\n  min-height: 24px;\n  padding: 0 2px;\n  border-radius: var(--dsw-radius-xs);\n  font-size: 11px;\n}\n\n._0qoF0J_draftKind {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  text-transform: lowercase;\n}\n\n._0qoF0J_draftSummary {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._0qoF0J_draftHint {\n  margin: 2px 10px 6px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_draftCounts {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  padding: 0 10px 8px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n}\n\n._0qoF0J_draftActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  padding: 2px 10px 8px;\n}\n\n/* The annotation form: three labelled fields, then stage/cancel. */\n._0qoF0J_placementForm {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  padding-bottom: 6px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  margin-bottom: 6px;\n}\n\n._0qoF0J_formRow {\n  display: grid;\n  grid-template-columns: 62px minmax(0, 1fr);\n  align-items: center;\n  gap: 6px;\n  padding: 0 10px;\n  font-size: 11px;\n}\n\n._0qoF0J_formLabel {\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_formInput {\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 24px;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 11px;\n}\n\n._0qoF0J_formInput:focus-visible,\n._0qoF0J_formActions button:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n._0qoF0J_formError {\n  margin: 0 10px;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 10px;\n}\n\n._0qoF0J_formActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  padding: 2px 10px 0;\n}\n\n/* The apply outcome: written path, counters, verification and DWG round trip. */\n._0qoF0J_applyOutcome {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  margin: 0 6px 8px;\n  padding: 6px 8px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-bg-document-preview);\n  font-size: 11px;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_applyOk {\n  border-color: var(--dsw-alias-state-success-primary);\n}\n\n._0qoF0J_applyWarn {\n  border-color: var(--dsw-alias-state-warn-primary);\n}\n\n._0qoF0J_applyFailed {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n._0qoF0J_outputPath {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_outputPath code {\n  font-family: var(--dsh-font-family-code, ui-monospace, 'SF Mono', Consolas, monospace);\n  font-size: 10px;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_applySummary {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.4;\n}\n\n._0qoF0J_counterGroup {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  padding: 4px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n}\n\n._0qoF0J_counterRow {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 8px;\n  font-size: 10px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_counterValue {\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n._0qoF0J_okText {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n._0qoF0J_warnText {\n  color: var(--dsw-alias-state-warn-label);\n}\n\n._0qoF0J_warnBlock {\n  padding: 4px 6px;\n  border-left: 2px solid var(--dsw-alias-state-warn-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-tertiary) 45%, transparent);\n  border-radius: 0 var(--dsw-radius-xs) var(--dsw-radius-xs) 0;\n}\n\n._0qoF0J_warnTitle {\n  display: block;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 600;\n}\n\n._0qoF0J_warnList {\n  margin: 3px 0 0;\n  padding-left: 14px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.4;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_noteBlock {\n  padding: 4px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n}\n\n/* The written drawing's banner sits over the sheet's top edge like the\n   truncation notice, and offers the way back. */\n._0qoF0J_writtenBanner {\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  right: 8px;\n  z-index: 3;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 5px 9px;\n  border: 0.5px solid var(--dsw-alias-state-success-primary);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n  box-shadow: var(--dsw-elevation-panel);\n  overflow-wrap: anywhere;\n}\n\n/* Draft ghosts and the erase fade: the staged state is visible on the sheet\n   without ever claiming the source changed. */\n._0qoF0J_ghostGroup {\n  pointer-events: none;\n}\n\n._0qoF0J_ghostText {\n  fill: var(--ecad-accent);\n  opacity: 0.9;\n}\n\n._0qoF0J_placementMarker {\n  stroke: var(--ecad-accent);\n  stroke-width: 1;\n  fill: none;\n  opacity: 0.9;\n}\n\n/* A truncation notice under the written-drawing banner keeps both readable. */\n._0qoF0J_noticeBelowBanner {\n  top: 46px;\n}\n\n._0qoF0J_faded {\n  opacity: 0.3;\n}\n\n/* The inspector's edit block: delta fields above the stage actions. */\n._0qoF0J_editActionsBlock {\n  display: flex;\n  flex-direction: column;\n}\n\n/* Editing copy: a hint under the inspector actions, quiet like the rest. */\n._0qoF0J_editHint {\n  margin: 8px 0 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 1.45;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_moveFields {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  gap: 6px;\n  margin-top: 8px;\n}\n\n._0qoF0J_moveField {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  font-size: 10px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_moveField input {\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 24px;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 11px;\n}\n\n._0qoF0J_moveField input:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n@media (hover: hover) {\n  ._0qoF0J_modeButton:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_applyButton:hover:not(:disabled) {\n    background: var(--dsw-alias-button-primary-hover);\n    border-color: var(--dsw-alias-button-primary-hover);\n  }\n\n  ._0qoF0J_draftItem:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._0qoF0J_writtenBanner {\n    box-shadow: none;\n  }\n}\n\n@container (max-width: 520px) {\n  ._0qoF0J_editBarMeta {\n    display: none;\n  }\n\n  ._0qoF0J_editBar {\n    gap: 6px;\n    padding: 4px 8px;\n  }\n\n  /* These rules follow the base declaration, so the cascade keeps them. */\n  ._0qoF0J_applyLabelLong {\n    display: none;\n  }\n\n  ._0qoF0J_applyLabelShort {\n    display: inline;\n  }\n}\n\n/* The CAD workspace \u2014 selection, navigation, drawing aids, the tool palette and\n * the command surfaces. Appended as one block, tokens only, like the panes above.\n */\n\n/* The sheet column: the canvas keeps every spare pixel and the status line is a\n   single quiet footer under it. */\n._0qoF0J_canvasColumn {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-width: 0;\n  min-height: 0;\n  position: relative;\n}\n\n/* The tool rail: a compact vertical palette inside the stage's left edge. A\n   grouping label sits above each run of buttons; every button is a 24 px target. */\n._0qoF0J_toolRail {\n  display: flex;\n  flex-direction: column;\n  flex: none;\n  width: 38px;\n  min-height: 0;\n  padding: 4px 2px;\n  box-sizing: border-box;\n  overflow-y: auto;\n  overflow-x: hidden;\n  border-right: 0.5px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-document-preview);\n  scrollbar-width: thin;\n}\n\n._0qoF0J_paletteGroup {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 2px;\n  padding: 2px 0 4px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_paletteGroup:last-child {\n  border-bottom: 0;\n}\n\n._0qoF0J_paletteGroupLabel {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 8px;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n}\n\n._0qoF0J_paletteTools {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 1px;\n}\n\n._0qoF0J_paletteButton {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 26px;\n  height: 26px;\n  padding: 0;\n  border: 0.5px solid transparent;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n}\n\n._0qoF0J_paletteButton:disabled {\n  opacity: 0.35;\n  cursor: default;\n}\n\n/* The command bar under the toolbar: the armed tool's instruction, the numeric\n   entry a command accepts, and the cancel action. */\n._0qoF0J_commandBar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  min-height: 32px;\n  box-sizing: border-box;\n  padding: 3px 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-interactive-bg-hover);\n  overflow-x: auto;\n  overflow-y: hidden;\n  white-space: nowrap;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_commandText {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n}\n\n._0qoF0J_commandTool {\n  flex: none;\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_commandMeta {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n}\n\n._0qoF0J_commandField {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  flex: none;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n}\n\n._0qoF0J_commandField ._0qoF0J_formInput {\n  width: 84px;\n}\n\n._0qoF0J_commandActions {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n}\n\n/* Context menu: an elevated list at the pointer, closed by Escape or a click on\n   the backdrop. */\n._0qoF0J_contextBackdrop {\n  position: absolute;\n  inset: 0;\n  z-index: 20;\n  background: transparent;\n}\n\n._0qoF0J_contextMenu {\n  position: absolute;\n  z-index: 21;\n  display: flex;\n  flex-direction: column;\n  min-width: 176px;\n  max-width: 260px;\n  padding: 4px;\n  box-sizing: border-box;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  box-shadow: var(--dsw-elevation-panel);\n}\n\n._0qoF0J_contextMenuItem {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 24px;\n  padding: 2px 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  font-size: 11px;\n  text-align: left;\n  cursor: pointer;\n}\n\n._0qoF0J_contextMenuItem:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._0qoF0J_contextMenuLabel {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._0qoF0J_contextMenuShortcut {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n._0qoF0J_contextMenuSeparator {\n  height: 0.5px;\n  margin: 3px 4px;\n  background: var(--dsw-alias-border-l2);\n}\n\n/* Status footer: coordinates, sheet size and the drawing-aid state. State is a\n   labelled chip with aria-pressed, never colour alone. */\n._0qoF0J_statusBar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  min-height: 24px;\n  box-sizing: border-box;\n  padding: 2px 8px;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n  overflow-x: auto;\n  overflow-y: hidden;\n  white-space: nowrap;\n  scrollbar-width: none;\n}\n\n._0qoF0J_statusItem {\n  flex: none;\n}\n\n._0qoF0J_statusGrow {\n  flex: 1;\n  min-width: 8px;\n}\n\n._0qoF0J_statusChip {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n  min-height: 20px;\n  padding: 0 5px;\n  border: 0.5px solid transparent;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-size: 9px;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  cursor: pointer;\n}\n\n._0qoF0J_statusChip[aria-pressed='true'] {\n  border-color: var(--dsw-alias-border-l3);\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Canvas overlays: the selection outline, the marquee rectangle, the snap marker\n   and the grip handles all live in screen space on top of the transformed scene. */\n._0qoF0J_selectionOverlay {\n  pointer-events: none;\n}\n\n._0qoF0J_marqueeWindow {\n  fill: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);\n  stroke: var(--dsw-alias-state-business-primary);\n  stroke-width: 1;\n  stroke-dasharray: 4 3;\n}\n\n._0qoF0J_marqueeCrossing {\n  fill: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);\n  stroke: var(--dsw-alias-state-success-primary);\n  stroke-width: 1;\n  stroke-dasharray: 4 3;\n}\n\n._0qoF0J_gridLine {\n  stroke: var(--dsw-alias-border-l2);\n  stroke-width: 0.5;\n  opacity: 0.6;\n}\n\n._0qoF0J_snapMarker {\n  fill: none;\n  stroke: var(--dsw-alias-state-warn-primary);\n  stroke-width: 1.5;\n  pointer-events: none;\n}\n\n._0qoF0J_snapLabel {\n  fill: var(--dsw-alias-state-warn-label);\n  font-size: 10px;\n  font-weight: 600;\n  paint-order: stroke;\n  stroke: var(--ecad-paper);\n  stroke-width: 3;\n  pointer-events: none;\n}\n\n._0qoF0J_gripHandle {\n  fill: var(--ecad-paper);\n  stroke: var(--ecad-accent);\n  stroke-width: 1.5;\n  pointer-events: none;\n}\n\n._0qoF0J_gripHandleActive {\n  fill: var(--ecad-accent);\n  stroke: var(--ecad-accent);\n  stroke-width: 1.5;\n  pointer-events: none;\n}\n\n._0qoF0J_gripLine {\n  stroke: var(--ecad-accent);\n  stroke-width: 1;\n  stroke-dasharray: 3 2;\n  fill: none;\n  pointer-events: none;\n}\n\n._0qoF0J_previewLine {\n  stroke: var(--ecad-accent);\n  stroke-width: 1.25;\n  stroke-dasharray: 5 3;\n  fill: none;\n  pointer-events: none;\n}\n\n._0qoF0J_previewShape {\n  stroke: var(--ecad-accent);\n  stroke-width: 1.25;\n  stroke-dasharray: 4 3;\n  fill: none;\n  opacity: 0.8;\n  pointer-events: none;\n}\n\n/* Properties panel: edit sub-blocks reuse the inspector's key/value rows. */\n._0qoF0J_propertyHeading {\n  margin: 10px 0 2px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n}\n\n/* Layers: the current-layer line, per-row action buttons, and the create/edit\n   forms. The layer row keeps the existing toggle's grid and adds its actions. */\n._0qoF0J_layerCurrent {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 0 6px 6px;\n  font-size: 10px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_layerCurrent ._0qoF0J_formInput {\n  flex: 1;\n  min-width: 0;\n}\n\n._0qoF0J_layerRow {\n  display: flex;\n  align-items: center;\n  gap: 1px;\n}\n\n._0qoF0J_layerRow ._0qoF0J_layerToggle {\n  flex: 1;\n  min-width: 0;\n}\n\n._0qoF0J_layerMiniButton {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  width: 22px;\n  height: 24px;\n  padding: 0;\n  border: 0;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n\n._0qoF0J_layerMiniButton[aria-pressed='true'] {\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_layerForm {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 4px 6px 6px;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_layerFormRow {\n  display: grid;\n  grid-template-columns: 62px minmax(0, 1fr);\n  align-items: center;\n  gap: 6px;\n  font-size: 10px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n._0qoF0J_layerFormRow ._0qoF0J_formInput {\n  min-height: 22px;\n}\n\n/* An actionable notice (engine operation pending, export failure) must accept a\n   pointer so it can be dismissed; the warning notice over the sheet stays inert. */\n._0qoF0J_noticeActionable {\n  pointer-events: auto;\n}\n\n._0qoF0J_noticeInfo {\n  border-color: var(--dsw-alias-state-business-primary);\n  background: var(--dsw-alias-bg-document-preview);\n}\n\n._0qoF0J_noticeError {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n/* Print: only the drawing page goes to the printer. The sheet column fills the\n   page, the header names what is printed, and every control is hidden. */\n@media print {\n  ._0qoF0J_noPrint {\n    display: none !important;\n  }\n\n  ._0qoF0J_printOnly {\n    display: block !important;\n  }\n\n  /* The sheet is the printed page: selection, snaps, grips, ghosts, the command\n     bar and the written-drawing banner are screen chrome, not drawing content. */\n  ._0qoF0J_selectionOverlay,\n  ._0qoF0J_snapMarker,\n  ._0qoF0J_snapLabel,\n  ._0qoF0J_gripHandle,\n  ._0qoF0J_gripHandleActive,\n  ._0qoF0J_gripLine,\n  ._0qoF0J_previewLine,\n  ._0qoF0J_previewShape,\n  ._0qoF0J_placementMarker,\n  ._0qoF0J_marqueeWindow,\n  ._0qoF0J_marqueeCrossing,\n  ._0qoF0J_gridLine,\n  ._0qoF0J_ghostGroup,\n  ._0qoF0J_ghostText,\n  ._0qoF0J_commandBar,\n  ._0qoF0J_writtenBanner,\n  ._0qoF0J_notice {\n    display: none !important;\n  }\n\n  ._0qoF0J_root {\n    height: auto;\n    min-height: 0;\n    background: #ffffff;\n  }\n\n  ._0qoF0J_stage {\n    display: block;\n  }\n\n  ._0qoF0J_canvasColumn {\n    display: block;\n  }\n\n  ._0qoF0J_canvasWrap {\n    height: 84vh;\n    border: 0;\n    outline: none;\n    background: #ffffff;\n  }\n\n  /* The focused canvas keeps no focus ring on paper. */\n  ._0qoF0J_canvasWrap:focus-visible {\n    outline: none;\n  }\n\n  ._0qoF0J_statusBar {\n    display: none;\n  }\n}\n\n._0qoF0J_printOnly {\n  display: none;\n}\n\n._0qoF0J_printHeader {\n  padding: 6px 0 4px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n}\n\n._0qoF0J_printTitle {\n  font-weight: 600;\n}\n\n._0qoF0J_printMeta {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n}\n\n/* The tool rail yields its width to the sheet on a genuinely narrow pane. */\n@container (max-width: 420px) {\n  ._0qoF0J_toolRail {\n    width: 32px;\n  }\n\n  ._0qoF0J_paletteButton {\n    width: 24px;\n    height: 24px;\n  }\n\n  ._0qoF0J_paletteGroupLabel {\n    display: none;\n  }\n}\n\n@media (hover: hover) {\n  ._0qoF0J_paletteButton:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_contextMenuItem:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n\n  ._0qoF0J_statusChip:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_layerMiniButton:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n}\n\n._0qoF0J_paletteButton:active:not(:disabled),\n._0qoF0J_statusChip:active,\n._0qoF0J_layerMiniButton:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._0qoF0J_contextMenu {\n    scroll-behavior: auto;\n  }\n}\n";
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
  "layerMiniButton": "_0qoF0J_layerMiniButton",
  "paletteButton": "_0qoF0J_paletteButton",
  "statusChip": "_0qoF0J_statusChip",
  "contextMenuItem": "_0qoF0J_contextMenuItem",
  "canvasWrap": "_0qoF0J_canvasWrap",
  "icon": "_0qoF0J_icon",
  "layoutTabs": "_0qoF0J_layoutTabs",
  "layoutTabActive": "_0qoF0J_layoutTabActive",
  "tabCount": "_0qoF0J_tabCount",
  "stage": "_0qoF0J_stage",
  "panning": "_0qoF0J_panning",
  "canvas": "_0qoF0J_canvas",
  "primitive": "_0qoF0J_primitive",
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
  "noticeBelowBanner": "_0qoF0J_noticeBelowBanner",
  "faded": "_0qoF0J_faded",
  "editActionsBlock": "_0qoF0J_editActionsBlock",
  "editHint": "_0qoF0J_editHint",
  "moveFields": "_0qoF0J_moveFields",
  "moveField": "_0qoF0J_moveField",
  "canvasColumn": "_0qoF0J_canvasColumn",
  "toolRail": "_0qoF0J_toolRail",
  "paletteGroup": "_0qoF0J_paletteGroup",
  "paletteGroupLabel": "_0qoF0J_paletteGroupLabel",
  "paletteTools": "_0qoF0J_paletteTools",
  "commandBar": "_0qoF0J_commandBar",
  "commandText": "_0qoF0J_commandText",
  "commandTool": "_0qoF0J_commandTool",
  "commandMeta": "_0qoF0J_commandMeta",
  "commandField": "_0qoF0J_commandField",
  "commandActions": "_0qoF0J_commandActions",
  "contextBackdrop": "_0qoF0J_contextBackdrop",
  "contextMenu": "_0qoF0J_contextMenu",
  "contextMenuLabel": "_0qoF0J_contextMenuLabel",
  "contextMenuShortcut": "_0qoF0J_contextMenuShortcut",
  "contextMenuSeparator": "_0qoF0J_contextMenuSeparator",
  "statusBar": "_0qoF0J_statusBar",
  "statusItem": "_0qoF0J_statusItem",
  "statusGrow": "_0qoF0J_statusGrow",
  "selectionOverlay": "_0qoF0J_selectionOverlay",
  "marqueeWindow": "_0qoF0J_marqueeWindow",
  "marqueeCrossing": "_0qoF0J_marqueeCrossing",
  "gridLine": "_0qoF0J_gridLine",
  "snapMarker": "_0qoF0J_snapMarker",
  "snapLabel": "_0qoF0J_snapLabel",
  "gripHandle": "_0qoF0J_gripHandle",
  "gripHandleActive": "_0qoF0J_gripHandleActive",
  "gripLine": "_0qoF0J_gripLine",
  "previewLine": "_0qoF0J_previewLine",
  "previewShape": "_0qoF0J_previewShape",
  "propertyHeading": "_0qoF0J_propertyHeading",
  "layerCurrent": "_0qoF0J_layerCurrent",
  "layerRow": "_0qoF0J_layerRow",
  "layerForm": "_0qoF0J_layerForm",
  "layerFormRow": "_0qoF0J_layerFormRow",
  "noticeActionable": "_0qoF0J_noticeActionable",
  "noticeInfo": "_0qoF0J_noticeInfo",
  "noticeError": "_0qoF0J_noticeError",
  "noPrint": "_0qoF0J_noPrint",
  "printOnly": "_0qoF0J_printOnly",
  "printHeader": "_0qoF0J_printHeader",
  "printTitle": "_0qoF0J_printTitle",
  "printMeta": "_0qoF0J_printMeta"
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
    { className: `${EcadBody_default.editBar} ${EcadBody_default.noPrint}`, role: "group", "aria-label": t("editBarLabel") },
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
function BlockPlacementForm({ t, value, blocks, onChange, onStage, onCancel }) {
  return (0, import_react.createElement)(
    "form",
    {
      className: EcadBody_default.placementForm,
      onSubmit: (event) => {
        event.preventDefault();
        onStage();
      },
      "data-ecad-block-form": "true"
    },
    (0, import_react.createElement)("div", { className: EcadBody_default.panelHeading }, t("blockPlacementTitle", { point: `${value.point[0]}, ${value.point[1]}` })),
    blocks.length === 0 ? (0, import_react.createElement)("p", { className: EcadBody_default.inspectorHint }, t("noBlocks")) : (0, import_react.createElement)(
      "div",
      null,
      (0, import_react.createElement)(
        "label",
        { className: EcadBody_default.formRow },
        (0, import_react.createElement)("span", { className: EcadBody_default.formLabel }, t("blockPlacementLabel")),
        (0, import_react.createElement)("select", {
          className: EcadBody_default.formInput,
          value: value.block,
          "aria-label": t("blockPlacementLabel"),
          onChange: (event) => {
            onChange("block", event.target.value);
          },
          "data-ecad-block-name": "true"
        }, blocks.map((block) => (0, import_react.createElement)("option", { key: block, value: block }, block)))
      ),
      (0, import_react.createElement)(
        "label",
        { className: EcadBody_default.formRow },
        (0, import_react.createElement)("span", { className: EcadBody_default.formLabel }, t("blockRotation")),
        (0, import_react.createElement)("input", {
          className: EcadBody_default.formInput,
          type: "text",
          inputMode: "decimal",
          value: value.rotation,
          "aria-label": t("blockRotation"),
          onChange: (event) => {
            onChange("rotation", event.target.value);
          },
          "data-ecad-block-rotation": "true"
        })
      ),
      (0, import_react.createElement)(
        "label",
        { className: EcadBody_default.formRow },
        (0, import_react.createElement)("span", { className: EcadBody_default.formLabel }, t("blockScale")),
        (0, import_react.createElement)("input", {
          className: EcadBody_default.formInput,
          type: "text",
          inputMode: "decimal",
          value: value.scale,
          "aria-label": t("blockScale"),
          onChange: (event) => {
            onChange("scale", event.target.value);
          },
          "data-ecad-block-scale": "true"
        })
      )
    ),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.formActions },
      (0, import_react.createElement)("button", { type: "submit", className: EcadBody_default.applyButton, disabled: blocks.length === 0 || value.block === "" }, t("stageBlockPlacement")),
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
    (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, `${t("format")}: ${(result.format ?? "dxf").toUpperCase()}`),
    Object.keys(result.changes ?? {}).length === 0 ? null : (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, `${t("changes")}: ${Object.entries(result.changes).map(([kind, count]) => `${kind} ${count}`).join(", ")}`),
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
      roundTrip.hardChanges !== void 0 && roundTrip.hardChanges > 0 ? (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, t("roundTripHardChanges", { count: roundTrip.hardChanges })) : null,
      roundTrip.metadataChanges !== void 0 && roundTrip.metadataChanges > 0 ? (0, import_react.createElement)("p", { className: EcadBody_default.applySummary }, t("roundTripMetadataChanges", { count: roundTrip.metadataChanges })) : null,
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
function DraftPanel({ t, staged: staged2, counts, hint, placement, layers, invalidHeight, onPlacementChange, onStagePlacement, onCancelPlacement, blockPlacement, blocks, onBlockChange, onStageBlock, onCancelBlock, onRemove, outcome, onDismissOutcome, onOpenWritten, onBackToSource }) {
  const summarize = (item) => {
    const op = item.op;
    if (op.op === "addText") return t("stageTextSummary", { text: op.text, point: `${op.p[0]}, ${op.p[1]}` });
    if (op.op === "move") return t("stageMoveSummary", { id: op.ids[0] ?? "", dx: op.dx, dy: op.dy });
    if (op.op === "erase") return t("stageEraseSummary", { id: op.ids[0] ?? "" });
    if (op.op === "addBlock") return t("stageBlockSummary", { block: op.block, point: `${op.p[0]}, ${op.p[1]}` });
    if (op.op === "rotate") return t("stageRotateSummary", { count: op.ids.length, angle: op.angleDeg });
    if (op.op === "copy") return t("stageCopySummary", { count: op.ids.length, dx: op.dx, dy: op.dy });
    if (op.op === "scale" || op.op === "mirror") return t("stageModifySummary", { op: op.op, count: op.ids.length });
    if (op.op === "offset") return t("stageOffsetSummary", { id: op.id, distance: op.distance });
    if (op.op === "trim" || op.op === "extend" || op.op === "setLine" || op.op === "setPolyline") return t("stageGripSummary", { op: op.op, id: op.id });
    if (op.op === "setCircle" || op.op === "setArc" || op.op === "setEllipse") return t("stageSetterSummary", { op: op.op, id: op.id });
    if (op.op === "setColor") return t("stageColorSummary", { color: op.color, count: op.ids.length });
    if (op.op === "addLayer" || op.op === "renameLayer" || op.op === "setLayerColor") return t("stageLayerSummary", { op: op.op, name: "name" in op ? op.name : op.from });
    if (op.op === "setText" || op.op === "setAttribute" || op.op === "setLayer") return t("stagePropertySummary", { op: op.op, id: op.id });
    if (op.op === "addLine" || op.op === "addPolyline" || op.op === "addRectangle" || op.op === "addRevisionCloud" || op.op === "addLeader") {
      const points = "pts" in op ? op.pts.length : "a" in op && "b" in op ? 2 : 2;
      return t("stageDrawSummary", { op: op.op, count: points });
    }
    if (op.op === "addCircle" || op.op === "addArc") return t("stageDrawSummary", { op: op.op, count: 1 });
    return op.op ?? "op";
  };
  const kindLabel = (kind) => {
    if (kind === "addText") return t("opAddText");
    if (kind === "move") return t("opMove");
    if (kind === "erase") return t("opErase");
    if (kind === "rotate") return t("opRotate");
    if (kind === "copy" || kind === "scale" || kind === "mirror" || kind === "offset" || kind === "trim" || kind === "extend" || kind === "setLine" || kind === "setPolyline" || kind === "setCircle" || kind === "setArc" || kind === "setEllipse") return t("opModify");
    if (kind === "addLayer" || kind === "renameLayer" || kind === "setLayerColor") return t("opLayer");
    if (kind === "setText" || kind === "setAttribute" || kind === "setLayer" || kind === "setColor") return t("opProperty");
    return t("opDraw");
  };
  return (0, import_react.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.draftSection}`, "data-ecad-draft": "true" },
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.panelHeading },
      t("stagedOps"),
      (0, import_react.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
      staged2.length === 0 ? null : (0, import_react.createElement)("span", { className: EcadBody_default.tabCount }, t("stagedCount", { count: staged2.length }))
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
    blockPlacement === void 0 || blocks === void 0 || onBlockChange === void 0 || onStageBlock === void 0 || onCancelBlock === void 0 ? null : (0, import_react.createElement)(BlockPlacementForm, {
      t,
      value: blockPlacement,
      blocks,
      onChange: onBlockChange,
      onStage: onStageBlock,
      onCancel: onCancelBlock
    }),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.draftList, role: "list", "aria-label": t("stagedOps") },
      staged2.length === 0 ? (0, import_react.createElement)("p", { className: EcadBody_default.inspectorHint }, t("noDraft")) : staged2.map((item) => {
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
    (0, import_react.createElement)("p", { className: EcadBody_default.draftHint }, hint),
    staged2.length === 0 ? null : (0, import_react.createElement)(
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

// packages/ecad/src/client/EcadCad.tsx
var import_react2 = require("react");
function icon(children, size = 14) {
  return (0, import_react2.createElement)("svg", {
    className: EcadBody_default.icon,
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  }, children);
}
function ToolGlyph({ tool, size = 14 }) {
  switch (tool) {
    case "select":
      return icon([(0, import_react2.createElement)("path", { key: "a", d: "M3 2.5l8.5 5-4 1.2-1.4 4L3 2.5Z" })], size);
    case "pan":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M8 2v12M2 8h12" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M5.5 4.5 8 2l2.5 2.5M5.5 11.5 8 14l2.5-2.5M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5" })
      ], size);
    case "zoomWindow":
      return icon([
        (0, import_react2.createElement)("rect", { key: "a", x: 2, y: 2, width: 8, height: 8, rx: 0.5, strokeDasharray: "2 1.5" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M10 10l4 4" }),
        (0, import_react2.createElement)("path", { key: "c", d: "M12.5 9.5v3M9.5 12.5h3" })
      ], size);
    case "line":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M3 12.5 13 3.5" }),
        (0, import_react2.createElement)("circle", { key: "b", cx: 3, cy: 12.5, r: 1.2 }),
        (0, import_react2.createElement)("circle", { key: "c", cx: 13, cy: 3.5, r: 1.2 })
      ], size);
    case "polyline":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M2.5 12.5 6 5l4 5 3.5-7" }),
        (0, import_react2.createElement)("circle", { key: "b", cx: 6, cy: 5, r: 1.1 }),
        (0, import_react2.createElement)("circle", { key: "c", cx: 10, cy: 10, r: 1.1 })
      ], size);
    case "rectangle":
      return icon([(0, import_react2.createElement)("rect", { key: "a", x: 2.5, y: 4.5, width: 11, height: 7, rx: 0.5 })], size);
    case "circle":
      return icon([(0, import_react2.createElement)("circle", { key: "a", cx: 8, cy: 8, r: 5.5 })], size);
    case "arc":
      return icon([(0, import_react2.createElement)("path", { key: "a", d: "M2.5 12.5a7 7 0 0 1 11-7" })], size);
    case "revisionCloud":
      return icon([(0, import_react2.createElement)("path", { key: "a", d: "M3 9.5a2 2 0 0 1 1.4-3.4A2.4 2.4 0 0 1 8 4.4a2.3 2.3 0 0 1 3.7 1.9A2 2 0 0 1 12.6 10a2.1 2.1 0 0 1-2 2H5a2 2 0 0 1-2-2Z" })], size);
    case "leader":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M3 13 8 8l5-4" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M3 13v-3h3" })
      ], size);
    case "text":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M3.5 3.5h9M8 3.5v9M6 12.5h4" })
      ], size);
    case "block":
      return icon([
        (0, import_react2.createElement)("rect", { key: "a", x: 2.5, y: 2.5, width: 5, height: 5, rx: 0.5 }),
        (0, import_react2.createElement)("rect", { key: "b", x: 8.5, y: 8.5, width: 5, height: 5, rx: 0.5 }),
        (0, import_react2.createElement)("path", { key: "c", d: "M8.5 5.5h2v2M5.5 8.5v2h2" })
      ], size);
    case "move":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M8 2v12M2 8h12" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M5.5 4.5 8 2l2.5 2.5M5.5 11.5 8 14l2.5-2.5M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5" })
      ], size);
    case "copy":
      return icon([
        (0, import_react2.createElement)("rect", { key: "a", x: 2.5, y: 2.5, width: 8, height: 8, rx: 0.5 }),
        (0, import_react2.createElement)("path", { key: "b", d: "M5.5 5.5h8v8h-8" })
      ], size);
    case "rotate":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M12.5 6A5 5 0 1 0 13 9.5" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M12.5 2.5v3.5H9" }),
        (0, import_react2.createElement)("circle", { key: "c", cx: 8, cy: 8, r: 1 })
      ], size);
    case "scale":
      return icon([
        (0, import_react2.createElement)("rect", { key: "a", x: 2.5, y: 8.5, width: 5, height: 5, rx: 0.5 }),
        (0, import_react2.createElement)("rect", { key: "b", x: 6.5, y: 2.5, width: 7, height: 7, rx: 0.5, strokeDasharray: "2 1.5" }),
        (0, import_react2.createElement)("path", { key: "c", d: "M8 8l4-4M9.5 4H12v2.5" })
      ], size);
    case "mirror":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M8 1.5v13", strokeDasharray: "2 1.5" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M6 3 2.5 8 6 13M10 3l3.5 5L10 13" })
      ], size);
    case "offset":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M2.5 3.5h11v9h-11z" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M5 6h6v4H5z" })
      ], size);
    case "trim":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M2.5 5.5h11M7 9.5h6.5" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M9 2.5 12.5 9" })
      ], size);
    case "extend":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M2.5 5.5h6M11 9.5h2.5" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M10 6.5 13.5 9.5 10 12.5" })
      ], size);
    case "erase":
      return icon([
        (0, import_react2.createElement)("path", { key: "a", d: "M3 8.5 8.5 3l4.5 4.5L8.5 12H5L3 10V8.5Z" }),
        (0, import_react2.createElement)("path", { key: "b", d: "M6 5.5 10.5 10" }),
        (0, import_react2.createElement)("path", { key: "c", d: "M8.5 14h5" })
      ], size);
  }
}
function UndoIcon({ size = 14 }) {
  return icon([(0, import_react2.createElement)("path", { key: "a", d: "M3 7.5h6.5a3.5 3.5 0 0 1 0 7H6" }), (0, import_react2.createElement)("path", { key: "b", d: "M5.5 3.5 3 7.5l2.5 4" })], size);
}
function RedoIcon({ size = 14 }) {
  return icon([(0, import_react2.createElement)("path", { key: "a", d: "M13 7.5H6.5a3.5 3.5 0 0 0 0 7H10" }), (0, import_react2.createElement)("path", { key: "b", d: "M10.5 3.5 13 7.5l-2.5 4" })], size);
}
function GridIcon({ size = 14 }) {
  return icon([
    (0, import_react2.createElement)("path", { key: "a", d: "M2.5 6h11M2.5 10h11M6 2.5v11M10 2.5v11" }),
    (0, import_react2.createElement)("rect", { key: "b", x: 2.5, y: 2.5, width: 11, height: 11, rx: 0.5 })
  ], size);
}
function SnapIcon({ size = 14 }) {
  return icon([
    (0, import_react2.createElement)("path", { key: "a", d: "M5 2.5v5a3 3 0 0 0 6 0v-5M5 2.5h2M11 2.5h-2M2.5 11.5h5M8.5 11.5h5" })
  ], size);
}
function OrthoIcon({ size = 14 }) {
  return icon([(0, import_react2.createElement)("path", { key: "a", d: "M3.5 13V3.5h9M3.5 9.5h2.5v2.5" })], size);
}
function PrintIcon({ size = 14 }) {
  return icon([
    (0, import_react2.createElement)("path", { key: "a", d: "M4.5 6V2.5h7V6M4.5 11.5H3a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 3 6.5h10A1.5 1.5 0 0 1 14.5 8v2a1.5 1.5 0 0 1-1.5 1.5h-1.5" }),
    (0, import_react2.createElement)("rect", { key: "b", x: 4.5, y: 10, width: 7, height: 3.5, rx: 0.5 })
  ], size);
}
function ExportIcon({ size = 14 }) {
  return icon([
    (0, import_react2.createElement)("path", { key: "a", d: "M8 2.5v7.5M5 7.5 8 10.5l3-3" }),
    (0, import_react2.createElement)("path", { key: "b", d: "M3 11.5v2h10v-2" })
  ], size);
}
function LockGlyph({ size = 12, open = false }) {
  return icon([
    (0, import_react2.createElement)("rect", { key: "a", x: 3.5, y: 7.5, width: 9, height: 6.5, rx: 1 }),
    (0, import_react2.createElement)("path", { key: "b", d: open ? "M5.5 7.5V5.6a2.5 2.5 0 0 1 4.9-.7" : "M5.5 7.5V5.6a2.5 2.5 0 0 1 5 0v1.9" })
  ], size);
}
function PencilGlyph({ size = 12 }) {
  return icon([(0, import_react2.createElement)("path", { key: "a", d: "M11 2.5l2.5 2.5-8 8H3v-2.5l8-8ZM9 4.5l2.5 2.5" })], size);
}
function DismissGlyph({ size = 12 }) {
  return icon([(0, import_react2.createElement)("path", { key: "a", d: "M4 4l8 8M12 4l-8 8" })], size);
}
function EyeGlyph({ size = 13, open = true }) {
  if (!open) {
    return icon([
      (0, import_react2.createElement)("path", { key: "a", d: "M2 2l12 12" }),
      (0, import_react2.createElement)("path", { key: "b", d: "M6.3 4.4A7.4 7.4 0 0 1 8 4.2c4.1 0 6.5 3.8 6.5 3.8a12 12 0 0 1-2.4 2.9M4 6.2A12.3 12.3 0 0 0 1.5 8S3.9 11.8 8 11.8c.9 0 1.7-.2 2.4-.4" })
    ], size);
  }
  return icon([
    (0, import_react2.createElement)("path", { key: "a", d: "M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z" }),
    (0, import_react2.createElement)("circle", { key: "b", cx: 8, cy: 8, r: 1.9 })
  ], size);
}
function PaletteGroup({ t, group, active, editing, onPick }) {
  const tools = CAD_TOOLS.filter((tool) => tool.group === group);
  const groupLabel = group === "view" ? t("toolGroupView") : group === "draw" ? t("toolGroupDraw") : t("toolGroupModify");
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.paletteGroup, role: "group", "aria-label": groupLabel },
    (0, import_react2.createElement)("span", { className: EcadBody_default.paletteGroupLabel }, groupLabel),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.paletteTools },
      tools.map((tool) => {
        const written = tool.writes && !editing;
        const label = t(tool.labelKey);
        const hint = t(tool.hintKey);
        const shortcut = tool.shortcut === void 0 ? "" : ` \xB7 ${t("toolShortcut", { key: tool.shortcut })}`;
        return (0, import_react2.createElement)("button", {
          key: tool.id,
          type: "button",
          className: `${EcadBody_default.paletteButton}${tool.id === active ? ` ${EcadBody_default.toolArmed}` : ""}`,
          title: `${label} \u2014 ${hint}${shortcut}`,
          "aria-label": label,
          "aria-pressed": tool.id === active,
          "data-ecad-tool": tool.id,
          ...written ? { disabled: true } : {},
          onClick: () => {
            onPick(tool.id);
          }
        }, (0, import_react2.createElement)(ToolGlyph, { tool: tool.id }));
      })
    )
  );
}
function ToolPalette(props) {
  return (0, import_react2.createElement)(
    "div",
    { className: `${EcadBody_default.toolRail} ${EcadBody_default.noPrint}`, role: "toolbar", "aria-label": props.t("toolPalette"), "aria-orientation": "vertical", "data-ecad-palette": "true" },
    (0, import_react2.createElement)(PaletteGroup, { ...props, group: "view" }),
    props.editable ? (0, import_react2.createElement)(PaletteGroup, { ...props, group: "draw" }) : null,
    props.editable ? (0, import_react2.createElement)(PaletteGroup, { ...props, group: "modify" }) : null
  );
}
function CommandBar({ t, tool, points, numeric, onNumeric, onApplyNumeric, onCancel, error }) {
  const spec = toolOf(tool);
  if (spec === void 0 || spec.writes === false || spec.op === void 0) return null;
  const numericLabel = spec.numeric === "radius" ? t("commandNumericLabelRadius") : spec.numeric === "angle" ? t("commandNumericLabelAngle") : spec.numeric === "distance" ? t("commandNumericLabelDistance") : spec.numeric === "factor" ? t("commandNumericLabelFactor") : void 0;
  const stepHint = t(spec.hintKey);
  return (0, import_react2.createElement)(
    "div",
    { className: `${EcadBody_default.commandBar} ${EcadBody_default.noPrint}`, role: "group", "aria-label": t("commandBarLabel"), "data-ecad-command-bar": "true" },
    (0, import_react2.createElement)(
      "span",
      { className: EcadBody_default.commandText },
      (0, import_react2.createElement)("span", { className: EcadBody_default.commandTool }, t(spec.labelKey)),
      (0, import_react2.createElement)("span", { className: EcadBody_default.commandMeta }, stepHint)
    ),
    points > 0 ? (0, import_react2.createElement)("span", { className: EcadBody_default.commandMeta }, t("commandFinishHint")) : null,
    numericLabel === void 0 ? null : (0, import_react2.createElement)(
      "label",
      { className: EcadBody_default.commandField },
      (0, import_react2.createElement)("span", {}, numericLabel),
      (0, import_react2.createElement)("input", {
        className: EcadBody_default.formInput,
        type: "text",
        inputMode: "decimal",
        value: numeric,
        "aria-label": numericLabel,
        placeholder: t("commandNumericPlaceholder"),
        onChange: (event) => {
          onNumeric(event.target.value);
        },
        onKeyDown: (event) => {
          if (event.key !== "Enter") return;
          event.stopPropagation();
          event.preventDefault();
          onApplyNumeric();
        },
        "data-ecad-command-numeric": "true"
      }),
      (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, title: t("commandNumericApply"), onClick: onApplyNumeric }, t("commandNumericApply"))
    ),
    (0, import_react2.createElement)("span", { className: EcadBody_default.statusGrow }),
    error === void 0 ? null : (0, import_react2.createElement)("span", { className: EcadBody_default.formError, role: "alert" }, error),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.commandActions },
      (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onCancel }, t("commandCancel"))
    )
  );
}
function ContextMenu({ t, x, y, items, onClose }) {
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.contextBackdrop, "data-ecad-context-backdrop": "true", onPointerDown: onClose },
    (0, import_react2.createElement)(
      "div",
      {
        className: EcadBody_default.contextMenu,
        role: "menu",
        "aria-label": t("contextMenuLabel"),
        "data-ecad-context-menu": "true",
        style: { left: x, top: y },
        onPointerDown: (event) => {
          event.stopPropagation();
        },
        onContextMenu: (event) => {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      items.map((item) => (0, import_react2.createElement)(
        "div",
        { key: item.id },
        item.separatorBefore === true ? (0, import_react2.createElement)("div", { className: EcadBody_default.contextMenuSeparator, role: "separator" }) : null,
        (0, import_react2.createElement)(
          "button",
          {
            type: "button",
            role: "menuitem",
            className: EcadBody_default.contextMenuItem,
            disabled: item.disabled,
            "data-ecad-menu-item": item.id,
            onClick: () => {
              onClose();
              item.onSelect();
            }
          },
          (0, import_react2.createElement)("span", { className: EcadBody_default.contextMenuLabel }, item.label),
          item.shortcut === void 0 ? null : (0, import_react2.createElement)("span", { className: EcadBody_default.contextMenuShortcut }, item.shortcut)
        )
      ))
    )
  );
}
function CadStatusBar({ t, cursor, selectionCount, snapKind, osnap, ortho, grid, sheet, onToggleOsnap, onToggleOrtho, onToggleGrid }) {
  const coordinates = cursor === void 0 ? t("statusNoCoordinates") : t("statusCoordinates", { x: Number(cursor[0].toFixed(3)), y: Number(cursor[1].toFixed(3)) });
  const snapLabel = snapKind === void 0 ? void 0 : snapKind === "endpoint" ? t("snapEndpoint") : snapKind === "intersection" ? t("snapIntersection") : snapKind === "midpoint" ? t("snapMidpoint") : snapKind === "center" ? t("snapCenter") : snapKind === "nearest" ? t("snapNearest") : t("snapGrid");
  return (0, import_react2.createElement)(
    "div",
    { className: `${EcadBody_default.statusBar} ${EcadBody_default.noPrint}`, role: "status", "aria-label": t("statusBarLabel"), "data-ecad-status": "true" },
    (0, import_react2.createElement)("span", { className: EcadBody_default.statusItem, "data-ecad-cursor": "true" }, coordinates),
    (0, import_react2.createElement)("span", { className: EcadBody_default.statusItem }, t("selectionCount", { count: selectionCount })),
    snapLabel === void 0 ? null : (0, import_react2.createElement)("span", { className: EcadBody_default.statusItem, "data-ecad-snap-label": snapKind }, t("statusSnap", { kind: snapLabel })),
    (0, import_react2.createElement)("span", { className: EcadBody_default.statusGrow }),
    (0, import_react2.createElement)("span", { className: EcadBody_default.statusItem }, sheet),
    (0, import_react2.createElement)("button", {
      type: "button",
      className: EcadBody_default.statusChip,
      "aria-pressed": osnap,
      title: t("osnapHint"),
      onClick: onToggleOsnap,
      "data-ecad-aid": "osnap"
    }, t("statusOsnap")),
    (0, import_react2.createElement)("button", {
      type: "button",
      className: EcadBody_default.statusChip,
      "aria-pressed": ortho,
      title: t("orthoHint"),
      onClick: onToggleOrtho,
      "data-ecad-aid": "ortho"
    }, t("statusOrtho")),
    (0, import_react2.createElement)("button", {
      type: "button",
      className: EcadBody_default.statusChip,
      "aria-pressed": grid,
      title: t("gridHint"),
      onClick: onToggleGrid,
      "data-ecad-aid": "grid"
    }, t("statusGrid"))
  );
}
function propertyRows(t, facts) {
  return [
    { label: t("kind"), value: facts.kind, mono: true },
    { label: t("layer"), value: facts.layer },
    ...facts.text === void 0 ? [] : [{ label: t("text"), value: facts.text }],
    ...facts.point === void 0 ? [] : [{ label: t("position"), value: formatPoint(facts.point), mono: true }],
    ...facts.points === void 0 ? [] : [{ label: t("points"), value: String(facts.points), mono: true }],
    ...facts.block === void 0 ? [] : [{ label: t("block"), value: facts.block }],
    { label: t("entityId"), value: facts.id, mono: true }
  ];
}
function attributeOwner(entity) {
  if (entity === void 0) return void 0;
  if (entity.k === "insert") return entity.id;
  if (entity.k === "text" && entity.g !== void 0) return entity.g;
  return void 0;
}
function PropertiesPanel(props) {
  const { t, entities, model, editing, moveDx, moveDy, rotateAngle } = props;
  const single = entities.length === 1 ? entities[0] : void 0;
  const selectedKey = entities.map((entity) => entity.id).join("|");
  const [textDraft, setTextDraft] = (0, import_react2.useState)("");
  const [layerDraft, setLayerDraft] = (0, import_react2.useState)("");
  const [colorDraft, setColorDraft] = (0, import_react2.useState)("");
  const [tagDraft, setTagDraft] = (0, import_react2.useState)("");
  const [valueDraft, setValueDraft] = (0, import_react2.useState)("");
  (0, import_react2.useEffect)(() => {
    setTextDraft(single !== void 0 && (single.k === "text" || single.k === "mtext") ? single.t ?? "" : "");
    setLayerDraft(single === void 0 ? "" : single.layer);
    setColorDraft(single !== void 0 && single.color > 0 && single.color < 256 ? String(single.color) : "7");
    setTagDraft("");
    setValueDraft(attributeOwner(single) === void 0 ? "" : single?.t ?? "");
  }, [selectedKey]);
  const kindCounts = (0, import_react2.useMemo)(() => {
    const counts = /* @__PURE__ */ new Map();
    for (const entity of entities) counts.set(entity.k, (counts.get(entity.k) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entities]);
  const layers = (0, import_react2.useMemo)(() => model.layers.length === 0 ? [...new Set(entities.map((entity) => entity.layer))] : model.layers.map((layer) => layer.name), [model, entities]);
  const layerValue = single?.layer ?? layerDraft;
  const canStageText = editing && single !== void 0 && (single.k === "text" || single.k === "mtext") && textDraft !== (single.t ?? "");
  const canStageLayer = editing && entities.length > 0 && layerDraft !== "" && (single === void 0 || layerDraft !== single.layer);
  const attributeTarget = attributeOwner(single);
  const canStageAttribute = editing && attributeTarget !== void 0 && tagDraft.trim() !== "" && valueDraft !== (single?.t ?? "");
  const canStageMove = parseNumberField(moveDx) !== void 0 && parseNumberField(moveDy) !== void 0;
  const canStageRotate = parseNumberField(rotateAngle) !== void 0;
  const colorNumber = parseNumberField(colorDraft);
  const colorValid = colorNumber !== void 0 && Number.isInteger(colorNumber) && colorNumber >= 1 && colorNumber <= 255;
  const colorInvalid = colorDraft.trim() !== "" && !colorValid;
  const canStageColor = editing && entities.length > 0 && colorValid && (single === void 0 || colorNumber !== single.color);
  const swatch = single !== void 0 && single.color > 0 && single.color < 256 ? aciHex(single.color) : "var(--dsw-alias-interactive-bg-active)";
  return (0, import_react2.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.inspectorSection}`, "data-ecad-properties": "true" },
    (0, import_react2.createElement)("div", { className: EcadBody_default.panelHeading }, t("properties")),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.inspector },
      entities.length === 0 ? (0, import_react2.createElement)("p", { className: EcadBody_default.inspectorHint }, t("propertiesHint")) : (0, import_react2.createElement)(
        "div",
        null,
        entities.length > 1 ? (0, import_react2.createElement)("p", { className: EcadBody_default.inspectorHint }, t("propertiesHintMulti", { count: entities.length })) : null,
        single === void 0 ? (0, import_react2.createElement)(
          "div",
          null,
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.propertyRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.propertyLabel }, t("kind")),
            (0, import_react2.createElement)("span", { className: EcadBody_default.propertyValue }, kindCounts.map(([kind, count]) => `${kind} \xD7${count}`).join(", ") || t("propertiesMixedKind"))
          ),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.propertyRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.propertyLabel }, t("layer")),
            (0, import_react2.createElement)("span", { className: EcadBody_default.propertyValue }, [...new Set(entities.map((entity) => entity.layer))].join(", ") || t("propertiesMixedLayer"))
          )
        ) : propertyRows(t, factsOf(single)).map((row) => (0, import_react2.createElement)(
          "div",
          { key: row.label, className: EcadBody_default.propertyRow },
          (0, import_react2.createElement)("span", { className: EcadBody_default.propertyLabel }, row.label),
          (0, import_react2.createElement)("span", { className: `${EcadBody_default.propertyValue}${row.mono === true ? ` ${EcadBody_default.mono}` : ""}` }, row.value)
        )),
        // A block attribute edit names the owning INSERT and the tag; the sheet
        // model does not carry tag names, so the reader types the tag.
        attributeTarget === void 0 ? null : (0, import_react2.createElement)(
          "div",
          { className: EcadBody_default.placementForm, "data-ecad-attribute-editor": "true" },
          (0, import_react2.createElement)("div", { className: EcadBody_default.panelHeading }, t("propertiesAttributeTitle")),
          (0, import_react2.createElement)("p", { className: EcadBody_default.editHint }, t("propertiesAttributeHint")),
          (0, import_react2.createElement)(
            "label",
            { className: EcadBody_default.formRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.formLabel }, t("propertiesTag")),
            (0, import_react2.createElement)("input", {
              className: EcadBody_default.formInput,
              type: "text",
              value: tagDraft,
              "aria-label": t("propertiesTag"),
              onChange: (event) => {
                setTagDraft(event.target.value);
              },
              "data-ecad-attribute-tag": "true"
            })
          ),
          (0, import_react2.createElement)(
            "label",
            { className: EcadBody_default.formRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.formLabel }, t("propertiesValue")),
            (0, import_react2.createElement)("input", {
              className: EcadBody_default.formInput,
              type: "text",
              value: valueDraft,
              "aria-label": t("propertiesValue"),
              onChange: (event) => {
                setValueDraft(event.target.value);
              },
              "data-ecad-attribute-value": "true"
            })
          ),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.formActions },
            (0, import_react2.createElement)("button", {
              type: "button",
              className: EcadBody_default.applyButton,
              disabled: !canStageAttribute,
              onClick: () => {
                if (attributeTarget === void 0) return;
                props.onStageAttribute(attributeTarget, tagDraft.trim(), valueDraft);
              }
            }, t("propertiesAttributeApply"))
          )
        ),
        single !== void 0 && (single.k === "text" || single.k === "mtext") ? (0, import_react2.createElement)(
          "div",
          { className: EcadBody_default.placementForm, "data-ecad-text-editor": "true" },
          (0, import_react2.createElement)(
            "label",
            { className: EcadBody_default.formRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.formLabel }, t("text")),
            (0, import_react2.createElement)("input", {
              className: EcadBody_default.formInput,
              type: "text",
              value: textDraft,
              "aria-label": t("text"),
              onChange: (event) => {
                setTextDraft(event.target.value);
              },
              "data-ecad-property-text": "true"
            })
          ),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.formActions },
            (0, import_react2.createElement)("button", {
              type: "button",
              className: EcadBody_default.applyButton,
              disabled: !canStageText,
              onClick: () => {
                if (single === void 0) return;
                props.onStageText(single, textDraft);
              }
            }, t("propertiesTextApply"))
          )
        ) : null,
        editing ? (0, import_react2.createElement)(
          "div",
          null,
          (0, import_react2.createElement)("div", { className: EcadBody_default.propertyHeading }, t("layer")),
          (0, import_react2.createElement)(
            "label",
            { className: EcadBody_default.formRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.formLabel }, t("layer")),
            (0, import_react2.createElement)("select", {
              className: EcadBody_default.formInput,
              value: layerValue,
              "aria-label": t("layer"),
              onChange: (event) => {
                setLayerDraft(event.target.value);
              },
              "data-ecad-property-layer": "true"
            }, layers.map((name) => (0, import_react2.createElement)("option", { key: name, value: name }, name)))
          ),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.formActions },
            (0, import_react2.createElement)("button", {
              type: "button",
              className: EcadBody_default.applyButton,
              disabled: !canStageLayer,
              onClick: () => {
                props.onStageLayer(entities, layerDraft);
              }
            }, t("propertiesLayerApply"))
          ),
          (0, import_react2.createElement)("div", { className: EcadBody_default.propertyHeading }, t("propertiesColor")),
          (0, import_react2.createElement)(
            "label",
            { className: EcadBody_default.formRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.formLabel }, t("propertiesColor")),
            (0, import_react2.createElement)(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
              (0, import_react2.createElement)("span", { className: EcadBody_default.swatch, style: { background: swatch }, "aria-hidden": true }),
              (0, import_react2.createElement)("input", {
                className: EcadBody_default.formInput,
                type: "text",
                inputMode: "numeric",
                value: colorDraft,
                "aria-label": t("propertiesColor"),
                placeholder: t("propertiesColorPlaceholder"),
                "aria-invalid": colorInvalid,
                onChange: (event) => {
                  setColorDraft(event.target.value);
                },
                "data-ecad-property-color": "true"
              })
            )
          ),
          colorInvalid ? (0, import_react2.createElement)("p", { className: EcadBody_default.formError, role: "alert" }, t("propertiesColorInvalid")) : (0, import_react2.createElement)("p", { className: EcadBody_default.editHint }, t("propertiesColorHint")),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.formActions },
            (0, import_react2.createElement)("button", {
              type: "button",
              className: EcadBody_default.applyButton,
              disabled: !canStageColor,
              onClick: () => {
                if (!colorValid || colorNumber === void 0) return;
                props.onStageColor(entities, colorNumber);
              },
              "data-ecad-stage-color": "true"
            }, t("propertiesColorApply"))
          ),
          (0, import_react2.createElement)("div", { className: EcadBody_default.propertyHeading }, t("toolMove")),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.editActionsBlock },
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
                    props.onMoveDx(event.target.value);
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
                    props.onMoveDy(event.target.value);
                  },
                  "data-ecad-move-dy": "true"
                })
              )
            ),
            (0, import_react2.createElement)(
              "div",
              { className: EcadBody_default.inspectorActions },
              (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.applyButton, disabled: !canStageMove, onClick: props.onStageMove, "data-ecad-stage-move": "true" }, t("propertiesMoveApply"))
            )
          ),
          (0, import_react2.createElement)("div", { className: EcadBody_default.propertyHeading }, t("toolRotate")),
          (0, import_react2.createElement)(
            "label",
            { className: EcadBody_default.formRow },
            (0, import_react2.createElement)("span", { className: EcadBody_default.formLabel }, t("commandNumericLabelAngle")),
            (0, import_react2.createElement)("input", {
              className: EcadBody_default.formInput,
              type: "text",
              inputMode: "decimal",
              value: rotateAngle,
              "aria-label": t("commandNumericLabelAngle"),
              onChange: (event) => {
                props.onRotateAngle(event.target.value);
              },
              "data-ecad-rotate-angle": "true"
            })
          ),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.formActions },
            (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.applyButton, disabled: !canStageRotate, onClick: props.onStageRotate, "data-ecad-stage-rotate": "true" }, t("propertiesRotateApply"))
          ),
          (0, import_react2.createElement)(
            "div",
            { className: EcadBody_default.inspectorActions },
            (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: props.onStageErase, "data-ecad-stage-erase": "true" }, t("propertiesDelete"))
          )
        ) : (0, import_react2.createElement)("p", { className: EcadBody_default.editHint }, t("readOnlyHint")),
        single !== void 0 && single.approx === true ? (0, import_react2.createElement)("p", { className: EcadBody_default.approxNote }, single.src === void 0 ? t("approximateNoteGeneric") : t("approximateNote", { src: single.src })) : null
      ),
      (0, import_react2.createElement)(
        "div",
        { className: EcadBody_default.inspectorActions },
        (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: props.onAsk }, t("propertiesAsk")),
        (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: props.onClear }, t("propertiesClear"))
      )
    )
  );
}
function CadLayersPanel(props) {
  const { t, model, layoutEntities, hidden, locked, current, editing } = props;
  const [createOpen, setCreateOpen] = (0, import_react2.useState)(false);
  const [name, setName] = (0, import_react2.useState)("");
  const [color, setColor] = (0, import_react2.useState)("1");
  const [editingLayer, setEditingLayer] = (0, import_react2.useState)(void 0);
  const [renameDraft, setRenameDraft] = (0, import_react2.useState)("");
  const [colorDraft, setColorDraft] = (0, import_react2.useState)("1");
  const [message, setMessage] = (0, import_react2.useState)(void 0);
  const counts = (0, import_react2.useMemo)(() => {
    const next = /* @__PURE__ */ new Map();
    for (const entity of layoutEntities) {
      const key = entity.layer.toUpperCase();
      next.set(key, (next.get(key) ?? 0) + 1);
    }
    return next;
  }, [layoutEntities]);
  const parseColor = (raw) => {
    const value = Number(raw.trim());
    return Number.isInteger(value) && value >= 1 && value <= 255 ? value : void 0;
  };
  const beginEdit = (layerName) => {
    setEditingLayer(layerName);
    setRenameDraft(layerName);
    setColorDraft(String(model.layers.find((layer) => layer.name === layerName)?.color ?? 7));
    setMessage(void 0);
  };
  const anyHidden = model.layers.some((layer) => hidden.has(layer.name.toUpperCase()));
  return (0, import_react2.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.layersSection}`, "data-ecad-layers": "true" },
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.panelHeading },
      t("layers"),
      (0, import_react2.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
      anyHidden ? (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.panelHeadingButton}`, onClick: props.onShowAll }, t("layersShowAll")) : null,
      (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.panelHeadingButton}`, onClick: props.onHideAll }, t("layerHideAll"))
    ),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.layerCurrent },
      (0, import_react2.createElement)("span", {}, t("layersCurrent")),
      (0, import_react2.createElement)("select", {
        className: EcadBody_default.formInput,
        value: current ?? "",
        "aria-label": t("layersCurrent"),
        onChange: (event) => {
          props.onCurrent(event.target.value);
        },
        "data-ecad-current-layer": "true"
      }, model.layers.map((layer) => (0, import_react2.createElement)("option", { key: layer.name, value: layer.name }, layer.name)))
    ),
    (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.layerList, role: "group", "aria-label": t("layers") },
      model.layers.map((layer) => {
        const key = layer.name.toUpperCase();
        const visible = !hidden.has(key);
        const isLocked = locked.has(key);
        const isCurrent = current === layer.name;
        const title = `${visible ? t("layerHide", { layer: layer.name }) : t("layerShow", { layer: layer.name })}${layer.frozen === true ? ` \xB7 ${t("layerFrozen")}` : ""}${layer.locked === true ? ` \xB7 ${t("layerLocked")}` : ""}`;
        return (0, import_react2.createElement)(
          "div",
          { key: layer.name, className: EcadBody_default.layerRow, "data-ecad-layer-row": layer.name },
          (0, import_react2.createElement)(
            "button",
            {
              type: "button",
              className: EcadBody_default.layerToggle,
              "aria-pressed": visible,
              title,
              onClick: () => {
                props.onToggle(layer.name);
              }
            },
            (0, import_react2.createElement)("span", { className: EcadBody_default.layerEye }, (0, import_react2.createElement)(EyeGlyph, { open: visible })),
            (0, import_react2.createElement)("span", { className: EcadBody_default.swatch, style: { background: layerInk(layer) } }),
            (0, import_react2.createElement)("span", { className: EcadBody_default.layerName }, layer.name),
            isCurrent ? (0, import_react2.createElement)("span", { className: EcadBody_default.tabCount }, t("layerCurrentBadge")) : null,
            (0, import_react2.createElement)("span", { className: EcadBody_default.layerCount }, String(counts.get(key) ?? 0))
          ),
          (0, import_react2.createElement)("button", {
            type: "button",
            className: EcadBody_default.layerMiniButton,
            "aria-pressed": isLocked,
            title: isLocked ? t("layerUnlock", { layer: layer.name }) : t("layerLock", { layer: layer.name }),
            "aria-label": isLocked ? t("layerUnlock", { layer: layer.name }) : t("layerLock", { layer: layer.name }),
            onClick: () => {
              props.onLock(layer.name);
            }
          }, (0, import_react2.createElement)(LockGlyph, { open: !isLocked })),
          editing ? (0, import_react2.createElement)("button", {
            type: "button",
            className: EcadBody_default.layerMiniButton,
            title: t("layerEdit", { layer: layer.name }),
            "aria-label": t("layerEdit", { layer: layer.name }),
            "data-ecad-layer-edit": layer.name,
            onClick: () => {
              beginEdit(layer.name);
            }
          }, (0, import_react2.createElement)(PencilGlyph, {})) : null
        );
      })
    ),
    editingLayer === void 0 ? null : (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.layerForm, "data-ecad-layer-form": "true" },
      (0, import_react2.createElement)(
        "label",
        { className: EcadBody_default.layerFormRow },
        (0, import_react2.createElement)("span", {}, t("layerName")),
        (0, import_react2.createElement)("input", {
          className: EcadBody_default.formInput,
          type: "text",
          value: renameDraft,
          "aria-label": t("layerName"),
          onChange: (event) => {
            setRenameDraft(event.target.value);
          },
          "data-ecad-layer-rename": "true"
        })
      ),
      (0, import_react2.createElement)(
        "label",
        { className: EcadBody_default.layerFormRow },
        (0, import_react2.createElement)("span", {}, t("layerColor")),
        (0, import_react2.createElement)("input", {
          className: EcadBody_default.formInput,
          type: "text",
          inputMode: "numeric",
          value: colorDraft,
          "aria-label": t("layerColor"),
          onChange: (event) => {
            setColorDraft(event.target.value);
          },
          "data-ecad-layer-color": "true"
        })
      ),
      message === void 0 ? null : (0, import_react2.createElement)("p", { className: EcadBody_default.formError, role: "alert" }, message),
      (0, import_react2.createElement)(
        "div",
        { className: EcadBody_default.formActions },
        (0, import_react2.createElement)("button", {
          type: "button",
          className: EcadBody_default.applyButton,
          "data-ecad-layer-rename-apply": "true",
          onClick: () => {
            if (!validLayerName(renameDraft)) {
              setMessage(t("layerInvalidName"));
              return;
            }
            const parsed = parseColor(colorDraft);
            if (parsed === void 0) {
              setMessage(t("layerColorInvalid"));
              return;
            }
            const renameMessage = editingLayer === renameDraft ? void 0 : props.onRenameLayer(editingLayer, renameDraft);
            if (renameMessage !== void 0) {
              setMessage(renameMessage);
              return;
            }
            const colorMessage = props.onSetLayerColor(renameDraft, parsed);
            if (colorMessage !== void 0) {
              setMessage(colorMessage);
              return;
            }
            setMessage(renameMessage ?? colorMessage);
            setEditingLayer(void 0);
          }
        }, t("layerRenameApply")),
        (0, import_react2.createElement)("button", {
          type: "button",
          className: EcadBody_default.applyButton,
          "data-ecad-layer-color-apply": "true",
          onClick: () => {
            const parsed = parseColor(colorDraft);
            if (parsed === void 0) {
              setMessage(t("layerColorInvalid"));
              return;
            }
            const colorMessage = props.onSetLayerColor(editingLayer, parsed);
            setMessage(colorMessage);
            if (colorMessage === void 0) setEditingLayer(void 0);
          }
        }, t("layerColorApply")),
        (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: () => {
          setEditingLayer(void 0);
          setMessage(void 0);
        } }, t("cancel"))
      )
    ),
    editing ? (0, import_react2.createElement)(
      "div",
      { className: EcadBody_default.layerForm, "data-ecad-layer-create": "true" },
      createOpen ? (0, import_react2.createElement)(
        "div",
        null,
        (0, import_react2.createElement)(
          "label",
          { className: EcadBody_default.layerFormRow },
          (0, import_react2.createElement)("span", {}, t("layerName")),
          (0, import_react2.createElement)("input", {
            className: EcadBody_default.formInput,
            type: "text",
            value: name,
            "aria-label": t("layerName"),
            placeholder: t("layerName"),
            onChange: (event) => {
              setName(event.target.value);
            },
            "data-ecad-new-layer-name": "true"
          })
        ),
        (0, import_react2.createElement)(
          "label",
          { className: EcadBody_default.layerFormRow },
          (0, import_react2.createElement)("span", {}, t("layerColor")),
          (0, import_react2.createElement)("input", {
            className: EcadBody_default.formInput,
            type: "text",
            inputMode: "numeric",
            value: color,
            "aria-label": t("layerColor"),
            onChange: (event) => {
              setColor(event.target.value);
            },
            "data-ecad-new-layer-color": "true"
          })
        ),
        message === void 0 ? null : (0, import_react2.createElement)("p", { className: EcadBody_default.formError, role: "alert" }, message),
        (0, import_react2.createElement)(
          "div",
          { className: EcadBody_default.formActions },
          (0, import_react2.createElement)("button", {
            type: "button",
            className: EcadBody_default.applyButton,
            onClick: () => {
              if (!validLayerName(name)) {
                setMessage(t("layerInvalidName"));
                return;
              }
              const parsed = parseColor(color);
              if (parsed === void 0) {
                setMessage(t("layerColorInvalid"));
                return;
              }
              const pending = props.onCreateLayer(name, parsed);
              setMessage(pending);
              if (pending === void 0) {
                setCreateOpen(false);
                setName("");
                setColor("1");
              }
            }
          }, t("layerCreateApply")),
          (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: () => {
            setCreateOpen(false);
            setMessage(void 0);
          } }, t("cancel"))
        )
      ) : (0, import_react2.createElement)("div", { className: EcadBody_default.formActions }, (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: () => {
        setCreateOpen(true);
        setMessage(void 0);
      } }, t("layerCreate")))
    ) : (0, import_react2.createElement)("p", { className: EcadBody_default.editHint }, t("layerReadOnlyHint"))
  );
}
function CadNoticeView({ t, notice, onDismiss }) {
  const tone = notice.kind === "warn" ? EcadBody_default.badgeWarn : notice.kind === "error" ? EcadBody_default.noticeError : EcadBody_default.noticeInfo;
  return (0, import_react2.createElement)(
    "div",
    { className: `${EcadBody_default.notice} ${tone} ${EcadBody_default.noticeActionable}`, role: notice.kind === "error" ? "alert" : "status", "data-ecad-notice": notice.kind },
    (0, import_react2.createElement)("span", { className: EcadBody_default.noticeText }, notice.text),
    (0, import_react2.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onDismiss, title: t("cancel"), "aria-label": t("cancel") }, (0, import_react2.createElement)(DismissGlyph, {}))
  );
}
function DrawingAidButtons({ t, osnap, ortho, grid, onToggleOsnap, onToggleOrtho, onToggleGrid }) {
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.toolbarGroup, role: "group", "aria-label": t("drawingAids") },
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("osnapHint"), "aria-label": t("osnap"), "aria-pressed": osnap, onClick: onToggleOsnap }, (0, import_react2.createElement)(SnapIcon, {})),
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("orthoHint"), "aria-label": t("statusOrtho"), "aria-pressed": ortho, onClick: onToggleOrtho }, (0, import_react2.createElement)(OrthoIcon, {})),
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("gridHint"), "aria-label": t("statusGrid"), "aria-pressed": grid, onClick: onToggleGrid }, (0, import_react2.createElement)(GridIcon, {}))
  );
}
function SheetActionButtons({ t, disabled, onPrint, onExportSvg, onExportPng }) {
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.toolbarGroup },
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("printHint"), "aria-label": t("print"), disabled, onClick: onPrint, "data-ecad-print": "true" }, (0, import_react2.createElement)(PrintIcon, {})),
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("exportSvgHint"), "aria-label": t("exportSvg"), disabled, onClick: onExportSvg, "data-ecad-export-svg": "true" }, (0, import_react2.createElement)(ExportIcon, {})),
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("exportPngHint"), "aria-label": t("exportPng"), disabled, onClick: onExportPng, "data-ecad-export-png": "true" }, (0, import_react2.createElement)(ExportIcon, {}))
  );
}
function UndoRedoButtons({ t, canUndo, canRedo, onUndo, onRedo }) {
  return (0, import_react2.createElement)(
    "div",
    { className: EcadBody_default.toolbarGroup },
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("undoHint"), "aria-label": t("undo"), disabled: !canUndo, onClick: onUndo, "data-ecad-undo": "true" }, (0, import_react2.createElement)(UndoIcon, {})),
    (0, import_react2.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("redoHint"), "aria-label": t("redo"), disabled: !canRedo, onClick: onRedo, "data-ecad-redo": "true" }, (0, import_react2.createElement)(RedoIcon, {}))
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

// packages/ecad/src/client/svgExport.ts
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function exportedInk(primitive) {
  const ink = primitive.ink;
  if (ink.startsWith("#") || ink.startsWith("rgb") || ink.startsWith("hsl")) return ink;
  return "#1a1a1a";
}
function shapeOf(primitive) {
  const geometry = primitive.geometry;
  const ink = exportedInk(primitive);
  switch (geometry.t) {
    case "line":
      return `<line x1="${fmt(geometry.x1)}" y1="${fmt(geometry.y1)}" x2="${fmt(geometry.x2)}" y2="${fmt(geometry.y2)}" fill="none" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
    case "path":
      return `<path d="${geometry.d}" fill="${geometry.fill ? ink : "none"}" fill-opacity="${geometry.hatch ? "0.22" : "0.9"}" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "rect":
      return `<rect x="${fmt(geometry.x)}" y="${fmt(geometry.y)}" width="${fmt(geometry.width)}" height="${fmt(geometry.height)}" fill="none" stroke="${ink}" stroke-width="1"${geometry.dashed ? ' stroke-dasharray="4 2"' : ""} vector-effect="non-scaling-stroke"/>`;
    case "circle":
      return `<circle cx="${fmt(geometry.cx)}" cy="${fmt(geometry.cy)}" r="${fmt(geometry.r)}" fill="none" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    case "ellipse":
      return `<ellipse cx="${fmt(geometry.cx)}" cy="${fmt(geometry.cy)}" rx="${fmt(geometry.rx)}" ry="${fmt(geometry.ry)}" transform="rotate(${Number(geometry.degrees.toFixed(4))} ${fmt(geometry.cx)} ${fmt(geometry.cy)})" fill="none" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    case "dot":
      return `<circle cx="${fmt(geometry.cx)}" cy="${fmt(geometry.cy)}" r="${fmt(geometry.r)}" fill="${ink}"/>`;
    case "none":
      return "";
    default:
      return "";
  }
}
function textOf(primitive) {
  const ink = exportedInk(primitive);
  return primitive.text.map((line) => `<text transform="translate(${fmt(line.x)} ${fmt(line.y)}) scale(1 -1) rotate(${Number((-line.degrees).toFixed(4))})" font-size="${fmt(line.height)}" text-anchor="${line.anchor}" dominant-baseline="${line.baseline}" fill="${ink}" font-family="sans-serif">${escapeXml(line.text)}</text>`).join("");
}
function svgDocumentOf(scene, fit, view, options) {
  const body2 = scene.primitives.map((primitive) => `<g>${shapeOf(primitive)}${textOf(primitive)}</g>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" role="img" aria-label="${escapeXml(options.title)}">
<title>${escapeXml(options.title)}</title>
<rect width="${options.width}" height="${options.height}" fill="#ffffff"/>
<g transform="translate(${fmt(view.panX)} ${fmt(view.panY)}) scale(${fmt(view.zoom)})">
<g transform="translate(${fmt(fit.translateX)} ${fmt(fit.translateY)}) scale(${fmt(fit.scale)} ${fmt(-fit.scale)})">
${body2}
</g>
</g>
</svg>
`;
}

// packages/ecad/src/client/EcadBody.tsx
var FIT_MARGIN = 24;
var PAN_STEP = 40;
var PICK_TOLERANCE_PX = 6;
var SNAP_RADIUS_PX = 12;
var GRIP_HALF_PX = 4;
var GRIP_HIT_PX = 7;
var DOUBLE_CLICK_MS = 320;
var DOUBLE_CLICK_PX = 5;
function MinusIcon({ size = 14 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react3.createElement)("path", { d: "M3.5 8h9" })
  );
}
function PlusIcon2({ size = 14 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react3.createElement)("path", { d: "M8 3.5v9M3.5 8h9" })
  );
}
function FitIcon({ size = 14 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react3.createElement)("path", { d: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" }),
    (0, import_react3.createElement)("rect", { x: 5.5, y: 5.5, width: 5, height: 5, rx: 0.5 })
  );
}
function LayersIcon({ size = 14 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react3.createElement)("path", { d: "M8 2.2 14 5.3 8 8.4 2 5.3 8 2.2Z" }),
    (0, import_react3.createElement)("path", { d: "M2 8.4l6 3.1 6-3.1M2 11.2l6 3.1 6-3.1" })
  );
}
function LockIcon({ size = 12 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react3.createElement)("rect", { x: 3.5, y: 7.5, width: 9, height: 6.5, rx: 1 }),
    (0, import_react3.createElement)("path", { d: "M5.5 7.5V5.6a2.5 2.5 0 0 1 5 0v1.9" })
  );
}
function WarningIcon({ size = 13 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react3.createElement)("path", { d: "M8 2.4 14.4 13H1.6L8 2.4Z" }),
    (0, import_react3.createElement)("path", { d: "M8 6.4v3.1M8 11.5v.1" })
  );
}
function ChatIcon({ size = 14 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react3.createElement)("path", { d: "M13.5 8.6a5.7 5.7 0 0 1-6 5.5 6.6 6.6 0 0 1-1.9-.3L2.5 14.5l.7-2.7a5.3 5.3 0 0 1-1-3.2 5.7 5.7 0 0 1 6-5.5 5.7 5.7 0 0 1 5.3 5.5Z" })
  );
}
function CloseIcon({ size = 13 }) {
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react3.createElement)("path", { d: "M4 4l8 8M12 4l-8 8" })
  );
}
function useElementSize(element) {
  const [size, setSize] = (0, import_react3.useState)({ width: 0, height: 0 });
  (0, import_react3.useEffect)(() => {
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
      return (0, import_react3.createElement)("line", { ...shared, x1: geometry.x1, y1: geometry.y1, x2: geometry.x2, y2: geometry.y2 });
    case "path":
      return (0, import_react3.createElement)("path", { ...shared, d: geometry.d });
    case "rect":
      return (0, import_react3.createElement)("rect", { ...shared, x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, rx: 0 });
    case "circle":
      return (0, import_react3.createElement)("circle", { ...shared, cx: geometry.cx, cy: geometry.cy, r: geometry.r });
    case "ellipse":
      return (0, import_react3.createElement)("ellipse", {
        ...shared,
        cx: geometry.cx,
        cy: geometry.cy,
        rx: geometry.rx,
        ry: geometry.ry,
        transform: `rotate(${Number(geometry.degrees.toFixed(4))} ${geometry.cx} ${geometry.cy})`
      });
    case "dot":
      return (0, import_react3.createElement)("circle", {
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
  return primitive.text.map((line, index) => (0, import_react3.createElement)(
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
function ScenePrimitive({ primitive }) {
  const filled = primitive.geometry.t === "path" && (primitive.geometry.fill || primitive.geometry.hatch);
  return (0, import_react3.createElement)(
    "g",
    {
      className: EcadBody_default.primitive,
      "data-ecad-id": primitive.id,
      "data-ecad-kind": primitive.kind,
      "data-ecad-layer": primitive.layer,
      ...primitive.approx ? { "data-ecad-approx": "true" } : {}
    },
    primitive.geometry.t === "none" ? null : (0, import_react3.createElement)(SceneShape, { geometry: primitive.geometry, paint: paintOf(primitive, false, filled) }),
    textRuns(primitive, primitive.ink, false)
  );
}
var MemoPrimitive = (0, import_react3.memo)(ScenePrimitive);
function PreviewView({ elements }) {
  if (elements.length === 0) return null;
  return (0, import_react3.createElement)(
    "g",
    { className: EcadBody_default.selectionOverlay, "data-ecad-preview": "true", "aria-hidden": true },
    elements.map((element, index) => {
      const key = `preview-${index}`;
      switch (element.kind) {
        case "line":
          return (0, import_react3.createElement)("line", { key, className: EcadBody_default.previewLine, x1: element.a[0], y1: element.a[1], x2: element.b[0], y2: element.b[1] });
        case "polyline": {
          const parts = [];
          element.points.forEach((point, pointIndex) => {
            parts.push(`${pointIndex === 0 ? "M" : "L"} ${fmt(point[0])} ${fmt(point[1])}`);
          });
          if (element.closed === true) parts.push("Z");
          return (0, import_react3.createElement)("path", { key, className: EcadBody_default.previewLine, d: parts.join(" ") });
        }
        case "rect":
          return (0, import_react3.createElement)("rect", {
            key,
            className: EcadBody_default.previewShape,
            x: Math.min(element.a[0], element.b[0]),
            y: Math.min(element.a[1], element.b[1]),
            width: Math.abs(element.b[0] - element.a[0]),
            height: Math.abs(element.b[1] - element.a[1])
          });
        case "circle":
          return (0, import_react3.createElement)("circle", { key, className: EcadBody_default.previewShape, cx: element.c[0], cy: element.c[1], r: Math.abs(element.r) });
        case "arc": {
          const start = [element.c[0] + element.r * Math.cos(element.a0), element.c[1] + element.r * Math.sin(element.a0)];
          const end = [element.c[0] + element.r * Math.cos(element.a1), element.c[1] + element.r * Math.sin(element.a1)];
          const large = element.a1 - element.a0 > Math.PI ? 1 : 0;
          return (0, import_react3.createElement)("path", {
            key,
            className: EcadBody_default.previewShape,
            d: `M ${fmt(start[0])} ${fmt(start[1])} A ${fmt(Math.abs(element.r))} ${fmt(Math.abs(element.r))} 0 ${large} 1 ${fmt(end[0])} ${fmt(end[1])}`
          });
        }
        case "ellipse":
          return (0, import_react3.createElement)("ellipse", {
            key,
            className: EcadBody_default.previewShape,
            cx: element.c[0],
            cy: element.c[1],
            rx: Math.abs(element.rx),
            ry: Math.abs(element.ry),
            transform: `rotate(${Number(element.deg.toFixed(4))} ${element.c[0]} ${element.c[1]})`
          });
        default:
          return null;
      }
    })
  );
}
function payloadPoint(value) {
  if (!Array.isArray(value) || value.length < 2) return void 0;
  const x = Number(value[0]);
  const y = Number(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : void 0;
}
function movedPreviewOf(entity, dx, dy) {
  const shift = (point) => point === void 0 ? void 0 : [point[0] + dx, point[1] + dy];
  if (entity.k === "circle") {
    const center = shift(entity.c);
    return center === void 0 ? void 0 : { kind: "circle", c: center, r: Math.abs(entity.r ?? 0) };
  }
  if (entity.k === "arc") {
    const center = shift(entity.c);
    if (center === void 0) return void 0;
    let a1 = entity.a1 ?? 0;
    const a0 = entity.a0 ?? 0;
    if (a1 < a0) a1 += Math.PI * 2;
    return { kind: "arc", c: center, r: Math.abs(entity.r ?? 0), a0, a1 };
  }
  if (entity.k === "ellipse") {
    const center = shift(entity.c);
    return center === void 0 ? void 0 : { kind: "ellipse", c: center, rx: Math.abs(entity.rx ?? 0), ry: Math.abs(entity.ry ?? 0), deg: (entity.rot ?? 0) * 180 / Math.PI };
  }
  return void 0;
}
function setterPreviewOf(op, payload) {
  if (op === "setCircle") {
    const center = payloadPoint(payload.center);
    const radius = Number(payload.radius);
    return center === void 0 || !Number.isFinite(radius) ? void 0 : { kind: "circle", c: center, r: Math.abs(radius) };
  }
  if (op === "setArc") {
    const center = payloadPoint(payload.center);
    const radius = Number(payload.radius);
    const start = Number(payload.startAngleDeg);
    const end = Number(payload.endAngleDeg);
    if (center === void 0 || !Number.isFinite(radius) || !Number.isFinite(start) || !Number.isFinite(end)) return void 0;
    const radians = Math.PI / 180;
    let a0 = start * radians;
    let a1 = end * radians;
    if (a1 <= a0) a1 += Math.PI * 2;
    return { kind: "arc", c: center, r: Math.abs(radius), a0, a1 };
  }
  if (op === "setEllipse") {
    const center = payloadPoint(payload.center);
    const rx = Number(payload.rx);
    const ry = Number(payload.ry);
    const rotDeg = Number(payload.rotDeg);
    return center === void 0 || !Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rotDeg) ? void 0 : { kind: "ellipse", c: center, rx: Math.abs(rx), ry: Math.abs(ry), deg: rotDeg };
  }
  if (op === "setLine") {
    const a = payloadPoint(payload.a);
    const b = payloadPoint(payload.b);
    return a === void 0 || b === void 0 ? void 0 : { kind: "line", a, b };
  }
  if (op === "setPolyline") {
    const points = Array.isArray(payload.pts) ? payload.pts.map(payloadPoint).filter((point) => point !== void 0) : [];
    return points.length >= 2 ? { kind: "polyline", points } : void 0;
  }
  return void 0;
}
function SceneView({ scene, fit, view, label, width, height, selectedIds, fadedIds, ghostMoves, ghostTexts, pendingPoint, marquee, zoomBox, grid, grips, activeGripKey, gripPreview, snap, preview }) {
  const base = (0, import_react3.useMemo)(() => scene.primitives.map((primitive) => (0, import_react3.createElement)(MemoPrimitive, { key: primitive.id, primitive })), [scene]);
  const byId = (0, import_react3.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const primitive of scene.primitives) map.set(primitive.id, primitive);
    return map;
  }, [scene]);
  const selectedSet = (0, import_react3.useMemo)(() => new Set(selectedIds), [selectedIds]);
  const selected = (0, import_react3.useMemo)(() => scene.primitives.filter((primitive) => selectedSet.has(primitive.id)), [scene, selectedSet]);
  const faded = (0, import_react3.useMemo)(() => scene.primitives.filter((primitive) => fadedIds.has(primitive.id)), [scene, fadedIds]);
  const span = Math.max(scene.bounds.max[0] - scene.bounds.min[0], scene.bounds.max[1] - scene.bounds.min[1]);
  const marker = Math.max(span * 0.012, 1e-6);
  const ghosts = (ghostMoves ?? []).flatMap((move) => {
    const primitive = byId.get(move.id);
    if (primitive === void 0) return [];
    return [{ move, primitive }];
  });
  const snapScreen = snap === void 0 ? void 0 : toScreen(snap.point, fit, view);
  const gripScreens = grips.map((grip) => ({ grip, screen: toScreen(grip.point, fit, view) }));
  const gripLine = gripPreview === void 0 ? void 0 : { from: toScreen(gripPreview[0], fit, view), to: toScreen(gripPreview[1], fit, view) };
  return (0, import_react3.createElement)(
    "svg",
    { className: EcadBody_default.canvas, role: "img", "aria-label": label, "data-ecad-canvas": "true" },
    grid === void 0 ? null : (0, import_react3.createElement)(
      "g",
      { "aria-hidden": true },
      grid.xs.map((x) => (0, import_react3.createElement)("line", { key: `gx-${x}`, className: EcadBody_default.gridLine, x1: x, y1: 0, x2: x, y2: height })),
      grid.ys.map((y) => (0, import_react3.createElement)("line", { key: `gy-${y}`, className: EcadBody_default.gridLine, x1: 0, y1: y, x2: width, y2: y }))
    ),
    (0, import_react3.createElement)(
      "g",
      { transform: `translate(${view.panX} ${view.panY}) scale(${view.zoom})`, "data-ecad-view": "true" },
      (0, import_react3.createElement)(
        "g",
        { transform: `translate(${fit.translateX} ${fit.translateY}) scale(${fit.scale} ${-fit.scale})` },
        base,
        faded.map((primitive) => (0, import_react3.createElement)(
          "g",
          { key: `fade-${primitive.id}`, className: EcadBody_default.faded, "data-ecad-faded": primitive.id, "aria-hidden": true },
          primitive.geometry.t === "none" ? null : (0, import_react3.createElement)(SceneShape, {
            geometry: primitive.geometry,
            paint: { fill: "none", stroke: primitive.ink, strokeWidth: 1 }
          }),
          textRuns(primitive, primitive.ink, false)
        )),
        selected.flatMap((primitive) => {
          const filled = primitive.geometry.t === "path" && (primitive.geometry.fill || primitive.geometry.hatch);
          const shade = filled ? { fill: "var(--ecad-accent)", fillOpacity: 0.14, stroke: "var(--ecad-accent)", strokeWidth: 2.5 } : { fill: "none", stroke: "var(--ecad-accent)", strokeWidth: 2.5 };
          if (primitive.geometry.t === "none") {
            return [(0, import_react3.createElement)("g", { key: `sel-text-${primitive.id}`, className: EcadBody_default.selectionOverlay }, textRuns(primitive, "var(--ecad-accent)", true))];
          }
          return [
            (0, import_react3.createElement)(
              "g",
              { key: `sel-${primitive.id}`, className: EcadBody_default.selectionOverlay, "data-ecad-selected": primitive.id },
              (0, import_react3.createElement)(SceneShape, { geometry: primitive.geometry, paint: { fill: "none", stroke: "var(--ecad-paper)", strokeWidth: 5 }, className: EcadBody_default.selectionHalo }),
              (0, import_react3.createElement)(SceneShape, { geometry: primitive.geometry, paint: shade, className: EcadBody_default.selection }),
              textRuns(primitive, "var(--ecad-accent)", true)
            )
          ];
        }),
        ...ghosts.map(({ move, primitive }) => (0, import_react3.createElement)(
          "g",
          {
            key: `ghost-${move.key}-${move.id}`,
            transform: `translate(${move.delta[0]} ${move.delta[1]})`,
            className: EcadBody_default.ghostGroup,
            "data-ecad-ghost": move.id,
            "aria-hidden": true
          },
          primitive.geometry.t === "none" ? null : (0, import_react3.createElement)(SceneShape, {
            geometry: primitive.geometry,
            paint: { fill: "none", stroke: "var(--ecad-accent)", strokeWidth: 1.5, strokeDasharray: "5 3" }
          }),
          textRuns(primitive, "var(--ecad-accent)", false)
        )),
        (ghostTexts ?? []).flatMap((ghost) => {
          const runs = textLines({ id: `ghost-${ghost.key}`, k: "text", layer: "", color: 7, p: ghost.point, t: ghost.text, h: ghost.height, rot: ghost.rotation });
          return runs.map((line, index) => (0, import_react3.createElement)(
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
        (0, import_react3.createElement)(PreviewView, { elements: preview }),
        pendingPoint === void 0 ? null : (0, import_react3.createElement)(
          "g",
          { key: "placement-marker", "aria-hidden": true, "data-ecad-placement": `${pendingPoint[0]},${pendingPoint[1]}` },
          (0, import_react3.createElement)("line", { className: EcadBody_default.placementMarker, x1: pendingPoint[0] - marker, y1: pendingPoint[1], x2: pendingPoint[0] + marker, y2: pendingPoint[1] }),
          (0, import_react3.createElement)("line", { className: EcadBody_default.placementMarker, x1: pendingPoint[0], y1: pendingPoint[1] - marker, x2: pendingPoint[0], y2: pendingPoint[1] + marker }),
          (0, import_react3.createElement)("circle", { className: EcadBody_default.placementMarker, cx: pendingPoint[0], cy: pendingPoint[1], r: marker * 0.45 })
        )
      ),
      (0, import_react3.createElement)(
        "g",
        { className: EcadBody_default.selectionOverlay, "aria-hidden": true },
        fadedIds.size === 0 ? null : null,
        marquee === void 0 ? null : (0, import_react3.createElement)("rect", {
          className: marquee.mode === "window" ? EcadBody_default.marqueeWindow : EcadBody_default.marqueeCrossing,
          x: marquee.box.minX,
          y: marquee.box.minY,
          width: marquee.box.maxX - marquee.box.minX,
          height: marquee.box.maxY - marquee.box.minY,
          "data-ecad-marquee": marquee.mode
        }),
        zoomBox === void 0 ? null : (0, import_react3.createElement)("rect", {
          className: EcadBody_default.marqueeWindow,
          x: zoomBox.minX,
          y: zoomBox.minY,
          width: zoomBox.maxX - zoomBox.minX,
          height: zoomBox.maxY - zoomBox.minY,
          "data-ecad-zoom-window": "true"
        }),
        gripScreens.map(({ grip, screen }) => (0, import_react3.createElement)("rect", {
          key: `grip-${grip.key}`,
          className: grip.key === activeGripKey ? EcadBody_default.gripHandleActive : EcadBody_default.gripHandle,
          x: screen[0] - GRIP_HALF_PX,
          y: screen[1] - GRIP_HALF_PX,
          width: GRIP_HALF_PX * 2,
          height: GRIP_HALF_PX * 2,
          "data-ecad-grip": grip.key
        })),
        gripLine === void 0 ? null : (0, import_react3.createElement)(
          "g",
          null,
          (0, import_react3.createElement)("line", { className: EcadBody_default.gripLine, x1: gripLine.from[0], y1: gripLine.from[1], x2: gripLine.to[0], y2: gripLine.to[1] }),
          (0, import_react3.createElement)("circle", { className: EcadBody_default.gripHandleActive, cx: gripLine.to[0], cy: gripLine.to[1], r: GRIP_HALF_PX })
        ),
        snapScreen === void 0 || snap === void 0 ? null : (0, import_react3.createElement)(
          "g",
          { transform: `translate(${snapScreen[0]} ${snapScreen[1]})`, "data-ecad-snap": snap.kind },
          (0, import_react3.createElement)("line", { className: EcadBody_default.snapMarker, x1: -7, y1: 0, x2: 7, y2: 0 }),
          (0, import_react3.createElement)("line", { className: EcadBody_default.snapMarker, x1: 0, y1: -7, x2: 0, y2: 7 }),
          (0, import_react3.createElement)("circle", { className: EcadBody_default.snapMarker, cx: 0, cy: 0, r: 3.5 }),
          (0, import_react3.createElement)("text", { className: EcadBody_default.snapLabel, x: 9, y: -8 }, snap.label)
        )
      )
    )
  );
}
function CadToolbar({ coverage, coverageText, coverageTitle, ready, format, conversion, writes, editable, mode, onModeChange, panelsOpen, chatUnavailable, aids, onToggleAid, canUndo, canRedo, onUndo, onRedo, onPrint, onExportSvg, onExportPng, onFit, onZoom, onTogglePanels, onAsk, t }) {
  return (0, import_react3.createElement)(
    "div",
    { className: `${EcadBody_default.toolbar} ${EcadBody_default.noPrint}` },
    (0, import_react3.createElement)(
      "div",
      { className: EcadBody_default.toolbarGroup },
      ready && format !== void 0 ? (0, import_react3.createElement)("span", { className: EcadBody_default.badge, title: formatTitleOf(format, conversion, t) }, format.toUpperCase()) : null,
      ready && !writes ? (0, import_react3.createElement)("span", { className: EcadBody_default.badge, title: t("readOnlyHint") }, (0, import_react3.createElement)(LockIcon, {}), t("readOnly")) : null,
      ready && coverage.truncated ? (0, import_react3.createElement)("span", { className: `${EcadBody_default.badge} ${EcadBody_default.badgeWarn}` }, (0, import_react3.createElement)(WarningIcon, {}), t("truncatedBadge")) : null,
      ready && coverage.approximate > 0 ? (0, import_react3.createElement)("span", { className: EcadBody_default.badge, title: t("approximateHint", { count: coverage.approximate }) }, (0, import_react3.createElement)("span", { className: EcadBody_default.badgeDot }), t("approximateBadge")) : null
    ),
    ready ? (0, import_react3.createElement)("span", { className: EcadBody_default.coverage, title: coverageTitle }, coverageText) : (0, import_react3.createElement)("span", { className: EcadBody_default.coverage }),
    (0, import_react3.createElement)("span", { className: EcadBody_default.toolbarSpacer }),
    (0, import_react3.createElement)(
      "div",
      { className: EcadBody_default.toolbarGroup },
      editable ? (0, import_react3.createElement)(EditModeToggle, { mode, onChange: onModeChange, t }) : null,
      editable && mode === "edit" ? (0, import_react3.createElement)(UndoRedoButtons, { t, canUndo, canRedo, onUndo, onRedo }) : null,
      (0, import_react3.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomExtentsHint"), "aria-label": t("zoomExtents"), disabled: !ready, onClick: onFit }, (0, import_react3.createElement)(FitIcon, {})),
      (0, import_react3.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomOut"), "aria-label": t("zoomOut"), disabled: !ready, onClick: () => {
        onZoom(1 / 1.3);
      } }, (0, import_react3.createElement)(MinusIcon, {})),
      (0, import_react3.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomIn"), "aria-label": t("zoomIn"), disabled: !ready, onClick: () => {
        onZoom(1.3);
      } }, (0, import_react3.createElement)(PlusIcon2, {})),
      (0, import_react3.createElement)(DrawingAidButtons, {
        t,
        osnap: aids.osnap,
        ortho: aids.ortho,
        grid: aids.grid,
        onToggleOsnap: () => {
          onToggleAid("osnap");
        },
        onToggleOrtho: () => {
          onToggleAid("ortho");
        },
        onToggleGrid: () => {
          onToggleAid("grid");
        }
      }),
      (0, import_react3.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`,
        title: t("panels"),
        "aria-label": t("panels"),
        "aria-pressed": panelsOpen,
        disabled: !ready,
        onClick: onTogglePanels
      }, (0, import_react3.createElement)(LayersIcon, {})),
      (0, import_react3.createElement)(SheetActionButtons, { t, disabled: !ready, onPrint, onExportSvg, onExportPng }),
      (0, import_react3.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.primaryButton}`,
        title: chatUnavailable ? t("askUnavailable") : t("ask"),
        disabled: !ready || chatUnavailable,
        onClick: onAsk
      }, (0, import_react3.createElement)(ChatIcon, {}), (0, import_react3.createElement)("span", { className: EcadBody_default.toolbarLabel }, t("ask")))
    )
  );
}
function LoadingState({ label }) {
  return (0, import_react3.createElement)(
    "div",
    { className: EcadBody_default.state, role: "status" },
    (0, import_react3.createElement)("span", { className: EcadBody_default.spinner }),
    (0, import_react3.createElement)("p", { className: EcadBody_default.stateBody }, label)
  );
}
function FailureState({ error, onRetry, onAsk, chatUnavailable, t }) {
  const unavailable = error.code === "ECAD_DISABLED";
  return (0, import_react3.createElement)(
    "div",
    { className: EcadBody_default.state, role: "alert" },
    (0, import_react3.createElement)("h3", { className: EcadBody_default.stateTitle }, unavailable ? t("unavailable") : t("errorTitle")),
    (0, import_react3.createElement)("code", { className: EcadBody_default.stateCode }, `${t("errorCode")}: ${error.code}`),
    (0, import_react3.createElement)("p", { className: EcadBody_default.stateBody }, error.message),
    (0, import_react3.createElement)("p", { className: EcadBody_default.stateBody }, `${t("errorFix")}: ${unavailable ? t("unavailableFix") : error.fix}`),
    (0, import_react3.createElement)(
      "div",
      { className: EcadBody_default.stateActions },
      (0, import_react3.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onRetry }, t("retry")),
      (0, import_react3.createElement)("button", { type: "button", className: EcadBody_default.button, disabled: chatUnavailable, onClick: onAsk }, (0, import_react3.createElement)(ChatIcon, {}), t("ask"))
    ),
    chatUnavailable ? (0, import_react3.createElement)("p", { className: EcadBody_default.stateBody }, t("askUnavailable")) : null
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
  rows.push({ label: t("format"), value: format.toUpperCase(), ...format === "dwg" ? { title: t("dwgSupport") } : {} });
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
  return (0, import_react3.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.sheetSection}` },
    (0, import_react3.createElement)("div", { className: EcadBody_default.panelHeading }, t("sheet")),
    (0, import_react3.createElement)(
      "div",
      { className: EcadBody_default.sheetRows },
      rows.map((row) => (0, import_react3.createElement)(
        "div",
        { key: row.label, className: EcadBody_default.propertyRow, title: row.value },
        (0, import_react3.createElement)("span", { className: EcadBody_default.propertyLabel }, row.label),
        (0, import_react3.createElement)("span", { className: `${EcadBody_default.propertyValue} ${row.wrap === true ? EcadBody_default.sheetValueWrap : EcadBody_default.sheetValue}` }, row.value)
      ))
    )
  );
}
function EcadBody(props) {
  const { resourceAddress, content, t, open, apply: apply2, ask } = props;
  const request = content?.kind === "renderer" ? content : void 0;
  const revision = request?.revision ?? 0;
  const [localRevision, setLocalRevision] = (0, import_react3.useState)(0);
  const [state, setState] = (0, import_react3.useState)({ phase: "loading" });
  const [layoutId, setLayoutId] = (0, import_react3.useState)(void 0);
  const [hidden, setHidden] = (0, import_react3.useState)(/* @__PURE__ */ new Set());
  const [lockedLayers, setLockedLayers] = (0, import_react3.useState)(/* @__PURE__ */ new Set());
  const [currentLayer, setCurrentLayer] = (0, import_react3.useState)(void 0);
  const [panelsOpen, setPanelsOpen] = (0, import_react3.useState)(true);
  const panelsTouchedRef = (0, import_react3.useRef)(false);
  const [chatUnavailable, setChatUnavailable] = (0, import_react3.useState)(false);
  const [view, setView] = (0, import_react3.useState)({ zoom: 1, panX: 0, panY: 0 });
  const [panning, setPanning] = (0, import_react3.useState)(false);
  const [selected, setSelected] = (0, import_react3.useState)([]);
  const [tool, setTool] = (0, import_react3.useState)("select");
  const [command, setCommand] = (0, import_react3.useState)(void 0);
  const [commandError, setCommandError] = (0, import_react3.useState)(void 0);
  const [numericText, setNumericText] = (0, import_react3.useState)("");
  const [aids, setAids] = (0, import_react3.useState)({ osnap: true, ortho: false, grid: false });
  const [cursorWorld, setCursorWorld] = (0, import_react3.useState)(void 0);
  const [snap, setSnap] = (0, import_react3.useState)(void 0);
  const [marquee, setMarquee] = (0, import_react3.useState)(void 0);
  const [zoomBox, setZoomBox] = (0, import_react3.useState)(void 0);
  const [contextMenu, setContextMenu] = (0, import_react3.useState)(void 0);
  const [notice, setNotice] = (0, import_react3.useState)(void 0);
  const [spaceDown, setSpaceDown] = (0, import_react3.useState)(false);
  const [dragGhost, setDragGhost] = (0, import_react3.useState)(void 0);
  const [gripDrag, setGripDrag] = (0, import_react3.useState)(void 0);
  const [draft, setDraft] = (0, import_react3.useState)(EMPTY_DRAFT_STATE);
  const [mode, setMode] = (0, import_react3.useState)("view");
  const [placement, setPlacement] = (0, import_react3.useState)(void 0);
  const [blockPlacement, setBlockPlacement] = (0, import_react3.useState)(void 0);
  const [moveDx, setMoveDx] = (0, import_react3.useState)("0");
  const [moveDy, setMoveDy] = (0, import_react3.useState)("0");
  const [rotateAngle, setRotateAngle] = (0, import_react3.useState)("90");
  const [applying, setApplying] = (0, import_react3.useState)(false);
  const [outcome, setOutcome] = (0, import_react3.useState)(void 0);
  const [written, setWritten] = (0, import_react3.useState)(void 0);
  const [writtenCandidate, setWrittenCandidate] = (0, import_react3.useState)(void 0);
  const draftKeyRef = (0, import_react3.useRef)(0);
  const applyAbortRef = (0, import_react3.useRef)(void 0);
  const gestureRef = (0, import_react3.useRef)(void 0);
  const indexRef = (0, import_react3.useRef)(void 0);
  const suppressContextMenuRef = (0, import_react3.useRef)(false);
  const lastClickRef = (0, import_react3.useRef)(void 0);
  const spaceHeldRef = (0, import_react3.useRef)(false);
  const [canvasElement, setCanvasElement] = (0, import_react3.useState)(null);
  const size = useElementSize(canvasElement);
  (0, import_react3.useEffect)(() => {
    if (panelsTouchedRef.current) return;
    const paneWidth = canvasElement?.parentElement?.clientWidth ?? 0;
    if (paneWidth === 0) return;
    if (paneWidth <= 520) setPanelsOpen(false);
  }, [canvasElement, size.width]);
  const retry = (0, import_react3.useCallback)(() => {
    if (request !== void 0) request.reload();
    else setLocalRevision((value) => value + 1);
    setState({ phase: "loading" });
  }, [request]);
  const resetSheetState = (0, import_react3.useCallback)(() => {
    setSelected([]);
    setView({ zoom: 1, panX: 0, panY: 0 });
    setHidden(/* @__PURE__ */ new Set());
    setLockedLayers(/* @__PURE__ */ new Set());
    setLayoutId(void 0);
    setMode("view");
    setTool("select");
    setCommand(void 0);
    setCommandError(void 0);
    setNumericText("");
    setPlacement(void 0);
    setBlockPlacement(void 0);
    setDraft(EMPTY_DRAFT_STATE);
    setApplying(false);
    setOutcome(void 0);
    setWritten(void 0);
    setWrittenCandidate(void 0);
    setDragGhost(void 0);
    setGripDrag(void 0);
    setMarquee(void 0);
    setZoomBox(void 0);
    setContextMenu(void 0);
    setNotice(void 0);
    setMoveDx("0");
    setMoveDy("0");
    setRotateAngle("90");
  }, []);
  (0, import_react3.useEffect)(() => {
    if (resourceAddress === "") return;
    const controller = new AbortController();
    applyAbortRef.current?.abort();
    applyAbortRef.current = void 0;
    setState({ phase: "loading" });
    resetSheetState();
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
  }, [resourceAddress, revision, localRevision, open, resetSheetState, t]);
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
  const layers = (0, import_react3.useMemo)(() => displayModel === void 0 ? /* @__PURE__ */ new Map() : layersOf(displayModel), [displayModel]);
  const activeLayout = (0, import_react3.useMemo)(() => {
    if (displayModel === void 0) return void 0;
    return displayModel.layouts.find((layout) => layout.id === layoutId) ?? displayModel.layouts.find((layout) => layout.kind === "model") ?? displayModel.layouts[0];
  }, [displayModel, layoutId]);
  const activeLayoutId = activeLayout?.id;
  const scene = (0, import_react3.useMemo)(
    () => activeLayout === void 0 ? void 0 : sceneOf(activeLayout, layers, hidden),
    [activeLayout, layers, hidden]
  );
  const drawableIds = (0, import_react3.useMemo)(() => new Set((scene?.primitives ?? []).map((primitive) => primitive.id.split("#")[0])), [scene]);
  const pickableEntities = (0, import_react3.useMemo)(() => {
    if (activeLayout === void 0) return [];
    return activeLayout.entities.filter((entity) => entity.k !== "insert" && entity.k !== "unsupported" && drawableIds.has(entity.id) && !hidden.has(entity.layer.toUpperCase()));
  }, [activeLayout, drawableIds, hidden]);
  const hiddenKey = (0, import_react3.useMemo)(() => [...hidden].sort().join(","), [hidden]);
  const indexKey = `${activeLayoutId ?? ""}|${hiddenKey}`;
  const ensureIndex = (0, import_react3.useCallback)(() => {
    const cached = indexRef.current;
    if (cached !== void 0 && cached.key === indexKey) return cached.index;
    const index = buildIndex(pickableEntities);
    indexRef.current = { key: indexKey, index };
    return index;
  }, [indexKey, pickableEntities]);
  const coverage = (0, import_react3.useMemo)(() => displayModel === void 0 ? void 0 : coverageOf(displayModel), [displayModel]);
  const coverageText = coverage === void 0 ? "" : coverage.unsupportedTotal > 0 ? t("coverage", { entities: coverage.entities.toLocaleString(), approximate: coverage.approximate, unsupported: coverage.unsupportedTotal }) : t("coverageClean", { entities: coverage.entities.toLocaleString() });
  const coverageTitle = coverage === void 0 || coverage.unsupportedTotal === 0 ? void 0 : t("coverageUndrawn", { list: coverage.unsupported.map(([kind, count]) => `${kind} \xD7${count}`).join(", ") });
  const selectedSet = (0, import_react3.useMemo)(() => new Set(selected), [selected]);
  const selectedEntities = (0, import_react3.useMemo)(
    () => activeLayout === void 0 ? [] : activeLayout.entities.filter((entity) => selectedSet.has(entity.id)),
    [activeLayout, selectedSet]
  );
  const selectedOne = selectedEntities.length === 1 ? selectedEntities[0] : void 0;
  const fit = (0, import_react3.useMemo)(() => {
    if (scene === void 0) return { scale: 1, translateX: 0, translateY: 0 };
    return fitBox(scene.bounds, Math.max(size.width, 1), Math.max(size.height, 1), FIT_MARGIN);
  }, [scene, size.width, size.height]);
  const worldScale = fit.scale * view.zoom;
  const pickTolerance = worldScale > 0 ? PICK_TOLERANCE_PX / worldScale : 0;
  const snapRadius = worldScale > 0 ? SNAP_RADIUS_PX / worldScale : 0;
  const grid = (0, import_react3.useMemo)(
    () => aids.grid ? gridLinesOf(fit, view, size.width, size.height) : void 0,
    [aids.grid, fit, view, size.width, size.height]
  );
  const placementLayers = (0, import_react3.useMemo)(() => (displayModel?.layers ?? []).map((layer) => layer.name), [displayModel]);
  const defaultAnnotationHeight = activeLayout === void 0 ? 1 : defaultTextHeight(scene?.bounds ?? activeLayout.extents, activeLayout);
  const defaultAnnotationLayer = displayModel === void 0 ? void 0 : currentLayer ?? defaultLayer(displayModel, activeLayout) ?? placementLayers[0];
  (0, import_react3.useEffect)(() => {
    if (displayModel === void 0) return;
    if (currentLayer !== void 0 && displayModel.layers.some((layer) => layer.name === currentLayer)) return;
    setCurrentLayer(defaultLayer(displayModel, activeLayout));
  }, [displayModel, activeLayout, currentLayer]);
  const staged2 = draft.ops;
  const counts = (0, import_react3.useMemo)(() => draftCounts(staged2), [staged2]);
  const preview = (0, import_react3.useMemo)(() => draftPreview(staged2), [staged2]);
  const draftHint = (0, import_react3.useMemo)(() => {
    const ids = [...new Set(staged2.map((item) => item.layout).filter((id) => id !== ""))];
    const layerOps = staged2.some((item) => item.layout === "");
    if (ids.length > 1) return t("draftSeveralLayouts");
    if (ids.length === 1) {
      const name = displayModel?.layouts.find((layout) => layout.id === ids[0])?.name ?? ids[0];
      return t("draftLayoutHint", { layout: name });
    }
    if (layerOps) return t("draftLayerOps");
    return t("draftLayoutHint", { layout: activeLayout?.name ?? "" });
  }, [activeLayout, displayModel, staged2, t]);
  const ghostMoves = (0, import_react3.useMemo)(() => {
    const moves = [...preview.moves];
    if (dragGhost !== void 0) {
      for (const id of dragGhost.ids) moves.push({ key: `drag-${id}`, id, delta: [dragGhost.dx, dragGhost.dy] });
    }
    return moves;
  }, [preview.moves, dragGhost]);
  const commandGhostMoves = (0, import_react3.useMemo)(() => {
    if (command === void 0 || command.points.length === 0) return [];
    const cursor = command.cursor;
    if (cursor === void 0) return [];
    const base = command.points[0];
    const dx = roundValue(cursor[0] - base[0]);
    const dy = roundValue(cursor[1] - base[1]);
    const wanted = command.tool === "move" || command.tool === "copy";
    if (!wanted) return [];
    return selectedEntities.filter((entity) => editableEntityId(entity.id)).map((entity) => ({ key: `command-${entity.id}`, id: entity.id, delta: [dx, dy] }));
  }, [command, selectedEntities]);
  const allGhostMoves = (0, import_react3.useMemo)(() => [...ghostMoves, ...commandGhostMoves], [ghostMoves, commandGhostMoves]);
  const ghostTexts = (0, import_react3.useMemo)(() => {
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
  const pendingPoint = placement?.point ?? blockPlacement?.point;
  const applyDisabledReason = staged2.length === 0 ? t("applyDisabledEmpty") : !editable ? t("readOnlyHint") : void 0;
  const applyView = (0, import_react3.useCallback)((next) => {
    setView(next);
  }, []);
  const zoomBy = (0, import_react3.useCallback)((factor) => {
    applyView((current) => zoomAt(current, factor, size.width / 2, size.height / 2));
  }, [applyView, size.width, size.height]);
  const fitView = (0, import_react3.useCallback)(() => {
    applyView(() => ({ zoom: 1, panX: 0, panY: 0 }));
  }, [applyView]);
  (0, import_react3.useEffect)(() => {
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
  const nextDraftKey = (0, import_react3.useCallback)(() => {
    draftKeyRef.current += 1;
    return `draft-${draftKeyRef.current}`;
  }, []);
  const commitOps = (0, import_react3.useCallback)((ops) => {
    if (ops.length === 0) return;
    setDraft((current) => draftAddMany(current, ops));
  }, []);
  const reportPending = (0, import_react3.useCallback)((op) => {
    setNotice({ kind: "warn", text: t("engineOpPending", { op }) });
  }, [t]);
  const clearSelection = (0, import_react3.useCallback)(() => {
    setSelected([]);
  }, []);
  const selectAll = (0, import_react3.useCallback)(() => {
    const ids = pickableEntities.filter((entity) => !lockedLayers.has(entity.layer.toUpperCase())).map((entity) => entity.id);
    setSelected(ids);
  }, [pickableEntities, lockedLayers]);
  const toggleLayer = (0, import_react3.useCallback)((name) => {
    const key = name.toUpperCase();
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelected((current) => current.filter((id) => {
      const entity = activeLayout?.entities.find((candidate) => candidate.id === id);
      return entity === void 0 || entity.layer.toUpperCase() !== key;
    }));
  }, [activeLayout]);
  const showAllLayers = (0, import_react3.useCallback)(() => {
    setHidden(/* @__PURE__ */ new Set());
  }, []);
  const hideAllLayers = (0, import_react3.useCallback)(() => {
    if (displayModel === void 0) return;
    setHidden(new Set(displayModel.layers.map((layer) => layer.name.toUpperCase())));
    setSelected([]);
  }, [displayModel]);
  const toggleLayerLock = (0, import_react3.useCallback)((name) => {
    const key = name.toUpperCase();
    setLockedLayers((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelected((current) => current.filter((id) => {
      const entity = activeLayout?.entities.find((candidate) => candidate.id === id);
      return !(entity !== void 0 && entity.layer.toUpperCase() === key);
    }));
  }, [activeLayout]);
  const cancelCommand = (0, import_react3.useCallback)(() => {
    setCommand(void 0);
    setCommandError(void 0);
    setNumericText("");
  }, []);
  const chooseTool = (0, import_react3.useCallback)((next) => {
    const spec = toolOf(next);
    if (spec === void 0) return;
    if (!toolAvailable(spec, editing)) return;
    setTool(next);
    cancelCommand();
    setMarquee(void 0);
    setZoomBox(void 0);
    setContextMenu(void 0);
    setGripDrag(void 0);
    if (next !== "text") setPlacement(void 0);
    if (next !== "block") setBlockPlacement(void 0);
    setNotice(void 0);
  }, [cancelCommand, editing]);
  const changeMode = (0, import_react3.useCallback)((next) => {
    setMode(next);
    if (next === "view") {
      setPlacement(void 0);
      setBlockPlacement(void 0);
      setDragGhost(void 0);
      setGripDrag(void 0);
      cancelCommand();
      setTool("select");
    }
  }, [cancelCommand]);
  const stageOps = (0, import_react3.useCallback)((items, nextTool) => {
    commitOps(items);
    if (nextTool !== void 0) setTool(nextTool);
  }, [commitOps]);
  const stagePlacement = (0, import_react3.useCallback)(() => {
    if (!editing || placement === void 0 || activeLayout === void 0) return;
    const text = placement.text.trim();
    const height = parseNumberField(placement.height);
    if (text === "" || height === void 0 || height <= 0) return;
    stageOps([stageText(
      nextDraftKey(),
      activeLayout.id,
      placement.point,
      text,
      height,
      placement.layer === "" ? void 0 : placement.layer
    )], "select");
    setPlacement(void 0);
  }, [activeLayout, editing, nextDraftKey, placement, stageOps]);
  const stageBlock = (0, import_react3.useCallback)(() => {
    if (!editing || blockPlacement === void 0 || activeLayout === void 0) return;
    const rotation = parseNumberField(blockPlacement.rotation) ?? 0;
    const scale = parseNumberField(blockPlacement.scale);
    if (blockPlacement.block === "" || scale === void 0 || scale <= 0) return;
    stageOps([stageAddBlock(nextDraftKey(), activeLayout.id, blockPlacement.block, blockPlacement.point, rotation, [scale, scale], currentLayer)], "select");
    setBlockPlacement(void 0);
  }, [activeLayout, blockPlacement, currentLayer, editing, nextDraftKey, stageOps]);
  const editableSelection = (0, import_react3.useMemo)(
    () => selectedEntities.filter((entity) => editableEntityId(entity.id)),
    [selectedEntities]
  );
  const stageMoveFromPanel = (0, import_react3.useCallback)(() => {
    if (!editing || activeLayout === void 0 || editableSelection.length === 0) return;
    const dx = parseNumberField(moveDx);
    const dy = parseNumberField(moveDy);
    if (dx === void 0 || dy === void 0 || dx === 0 && dy === 0) return;
    stageOps([stageMoveMany(nextDraftKey(), activeLayout.id, editableSelection.map((entity) => entity.id), dx, dy)], "select");
    setMoveDx("0");
    setMoveDy("0");
  }, [activeLayout, editing, editableSelection, moveDx, moveDy, nextDraftKey, stageOps]);
  const stageRotateFromPanel = (0, import_react3.useCallback)(() => {
    if (!editing || activeLayout === void 0 || editableSelection.length === 0) return;
    const angle = parseNumberField(rotateAngle);
    if (angle === void 0) return;
    let box;
    for (const entity of editableSelection) {
      const bounds = entityBounds(entity);
      if (bounds === void 0) continue;
      box = box === void 0 ? bounds : {
        min: [Math.min(box.min[0], bounds.min[0]), Math.min(box.min[1], bounds.min[1])],
        max: [Math.max(box.max[0], bounds.max[0]), Math.max(box.max[1], bounds.max[1])]
      };
    }
    if (box === void 0) return;
    const center = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
    stageOps([stageRotate(nextDraftKey(), activeLayout.id, editableSelection.map((entity) => entity.id), center, angle)], "select");
  }, [activeLayout, editing, editableSelection, nextDraftKey, rotateAngle, stageOps]);
  const stageEraseSelection = (0, import_react3.useCallback)(() => {
    if (!editing || activeLayout === void 0 || selectedEntities.length === 0) return;
    if (editableSelection.length === 0) {
      setNotice({ kind: "warn", text: t("editFlattened") });
      return;
    }
    stageOps([stageEraseMany(nextDraftKey(), activeLayout.id, editableSelection.map((entity) => entity.id))], void 0);
    setSelected((current) => current.filter((id) => !editableSelection.some((entity) => entity.id === id)));
  }, [activeLayout, editableSelection, editing, nextDraftKey, selectedEntities, stageOps, t]);
  const stageTextChange = (0, import_react3.useCallback)((entity, text) => {
    if (!editing || activeLayout === void 0) return;
    if (!editableEntityId(entity.id)) {
      setNotice({ kind: "warn", text: t("editFlattened") });
      return;
    }
    stageOps([stageSetText(nextDraftKey(), activeLayout.id, entity.id, text)], void 0);
  }, [activeLayout, editing, nextDraftKey, stageOps, t]);
  const stageLayerChange = (0, import_react3.useCallback)((entities, layer) => {
    if (!editing || activeLayout === void 0 || layer === "") return;
    const editable2 = entities.filter((entity) => editableEntityId(entity.id));
    if (editable2.length === 0) {
      setNotice({ kind: "warn", text: t("editFlattened") });
      return;
    }
    stageOps(stageSetLayerMany(nextDraftKey(), activeLayout.id, editable2.map((entity) => entity.id), layer), void 0);
    if (editable2.length < entities.length) setNotice({ kind: "info", text: t("editFlattened") });
  }, [activeLayout, editing, nextDraftKey, stageOps, t]);
  const stageColorChange = (0, import_react3.useCallback)((entities, color) => {
    if (!editing || activeLayout === void 0) return;
    const editable2 = entities.filter((entity) => editableEntityId(entity.id));
    if (editable2.length === 0) {
      setNotice({ kind: "warn", text: t("editFlattened") });
      return;
    }
    if (!engineOpAvailable("setColor")) {
      reportPending("setColor");
      return;
    }
    stageOps([stageSetColor(nextDraftKey(), activeLayout.id, editable2.map((entity) => entity.id), color)], void 0);
    if (editable2.length < entities.length) setNotice({ kind: "info", text: t("editFlattened") });
  }, [activeLayout, editing, nextDraftKey, reportPending, stageOps, t]);
  const stageAttributeChange = (0, import_react3.useCallback)((ownerId, tag, value) => {
    if (!editing || activeLayout === void 0) return;
    stageOps([stageSetAttribute(nextDraftKey(), activeLayout.id, ownerId, tag, value)], void 0);
  }, [activeLayout, editing, nextDraftKey, stageOps]);
  const removeStaged = (0, import_react3.useCallback)((key) => {
    setDraft((current) => draftRemove(current, key));
  }, []);
  const clearDraft = (0, import_react3.useCallback)(() => {
    setDraft((current) => draftClear(current));
    setPlacement(void 0);
    setBlockPlacement(void 0);
    cancelCommand();
  }, [cancelCommand]);
  const undoDraft = (0, import_react3.useCallback)(() => {
    setDraft(draftUndo);
    setCommandError(void 0);
  }, []);
  const redoDraft = (0, import_react3.useCallback)(() => {
    setDraft(draftRedo);
    setCommandError(void 0);
  }, []);
  const commandContext = (0, import_react3.useMemo)(() => ({
    layout: activeLayout?.id ?? "",
    ...defaultAnnotationLayer === void 0 ? {} : { layer: defaultAnnotationLayer },
    selection: editableSelection.map((entity) => entity.id),
    ...displayModel?.blocks[0] === void 0 ? {} : { block: displayModel.blocks[0].name }
  }), [activeLayout, defaultAnnotationLayer, editableSelection, displayModel]);
  const rejectKeyToMessage = (0, import_react3.useCallback)((reasonKey) => {
    if (reasonKey === "commandNeedsPoints") return t("commandNeedsPoints", { count: 2 });
    const known = /* @__PURE__ */ new Set([
      "commandNeedsSelection",
      "commandNeedsBlock",
      "commandNeedsPoint",
      "commandNeedsRadius",
      "commandNeedsDistance",
      "commandInvalidNumber",
      "commandArcCollinear",
      "commandUnknown",
      "commandNoNumeric"
    ]);
    return t(known.has(reasonKey) ? reasonKey : "commandUnknown");
  }, [t]);
  const applyCommandStep = (0, import_react3.useCallback)((step) => {
    if (step.kind === "rejected") {
      setCommandError(rejectKeyToMessage(step.reasonKey));
      return;
    }
    if (step.kind === "pending") {
      setCommand(step.command);
      setCommandError(void 0);
      return;
    }
    if (step.kind === "form") {
      if (step.form === "text") {
        setPlacement({
          point: step.point,
          text: "",
          height: String(Number(defaultAnnotationHeight.toFixed(4))),
          layer: defaultAnnotationLayer ?? ""
        });
      } else {
        const blocks = displayModel?.blocks ?? [];
        if (blocks.length === 0) {
          setNotice({ kind: "warn", text: t("noBlocks") });
          return;
        }
        setBlockPlacement({ point: step.point, block: blocks[0]?.name ?? "", rotation: "0", scale: "1" });
      }
      setTool("select");
      setCommand(void 0);
      return;
    }
    const stagedOps = [];
    let pendingOp;
    for (const item of step.ops) {
      if (engineOpAvailable(item.op)) {
        stagedOps.push({ key: nextDraftKey(), layout: activeLayout?.id ?? "", op: asEcadOp(item) });
      } else if (pendingOp === void 0) {
        pendingOp = item.op;
      }
    }
    if (stagedOps.length > 0) commitOps(stagedOps);
    if (pendingOp !== void 0) reportPending(pendingOp);
    setCommand(step.command);
    setCommandError(void 0);
    setNumericText("");
  }, [activeLayout, commitOps, defaultAnnotationHeight, defaultAnnotationLayer, displayModel, nextDraftKey, rejectKeyToMessage, reportPending, t]);
  const beginCommand = (0, import_react3.useCallback)((next) => {
    const started = commandStart(next);
    setCommand(started);
    setCommandError(void 0);
    setNumericText("");
    return started;
  }, []);
  const finishCommand = (0, import_react3.useCallback)(() => {
    if (command === void 0) return;
    applyCommandStep(commandFinish(command, commandContext));
  }, [applyCommandStep, command, commandContext]);
  const applyNumeric = (0, import_react3.useCallback)(() => {
    if (command === void 0) return;
    const value = parseNumberField(numericText);
    if (value === void 0) {
      setCommandError(t("commandInvalidNumber"));
      return;
    }
    applyCommandStep(commandNumeric(command, value, commandContext));
  }, [applyCommandStep, command, commandContext, numericText, t]);
  const localPoint = (0, import_react3.useCallback)((clientX, clientY) => {
    const element = canvasElement;
    if (element === null) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, [canvasElement]);
  const assistedPoint = (0, import_react3.useCallback)((screen, base) => {
    const raw = toWorld(screen, fit, view);
    let point = raw;
    let result;
    if (aids.osnap) {
      try {
        result = snapNear(ensureIndex(), raw, snapRadius, {
          ...aids.grid && grid !== void 0 ? { includeGrid: true, grid: grid.step } : {},
          locked: lockedLayers,
          // Screen-space projection turns on the intersection candidate and lets
          // its neighbourhood prefilter skip a sheet-wide pairwise search.
          project: (candidate) => toScreen(candidate, fit, view),
          screenRadius: SNAP_RADIUS_PX
        });
      } catch {
        result = void 0;
      }
      if (result !== void 0) point = result.point;
    }
    if (aids.ortho && base !== void 0) point = orthoPoint(base, point);
    return { point, snap: result };
  }, [aids.grid, aids.osnap, aids.ortho, ensureIndex, fit, grid, lockedLayers, snapRadius, view]);
  const beginPan = (0, import_react3.useCallback)((screen, pointerId, button) => {
    gestureRef.current = { kind: "pan", button, startX: screen.x, startY: screen.y, panX: view.panX, panY: view.panY, pointerId, moved: false };
    canvasElement?.setPointerCapture?.(pointerId);
    setPanning(true);
  }, [canvasElement, view.panX, view.panY]);
  const openContextMenuAt = (0, import_react3.useCallback)((screen) => {
    const maxX = Math.max(8, size.width - 220);
    const maxY = Math.max(8, size.height - (selected.length > 0 ? 340 : 300));
    setContextMenu({ x: Math.min(screen.x, maxX), y: Math.min(screen.y, maxY) });
    setCommandError(void 0);
  }, [selected.length, size.height, size.width]);
  const pointForSnapPreview = (0, import_react3.useCallback)((point, result) => {
    setCursorWorld(point);
    setSnap(result);
  }, []);
  const onPointerDown = (0, import_react3.useCallback)((event) => {
    const element = canvasElement;
    if (element === null) return;
    element.focus({ preventScroll: true });
    const screen = localPoint(event.clientX, event.clientY);
    suppressContextMenuRef.current = false;
    if (event.button === 1 || event.button === 2 || event.button === 0 && (spaceHeldRef.current || tool === "pan")) {
      event.preventDefault();
      beginPan(screen, event.pointerId, event.button);
      return;
    }
    if (event.button !== 0) return;
    setContextMenu(void 0);
    const base = command?.points[command.points.length - 1];
    const { point } = assistedPoint(screen, base);
    const now = Date.now();
    const last = lastClickRef.current;
    const isDouble = command !== void 0 && last !== void 0 && now - last.time < DOUBLE_CLICK_MS && Math.abs(last.x - screen.x) < DOUBLE_CLICK_PX && Math.abs(last.y - screen.y) < DOUBLE_CLICK_PX;
    lastClickRef.current = { time: now, x: screen.x, y: screen.y };
    if (isDouble) {
      lastClickRef.current = void 0;
      finishCommand();
      return;
    }
    if (editing && selectedEntities.length > 0) {
      for (const entity of selectedEntities) {
        for (const grip of gripsOf(entity)) {
          const gripScreen = toScreen(grip.point, fit, view);
          if (Math.hypot(gripScreen[0] - screen.x, gripScreen[1] - screen.y) > GRIP_HIT_PX) continue;
          gestureRef.current = { kind: "grip", entityId: entity.id, grip, original: grip.point, pointerId: event.pointerId, moved: false, point: grip.point };
          canvasElement?.setPointerCapture?.(event.pointerId);
          setGripDrag({ entityId: entity.id, grip, original: grip.point, point: grip.point });
          return;
        }
      }
    }
    if (tool === "select") {
      const hit = pickEntity(ensureIndex(), point, pickTolerance, { locked: lockedLayers });
      if (hit !== void 0) {
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        const mode2 = event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace";
        const already = selected.includes(hit);
        setSelected((current) => additive ? mode2 === "add" ? [...current, ...current.includes(hit) ? [] : [hit]] : current.filter((id) => id !== hit).concat(current.includes(hit) ? [] : [hit]) : [hit]);
        if (editing && !additive && already) {
          gestureRef.current = { kind: "moveDrag", startWorld: point, ids: [...selected], pointerId: event.pointerId, moved: false, dx: 0, dy: 0 };
          canvasElement?.setPointerCapture?.(event.pointerId);
        }
        return;
      }
      gestureRef.current = { kind: "marquee", start: screen, pointerId: event.pointerId, moved: false, additive: event.shiftKey || event.ctrlKey, toggle: event.ctrlKey || event.metaKey };
      canvasElement?.setPointerCapture?.(event.pointerId);
      setMarquee({ box: screenBoxOfPoints(screen, screen), mode: "window" });
      return;
    }
    if (tool === "zoomWindow") {
      gestureRef.current = { kind: "zoomWindow", start: screen, pointerId: event.pointerId, moved: false };
      canvasElement?.setPointerCapture?.(event.pointerId);
      setZoomBox(screenBoxOfPoints(screen, screen));
      return;
    }
    if (tool === "text") {
      setPlacement({
        point,
        text: "",
        height: String(Number(defaultAnnotationHeight.toFixed(4))),
        layer: defaultAnnotationLayer ?? ""
      });
      return;
    }
    if (tool === "block") {
      const blocks = displayModel?.blocks ?? [];
      if (blocks.length === 0) {
        setNotice({ kind: "warn", text: t("noBlocks") });
        return;
      }
      setBlockPlacement({ point, block: blocks[0]?.name ?? "", rotation: "0", scale: "1" });
      return;
    }
    if (tool === "erase" || tool === "trim" || tool === "extend") {
      const hit = pickEntity(ensureIndex(), point, pickTolerance, { locked: lockedLayers });
      if (hit === void 0) return;
      const entity = activeLayout?.entities.find((candidate) => candidate.id === hit);
      if (entity === void 0 || activeLayout === void 0) return;
      if (!editableEntityId(entity.id)) {
        setNotice({ kind: "warn", text: t("editFlattened") });
        return;
      }
      if (tool === "erase") {
        stageOps([stageEraseMany(nextDraftKey(), activeLayout.id, [entity.id])], void 0);
        setSelected((current) => current.filter((id) => id !== entity.id));
        return;
      }
      const boundary = editableSelection[0]?.id;
      if (boundary === void 0) {
        setCommandError(t("commandTrimNeedsBoundary"));
        return;
      }
      if (boundary === hit) {
        setCommandError(t("commandTrimSame"));
        return;
      }
      const key = nextDraftKey();
      if (tool === "trim") stageOps([stageTrim(key, activeLayout.id, hit, boundary, point)], void 0);
      else stageOps([stageExtend(key, activeLayout.id, hit, boundary)], void 0);
      return;
    }
    const started = command ?? commandStart(tool);
    if (started === void 0) return;
    setCommand(started);
    applyCommandStep(commandClick(started, point, commandContext));
  }, [activeLayout, applyCommandStep, assistedPoint, beginPan, canvasElement, command, commandContext, defaultAnnotationHeight, defaultAnnotationLayer, displayModel, editableSelection, editing, ensureIndex, finishCommand, fit, localPoint, lockedLayers, nextDraftKey, pickTolerance, selected, selectedEntities, stageOps, t, tool, view]);
  const onPointerMove = (0, import_react3.useCallback)((event) => {
    const element = canvasElement;
    if (element === null) return;
    const screen = localPoint(event.clientX, event.clientY);
    const gesture = gestureRef.current;
    if (gesture !== void 0) {
      if (gesture.kind === "pan") {
        const dx = screen.x - gesture.startX;
        const dy = screen.y - gesture.startY;
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        gesture.moved = true;
        setView((current) => ({ zoom: current.zoom, panX: gesture.panX + dx, panY: gesture.panY + dy }));
        return;
      }
      if (gesture.kind === "marquee") {
        const dx = screen.x - gesture.start.x;
        const dy = screen.y - gesture.start.y;
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        gesture.moved = true;
        setMarquee(marqueeOf(gesture.start, screen));
        setCursorWorld(toWorld(screen, fit, view));
        return;
      }
      if (gesture.kind === "zoomWindow") {
        const dx = screen.x - gesture.start.x;
        const dy = screen.y - gesture.start.y;
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        gesture.moved = true;
        setZoomBox(screenBoxOfPoints(gesture.start, screen));
        return;
      }
      if (gesture.kind === "moveDrag") {
        const { point: point2 } = assistedPoint(screen, gesture.startWorld);
        const dx = roundValue(point2[0] - gesture.startWorld[0]);
        const dy = roundValue(point2[1] - gesture.startWorld[1]);
        if (!gesture.moved && Math.abs(dx) === 0 && Math.abs(dy) === 0) return;
        gesture.moved = true;
        gesture.dx = dx;
        gesture.dy = dy;
        setDragGhost({ ids: gesture.ids, dx, dy });
        setCursorWorld(point2);
        return;
      }
      if (gesture.kind === "grip") {
        const { point: point2 } = assistedPoint(screen, gesture.original);
        gesture.moved = true;
        gesture.point = point2;
        setGripDrag({ entityId: gesture.entityId, grip: gesture.grip, original: gesture.original, point: point2 });
        setCursorWorld(point2);
        return;
      }
    }
    const base = command?.points[command.points.length - 1];
    const { point, snap: result } = assistedPoint(screen, base);
    pointForSnapPreview(point, result);
    if (command !== void 0) setCommand((current) => current === void 0 ? current : commandHover(current, point));
  }, [assistedPoint, canvasElement, command, fit, localPoint, pointForSnapPreview, view]);
  const dispatchGrip = (0, import_react3.useCallback)((entityId, grip, original, point) => {
    const entity = activeLayout?.entities.find((candidate) => candidate.id === entityId);
    if (entity === void 0 || activeLayout === void 0) return;
    const request2 = gripRequestFor(entity, grip, point);
    if (request2.kind === "move") {
      if (request2.dx === 0 && request2.dy === 0) return;
      stageOps([stageMoveMany(nextDraftKey(), activeLayout.id, [entityId], request2.dx, request2.dy)], void 0);
      setNotice({ kind: "info", text: t("gripMoveStaged", { dx: request2.dx, dy: request2.dy }) });
      return;
    }
    if (engineOpAvailable(request2.op)) {
      stageOps([{ key: nextDraftKey(), layout: activeLayout.id, op: asEcadOp({ op: request2.op, layout: activeLayout.id, ...request2.payload }) }], void 0);
      return;
    }
    setNotice({ kind: "warn", text: t("gripOpPending", { op: request2.op }) });
    void original;
  }, [activeLayout, nextDraftKey, stageOps, t]);
  const onPointerUp = (0, import_react3.useCallback)((event) => {
    const element = canvasElement;
    const screen = localPoint(event.clientX, event.clientY);
    const gesture = gestureRef.current;
    gestureRef.current = void 0;
    if (element !== null) {
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
      }
    }
    if (gesture === void 0) return;
    if (gesture.kind === "pan") {
      setPanning(false);
      if (gesture.button === 2) {
        if (gesture.moved) {
          suppressContextMenuRef.current = true;
        } else {
          openContextMenuAt(screen);
        }
      }
      return;
    }
    if (gesture.kind === "marquee") {
      setMarquee(void 0);
      if (gesture.moved) {
        const next = marqueeOf(gesture.start, screen);
        const ids = marqueeSelect(ensureIndex(), next, fit, view, { locked: lockedLayers });
        setSelected((current) => {
          if (gesture.additive) {
            let result = [...current];
            for (const id of ids) {
              if (gesture.toggle && result.includes(id)) result = result.filter((candidate) => candidate !== id);
              else if (!result.includes(id)) result.push(id);
            }
            return result;
          }
          return ids;
        });
      } else if (!gesture.additive) {
        setSelected([]);
      }
      return;
    }
    if (gesture.kind === "zoomWindow") {
      setZoomBox(void 0);
      if (!gesture.moved) return;
      const box = screenBoxOfPoints(gesture.start, screen);
      setView((current) => viewForBox(box, fit, current, Math.max(size.width, 1), Math.max(size.height, 1), 16));
      return;
    }
    if (gesture.kind === "moveDrag") {
      setDragGhost(void 0);
      if (gesture.moved && activeLayout !== void 0 && (gesture.dx !== 0 || gesture.dy !== 0)) {
        stageOps([stageMoveMany(nextDraftKey(), activeLayout.id, gesture.ids, gesture.dx, gesture.dy)], void 0);
      }
      return;
    }
    if (gesture.kind === "grip") {
      setGripDrag(void 0);
      if (gesture.moved) dispatchGrip(gesture.entityId, gesture.grip, gesture.original, gesture.point);
      return;
    }
  }, [activeLayout, canvasElement, dispatchGrip, ensureIndex, fit, localPoint, lockedLayers, nextDraftKey, openContextMenuAt, size.height, size.width, stageOps, view]);
  const onContextMenu = (0, import_react3.useCallback)((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (suppressContextMenuRef.current) {
      suppressContextMenuRef.current = false;
      return;
    }
    openContextMenuAt(localPoint(event.clientX, event.clientY));
  }, [localPoint, openContextMenuAt]);
  const askSelection = (0, import_react3.useCallback)(() => {
    if (selectedEntities.length === 0) return;
    const kinds = [...new Set(selectedEntities.map((entity) => entity.k))].join(", ");
    const layers2 = [...new Set(selectedEntities.map((entity) => entity.layer))].join(", ");
    const ids = selectedEntities.slice(0, 8).map((entity) => entity.id).join(", ");
    const told = ask(resourceAddress, t("askSelection", {
      count: selectedEntities.length,
      kinds,
      layers: layers2,
      ids,
      format: formatLabel,
      path: pathOf2(resourceAddress)
    }));
    setChatUnavailable(!told);
  }, [ask, formatLabel, resourceAddress, selectedEntities, t]);
  const askReview = (0, import_react3.useCallback)(() => {
    const told = ask(resourceAddress, t("askReview", { format: formatLabel, path: pathOf2(resourceAddress) }));
    setChatUnavailable(!told);
  }, [ask, formatLabel, resourceAddress, t]);
  const askEntity = (0, import_react3.useCallback)((entity) => {
    const told = ask(resourceAddress, t("askEntity", {
      id: entity.id,
      kind: entity.k,
      layer: entity.layer,
      format: formatLabel,
      path: pathOf2(resourceAddress)
    }));
    setChatUnavailable(!told);
  }, [ask, formatLabel, resourceAddress, t]);
  const fileStem = (0, import_react3.useMemo)(() => {
    const path = pathOf2(resourceAddress);
    const name = path.split("/").pop() ?? "drawing";
    return name.replace(/\.[^.]+$/u, "") || "drawing";
  }, [resourceAddress]);
  const sheetLabel = (0, import_react3.useMemo)(() => {
    if (scene === void 0) return "";
    const width = scene.bounds.max[0] - scene.bounds.min[0];
    const height = scene.bounds.max[1] - scene.bounds.min[1];
    const unit = displayModel === void 0 ? void 0 : unitLabel(displayModel.units);
    return t("statusSheet", { width: fmt(width), height: fmt(height), unit: unit ?? "" });
  }, [displayModel, scene, t]);
  const printSheet = (0, import_react3.useCallback)(() => {
    window.print();
  }, []);
  const downloadText = (0, import_react3.useCallback)((name, text, mime) => {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1e3);
    } catch {
      setNotice({ kind: "error", text: t("exportFailed") });
    }
  }, [t]);
  const exportSvg = (0, import_react3.useCallback)(() => {
    if (scene === void 0 || displayModel === void 0) return;
    try {
      const svg = svgDocumentOf(scene, fit, view, {
        title: t("exportSvgTitle", { path: pathOf2(resourceAddress), layout: activeLayout?.name ?? "" }),
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height))
      });
      downloadText(`${t("exportName", { name: fileStem, layout: activeLayout?.id ?? "Model" })}.svg`, svg, "image/svg+xml");
    } catch {
      setNotice({ kind: "error", text: t("exportFailed") });
    }
  }, [activeLayout, displayModel, downloadText, fileStem, fit, resourceAddress, scene, size.height, size.width, t, view]);
  const exportPng = (0, import_react3.useCallback)(() => {
    if (scene === void 0 || size.width <= 0 || size.height <= 0) {
      setNotice({ kind: "error", text: t("exportFailed") });
      return;
    }
    try {
      const svg = svgDocumentOf(scene, fit, view, {
        title: t("exportSvgTitle", { path: pathOf2(resourceAddress), layout: activeLayout?.name ?? "" }),
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height))
      });
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(size.width));
          canvas.height = Math.max(1, Math.round(size.height));
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("no 2d context");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (blob === null) {
              setNotice({ kind: "error", text: t("exportFailed") });
              return;
            }
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${t("exportName", { name: fileStem, layout: activeLayout?.id ?? "Model" })}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
          }, "image/png");
        } catch {
          URL.revokeObjectURL(url);
          setNotice({ kind: "error", text: t("exportFailed") });
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        setNotice({ kind: "error", text: t("exportFailed") });
      };
      image.src = url;
    } catch {
      setNotice({ kind: "error", text: t("exportFailed") });
    }
  }, [activeLayout, fileStem, fit, resourceAddress, scene, size.height, size.width, t, view]);
  const menuItems = (0, import_react3.useMemo)(() => {
    if (contextMenu === void 0) return [];
    const hasSelection = selected.length > 0;
    return [
      { id: "selectAll", label: t("selectAll"), shortcut: "Ctrl+A", disabled: pickableEntities.length === 0, onSelect: selectAll },
      { id: "zoomExtents", label: t("menuZoomExtents"), shortcut: "F", onSelect: fitView },
      { id: "zoomWindow", label: t("menuZoomWindow"), shortcut: "Z", onSelect: () => {
        chooseTool("zoomWindow");
      } },
      { id: "pan", label: t("toolPan"), shortcut: "H", onSelect: () => {
        chooseTool("pan");
      } },
      { id: "move", label: t("menuMove"), shortcut: "M", disabled: !editing || !hasSelection, separatorBefore: true, onSelect: () => {
        chooseTool("move");
      } },
      { id: "copy", label: t("menuCopy"), shortcut: "Y", disabled: !editing || !hasSelection, onSelect: () => {
        chooseTool("copy");
      } },
      { id: "erase", label: t("menuErase"), shortcut: "Del", disabled: !editing || !hasSelection, onSelect: stageEraseSelection },
      { id: "properties", label: t("menuProperties"), disabled: !hasSelection, separatorBefore: true, onSelect: () => {
        panelsTouchedRef.current = true;
        setPanelsOpen(true);
      } },
      { id: "ask", label: t("menuAskSelection"), disabled: !hasSelection, onSelect: askSelection },
      { id: "print", label: t("menuPrint"), disabled: state.phase !== "ready", separatorBefore: true, onSelect: printSheet },
      { id: "exportSvg", label: t("menuExportSvg"), disabled: state.phase !== "ready", onSelect: exportSvg }
    ];
  }, [askSelection, chooseTool, contextMenu, editing, exportSvg, fitView, pickableEntities.length, printSheet, selectAll, selected.length, stageEraseSelection, state.phase, t]);
  const dismissOutcome = (0, import_react3.useCallback)(() => {
    setOutcome(void 0);
  }, []);
  const backToSource = (0, import_react3.useCallback)(() => {
    setWritten(void 0);
    setSelected([]);
    setLayoutId(void 0);
    setView({ zoom: 1, panX: 0, panY: 0 });
    setOutcome((current) => current?.kind === "applied" ? { ...current, showingWritten: false } : current);
  }, []);
  const openWritten = (0, import_react3.useCallback)(() => {
    if (writtenCandidate === void 0) return;
    setWritten(writtenCandidate);
    setSelected([]);
    setLayoutId(void 0);
    setView({ zoom: 1, panX: 0, panY: 0 });
    setOutcome((current) => current?.kind === "applied" ? { ...current, showingWritten: true } : current);
  }, [writtenCandidate]);
  const applyNow = (0, import_react3.useCallback)(() => {
    if (!editable || applying || staged2.length === 0 || summary === void 0) return;
    const controller = new AbortController();
    applyAbortRef.current?.abort();
    applyAbortRef.current = controller;
    setApplying(true);
    setOutcome(void 0);
    const ops = draftOps(staged2);
    void apply2(resourceAddress, summary.version, ops, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setApplying(false);
      if (!result.ok) {
        setOutcome({ kind: "failed", error: result.error });
        return;
      }
      setDraft(draftReset());
      setPlacement(void 0);
      setBlockPlacement(void 0);
      cancelCommand();
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
  }, [apply2, applying, cancelCommand, editable, resourceAddress, staged2, summary, t]);
  (0, import_react3.useEffect)(() => {
    if (!editable && mode === "edit") setMode("view");
  }, [editable, mode]);
  (0, import_react3.useEffect)(() => {
    if (editing) return;
    const spec = toolOf(tool);
    if (spec?.writes === true) {
      setTool("select");
      cancelCommand();
    }
  }, [cancelCommand, editing, tool]);
  (0, import_react3.useEffect)(() => {
    if (placement === void 0 && blockPlacement === void 0 || panelsOpen) return;
    panelsTouchedRef.current = true;
    setPanelsOpen(true);
  }, [blockPlacement, panelsOpen, placement]);
  (0, import_react3.useEffect)(() => {
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      setContextMenu(void 0);
      setPlacement(void 0);
      setBlockPlacement(void 0);
      setNotice(void 0);
      setMarquee(void 0);
      setZoomBox(void 0);
      if (command !== void 0) cancelCommand();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [cancelCommand, command]);
  (0, import_react3.useEffect)(() => {
    const onKeyUp = (event) => {
      if (event.key !== " " && event.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpaceDown(false);
    };
    const onBlur = () => {
      spaceHeldRef.current = false;
      setSpaceDown(false);
    };
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const onKeyDown = (0, import_react3.useCallback)((event) => {
    const key = event.key;
    const commandModifier = event.ctrlKey || event.metaKey;
    if (commandModifier) {
      if (key === "z" || key === "Z") {
        event.preventDefault();
        if (event.shiftKey) redoDraft();
        else undoDraft();
        return;
      }
      if (key === "y" || key === "Y") {
        event.preventDefault();
        redoDraft();
        return;
      }
      if (key === "a" || key === "A") {
        event.preventDefault();
        selectAll();
        return;
      }
      return;
    }
    switch (key) {
      case "Escape":
        event.preventDefault();
        if (contextMenu !== void 0) {
          setContextMenu(void 0);
        } else if (placement !== void 0 || blockPlacement !== void 0) {
          setPlacement(void 0);
          setBlockPlacement(void 0);
          setTool("select");
        } else if (command !== void 0) {
          cancelCommand();
          setTool("select");
        } else if (gripDrag !== void 0) {
          setGripDrag(void 0);
        } else {
          setSelected([]);
          setSnap(void 0);
        }
        return;
      case "Delete":
      case "Backspace":
        if (editing && selected.length > 0) {
          event.preventDefault();
          stageEraseSelection();
        }
        return;
      case "Enter":
        if (command !== void 0) {
          event.preventDefault();
          finishCommand();
          return;
        }
        if (editing && tool === "text" && placement === void 0) {
          event.preventDefault();
          setPlacement({
            point: toWorld({ x: size.width / 2, y: size.height / 2 }, fit, view),
            text: "",
            height: String(Number(defaultAnnotationHeight.toFixed(4))),
            layer: defaultAnnotationLayer ?? ""
          });
        }
        return;
      case "F3":
        event.preventDefault();
        setAids((current) => ({ ...current, osnap: !current.osnap }));
        return;
      case "F7":
        event.preventDefault();
        setAids((current) => ({ ...current, grid: !current.grid }));
        return;
      case "F8":
        event.preventDefault();
        setAids((current) => ({ ...current, ortho: !current.ortho }));
        return;
      case " ":
      case "Spacebar":
        event.preventDefault();
        spaceHeldRef.current = true;
        setSpaceDown(true);
        return;
      case "ArrowLeft":
        event.preventDefault();
        applyView((current) => ({ ...current, panX: current.panX + PAN_STEP }));
        return;
      case "ArrowRight":
        event.preventDefault();
        applyView((current) => ({ ...current, panX: current.panX - PAN_STEP }));
        return;
      case "ArrowUp":
        event.preventDefault();
        applyView((current) => ({ ...current, panY: current.panY + PAN_STEP }));
        return;
      case "ArrowDown":
        event.preventDefault();
        applyView((current) => ({ ...current, panY: current.panY - PAN_STEP }));
        return;
      case "+":
      case "=":
        event.preventDefault();
        zoomBy(1.3);
        return;
      case "-":
      case "_":
        event.preventDefault();
        zoomBy(1 / 1.3);
        return;
      default: {
        const shortcut = toolForShortcut(key);
        if (shortcut !== void 0) {
          event.preventDefault();
          chooseTool(shortcut);
        }
      }
    }
  }, [applyView, blockPlacement, cancelCommand, chooseTool, command, contextMenu, defaultAnnotationHeight, defaultAnnotationLayer, editing, finishCommand, fit, gripDrag, placement, redoDraft, selectAll, selected.length, size.height, size.width, stageEraseSelection, t, tool, undoDraft, view, zoomBy]);
  const previewElements = (0, import_react3.useMemo)(() => {
    if (gripDrag !== void 0) {
      const elements = [{ kind: "line", a: gripDrag.original, b: gripDrag.point }];
      const entity = activeLayout?.entities.find((candidate) => candidate.id === gripDrag.entityId);
      if (entity !== void 0) {
        const request2 = gripRequestFor(entity, gripDrag.grip, gripDrag.point);
        const shape = request2.kind === "move" ? movedPreviewOf(entity, request2.dx, request2.dy) : setterPreviewOf(request2.op, request2.payload);
        if (shape !== void 0) elements.push(shape);
      }
      return elements;
    }
    if (command === void 0 || command.points.length === 0) return [];
    const cursor = command.cursor;
    if (cursor === void 0) return [];
    const points = command.points;
    const first = points[0];
    switch (command.tool) {
      case "line":
      case "polyline":
      case "leader":
      case "revisionCloud": {
        const path = [...points, cursor];
        return path.length >= 2 ? [{ kind: "polyline", points: path }] : [];
      }
      case "rectangle":
        return [{ kind: "rect", a: first, b: cursor }];
      case "circle": {
        const radius = Math.hypot(cursor[0] - first[0], cursor[1] - first[1]);
        return radius > 0 ? [{ kind: "circle", c: first, r: radius }] : [];
      }
      case "arc": {
        if (points.length < 2) return [{ kind: "line", a: first, b: cursor }];
        const second = points[1];
        const arc = arcThroughPoints(first, second, cursor);
        return arc === void 0 ? [{ kind: "polyline", points: [first, second, cursor] }] : [{ kind: "arc", c: arc.center, r: arc.radius, a0: arc.a0, a1: arc.a1 }];
      }
      case "move":
      case "copy":
      case "mirror":
        return [{ kind: "line", a: first, b: cursor }];
      case "rotate":
        return [{ kind: "line", a: first, b: cursor }];
      case "scale":
      case "offset":
        return [{ kind: "line", a: first, b: cursor }];
      case "trim":
      case "extend":
        return [{ kind: "line", a: first, b: cursor }];
      default:
        return [];
    }
  }, [activeLayout, command, gripDrag]);
  const grips = (0, import_react3.useMemo)(() => {
    if (!editing) return [];
    const result = [];
    for (const entity of selectedEntities) {
      for (const grip of gripsOf(entity)) {
        result.push(grip);
        if (result.length >= 200) return result;
      }
    }
    return result;
  }, [editing, selectedEntities]);
  const snapLabel = snap === void 0 ? void 0 : snap.kind === "endpoint" ? t("snapEndpoint") : snap.kind === "intersection" ? t("snapIntersection") : snap.kind === "midpoint" ? t("snapMidpoint") : snap.kind === "center" ? t("snapCenter") : snap.kind === "nearest" ? t("snapNearest") : t("snapGrid");
  const layouts = displayModel?.layouts ?? [];
  const layoutTabs = layouts.length > 1 ? (0, import_react3.createElement)(
    "div",
    { className: `${EcadBody_default.layoutTabs} ${EcadBody_default.noPrint}`, role: "tablist", "aria-label": t("layout") },
    layouts.map((layout) => (0, import_react3.createElement)(
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
          setSelected([]);
          setView({ zoom: 1, panX: 0, panY: 0 });
          cancelCommand();
          setTool("select");
        }
      },
      layout.kind === "model" ? t("modelSpace") : layout.name,
      (0, import_react3.createElement)("span", { className: EcadBody_default.tabCount }, String(layout.entities.length))
    ))
  ) : null;
  const sheetUnit = displayModel === void 0 ? void 0 : unitLabel(displayModel.units);
  const printMeta = t("printFooter", {
    format: formatLabel,
    width: scene === void 0 ? "" : fmt(scene.bounds.max[0] - scene.bounds.min[0]),
    height: scene === void 0 ? "" : fmt(scene.bounds.max[1] - scene.bounds.min[1]),
    unit: sheetUnit ?? "",
    selection: t("selectionCount", { count: selected.length })
  });
  let stage;
  if (state.phase === "loading") {
    stage = (0, import_react3.createElement)(LoadingState, { label: t("loading") });
  } else if (state.phase === "error") {
    stage = (0, import_react3.createElement)(FailureState, {
      error: state.error,
      onRetry: retry,
      onAsk: askReview,
      chatUnavailable,
      t
    });
  } else if (scene === void 0 || coverage === void 0 || summary === void 0) {
    stage = (0, import_react3.createElement)(LoadingState, { label: t("loadingModel") });
  } else if (scene.primitives.length === 0) {
    stage = (0, import_react3.createElement)(
      "div",
      { className: EcadBody_default.state, role: "status" },
      (0, import_react3.createElement)("h3", { className: EcadBody_default.stateTitle }, t("empty")),
      (0, import_react3.createElement)("p", { className: EcadBody_default.stateBody }, t("emptyHint", { entities: coverage.entities.toLocaleString() })),
      (0, import_react3.createElement)("div", { className: EcadBody_default.stateActions }, (0, import_react3.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: retry }, t("retry")))
    );
  } else {
    const panelToggle = panelsOpen ? "" : ` ${EcadBody_default.sidePanelHidden}`;
    const canvasLabel = t("canvasLabel", { path: pathOf2(resourceAddress) });
    stage = (0, import_react3.createElement)(
      "div",
      { className: EcadBody_default.stage },
      (0, import_react3.createElement)(ToolPalette, { t, active: tool, editing, editable, onPick: chooseTool }),
      (0, import_react3.createElement)(
        "div",
        { className: EcadBody_default.canvasColumn },
        (0, import_react3.createElement)(
          "div",
          {
            ref: setCanvasElement,
            className: `${EcadBody_default.canvasWrap}${panning ? ` ${EcadBody_default.panning}` : ""}`,
            tabIndex: 0,
            role: "group",
            "aria-label": canvasLabel,
            title: spaceDown ? t("toolPanHint") : `${t("panHint")} \xB7 ${t("keyboardHint")}`,
            style: {
              cursor: panning ? "grabbing" : spaceDown || tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair"
            },
            onKeyDown,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            onContextMenu,
            "data-ecad-tool": tool
          },
          (0, import_react3.createElement)(SceneView, {
            scene,
            fit,
            view,
            label: canvasLabel,
            width: Math.max(1, size.width),
            height: Math.max(1, size.height),
            selectedIds: selected,
            fadedIds: preview.erases,
            ghostMoves: allGhostMoves,
            ghostTexts,
            pendingPoint,
            marquee,
            zoomBox,
            grid,
            grips,
            activeGripKey: gripDrag?.grip.key,
            gripPreview: gripDrag === void 0 ? void 0 : [gripDrag.original, gripDrag.point],
            snap: snap === void 0 || snapLabel === void 0 ? void 0 : { point: snap.point, kind: snap.kind, label: snapLabel },
            preview: previewElements
          }),
          written === void 0 ? null : (0, import_react3.createElement)(WrittenBanner, { t, path: written.path, onBackToSource: backToSource }),
          coverage.truncated ? (0, import_react3.createElement)(
            "div",
            { className: `${EcadBody_default.notice}${written === void 0 ? "" : ` ${EcadBody_default.noticeBelowBanner}`}`, role: "status" },
            (0, import_react3.createElement)(WarningIcon, {}),
            (0, import_react3.createElement)("span", { className: EcadBody_default.noticeText }, t("truncated"))
          ) : null,
          notice === void 0 ? null : (0, import_react3.createElement)(CadNoticeView, { t, notice, onDismiss: () => {
            setNotice(void 0);
          } }),
          contextMenu === void 0 ? null : (0, import_react3.createElement)(ContextMenu, {
            t,
            x: contextMenu.x,
            y: contextMenu.y,
            items: menuItems,
            onClose: () => {
              setContextMenu(void 0);
            }
          })
        ),
        (0, import_react3.createElement)(CadStatusBar, {
          t,
          cursor: cursorWorld,
          selectionCount: selected.length,
          snapKind: snap?.kind,
          osnap: aids.osnap,
          ortho: aids.ortho,
          grid: aids.grid,
          sheet: sheetLabel,
          onToggleOsnap: () => {
            setAids((current) => ({ ...current, osnap: !current.osnap }));
          },
          onToggleOrtho: () => {
            setAids((current) => ({ ...current, ortho: !current.ortho }));
          },
          onToggleGrid: () => {
            setAids((current) => ({ ...current, grid: !current.grid }));
          }
        })
      ),
      (0, import_react3.createElement)(
        "div",
        { className: `${EcadBody_default.sidePanel}${panelToggle} ${EcadBody_default.noPrint}` },
        (0, import_react3.createElement)(
          "div",
          { className: EcadBody_default.panelHeading },
          (0, import_react3.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
          (0, import_react3.createElement)("button", {
            type: "button",
            className: `${EcadBody_default.button} ${EcadBody_default.iconButton} ${EcadBody_default.panelClose}`,
            title: t("panels"),
            "aria-label": t("panels"),
            onClick: () => {
              panelsTouchedRef.current = true;
              setPanelsOpen(false);
            }
          }, (0, import_react3.createElement)(CloseIcon, {}))
        ),
        editing || outcome !== void 0 ? (0, import_react3.createElement)(DraftPanel, {
          t,
          staged: staged2,
          counts,
          hint: draftHint,
          placement: editing ? placement : void 0,
          layers: placementLayers,
          invalidHeight: placement !== void 0 && (parseNumberField(placement.height) === void 0 || (parseNumberField(placement.height) ?? 0) <= 0),
          onPlacementChange: (field2, value) => {
            setPlacement((current) => current === void 0 ? current : { ...current, [field2]: value });
          },
          onStagePlacement: stagePlacement,
          onCancelPlacement: () => {
            setPlacement(void 0);
            setTool("select");
          },
          blockPlacement: editing ? blockPlacement : void 0,
          blocks: (displayModel?.blocks ?? []).map((block) => block.name),
          onBlockChange: (field2, value) => {
            setBlockPlacement((current) => current === void 0 ? current : { ...current, [field2]: value });
          },
          onStageBlock: stageBlock,
          onCancelBlock: () => {
            setBlockPlacement(void 0);
            setTool("select");
          },
          onRemove: removeStaged,
          outcome,
          onDismissOutcome: dismissOutcome,
          onOpenWritten: openWritten,
          onBackToSource: backToSource
        }) : null,
        (0, import_react3.createElement)(CadLayersPanel, {
          t,
          model: displayModel ?? state.model,
          layoutEntities: activeLayout?.entities ?? [],
          hidden,
          locked: lockedLayers,
          current: currentLayer,
          editing,
          onToggle: (name) => {
            toggleLayer(name);
          },
          onShowAll: () => {
            showAllLayers();
          },
          onHideAll: () => {
            hideAllLayers();
          },
          onLock: (name) => {
            toggleLayerLock(name);
          },
          onCurrent: (name) => {
            setCurrentLayer(name);
          },
          onCreateLayer: (name, color) => {
            commitOps([stageAddLayer(nextDraftKey(), name, color)]);
            return void 0;
          },
          onRenameLayer: (from, to) => {
            commitOps([stageRenameLayer(nextDraftKey(), from, to)]);
            return void 0;
          },
          onSetLayerColor: (name, color) => {
            commitOps([stageSetLayerColor(nextDraftKey(), name, color)]);
            return void 0;
          }
        }),
        (0, import_react3.createElement)(PropertiesPanel, {
          t,
          entities: selectedEntities,
          model: displayModel ?? state.model,
          editing,
          moveDx,
          moveDy,
          rotateAngle,
          onMoveDx: setMoveDx,
          onMoveDy: setMoveDy,
          onRotateAngle: setRotateAngle,
          onStageMove: stageMoveFromPanel,
          onStageRotate: stageRotateFromPanel,
          onStageErase: stageEraseSelection,
          onStageText: stageTextChange,
          onStageLayer: stageLayerChange,
          onStageColor: stageColorChange,
          onStageAttribute: stageAttributeChange,
          onAsk: () => {
            if (selectedOne !== void 0) askEntity(selectedOne);
            else askSelection();
          },
          onClear: clearSelection
        }),
        (0, import_react3.createElement)(SheetSection, {
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
  return (0, import_react3.createElement)(
    "div",
    {
      className: EcadBody_default.root,
      "data-ecad-pane": "drawing",
      "data-ecad-state": state.phase,
      ...format === void 0 ? {} : { "data-ecad-format": format },
      ...editable ? { "data-ecad-editable": "true" } : {},
      ...editing ? { "data-ecad-editing": "true" } : {},
      ...editing ? { "data-ecad-mode": mode } : {}
    },
    (0, import_react3.createElement)(
      "div",
      { className: `${EcadBody_default.printOnly} ${EcadBody_default.printHeader}` },
      (0, import_react3.createElement)("div", { className: EcadBody_default.printTitle }, t("printHeader", { path: pathOf2(resourceAddress), layout: activeLayout?.name ?? "" })),
      (0, import_react3.createElement)("div", { className: EcadBody_default.printMeta }, printMeta)
    ),
    (0, import_react3.createElement)(CadToolbar, {
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
      aids,
      onToggleAid: (aid) => {
        setAids((current) => ({ ...current, [aid]: !current[aid] }));
      },
      canUndo: draftCanUndo(draft),
      canRedo: draftCanRedo(draft),
      onUndo: undoDraft,
      onRedo: redoDraft,
      onPrint: printSheet,
      onExportSvg: exportSvg,
      onExportPng: exportPng,
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
    editing ? (0, import_react3.createElement)(CommandBar, {
      t,
      tool,
      points: command?.points.length ?? 0,
      numeric: numericText,
      onNumeric: setNumericText,
      onApplyNumeric: applyNumeric,
      onCancel: () => {
        cancelCommand();
        setTool("select");
      },
      error: commandError
    }) : null,
    editing ? (0, import_react3.createElement)(EditBar, {
      t,
      tool: tool === "text" ? "text" : void 0,
      onToggleText: () => {
        chooseTool(tool === "text" ? "select" : "text");
      },
      stagedCount: staged2.length,
      applying,
      canApply: staged2.length > 0 && !applying,
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
function arcThroughPoints(a, b, c) {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const cx = c[0];
  const cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return void 0;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const radius = Math.hypot(ax - ux, ay - uy);
  const angleOf = (point) => Math.atan2(point[1] - uy, point[0] - ux);
  const start = angleOf(a);
  const normalise = (value) => (value % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let sweep = normalise(angleOf(c) - start);
  if (normalise(angleOf(b) - start) > sweep) sweep -= Math.PI * 2;
  return { center: [ux, uy], radius, a0: start, a1: start + sweep };
}

// packages/ecad/src/client/EcadCards.tsx
var import_react4 = require("react");

// packages/ecad/src/client/toolCards.ts
var ECAD_TOOL_NAMES = [
  "ecad_capabilities",
  "ecad_profile",
  "ecad_scan",
  "ecad_open",
  "ecad_overview",
  "ecad_find",
  "ecad_cross_reference",
  "ecad_checks",
  "ecad_render",
  "ecad_compare",
  "ecad_draft_ops",
  "ecad_draft_apply",
  "ecad_draft_discard",
  "ecad_verify",
  "ecad_document",
  "ecad_backup"
];
var LIMIT = 8;
var TEXT_LIMIT = 400;
function recordOf(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function textOf2(value) {
  return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
function numberOf(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function arrayOf(value) {
  return Array.isArray(value) ? value : void 0;
}
function stringsOf(value) {
  return (arrayOf(value) ?? []).filter((entry) => typeof entry === "string" && entry.trim() !== "");
}
function countSum(value) {
  const record = recordOf(value);
  if (record === void 0) return void 0;
  let total = 0;
  for (const entry of Object.values(record)) {
    const count = numberOf(entry);
    if (count === void 0) continue;
    total += count;
  }
  return total;
}
function bounded(text) {
  const trimmed = text.trim();
  return trimmed.length > TEXT_LIMIT ? `${trimmed.slice(0, TEXT_LIMIT - 1)}\u2026` : trimmed;
}
function textOfContent(content) {
  return (content ?? []).flatMap((block) => (block.type === void 0 || block.type === "text") && typeof block.text === "string" ? [block.text] : []).join("\n").trim();
}
function formatOf(data, path) {
  const named = textOf2(data.format) ?? textOf2(data.outputFormat) ?? textOf2(data.sourceFormat);
  if (named === "dwg") return "dwg";
  if (named === "dxf") return "dxf";
  return path !== void 0 && path.toLowerCase().endsWith(".dwg") ? "dwg" : "dxf";
}
function errorOf(record) {
  const error = recordOf(record.error);
  if (error === void 0) return void 0;
  const code = textOf2(error.code);
  const message = textOf2(error.message);
  if (code === void 0 && message === void 0) return void 0;
  const fix = textOf2(error.fix);
  return {
    code: code ?? "ECAD_TOOL_ERROR",
    message: message ?? "",
    ...fix === void 0 ? {} : { fix },
    candidates: stringsOf(error.candidates)
  };
}
function plainCard(summary, text, error) {
  return {
    kind: "generic",
    summary: bounded(summary),
    text: bounded(text),
    fields: [],
    ...error === void 0 ? {} : { error }
  };
}
function scalarFields(data, names) {
  const fields = [];
  for (const name of names) {
    const value = data[name];
    const text = typeof value === "string" ? textOf2(value) : typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "boolean" ? String(value) : void 0;
    if (text === void 0) continue;
    fields.push({ name, value: bounded(text) });
    if (fields.length >= LIMIT) break;
  }
  return fields;
}
function openCardOf(data, summary) {
  if (textOf2(data.path) === void 0 && textOf2(data.modelPath) === void 0 && numberOf(data.entities) === void 0) return void 0;
  const path = textOf2(data.path) ?? textOf2(data.requestedPath);
  const converted = recordOf(data.converted);
  const titleBlock = recordOf(data.titleBlock);
  const titleFields = titleBlock === void 0 ? void 0 : recordOf(titleBlock.fields);
  return {
    kind: "open",
    summary,
    ...path === void 0 ? {} : { path },
    ...textOf2(data.requestedPath) === void 0 ? {} : { requestedPath: textOf2(data.requestedPath) },
    format: formatOf(data, path),
    converted: converted !== void 0,
    dwgWarnings: converted === void 0 ? 0 : stringsOf(converted.warnings).length,
    ...numberOf(data.entities) === void 0 ? {} : { entities: numberOf(data.entities) },
    ...arrayOf(data.layouts) === void 0 ? {} : { layouts: arrayOf(data.layouts).length },
    ...numberOf(data.unsupportedTotal) === void 0 ? {} : { unsupported: numberOf(data.unsupportedTotal) },
    ...numberOf(data.approximate) === void 0 ? {} : { approximate: numberOf(data.approximate) },
    truncated: data.truncated === true,
    titleBlock: titleFields !== void 0 && Object.keys(titleFields).length > 0,
    ...textOf2(data.modelPath) === void 0 ? {} : { modelPath: textOf2(data.modelPath) }
  };
}
function scanCardOf(data, summary) {
  if (textOf2(data.indexPath) === void 0 && numberOf(data.sheets) === void 0) return void 0;
  const formats = recordOf(data.formats);
  const sets = recordOf(data.sets);
  const skipped = arrayOf(data.skipped);
  return {
    kind: "scan",
    summary,
    ...textOf2(data.indexPath) === void 0 ? {} : { indexPath: textOf2(data.indexPath) },
    ...numberOf(data.sheets) === void 0 ? {} : { sheets: numberOf(data.sheets) },
    ...sets === void 0 ? {} : { sets: Object.keys(sets).length },
    formats: {
      dxf: formats === void 0 ? 0 : numberOf(formats.dxf) ?? 0,
      dwg: formats === void 0 ? 0 : numberOf(formats.dwg) ?? 0
    },
    ...numberOf(data.unsupported) === void 0 ? {} : { unsupported: numberOf(data.unsupported) },
    skipped: skipped === void 0 ? 0 : skipped.length,
    truncated: data.truncated === true
  };
}
function checksCardOf(data, summary) {
  const findings = arrayOf(data.findings);
  if (findings === void 0) return void 0;
  const rows = [];
  let critical = 0;
  let warning = 0;
  let info = 0;
  for (const entry of findings) {
    const finding = recordOf(entry);
    if (finding === void 0) continue;
    const severity = textOf2(finding.severity) === "critical" ? "critical" : textOf2(finding.severity) === "warning" ? "warning" : "info";
    if (severity === "critical") critical += 1;
    else if (severity === "warning") warning += 1;
    else info += 1;
    if (rows.length < LIMIT) {
      rows.push({
        rule: textOf2(finding.rule) ?? "ECAD",
        severity,
        message: textOf2(finding.message) ?? "",
        ...textOf2(finding.sheet) === void 0 ? {} : { sheet: textOf2(finding.sheet) }
      });
    }
  }
  return {
    kind: "checks",
    summary,
    total: findings.length,
    critical,
    warning,
    info,
    findings: rows,
    ...textOf2(data.scope) === void 0 ? {} : { scope: textOf2(data.scope) }
  };
}
function crossReferenceCardOf(data, summary) {
  const rows = arrayOf(data.rows);
  if (rows === void 0) return void 0;
  const totals = recordOf(data.totals);
  const byStatus = totals === void 0 ? void 0 : recordOf(totals.byStatus);
  const countStatus = (status) => {
    if (byStatus === void 0) return 0;
    let total = 0;
    for (const [key, value] of Object.entries(byStatus)) {
      if (!key.endsWith(`:${status}`)) continue;
      const count = numberOf(value);
      if (count !== void 0) total += count;
    }
    return total;
  };
  const candidates = [];
  for (const entry of rows) {
    const row = recordOf(entry);
    if (row === void 0) continue;
    const value = textOf2(row.value);
    if (value === void 0) continue;
    if (candidates.length >= LIMIT) break;
    candidates.push({
      value,
      kind: textOf2(row.kind) ?? "candidate",
      status: textOf2(row.status) ?? "ok",
      confidence: numberOf(row.confidence) ?? 0,
      occurrences: numberOf(row.occurrences) ?? 1,
      ...textOf2(row.note) === void 0 ? {} : { note: textOf2(row.note) }
    });
  }
  return {
    kind: "crossReference",
    summary,
    ...numberOf(data.sheets) === void 0 ? {} : { sheets: numberOf(data.sheets) },
    total: rows.length,
    rows: candidates,
    duplicate: countStatus("duplicate"),
    unresolved: countStatus("unresolved"),
    oneSided: countStatus("one-sided")
  };
}
function renderCardOf(data, summary) {
  if (textOf2(data.svgPath) === void 0) return void 0;
  return {
    kind: "render",
    summary,
    ...textOf2(data.path) === void 0 ? {} : { path: textOf2(data.path) },
    ...textOf2(data.layout) === void 0 ? {} : { layout: textOf2(data.layout) },
    ...textOf2(data.svgPath) === void 0 ? {} : { svgPath: textOf2(data.svgPath) },
    ...numberOf(data.characters) === void 0 ? {} : { characters: numberOf(data.characters) },
    ...numberOf(data.entities) === void 0 ? {} : { entities: numberOf(data.entities) },
    supported: numberOf(data.drawn) ?? 0,
    ...numberOf(data.unsupported) === void 0 ? {} : { unsupported: numberOf(data.unsupported) },
    ...numberOf(data.approximate) === void 0 ? {} : { approximate: numberOf(data.approximate) },
    truncated: data.truncated === true
  };
}
function roundTripOf(value) {
  const record = recordOf(value);
  if (record === void 0) return void 0;
  return {
    ok: record.ok === true,
    added: numberOf(record.added) ?? 0,
    removed: numberOf(record.removed) ?? 0,
    changed: numberOf(record.changed) ?? 0,
    ...numberOf(record.hardChanges) === void 0 ? {} : { hardChanges: numberOf(record.hardChanges) },
    ...numberOf(record.metadataChanges) === void 0 ? {} : { metadataChanges: numberOf(record.metadataChanges) },
    warnings: stringsOf(record.warnings).length
  };
}
function applyCardOf(data, summary) {
  const outputPath = textOf2(data.outputPath);
  if (outputPath === void 0) return void 0;
  const verification = recordOf(data.verification);
  const touched = numberOf(data.touched);
  return {
    kind: "apply",
    summary,
    ...textOf2(data.sourcePath) === void 0 ? {} : { sourcePath: textOf2(data.sourcePath) },
    outputPath,
    format: formatOf(data, outputPath),
    changes: countSum(data.changes) ?? 0,
    ...touched === void 0 ? {} : { touched },
    verificationOk: verification !== void 0 && verification.ok === true,
    problems: verification === void 0 ? [] : stringsOf(verification.problems).slice(0, 4),
    notes: verification === void 0 ? 0 : stringsOf(verification.notes).length,
    ...roundTripOf(data.dwgRoundTrip) === void 0 ? {} : { roundTrip: roundTripOf(data.dwgRoundTrip) }
  };
}
function fieldsOf(toolName, data) {
  switch (toolName) {
    case "ecad_compare": {
      const paths = [];
      for (const side of ["a", "b"]) {
        const path = textOf2(recordOf(data[side])?.path);
        if (path !== void 0) paths.push({ name: side, value: path });
      }
      return [...paths, ...scalarFields(data, ["added", "removed", "changed", "truncated"])].slice(0, LIMIT);
    }
    case "ecad_verify":
      return scalarFields(data, ["outputPath", "draftId", "mode", "outputChanged"]);
    case "ecad_capabilities":
      return scalarFields(data, ["engine", "writes", "profileSource", "maxFileBytes"]);
    case "ecad_profile":
      return scalarFields(data, ["path", "source", "sheets"]);
    case "ecad_overview":
      return scalarFields(data, ["sheets", "source", "truncated"]);
    case "ecad_find":
      return scalarFields(data, ["rows", "sheets", "truncated"]);
    case "ecad_draft_ops":
      return scalarFields(data, ["draftId", "ops", "path", "baseVersion"]);
    case "ecad_document":
      return scalarFields(data, ["outputPath", "files", "format"]);
    case "ecad_backup":
      return scalarFields(data, ["outputPath", "files", "format"]);
    default:
      return scalarFields(data, ["path", "outputPath", "sheets", "rows", "drafts", "format", "writes"]);
  }
}
function cardOfValue(toolName, value, text, isError = false) {
  const record = recordOf(value);
  if (record === void 0) {
    return plainCard(text, text, isError ? { code: "ECAD_TOOL_ERROR", message: "", candidates: [] } : void 0);
  }
  const error = errorOf(record);
  if (error !== void 0) return plainCard(error.message === "" ? error.code : error.message, text, error);
  if (isError) return plainCard(text, text, { code: "ECAD_TOOL_ERROR", message: textOf2(record.summary) ?? "", candidates: [] });
  const summary = textOf2(record.summary) ?? bounded(text);
  const data = recordOf(record.data);
  if (data === void 0) return plainCard(summary, text);
  switch (toolName) {
    case "ecad_open": {
      const card = openCardOf(data, summary);
      if (card !== void 0) return card;
      break;
    }
    case "ecad_scan": {
      const card = scanCardOf(data, summary);
      if (card !== void 0) return card;
      break;
    }
    case "ecad_checks": {
      const card = checksCardOf(data, summary);
      if (card !== void 0) return card;
      break;
    }
    case "ecad_cross_reference": {
      const card = crossReferenceCardOf(data, summary);
      if (card !== void 0) return card;
      break;
    }
    case "ecad_render": {
      const card = renderCardOf(data, summary);
      if (card !== void 0) return card;
      break;
    }
    case "ecad_draft_apply": {
      const card = applyCardOf(data, summary);
      if (card !== void 0) return card;
      break;
    }
    default:
      return {
        kind: "generic",
        summary,
        text: bounded(text),
        fields: fieldsOf(toolName, data)
      };
  }
  return plainCard(summary, text);
}
function cardOfContent(toolName, content, isError = false) {
  const text = textOfContent(content);
  if (text === "") {
    return plainCard("", "", isError ? { code: "ECAD_TOOL_ERROR", message: "", candidates: [] } : void 0);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return plainCard(firstLine(text), text, isError ? { code: "ECAD_TOOL_ERROR", message: "", candidates: [] } : void 0);
  }
  return cardOfValue(toolName, value, text, isError);
}
function firstLine(text) {
  const line = text.split("\n").find((entry) => entry.trim() !== "");
  return line === void 0 ? "" : bounded(line);
}
function sheetSetOf(sheetsValue, capabilitiesValue) {
  const sheets = recordOf(sheetsValue);
  const rows = sheets === void 0 ? void 0 : arrayOf(sheets.sheets);
  if (rows === void 0) return void 0;
  let dwg = 0;
  for (const entry of rows) {
    const row = recordOf(entry);
    if (row === void 0) continue;
    const path = textOf2(row.path);
    if (textOf2(row.format) === "dwg" || path !== void 0 && path.toLowerCase().endsWith(".dwg")) dwg += 1;
  }
  const capabilities = recordOf(capabilitiesValue);
  const profileSource = capabilities === void 0 ? void 0 : textOf2(capabilities.profileSource);
  return {
    drawings: rows.length,
    dwg,
    truncated: sheets?.truncated === true,
    ...capabilities === void 0 ? {} : { writes: capabilities.writes === true },
    ...profileSource === void 0 ? {} : { profileConfirmed: profileSource === "workspace" }
  };
}
function sheetSetVisible(set) {
  return set !== void 0 && set.drawings > 0;
}

var css2 = "/* The ECAD conversation surfaces: tool-result cards and the composer dock chip.\n *\n * These sit inside the transcript and the composer, so they follow the host's\n * own card and chip conventions (the schedule card beside them): one bordered\n * surface, 13/20 title, 10/16 tertiary detail, and the alias tokens for every\n * colour, radius, depth and focus ring. Nothing here is a new palette.\n */\n\n._tz6yGZ_card {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  width: 100%;\n  padding: 8px 10px;\n  overflow: hidden;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n}\n\n._tz6yGZ_cardRunning {\n  gap: 2px;\n}\n\n._tz6yGZ_header {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n\n._tz6yGZ_icon {\n  display: grid;\n  flex: none;\n  place-items: center;\n  width: 20px;\n  height: 20px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._tz6yGZ_titleWrap {\n  display: flex;\n  flex: 1 1 auto;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n}\n\n._tz6yGZ_title {\n  overflow: hidden;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._tz6yGZ_summary {\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  line-height: 16px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._tz6yGZ_badges {\n  display: inline-flex;\n  flex: none;\n  flex-wrap: wrap;\n  gap: 4px;\n  justify-content: flex-end;\n  max-width: 60%;\n}\n\n._tz6yGZ_badge {\n  display: inline-flex;\n  align-items: center;\n  box-sizing: border-box;\n  padding: 0 6px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n  line-height: 16px;\n  white-space: nowrap;\n}\n\n._tz6yGZ_badge_warn {\n  border-color: var(--dsw-alias-state-warn-primary);\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n}\n\n._tz6yGZ_badge_error {\n  border-color: var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n._tz6yGZ_badge_success {\n  border-color: var(--dsw-alias-state-success-primary);\n  color: var(--dsw-alias-state-success-primary);\n}\n\n._tz6yGZ_badge_business {\n  border-color: var(--dsw-alias-state-business-primary);\n  color: var(--dsw-alias-state-business-primary);\n}\n\n._tz6yGZ_body {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n  padding-left: 28px;\n}\n\n._tz6yGZ_field {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  min-width: 0;\n  font-size: 11px;\n  line-height: 18px;\n}\n\n._tz6yGZ_fieldWide {\n  flex-direction: column;\n  gap: 0;\n  align-items: stretch;\n}\n\n._tz6yGZ_fieldLabel {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  line-height: 16px;\n}\n\n._tz6yGZ_fieldValue {\n  overflow: hidden;\n  min-width: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 18px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._tz6yGZ_fieldWide ._tz6yGZ_fieldValue {\n  white-space: normal;\n  word-break: break-all;\n}\n\n._tz6yGZ_fieldValueMono {\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 10.5px;\n}\n\n/* Findings and candidates keep one list row per volume; the card never grows\n   into the transcript's own scroll region. */\n\n._tz6yGZ_finding {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  font-size: 11px;\n  line-height: 18px;\n}\n\n._tz6yGZ_severity {\n  flex: none;\n  box-sizing: border-box;\n  padding: 0 4px;\n  border-radius: var(--dsw-radius-xs);\n  font-size: 9.5px;\n  line-height: 15px;\n  text-transform: uppercase;\n}\n\n._tz6yGZ_severity_critical {\n  background: var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-bg-layer-1);\n}\n\n._tz6yGZ_severity_warning {\n  background: var(--dsw-alias-state-warn-primary);\n  color: var(--dsw-alias-bg-layer-1);\n}\n\n._tz6yGZ_severity_info {\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._tz6yGZ_findingRule {\n  flex: none;\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 10px;\n}\n\n._tz6yGZ_findingText {\n  overflow: hidden;\n  min-width: 0;\n  color: var(--dsw-alias-label-primary);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._tz6yGZ_findingSheet {\n  flex: none;\n  overflow: hidden;\n  max-width: 34%;\n  color: var(--dsw-alias-label-tertiary);\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 9.5px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._tz6yGZ_candidate {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  font-size: 11px;\n  line-height: 18px;\n}\n\n._tz6yGZ_candidateValue {\n  flex: none;\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 10.5px;\n}\n\n._tz6yGZ_candidateKind,\n._tz6yGZ_candidateMeta {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n}\n\n._tz6yGZ_candidateStatus {\n  flex: none;\n  box-sizing: border-box;\n  padding: 0 4px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 9.5px;\n  line-height: 15px;\n}\n\n._tz6yGZ_status_duplicate,\n._tz6yGZ_status_oneSided {\n  border-color: var(--dsw-alias-state-warn-primary);\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n}\n\n._tz6yGZ_status_unresolved {\n  border-color: var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n._tz6yGZ_candidateNote {\n  flex-basis: 100%;\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  line-height: 16px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n._tz6yGZ_more,\n._tz6yGZ_scope,\n._tz6yGZ_problem,\n._tz6yGZ_hint,\n._tz6yGZ_runningLabel {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  line-height: 16px;\n}\n\n._tz6yGZ_problem {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n._tz6yGZ_scope {\n  border-top: 0.5px solid var(--dsw-alias-border-l3);\n  margin-top: 2px;\n  padding-top: 4px;\n}\n\n/* The error envelope keeps the code, message and fix readable in one block. */\n\n._tz6yGZ_errorBlock {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 6px 8px;\n  border: 0.5px solid var(--dsw-alias-state-error-primary);\n  border-radius: var(--dsw-radius-xs);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent);\n}\n\n._tz6yGZ_errorHead {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n}\n\n._tz6yGZ_errorCode {\n  flex: none;\n  color: var(--dsw-alias-state-error-primary);\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 10px;\n}\n\n._tz6yGZ_errorText {\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n  line-height: 18px;\n}\n\n._tz6yGZ_errorFix {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  line-height: 16px;\n}\n\n._tz6yGZ_candidateList {\n  margin: 0;\n  padding-left: 16px;\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 10px;\n  line-height: 16px;\n}\n\n._tz6yGZ_actionRow {\n  display: flex;\n  align-items: center;\n  min-height: 24px;\n  padding-top: 2px;\n}\n\n._tz6yGZ_openButton {\n  box-sizing: border-box;\n  min-height: 24px;\n  padding: 2px 8px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 11px;\n  line-height: 18px;\n  cursor: pointer;\n}\n\n._tz6yGZ_openButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n._tz6yGZ_openButton:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n._tz6yGZ_openButton:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n._tz6yGZ_fallback {\n  margin: 0;\n  overflow: hidden;\n  color: var(--dsw-alias-label-tertiary);\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 10px;\n  line-height: 16px;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n/* The composer dock chip: one quiet status line, never a control. */\n\n._tz6yGZ_dockRow {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  box-sizing: border-box;\n  min-width: 0;\n  padding: 0 2px 4px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  line-height: 16px;\n}\n\n._tz6yGZ_dockIcon {\n  display: inline-flex;\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._tz6yGZ_dockChip {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n\n._tz6yGZ_dockChipStrong {\n  flex: none;\n  color: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n._tz6yGZ_dockSep {\n  color: var(--dsw-alias-label-tertiary);\n  opacity: 0.6;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._tz6yGZ_openButton {\n    transition: none;\n  }\n}\n";
var tagId2 = "@aryacode/dsh-engineering-ecad/EcadCards.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId2) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@aryacode/dsh-engineering-ecad";
  tag.dataset.pluginCss = tagId2;
  tag.textContent = css2;
  document.head.appendChild(tag);
}
var classes2 = {
  "card": "_tz6yGZ_card",
  "cardRunning": "_tz6yGZ_cardRunning",
  "header": "_tz6yGZ_header",
  "icon": "_tz6yGZ_icon",
  "titleWrap": "_tz6yGZ_titleWrap",
  "title": "_tz6yGZ_title",
  "summary": "_tz6yGZ_summary",
  "badges": "_tz6yGZ_badges",
  "badge": "_tz6yGZ_badge",
  "badge_warn": "_tz6yGZ_badge_warn",
  "badge_error": "_tz6yGZ_badge_error",
  "badge_success": "_tz6yGZ_badge_success",
  "badge_business": "_tz6yGZ_badge_business",
  "body": "_tz6yGZ_body",
  "field": "_tz6yGZ_field",
  "fieldWide": "_tz6yGZ_fieldWide",
  "fieldLabel": "_tz6yGZ_fieldLabel",
  "fieldValue": "_tz6yGZ_fieldValue",
  "fieldValueMono": "_tz6yGZ_fieldValueMono",
  "finding": "_tz6yGZ_finding",
  "severity": "_tz6yGZ_severity",
  "severity_critical": "_tz6yGZ_severity_critical",
  "severity_warning": "_tz6yGZ_severity_warning",
  "severity_info": "_tz6yGZ_severity_info",
  "findingRule": "_tz6yGZ_findingRule",
  "findingText": "_tz6yGZ_findingText",
  "findingSheet": "_tz6yGZ_findingSheet",
  "candidate": "_tz6yGZ_candidate",
  "candidateValue": "_tz6yGZ_candidateValue",
  "candidateKind": "_tz6yGZ_candidateKind",
  "candidateMeta": "_tz6yGZ_candidateMeta",
  "candidateStatus": "_tz6yGZ_candidateStatus",
  "status_duplicate": "_tz6yGZ_status_duplicate",
  "status_oneSided": "_tz6yGZ_status_oneSided",
  "status_unresolved": "_tz6yGZ_status_unresolved",
  "candidateNote": "_tz6yGZ_candidateNote",
  "more": "_tz6yGZ_more",
  "scope": "_tz6yGZ_scope",
  "problem": "_tz6yGZ_problem",
  "hint": "_tz6yGZ_hint",
  "runningLabel": "_tz6yGZ_runningLabel",
  "errorBlock": "_tz6yGZ_errorBlock",
  "errorHead": "_tz6yGZ_errorHead",
  "errorCode": "_tz6yGZ_errorCode",
  "errorText": "_tz6yGZ_errorText",
  "errorFix": "_tz6yGZ_errorFix",
  "candidateList": "_tz6yGZ_candidateList",
  "actionRow": "_tz6yGZ_actionRow",
  "openButton": "_tz6yGZ_openButton",
  "fallback": "_tz6yGZ_fallback",
  "dockRow": "_tz6yGZ_dockRow",
  "dockIcon": "_tz6yGZ_dockIcon",
  "dockChip": "_tz6yGZ_dockChip",
  "dockChipStrong": "_tz6yGZ_dockChipStrong",
  "dockSep": "_tz6yGZ_dockSep"
};
var EcadCards_default = classes2;

// packages/ecad/src/client/EcadCards.tsx
function recordOf2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function contentOf(block) {
  const content = recordOf2(block)?.content;
  return Array.isArray(content) ? content : void 0;
}
function DrawingIcon() {
  return (0, import_react4.createElement)(
    "svg",
    { viewBox: "0 0 16 16", width: 14, height: 14, "aria-hidden": "true", focusable: "false" },
    (0, import_react4.createElement)("path", {
      d: "M3.5 2h6l3 3v9h-9z",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.2,
      strokeLinejoin: "round"
    }),
    (0, import_react4.createElement)("path", { d: "M6 6.5h4M6 8.5h4M6 10.5h2.5", stroke: "currentColor", strokeWidth: 1, strokeLinecap: "round" })
  );
}
var TONE_CLASS = {
  warn: EcadCards_default.badge_warn,
  error: EcadCards_default.badge_error,
  success: EcadCards_default.badge_success,
  business: EcadCards_default.badge_business
};
function badge(t, text, tone) {
  const toneClass = tone === void 0 ? "" : ` ${TONE_CLASS[tone] ?? ""}`;
  return (0, import_react4.createElement)("span", { className: `${EcadCards_default.badge}${toneClass}` }, text);
}
function field(label, value, options) {
  const valueClass = options?.mono === true ? ` ${EcadCards_default.fieldValueMono}` : "";
  const classes3 = options?.wide === true ? `${EcadCards_default.field} ${EcadCards_default.fieldWide}` : EcadCards_default.field;
  return (0, import_react4.createElement)(
    "div",
    { className: classes3 },
    (0, import_react4.createElement)("span", { className: EcadCards_default.fieldLabel }, label),
    (0, import_react4.createElement)("span", { className: `${EcadCards_default.fieldValue}${valueClass}`, title: value }, value)
  );
}
function header(title, summary, badges) {
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.header },
    (0, import_react4.createElement)("span", { className: EcadCards_default.icon }, (0, import_react4.createElement)(DrawingIcon, {})),
    (0, import_react4.createElement)(
      "span",
      { className: EcadCards_default.titleWrap },
      (0, import_react4.createElement)("span", { className: EcadCards_default.title }, title),
      summary === "" ? null : (0, import_react4.createElement)("span", { className: EcadCards_default.summary, title: summary }, summary)
    ),
    badges.length === 0 ? null : (0, import_react4.createElement)("span", { className: EcadCards_default.badges }, ...badges)
  );
}
function body(children) {
  return (0, import_react4.createElement)("div", { className: EcadCards_default.body }, ...children.filter((entry) => entry !== null));
}
function openAction(t, path, openFile, written = false) {
  if (path === void 0) return null;
  const label = written ? t("cardOpenWritten") : t("cardOpenDrawing");
  const onOpen = openFile;
  if (onOpen === void 0 || typeof onOpen !== "function") {
    return (0, import_react4.createElement)("div", { className: EcadCards_default.actionRow }, (0, import_react4.createElement)("span", { className: EcadCards_default.hint }, t("cardOpenHint", { path })));
  }
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.actionRow },
    (0, import_react4.createElement)("button", {
      type: "button",
      className: EcadCards_default.openButton,
      onClick: () => {
        try {
          onOpen(path);
        } catch {
        }
      }
    }, label)
  );
}
function errorBlock(error, t) {
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.errorBlock, role: "alert" },
    (0, import_react4.createElement)(
      "div",
      { className: EcadCards_default.errorHead },
      (0, import_react4.createElement)("span", { className: EcadCards_default.errorCode }, error.code),
      (0, import_react4.createElement)("span", { className: EcadCards_default.errorText }, error.message === "" ? t("cardToolError") : error.message)
    ),
    error.fix === void 0 ? null : (0, import_react4.createElement)("div", { className: EcadCards_default.errorFix }, error.fix),
    error.candidates.length === 0 ? null : (0, import_react4.createElement)("ul", { className: EcadCards_default.candidateList }, ...error.candidates.map((candidate, index) => (0, import_react4.createElement)("li", { key: `${index}-${candidate}`, className: EcadCards_default.candidateValue }, candidate)))
  );
}
function severityLabel(t, severity) {
  return severity === "critical" ? t("cardCritical") : severity === "warning" ? t("cardWarning") : t("cardInfo");
}
var SEVERITY_CLASS = {
  critical: EcadCards_default.severity_critical,
  warning: EcadCards_default.severity_warning,
  info: EcadCards_default.severity_info
};
var CANDIDATE_STATUS_CLASS = {
  ok: "",
  duplicate: EcadCards_default.status_duplicate,
  "one-sided": EcadCards_default.status_oneSided,
  unresolved: EcadCards_default.status_unresolved
};
function checksBody(card, t) {
  return [
    ...card.findings.map((finding, index) => (0, import_react4.createElement)(
      "div",
      { key: `${index}-${finding.rule}-${finding.message}`, className: EcadCards_default.finding },
      (0, import_react4.createElement)("span", { className: `${EcadCards_default.severity} ${SEVERITY_CLASS[finding.severity]}` }, severityLabel(t, finding.severity)),
      (0, import_react4.createElement)("span", { className: EcadCards_default.findingRule }, finding.rule),
      (0, import_react4.createElement)("span", { className: EcadCards_default.findingText, title: finding.message }, finding.message),
      finding.sheet === void 0 ? null : (0, import_react4.createElement)("span", { className: EcadCards_default.findingSheet, title: finding.sheet }, finding.sheet)
    )),
    card.total > card.findings.length ? (0, import_react4.createElement)("div", { className: EcadCards_default.more }, t("cardMoreFindings", { count: card.total - card.findings.length })) : null,
    card.scope === void 0 ? null : (0, import_react4.createElement)("div", { className: EcadCards_default.scope }, card.scope)
  ];
}
function crossReferenceBody(card, t) {
  return [
    ...card.rows.map((row, index) => (0, import_react4.createElement)(
      "div",
      { key: `${index}-${row.kind}-${row.value}`, className: EcadCards_default.candidate },
      (0, import_react4.createElement)("span", { className: EcadCards_default.candidateValue, title: row.value }, row.value),
      (0, import_react4.createElement)("span", { className: EcadCards_default.candidateKind }, row.kind),
      (0, import_react4.createElement)("span", { className: `${EcadCards_default.candidateStatus} ${CANDIDATE_STATUS_CLASS[row.status] ?? ""}` }, row.status),
      (0, import_react4.createElement)("span", { className: EcadCards_default.candidateMeta }, `${t("cardConfidence")} ${Math.round(row.confidence * 100)}%`),
      (0, import_react4.createElement)("span", { className: EcadCards_default.candidateMeta }, t("cardOccurrences", { count: row.occurrences })),
      row.note === void 0 ? null : (0, import_react4.createElement)("span", { className: EcadCards_default.candidateNote }, row.note)
    )),
    card.total > card.rows.length ? (0, import_react4.createElement)("div", { className: EcadCards_default.more }, t("cardMoreCandidates", { count: card.total - card.rows.length })) : null
  ];
}
function openCardView(card, t, openFile) {
  const badges = [badge(t, card.format.toUpperCase(), "business")];
  if (card.converted) badges.push(badge(t, card.dwgWarnings === 0 ? t("cardDwgConverted") : t("cardDwgWarnings", { count: card.dwgWarnings }), card.dwgWarnings === 0 ? "business" : "warn"));
  if (card.truncated) badges.push(badge(t, t("cardTruncated"), "warn"));
  const rows = [
    card.path === void 0 ? null : field(t("cardDrawing"), card.path, { wide: true, mono: true }),
    card.entities === void 0 ? null : field(t("cardEntities"), String(card.entities)),
    card.layouts === void 0 ? null : field(t("cardLayouts"), String(card.layouts)),
    card.unsupported === void 0 ? null : field(t("cardUnsupported"), String(card.unsupported)),
    card.approximate === void 0 ? null : field(t("cardApproximate"), String(card.approximate)),
    card.titleBlock ? field(t("cardTitleBlock"), t("cardTitleBlockRead")) : null,
    openAction(t, card.path, openFile)
  ];
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.card, "data-ecad-card": "open", "data-tool": "ecad_open" },
    header(t("cardTitleOpen"), card.summary, badges),
    body(rows)
  );
}
function scanCardView(card, t, openFile) {
  const badges = [];
  if (card.truncated) badges.push(badge(t, t("cardTruncated"), "warn"));
  const formats = t("cardFormats", { dxf: card.formats.dxf, dwg: card.formats.dwg });
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.card, "data-ecad-card": "scan", "data-tool": "ecad_scan" },
    header(t("cardTitleScan"), card.summary, badges),
    body([
      card.indexPath === void 0 ? null : field(t("cardIndex"), card.indexPath, { wide: true, mono: true }),
      card.sheets === void 0 ? null : field(t("cardSheets"), String(card.sheets)),
      card.sets === void 0 ? null : field(t("cardSets"), String(card.sets)),
      field(t("cardFormatsLabel"), formats),
      card.unsupported === void 0 ? null : field(t("cardUnsupported"), String(card.unsupported)),
      card.skipped > 0 ? field(t("cardSkipped"), String(card.skipped)) : null,
      card.indexPath === void 0 ? null : openAction(t, card.indexPath, openFile)
    ])
  );
}
function checksCardView(card, t) {
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.card, "data-ecad-card": "checks", "data-tool": "ecad_checks" },
    header(t("cardTitleChecks"), card.summary, [
      badge(t, t("cardCriticalCount", { count: card.critical }), card.critical > 0 ? "error" : void 0),
      badge(t, t("cardWarningCount", { count: card.warning }), card.warning > 0 ? "warn" : void 0),
      badge(t, t("cardInfoCount", { count: card.info }))
    ]),
    body(checksBody(card, t))
  );
}
function crossReferenceCardView(card, t) {
  const badges = [];
  if (card.duplicate > 0) badges.push(badge(t, t("cardDuplicateCount", { count: card.duplicate }), "warn"));
  if (card.unresolved > 0) badges.push(badge(t, t("cardUnresolvedCount", { count: card.unresolved }), "warn"));
  if (card.oneSided > 0) badges.push(badge(t, t("cardOneSidedCount", { count: card.oneSided })));
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.card, "data-ecad-card": "crossReference", "data-tool": "ecad_cross_reference" },
    header(t("cardTitleCrossReference"), card.summary, badges),
    body(crossReferenceBody(card, t))
  );
}
function renderCardView(card, t) {
  const size = card.characters === void 0 ? void 0 : `${Math.max(1, Math.round(card.characters / 1024))} KB`;
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.card, "data-ecad-card": "render", "data-tool": "ecad_render" },
    header(t("cardTitleRender"), card.summary, [
      ...card.truncated ? [badge(t, t("cardTruncated"), "warn")] : []
    ]),
    body([
      card.path === void 0 ? null : field(t("cardDrawing"), card.path, { wide: true, mono: true }),
      card.layout === void 0 ? null : field(t("cardLayout"), card.layout),
      card.svgPath === void 0 ? null : field(t("cardSvg"), card.svgPath, { wide: true, mono: true }),
      card.entities === void 0 ? null : field(t("cardDrawn"), `${card.supported} / ${card.entities}`),
      size === void 0 ? null : field(t("cardSize"), size),
      card.unsupported === void 0 ? null : field(t("cardUnsupported"), String(card.unsupported)),
      card.approximate === void 0 ? null : field(t("cardApproximate"), String(card.approximate)),
      (0, import_react4.createElement)("div", { className: EcadCards_default.actionRow }, (0, import_react4.createElement)("span", { className: EcadCards_default.hint }, t("cardRenderHint")))
    ])
  );
}
function roundTripRows(card, t) {
  const trip = card.roundTrip;
  if (trip === void 0) return [];
  const rows = [
    field(t("cardRoundTrip"), trip.ok ? t("cardRoundTripOk") : t("cardRoundTripDiff", { added: trip.added, removed: trip.removed, changed: trip.changed }))
  ];
  if (trip.hardChanges !== void 0 && trip.hardChanges > 0) rows.push(field(t("cardRoundTripHard"), String(trip.hardChanges)));
  if (trip.metadataChanges !== void 0 && trip.metadataChanges > 0) rows.push(field(t("cardRoundTripMetadata"), String(trip.metadataChanges)));
  if (trip.warnings > 0) rows.push(field(t("cardRoundTripWarnings"), String(trip.warnings)));
  return rows;
}
function applyCardView(card, t, openFile) {
  const rows = [
    card.outputPath === void 0 ? null : field(t("cardOutput"), card.outputPath, { wide: true, mono: true }),
    card.sourcePath === void 0 ? null : field(t("cardSource"), card.sourcePath, { wide: true, mono: true }),
    field(t("cardFormat"), card.format.toUpperCase()),
    field(t("cardChanges"), String(card.changes)),
    card.touched === void 0 ? null : field(t("cardTouched"), String(card.touched)),
    ...roundTripRows(card, t),
    ...card.problems.map((problem, index) => (0, import_react4.createElement)("div", { key: `problem-${index}`, className: EcadCards_default.problem }, problem)),
    openAction(t, card.outputPath, openFile, true)
  ];
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.card, "data-ecad-card": "apply", "data-tool": "ecad_draft_apply" },
    header(t("cardTitleApply"), card.summary, [
      badge(t, card.verificationOk ? t("cardVerified") : t("cardNotVerified"), card.verificationOk ? "success" : "error"),
      badge(t, card.format.toUpperCase(), "business")
    ]),
    body(rows)
  );
}
function genericCardView(card, toolName, t) {
  const title = toolName === "" ? t("cardTitleTool", { tool: "ECAD" }) : t("cardTitleTool", { tool: toolName });
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.card, "data-ecad-card": "generic", "data-tool": toolName },
    header(title, card.summary, []),
    body([
      card.error === void 0 ? null : errorBlock(card.error, t),
      ...card.fields.map((entry, index) => (0, import_react4.createElement)(
        "div",
        { key: `${index}-${entry.name}`, className: EcadCards_default.field },
        (0, import_react4.createElement)("span", { className: EcadCards_default.fieldLabel }, entry.name),
        (0, import_react4.createElement)("span", { className: `${EcadCards_default.fieldValue} ${EcadCards_default.fieldValueMono}`, title: entry.value }, entry.value)
      )),
      card.error === void 0 && card.fields.length === 0 && card.text !== "" ? (0, import_react4.createElement)("pre", { className: EcadCards_default.fallback }, card.text) : null
    ])
  );
}
function cardView(card, toolName, t, openFile) {
  switch (card.kind) {
    case "open":
      return openCardView(card, t, openFile);
    case "scan":
      return scanCardView(card, t, openFile);
    case "checks":
      return checksCardView(card, t);
    case "crossReference":
      return crossReferenceCardView(card, t);
    case "render":
      return renderCardView(card, t);
    case "apply":
      return applyCardView(card, t, openFile);
    case "generic":
      return genericCardView(card, toolName, t);
  }
}
function EcadToolCardView({ t, toolName, phase, block, openFile }) {
  const name = toolName ?? "";
  if (phase !== "result") {
    const title = t(titleKeyOf(name), { tool: name });
    return (0, import_react4.createElement)(
      "div",
      { className: `${EcadCards_default.card} ${EcadCards_default.cardRunning}`, "data-ecad-card": "running", "data-tool": name },
      header(title, "", []),
      (0, import_react4.createElement)("div", { className: EcadCards_default.runningLabel }, t(phase === "preparing" ? "cardPreparing" : "cardRunning"))
    );
  }
  const card = cardOfContent(name, contentOf(block), recordOf2(block)?.isError === true);
  return cardView(card, name, t, openFile);
}
function titleKeyOf(toolName) {
  switch (toolName) {
    case "ecad_open":
      return "cardTitleOpen";
    case "ecad_scan":
      return "cardTitleScan";
    case "ecad_checks":
      return "cardTitleChecks";
    case "ecad_cross_reference":
      return "cardTitleCrossReference";
    case "ecad_render":
      return "cardTitleRender";
    case "ecad_draft_apply":
      return "cardTitleApply";
    default:
      return "cardTitleTool";
  }
}
function EcadSheetDock({ t, session, readSheetSet }) {
  const sessionId = typeof session?.sessionId === "string" && session.sessionId !== "" ? session.sessionId : void 0;
  const [set, setSet] = (0, import_react4.useState)(void 0);
  const readerRef = (0, import_react4.useRef)(readSheetSet);
  readerRef.current = readSheetSet;
  (0, import_react4.useEffect)(() => {
    setSet(void 0);
    if (sessionId === void 0) return;
    const reader = readerRef.current;
    if (reader === void 0) return;
    let live = true;
    void Promise.resolve().then(() => reader(sessionId)).then((value) => {
      if (live) setSet(value);
    }).catch(() => {
      if (live) setSet(void 0);
    });
    return () => {
      live = false;
    };
  }, [sessionId]);
  if (!sheetSetVisible(set)) return null;
  const chips = [
    (0, import_react4.createElement)("span", { key: "drawings", className: EcadCards_default.dockChipStrong }, t("dockDrawings", { count: set.drawings }))
  ];
  if (set.dwg > 0) chips.push((0, import_react4.createElement)("span", { key: "dwg", className: EcadCards_default.dockChip }, t("dockDwg", { count: set.dwg })));
  if (set.profileConfirmed !== void 0) {
    chips.push((0, import_react4.createElement)("span", { key: "profile", className: EcadCards_default.dockChip }, set.profileConfirmed ? t("dockProfileConfirmed") : t("dockProfileDefault")));
  }
  if (set.writes !== void 0) {
    chips.push((0, import_react4.createElement)("span", { key: "writes", className: EcadCards_default.dockChip }, set.writes ? t("dockWritesOn") : t("dockWritesOff")));
  }
  if (set.truncated) chips.push((0, import_react4.createElement)("span", { key: "truncated", className: EcadCards_default.dockChip }, t("cardTruncated")));
  const label = t("dockLabel", { count: set.drawings, dwg: set.dwg });
  return (0, import_react4.createElement)(
    "div",
    { className: EcadCards_default.dockRow, "data-ecad-dock": "sheet-set", "aria-label": label, title: label },
    (0, import_react4.createElement)("span", { className: EcadCards_default.dockIcon, "aria-hidden": "true" }, (0, import_react4.createElement)(DrawingIcon, {})),
    ...chips.flatMap((chip, index) => index === 0 ? [chip] : [(0, import_react4.createElement)("span", { key: `sep-${index}`, className: EcadCards_default.dockSep, "aria-hidden": "true" }, "\xB7"), chip])
  );
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
  askSelection: "Review the {count} selected entities ({ids}; kinds {kinds}; layers {layers}) in the {format} drawing at {path} and tell me what needs an engineer.",
  fit: "Fit",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  panels: "Show or hide the drawing panels",
  panHint: "Middle-drag or Space+drag to pan \xB7 wheel to zoom \xB7 left-drag selects",
  keyboardHint: "Arrow keys pan, + and \u2212 zoom, F3 snaps, F7 grid, F8 ortho, Delete erases the selection, Ctrl+Z undoes, Ctrl+Y redoes, Escape cancels.",
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
  opRotate: "Rotate",
  opDraw: "Draw",
  opModify: "Modify",
  opLayer: "Layer",
  opProperty: "Property",
  stageDrawSummary: "{op} \xB7 {count} points",
  stageRotateSummary: "Rotate {count} entities by {angle}\xB0",
  stageCopySummary: "Copy {count} entities by {dx}, {dy}",
  stageModifySummary: "{op} \xB7 {count} entities",
  stageOffsetSummary: "Offset {id} by {distance}",
  stageGripSummary: "{op} \xB7 {id}",
  stageSetterSummary: "{op} \xB7 {id}",
  stageColorSummary: "Set colour {color} on {count} entities",
  stageLayerSummary: "{op} \xB7 {name}",
  stagePropertySummary: "{op} \xB7 {id}",
  stageBlockSummary: "Block {block} at {point}",
  draftLayerOps: "This draft includes layer-table changes.",
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
  changes: "Changes",
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
  roundTripHardChanges: "{count} real model changes",
  roundTripMetadataChanges: "{count} metadata-only changes",
  roundTripTruncated: "The round-trip comparison was truncated.",
  roundTripWarnings: "{count} converter warnings",
  moveAction: "Stage move",
  moveDx: "Move X",
  moveDy: "Move Y",
  eraseAction: "Stage erase",
  editEntityHint: "Edits move and erase the entity as the drawing stores it.",
  editFlattened: "This entity comes from a block definition and cannot be edited in place.",
  editNoEntity: "Select an entity to move or erase it.",
  draftLayoutHint: "Changes target the {layout} layout.",
  cardTitleOpen: "Drawing opened",
  cardTitleScan: "Workspace indexed",
  cardTitleChecks: "Review findings",
  cardTitleCrossReference: "Cross-reference candidates",
  cardTitleRender: "Drawing rendered",
  cardTitleApply: "Drawing written",
  cardTitleTool: "{tool} result",
  cardPreparing: "Preparing call\u2026",
  cardRunning: "Running\u2026",
  cardToolError: "The tool reported an error.",
  cardOpenDrawing: "Open drawing",
  cardOpenWritten: "Open written drawing",
  cardOpenHint: "Open {path} from the drawing panel.",
  cardDrawing: "Drawing",
  cardFormat: "Format",
  cardEntities: "Entities",
  cardLayouts: "Layouts",
  cardUnsupported: "Unsupported",
  cardApproximate: "Approximate",
  cardTitleBlock: "Title block",
  cardTitleBlockRead: "read",
  cardTruncated: "truncated",
  cardDwgConverted: "DWG converted",
  cardDwgWarnings: "{count} conversion warnings",
  cardIndex: "Index",
  cardSheets: "Drawings",
  cardSets: "Sheet sets",
  cardSkipped: "Skipped",
  cardFormatsLabel: "Formats",
  cardFormats: "{dxf} DXF \xB7 {dwg} DWG",
  cardCritical: "critical",
  cardWarning: "warning",
  cardInfo: "info",
  cardCriticalCount: "{count} critical",
  cardWarningCount: "{count} warnings",
  cardInfoCount: "{count} info",
  cardMoreFindings: "{count} more findings",
  cardMoreCandidates: "{count} more candidates",
  cardConfidence: "confidence",
  cardOccurrences: "{count}\xD7",
  cardDuplicateCount: "{count} duplicate",
  cardUnresolvedCount: "{count} unresolved",
  cardOneSidedCount: "{count} one-sided",
  cardLayout: "Layout",
  cardSvg: "SVG",
  cardDrawn: "Drawn / total",
  cardSize: "Size",
  cardRenderHint: "The SVG is written under .ecad/renders and opens in a browser.",
  cardOutput: "Output",
  cardSource: "Source",
  cardChanges: "Changes",
  cardTouched: "Entities touched",
  cardVerified: "verified",
  cardNotVerified: "not verified",
  cardRoundTrip: "DWG round trip",
  cardRoundTripOk: "matched",
  cardRoundTripDiff: "{added} added \xB7 {removed} removed \xB7 {changed} changed",
  cardRoundTripHard: "{count} hard changes",
  cardRoundTripMetadata: "{count} metadata-only",
  cardRoundTripWarnings: "{count} converter warnings",
  dockDrawings: "{count} drawings",
  dockDwg: "{count} DWG",
  dockProfileConfirmed: "profile confirmed",
  dockProfileDefault: "default profile",
  dockWritesOn: "writes on",
  dockWritesOff: "writes off",
  dockLabel: "Workspace drawings: {count}, {dwg} DWG",
  // -- CAD workspace --------------------------------------------------------
  toolPalette: "Drawing tools",
  toolGroupView: "View",
  toolGroupDraw: "Draw",
  toolGroupModify: "Modify",
  toolSelect: "Select",
  toolSelectHint: "Click to select, Shift to add, Ctrl to toggle; drag on empty space for a window or crossing selection.",
  toolPan: "Pan",
  toolPanHint: "Drag to pan the sheet.",
  toolZoomWindow: "Zoom window",
  toolZoomWindowHint: "Drag a window to zoom into it.",
  toolLine: "Line",
  toolLineHint: "Pick the start, then each next point; Enter or Escape ends the chain.",
  toolPolyline: "Polyline",
  toolPolylineHint: "Pick points; Enter or double-click finishes, Escape cancels.",
  toolRectangle: "Rectangle",
  toolRectangleHint: "Pick two opposite corners.",
  toolCircle: "Circle",
  toolCircleHint: "Pick the centre, then a point on the rim or type the radius.",
  toolArc: "Arc",
  toolArcHint: "Pick the start, a point on the arc, then the end.",
  toolRevisionCloud: "Revision cloud",
  toolRevisionCloudHint: "Pick the cloud points; Enter or double-click finishes.",
  toolLeader: "Leader",
  toolLeaderHint: "Pick the arrow point and the elbow points; Enter or double-click finishes.",
  toolText: "Text",
  toolTextHint: "Click the sheet, then fill in the annotation.",
  toolBlock: "Block insert",
  toolBlockHint: "Click the sheet, then choose a block from the drawing.",
  toolMove: "Move",
  toolMoveHint: "Pick a base point, then the destination, or type a distance.",
  toolCopy: "Copy",
  toolCopyHint: "Pick a base point, then the destination, or type a distance.",
  toolRotate: "Rotate",
  toolRotateHint: "Pick the rotation centre, then type an angle or pick a direction.",
  toolScale: "Scale",
  toolScaleHint: "Pick the base point, then type the scale factor.",
  toolMirror: "Mirror",
  toolMirrorHint: "Pick two points on the mirror line.",
  toolOffset: "Offset",
  toolOffsetHint: "Pick the side, then type the offset distance.",
  toolTrim: "Trim",
  toolTrimHint: "Click the entity to trim.",
  toolExtend: "Extend",
  toolExtendHint: "Click the entity to extend.",
  toolErase: "Erase",
  toolEraseHint: "Click an entity to erase it; Delete erases the selection.",
  toolShortcut: "Shortcut {key}",
  commandBarLabel: "Command",
  commandActive: "{tool} \xB7 {hint}",
  commandFinishHint: "Enter or double-click finishes \xB7 Esc cancels \xB7 F3 snaps \xB7 F8 ortho.",
  commandNumericLabelRadius: "Radius",
  commandNumericLabelAngle: "Angle (\xB0)",
  commandNumericLabelDistance: "Distance",
  commandNumericLabelFactor: "Factor",
  commandNumericPlaceholder: "Type a value",
  commandNumericApply: "Apply value",
  commandCancel: "Cancel",
  commandNeedsSelection: "Select at least one entity first.",
  commandNeedsBlock: "Choose a block to insert.",
  commandNeedsPoints: "Pick at least {count} points.",
  commandNeedsPoint: "Pick a point first.",
  commandNeedsRadius: "Pick a point or type a positive radius.",
  commandNeedsDistance: "Type a positive distance.",
  commandInvalidNumber: "Enter a positive number.",
  commandArcCollinear: "Those three points are collinear; pick a third point off the line.",
  commandUnknown: "That command is not available.",
  commandNoNumeric: "This command does not take a typed value.",
  commandTrimNeedsBoundary: "Select the boundary line first, then click the line to trim or extend.",
  commandTrimSame: "The trim target and its boundary must be different lines.",
  engineOpPending: "The {op} operation is wired in this face but the pinned ECAD engine does not accept it yet; nothing was staged.",
  undo: "Undo",
  redo: "Redo",
  undoHint: "Undo the last staged change (Ctrl+Z)",
  redoHint: "Redo the last undone change (Ctrl+Y)",
  selectionCount: "{count} selected",
  selectionNone: "No selection",
  selectAll: "Select all",
  selectAllHint: "Select every visible entity (Ctrl+A)",
  drawingAids: "Drawing aids",
  osnap: "Object snap",
  osnapHint: "Object snap (F3)",
  orthoHint: "Orthogonal drawing (F8)",
  gridHint: "Grid (F7)",
  statusBarLabel: "Drawing status",
  statusCoordinates: "X {x} \xB7 Y {y}",
  statusNoCoordinates: "X \u2014 \xB7 Y \u2014",
  statusSheet: "{width} \xD7 {height} {unit}",
  statusSnap: "snap {kind}",
  statusOsnap: "OSNAP",
  statusOrtho: "ORTHO",
  statusGrid: "GRID",
  snapEndpoint: "Endpoint",
  snapIntersection: "Intersection",
  snapMidpoint: "Midpoint",
  snapCenter: "Center",
  snapNearest: "Nearest",
  snapGrid: "Grid",
  marqueeWindowLabel: "Window selection",
  marqueeCrossingLabel: "Crossing selection",
  gripDragHint: "Drag a grip to edit that point; the whole entity never moves from a grip.",
  gripOpPending: "Grip moved but nothing was staged: the {op} engine operation is not available yet.",
  gripMoveStaged: "Insertion point moved by {dx}, {dy}.",
  contextMenuLabel: "Drawing menu",
  menuZoomExtents: "Zoom extents",
  menuZoomWindow: "Zoom window",
  menuMove: "Move",
  menuCopy: "Copy",
  menuErase: "Erase",
  menuProperties: "Properties",
  menuAskSelection: "Ask about selection",
  menuPrint: "Print",
  menuExportSvg: "Export SVG",
  properties: "Properties",
  propertiesHint: "Select an entity to edit its text, layer or attribute.",
  propertiesHintMulti: "{count} entities selected. Choose a layer to stage a bulk change, or erase the selection.",
  propertiesMixedKind: "Mixed kinds",
  propertiesMixedLayer: "Mixed layers",
  propertiesTextApply: "Stage text",
  propertiesLayerApply: "Stage layer",
  propertiesColor: "Entity colour",
  propertiesColorApply: "Stage colour",
  propertiesColorPlaceholder: "ACI 1\u2013255",
  propertiesColorHint: "An ACI colour index from 1 to 255. ByBlock (0) and ByLayer (256) are not settable values.",
  propertiesColorInvalid: "Enter a whole ACI colour from 1 to 255.",
  propertiesMoveApply: "Stage move",
  propertiesRotateApply: "Stage rotate",
  propertiesDelete: "Stage erase",
  propertiesAttributeTitle: "Block attribute",
  propertiesAttributeHint: "The sheet model does not carry attribute tag names; type the tag as the drawing stores it.",
  propertiesTag: "Tag",
  propertiesValue: "Value",
  propertiesAttributeApply: "Stage attribute",
  propertiesAsk: "Ask about selection",
  propertiesClear: "Clear selection",
  layersCurrent: "Current layer",
  layerMakeCurrent: "Draw on layer {layer}",
  layerCurrentBadge: "current",
  layerLock: "Lock layer {layer}",
  layerUnlock: "Unlock layer {layer}",
  layerEdit: "Edit layer {layer}",
  layerCreate: "New layer",
  layerCreateApply: "Stage new layer",
  layerName: "Name",
  layerColor: "Colour index",
  layerRenameApply: "Stage rename",
  layerColorApply: "Stage colour",
  layerHideAll: "Hide every layer",
  layerReadOnlyHint: "Layer visibility and the current layer are local; creating or renaming a layer needs writes enabled.",
  layerOpPending: "Engine operation {op} is not available yet; nothing was staged.",
  layerInvalidName: 'A layer name cannot be empty or contain the characters < > / \\ " : ; ? * | , = `',
  layerColorInvalid: "The colour index must be a whole number from 1 to 255.",
  print: "Print",
  printHint: "Print the current sheet view",
  printHeader: "{path} \xB7 {layout}",
  printFooter: "{format} \xB7 {width} \xD7 {height} {unit} \xB7 {selection}",
  exportSvg: "Export SVG",
  exportSvgHint: "Download the current sheet view as an SVG drawing",
  exportPng: "Export PNG",
  exportPngHint: "Download the current sheet view as a PNG image",
  exportSvgTitle: "{path} \xB7 {layout}",
  exportFailed: "The drawing could not be exported in this browser.",
  exportName: "{name}-{layout}",
  zoomExtents: "Zoom extents",
  zoomExtentsHint: "Frame the whole sheet",
  blockPlacementTitle: "Insert block at {point}",
  blockPlacementLabel: "Block",
  blockRotation: "Rotation (\xB0)",
  blockScale: "Scale",
  stageBlockPlacement: "Stage block insert",
  noBlocks: "This drawing carries no block definitions."
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
  askSelection: "\u8BF7\u5BA1\u9605\u4F4D\u4E8E {path} \u7684 {format} \u56FE\u7EB8\u4E2D\u9009\u4E2D\u7684 {count} \u4E2A\u56FE\u5143\uFF08{ids}\uFF1B\u7C7B\u578B {kinds}\uFF1B\u56FE\u5C42 {layers}\uFF09\uFF0C\u5E76\u544A\u8BC9\u6211\u54EA\u4E9B\u9700\u8981\u5DE5\u7A0B\u5E08\u5904\u7406\u3002",
  fit: "\u9002\u5E94",
  zoomIn: "\u653E\u5927",
  zoomOut: "\u7F29\u5C0F",
  panels: "\u663E\u793A\u6216\u9690\u85CF\u56FE\u7EB8\u9762\u677F",
  panHint: "\u6309\u4F4F\u4E2D\u952E\u6216\u7A7A\u683C+\u5DE6\u952E\u5E73\u79FB \xB7 \u6EDA\u8F6E\u7F29\u653E \xB7 \u5DE6\u952E\u62D6\u52A8\u9009\u62E9",
  keyboardHint: "\u65B9\u5411\u952E\u5E73\u79FB\uFF0C+ \u548C \u2212 \u7F29\u653E\uFF0CF3 \u5BF9\u8C61\u6355\u6349\uFF0CF7 \u6805\u683C\uFF0CF8 \u6B63\u4EA4\uFF0CDelete \u5220\u9664\u6240\u9009\uFF0CCtrl+Z \u64A4\u9500\uFF0CCtrl+Y \u91CD\u505A\uFF0CEsc \u53D6\u6D88\u3002",
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
  opRotate: "\u65CB\u8F6C",
  opDraw: "\u7ED8\u5236",
  opModify: "\u4FEE\u6539",
  opLayer: "\u56FE\u5C42",
  opProperty: "\u5C5E\u6027",
  stageDrawSummary: "{op} \xB7 {count} \u4E2A\u70B9",
  stageRotateSummary: "\u65CB\u8F6C {count} \u4E2A\u56FE\u5143 {angle}\xB0",
  stageCopySummary: "\u590D\u5236 {count} \u4E2A\u56FE\u5143\uFF0C\u504F\u79FB {dx}\u3001{dy}",
  stageModifySummary: "{op} \xB7 {count} \u4E2A\u56FE\u5143",
  stageOffsetSummary: "\u504F\u79FB {id}\uFF0C\u8DDD\u79BB {distance}",
  stageGripSummary: "{op} \xB7 {id}",
  stageSetterSummary: "{op} \xB7 {id}",
  stageColorSummary: "\u5C06 {count} \u4E2A\u56FE\u5143\u7684\u989C\u8272\u8BBE\u4E3A {color}",
  stageLayerSummary: "{op} \xB7 {name}",
  stagePropertySummary: "{op} \xB7 {id}",
  stageBlockSummary: "\u5757 {block} \u4F4D\u4E8E {point}",
  draftLayerOps: "\u6B64\u8349\u7A3F\u5305\u542B\u56FE\u5C42\u8868\u66F4\u6539\u3002",
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
  changes: "\u66F4\u6539",
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
  roundTripHardChanges: "{count} \u9879\u5B9E\u9645\u6A21\u578B\u53D8\u66F4",
  roundTripMetadataChanges: "{count} \u9879\u4EC5\u5143\u6570\u636E\u53D8\u66F4",
  roundTripTruncated: "\u5F80\u8FD4\u6BD4\u8F83\u5DF2\u622A\u65AD\u3002",
  roundTripWarnings: "{count} \u6761\u8F6C\u6362\u5668\u8B66\u544A",
  moveAction: "\u6682\u5B58\u79FB\u52A8",
  moveDx: "\u79FB\u52A8 X",
  moveDy: "\u79FB\u52A8 Y",
  eraseAction: "\u6682\u5B58\u5220\u9664",
  editEntityHint: "\u7F16\u8F91\u4F1A\u6309\u56FE\u7EB8\u5B58\u50A8\u7684\u65B9\u5F0F\u79FB\u52A8\u6216\u5220\u9664\u56FE\u5143\u3002",
  editFlattened: "\u6B64\u56FE\u5143\u6765\u81EA\u5757\u5B9A\u4E49\uFF0C\u65E0\u6CD5\u5C31\u5730\u7F16\u8F91\u3002",
  editNoEntity: "\u9009\u62E9\u56FE\u5143\u4EE5\u79FB\u52A8\u6216\u5220\u9664\u3002",
  draftLayoutHint: "\u66F4\u6539\u76EE\u6807\u662F {layout} \u5E03\u5C40\u3002",
  cardTitleOpen: "\u5DF2\u6253\u5F00\u56FE\u7EB8",
  cardTitleScan: "\u5DE5\u4F5C\u533A\u5DF2\u7D22\u5F15",
  cardTitleChecks: "\u5BA1\u67E5\u53D1\u73B0",
  cardTitleCrossReference: "\u4EA4\u53C9\u5F15\u7528\u5019\u9009",
  cardTitleRender: "\u56FE\u7EB8\u5DF2\u6E32\u67D3",
  cardTitleApply: "\u56FE\u7EB8\u5DF2\u5199\u5165",
  cardTitleTool: "{tool} \u7ED3\u679C",
  cardPreparing: "\u6B63\u5728\u51C6\u5907\u8C03\u7528\u2026",
  cardRunning: "\u6B63\u5728\u8FD0\u884C\u2026",
  cardToolError: "\u5DE5\u5177\u62A5\u544A\u4E86\u9519\u8BEF\u3002",
  cardOpenDrawing: "\u6253\u5F00\u56FE\u7EB8",
  cardOpenWritten: "\u6253\u5F00\u5DF2\u5199\u5165\u7684\u56FE\u7EB8",
  cardOpenHint: "\u5728\u56FE\u7EB8\u9762\u677F\u4E2D\u6253\u5F00 {path}\u3002",
  cardDrawing: "\u56FE\u7EB8",
  cardFormat: "\u683C\u5F0F",
  cardEntities: "\u56FE\u5143",
  cardLayouts: "\u5E03\u5C40",
  cardUnsupported: "\u4E0D\u652F\u6301",
  cardApproximate: "\u8FD1\u4F3C",
  cardTitleBlock: "\u6807\u9898\u680F",
  cardTitleBlockRead: "\u5DF2\u8BFB\u53D6",
  cardTruncated: "\u5DF2\u622A\u65AD",
  cardDwgConverted: "DWG \u5DF2\u8F6C\u6362",
  cardDwgWarnings: "{count} \u6761\u8F6C\u6362\u8B66\u544A",
  cardIndex: "\u7D22\u5F15",
  cardSheets: "\u56FE\u7EB8",
  cardSets: "\u56FE\u7EB8\u96C6",
  cardSkipped: "\u5DF2\u8DF3\u8FC7",
  cardFormatsLabel: "\u683C\u5F0F",
  cardFormats: "{dxf} DXF \xB7 {dwg} DWG",
  cardCritical: "\u4E25\u91CD",
  cardWarning: "\u8B66\u544A",
  cardInfo: "\u4FE1\u606F",
  cardCriticalCount: "{count} \u4E25\u91CD",
  cardWarningCount: "{count} \u8B66\u544A",
  cardInfoCount: "{count} \u4FE1\u606F",
  cardMoreFindings: "\u53E6\u6709 {count} \u6761\u53D1\u73B0",
  cardMoreCandidates: "\u53E6\u6709 {count} \u4E2A\u5019\u9009",
  cardConfidence: "\u7F6E\u4FE1\u5EA6",
  cardOccurrences: "{count} \u5904",
  cardDuplicateCount: "{count} \u91CD\u590D",
  cardUnresolvedCount: "{count} \u672A\u89E3\u6790",
  cardOneSidedCount: "{count} \u5355\u4FA7",
  cardLayout: "\u5E03\u5C40",
  cardSvg: "SVG",
  cardDrawn: "\u5DF2\u7ED8\u5236 / \u603B\u6570",
  cardSize: "\u5927\u5C0F",
  cardRenderHint: "SVG \u5199\u5165 .ecad/renders\uFF0C\u53EF\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u3002",
  cardOutput: "\u8F93\u51FA",
  cardSource: "\u6E90\u6587\u4EF6",
  cardChanges: "\u66F4\u6539",
  cardTouched: "\u6D89\u53CA\u56FE\u5143",
  cardVerified: "\u5DF2\u9A8C\u8BC1",
  cardNotVerified: "\u672A\u9A8C\u8BC1",
  cardRoundTrip: "DWG \u5F80\u8FD4",
  cardRoundTripOk: "\u4E00\u81F4",
  cardRoundTripDiff: "\u65B0\u589E {added} \xB7 \u79FB\u9664 {removed} \xB7 \u53D8\u66F4 {changed}",
  cardRoundTripHard: "{count} \u9879\u5B9E\u9645\u53D8\u66F4",
  cardRoundTripMetadata: "{count} \u9879\u4EC5\u5143\u6570\u636E",
  cardRoundTripWarnings: "{count} \u6761\u8F6C\u6362\u5668\u8B66\u544A",
  dockDrawings: "{count} \u5F20\u56FE\u7EB8",
  dockDwg: "{count} DWG",
  dockProfileConfirmed: "\u914D\u7F6E\u5DF2\u786E\u8BA4",
  dockProfileDefault: "\u9ED8\u8BA4\u914D\u7F6E",
  dockWritesOn: "\u5199\u5165\u5F00\u542F",
  dockWritesOff: "\u5199\u5165\u5173\u95ED",
  dockLabel: "\u5DE5\u4F5C\u533A\u56FE\u7EB8\uFF1A{count} \u5F20\uFF0C{dwg} \u5F20 DWG",
  // -- CAD 工作区 -----------------------------------------------------------
  toolPalette: "\u7ED8\u56FE\u5DE5\u5177",
  toolGroupView: "\u89C6\u56FE",
  toolGroupDraw: "\u7ED8\u5236",
  toolGroupModify: "\u4FEE\u6539",
  toolSelect: "\u9009\u62E9",
  toolSelectHint: "\u5355\u51FB\u9009\u62E9\uFF0CShift \u6DFB\u52A0\uFF0CCtrl \u5207\u6362\uFF1B\u5728\u7A7A\u767D\u5904\u62D6\u52A8\u53EF\u7A97\u9009\u6216\u4EA4\u53C9\u9009\u62E9\u3002",
  toolPan: "\u5E73\u79FB",
  toolPanHint: "\u62D6\u52A8\u4EE5\u5E73\u79FB\u56FE\u7EB8\u3002",
  toolZoomWindow: "\u7A97\u53E3\u7F29\u653E",
  toolZoomWindowHint: "\u62D6\u51FA\u4E00\u4E2A\u7A97\u53E3\u4EE5\u7F29\u653E\u3002",
  toolLine: "\u76F4\u7EBF",
  toolLineHint: "\u4F9D\u6B21\u70B9\u53D6\u8D77\u70B9\u548C\u540E\u7EED\u70B9\uFF1BEnter \u6216 Esc \u7ED3\u675F\u3002",
  toolPolyline: "\u591A\u6BB5\u7EBF",
  toolPolylineHint: "\u70B9\u53D6\u5404\u70B9\uFF1BEnter \u6216\u53CC\u51FB\u5B8C\u6210\uFF0CEsc \u53D6\u6D88\u3002",
  toolRectangle: "\u77E9\u5F62",
  toolRectangleHint: "\u70B9\u53D6\u4E24\u4E2A\u5BF9\u89D2\u70B9\u3002",
  toolCircle: "\u5706",
  toolCircleHint: "\u70B9\u53D6\u5706\u5FC3\uFF0C\u518D\u70B9\u53D6\u5706\u5468\u4E0A\u7684\u70B9\u6216\u8F93\u5165\u534A\u5F84\u3002",
  toolArc: "\u5706\u5F27",
  toolArcHint: "\u4F9D\u6B21\u70B9\u53D6\u8D77\u70B9\u3001\u5F27\u4E0A\u4E00\u70B9\u548C\u7EC8\u70B9\u3002",
  toolRevisionCloud: "\u4FEE\u8BA2\u4E91\u7EBF",
  toolRevisionCloudHint: "\u70B9\u53D6\u4E91\u7EBF\u5404\u70B9\uFF1BEnter \u6216\u53CC\u51FB\u5B8C\u6210\u3002",
  toolLeader: "\u5F15\u7EBF",
  toolLeaderHint: "\u70B9\u53D6\u7BAD\u5934\u70B9\u548C\u6298\u70B9\uFF1BEnter \u6216\u53CC\u51FB\u5B8C\u6210\u3002",
  toolText: "\u6587\u5B57",
  toolTextHint: "\u5355\u51FB\u56FE\u7EB8\uFF0C\u7136\u540E\u586B\u5199\u6CE8\u91CA\u3002",
  toolBlock: "\u63D2\u5165\u5757",
  toolBlockHint: "\u5355\u51FB\u56FE\u7EB8\uFF0C\u7136\u540E\u4ECE\u56FE\u7EB8\u4E2D\u9009\u62E9\u4E00\u4E2A\u5757\u3002",
  toolMove: "\u79FB\u52A8",
  toolMoveHint: "\u70B9\u53D6\u57FA\u70B9\uFF0C\u518D\u70B9\u53D6\u76EE\u6807\u70B9\uFF0C\u6216\u8F93\u5165\u8DDD\u79BB\u3002",
  toolCopy: "\u590D\u5236",
  toolCopyHint: "\u70B9\u53D6\u57FA\u70B9\uFF0C\u518D\u70B9\u53D6\u76EE\u6807\u70B9\uFF0C\u6216\u8F93\u5165\u8DDD\u79BB\u3002",
  toolRotate: "\u65CB\u8F6C",
  toolRotateHint: "\u70B9\u53D6\u65CB\u8F6C\u4E2D\u5FC3\uFF0C\u7136\u540E\u8F93\u5165\u89D2\u5EA6\u6216\u70B9\u53D6\u65B9\u5411\u3002",
  toolScale: "\u7F29\u653E",
  toolScaleHint: "\u70B9\u53D6\u57FA\u70B9\uFF0C\u7136\u540E\u8F93\u5165\u7F29\u653E\u6BD4\u4F8B\u3002",
  toolMirror: "\u955C\u50CF",
  toolMirrorHint: "\u70B9\u53D6\u955C\u50CF\u7EBF\u4E0A\u7684\u4E24\u4E2A\u70B9\u3002",
  toolOffset: "\u504F\u79FB",
  toolOffsetHint: "\u70B9\u53D6\u504F\u79FB\u4FA7\uFF0C\u7136\u540E\u8F93\u5165\u504F\u79FB\u8DDD\u79BB\u3002",
  toolTrim: "\u4FEE\u526A",
  toolTrimHint: "\u5355\u51FB\u8981\u4FEE\u526A\u7684\u56FE\u5143\u3002",
  toolExtend: "\u5EF6\u4F38",
  toolExtendHint: "\u5355\u51FB\u8981\u5EF6\u4F38\u7684\u56FE\u5143\u3002",
  toolErase: "\u5220\u9664",
  toolEraseHint: "\u5355\u51FB\u56FE\u5143\u5C06\u5176\u5220\u9664\uFF1BDelete \u5220\u9664\u6240\u9009\u3002",
  toolShortcut: "\u5FEB\u6377\u952E {key}",
  commandBarLabel: "\u547D\u4EE4",
  commandActive: "{tool} \xB7 {hint}",
  commandFinishHint: "Enter \u6216\u53CC\u51FB\u5B8C\u6210 \xB7 Esc \u53D6\u6D88 \xB7 F3 \u6355\u6349 \xB7 F8 \u6B63\u4EA4\u3002",
  commandNumericLabelRadius: "\u534A\u5F84",
  commandNumericLabelAngle: "\u89D2\u5EA6\uFF08\xB0\uFF09",
  commandNumericLabelDistance: "\u8DDD\u79BB",
  commandNumericLabelFactor: "\u6BD4\u4F8B",
  commandNumericPlaceholder: "\u8F93\u5165\u6570\u503C",
  commandNumericApply: "\u5E94\u7528\u6570\u503C",
  commandCancel: "\u53D6\u6D88",
  commandNeedsSelection: "\u8BF7\u5148\u9009\u62E9\u81F3\u5C11\u4E00\u4E2A\u56FE\u5143\u3002",
  commandNeedsBlock: "\u8BF7\u9009\u62E9\u8981\u63D2\u5165\u7684\u5757\u3002",
  commandNeedsPoints: "\u8BF7\u81F3\u5C11\u70B9\u53D6 {count} \u4E2A\u70B9\u3002",
  commandNeedsPoint: "\u8BF7\u5148\u70B9\u53D6\u4E00\u4E2A\u70B9\u3002",
  commandNeedsRadius: "\u8BF7\u70B9\u53D6\u4E00\u70B9\u6216\u8F93\u5165\u6B63\u534A\u5F84\u3002",
  commandNeedsDistance: "\u8BF7\u8F93\u5165\u6B63\u7684\u8DDD\u79BB\u3002",
  commandInvalidNumber: "\u8BF7\u8F93\u5165\u6B63\u6570\u3002",
  commandArcCollinear: "\u8FD9\u4E09\u70B9\u5171\u7EBF\uFF1B\u8BF7\u53E6\u53D6\u4E00\u4E2A\u4E0D\u5728\u76F4\u7EBF\u4E0A\u7684\u70B9\u3002",
  commandUnknown: "\u6B64\u547D\u4EE4\u4E0D\u53EF\u7528\u3002",
  commandNoNumeric: "\u6B64\u547D\u4EE4\u4E0D\u63A5\u53D7\u952E\u5165\u6570\u503C\u3002",
  commandTrimNeedsBoundary: "\u8BF7\u5148\u9009\u62E9\u8FB9\u754C\u7EBF\uFF0C\u518D\u5355\u51FB\u8981\u4FEE\u526A\u6216\u5EF6\u4F38\u7684\u76F4\u7EBF\u3002",
  commandTrimSame: "\u4FEE\u526A\u76EE\u6807\u4E0E\u5176\u8FB9\u754C\u5FC5\u987B\u662F\u4E0D\u540C\u7684\u76F4\u7EBF\u3002",
  engineOpPending: "{op} \u64CD\u4F5C\u5DF2\u5728\u6B64\u9762\u677F\u4E2D\u63A5\u7EBF\uFF0C\u4F46\u5F53\u524D ECAD \u5F15\u64CE\u5C1A\u4E0D\u652F\u6301\uFF1B\u672A\u6682\u5B58\u4EFB\u4F55\u66F4\u6539\u3002",
  undo: "\u64A4\u9500",
  redo: "\u91CD\u505A",
  undoHint: "\u64A4\u9500\u4E0A\u4E00\u6B21\u6682\u5B58\uFF08Ctrl+Z\uFF09",
  redoHint: "\u91CD\u505A\u4E0A\u4E00\u6B21\u64A4\u9500\uFF08Ctrl+Y\uFF09",
  selectionCount: "\u5DF2\u9009\u62E9 {count} \u4E2A",
  selectionNone: "\u672A\u9009\u62E9",
  selectAll: "\u5168\u9009",
  selectAllHint: "\u9009\u62E9\u6240\u6709\u53EF\u89C1\u56FE\u5143\uFF08Ctrl+A\uFF09",
  drawingAids: "\u7ED8\u56FE\u8F85\u52A9",
  osnap: "\u5BF9\u8C61\u6355\u6349",
  osnapHint: "\u5BF9\u8C61\u6355\u6349\uFF08F3\uFF09",
  orthoHint: "\u6B63\u4EA4\u7ED8\u56FE\uFF08F8\uFF09",
  gridHint: "\u6805\u683C\uFF08F7\uFF09",
  statusBarLabel: "\u7ED8\u56FE\u72B6\u6001",
  statusCoordinates: "X {x} \xB7 Y {y}",
  statusNoCoordinates: "X \u2014 \xB7 Y \u2014",
  statusSheet: "{width} \xD7 {height} {unit}",
  statusSnap: "\u6355\u6349 {kind}",
  statusOsnap: "\u6355\u6349",
  statusOrtho: "\u6B63\u4EA4",
  statusGrid: "\u6805\u683C",
  snapEndpoint: "\u7AEF\u70B9",
  snapIntersection: "\u4EA4\u70B9",
  snapMidpoint: "\u4E2D\u70B9",
  snapCenter: "\u5706\u5FC3",
  snapNearest: "\u6700\u8FD1\u70B9",
  snapGrid: "\u6805\u683C\u70B9",
  marqueeWindowLabel: "\u7A97\u9009",
  marqueeCrossingLabel: "\u4EA4\u53C9\u9009\u62E9",
  gripDragHint: "\u62D6\u52A8\u5939\u70B9\u4EE5\u7F16\u8F91\u8BE5\u70B9\uFF1B\u5939\u70B9\u4E0D\u4F1A\u79FB\u52A8\u6574\u4E2A\u56FE\u5143\u3002",
  gripOpPending: "\u5939\u70B9\u5DF2\u79FB\u52A8\uFF0C\u4F46\u672A\u6682\u5B58\uFF1A{op} \u5F15\u64CE\u64CD\u4F5C\u5C1A\u4E0D\u53EF\u7528\u3002",
  gripMoveStaged: "\u63D2\u5165\u70B9\u5DF2\u79FB\u52A8 {dx}\u3001{dy}\u3002",
  contextMenuLabel: "\u56FE\u7EB8\u83DC\u5355",
  menuZoomExtents: "\u7F29\u653E\u5230\u8303\u56F4",
  menuZoomWindow: "\u7A97\u53E3\u7F29\u653E",
  menuMove: "\u79FB\u52A8",
  menuCopy: "\u590D\u5236",
  menuErase: "\u5220\u9664",
  menuProperties: "\u5C5E\u6027",
  menuAskSelection: "\u8BE2\u95EE\u6240\u9009\u5185\u5BB9",
  menuPrint: "\u6253\u5370",
  menuExportSvg: "\u5BFC\u51FA SVG",
  properties: "\u5C5E\u6027",
  propertiesHint: "\u9009\u62E9\u56FE\u5143\u4EE5\u7F16\u8F91\u5176\u6587\u5B57\u3001\u56FE\u5C42\u6216\u5C5E\u6027\u3002",
  propertiesHintMulti: "\u5DF2\u9009\u62E9 {count} \u4E2A\u56FE\u5143\u3002\u53EF\u9009\u62E9\u56FE\u5C42\u4EE5\u6279\u91CF\u6682\u5B58\u66F4\u6539\uFF0C\u6216\u5220\u9664\u6240\u9009\u3002",
  propertiesMixedKind: "\u591A\u79CD\u7C7B\u578B",
  propertiesMixedLayer: "\u591A\u4E2A\u56FE\u5C42",
  propertiesTextApply: "\u6682\u5B58\u6587\u5B57",
  propertiesLayerApply: "\u6682\u5B58\u56FE\u5C42",
  propertiesColor: "\u56FE\u5143\u989C\u8272",
  propertiesColorApply: "\u6682\u5B58\u989C\u8272",
  propertiesColorPlaceholder: "ACI 1\u2013255",
  propertiesColorHint: "\u989C\u8272\u7D22\u5F15\u4E3A 1 \u5230 255 \u7684 ACI \u503C\u3002\u968F\u5757\uFF080\uFF09\u548C\u968F\u5C42\uFF08256\uFF09\u4E0D\u80FD\u4F5C\u4E3A\u8BBE\u7F6E\u503C\u3002",
  propertiesColorInvalid: "\u8BF7\u8F93\u5165 1 \u5230 255 \u7684\u6574\u6570 ACI \u989C\u8272\u3002",
  propertiesMoveApply: "\u6682\u5B58\u79FB\u52A8",
  propertiesRotateApply: "\u6682\u5B58\u65CB\u8F6C",
  propertiesDelete: "\u6682\u5B58\u5220\u9664",
  propertiesAttributeTitle: "\u5757\u5C5E\u6027",
  propertiesAttributeHint: "\u56FE\u7EB8\u6A21\u578B\u4E0D\u5305\u542B\u5C5E\u6027\u6807\u8BB0\u540D\uFF1B\u8BF7\u6309\u56FE\u7EB8\u5B58\u50A8\u7684\u6807\u8BB0\u8F93\u5165\u3002",
  propertiesTag: "\u6807\u8BB0",
  propertiesValue: "\u503C",
  propertiesAttributeApply: "\u6682\u5B58\u5C5E\u6027",
  propertiesAsk: "\u8BE2\u95EE\u6240\u9009\u5185\u5BB9",
  propertiesClear: "\u6E05\u9664\u9009\u62E9",
  layersCurrent: "\u5F53\u524D\u56FE\u5C42",
  layerMakeCurrent: "\u5728\u56FE\u5C42 {layer} \u4E0A\u7ED8\u5236",
  layerCurrentBadge: "\u5F53\u524D",
  layerLock: "\u9501\u5B9A\u56FE\u5C42 {layer}",
  layerUnlock: "\u89E3\u9501\u56FE\u5C42 {layer}",
  layerEdit: "\u7F16\u8F91\u56FE\u5C42 {layer}",
  layerCreate: "\u65B0\u5EFA\u56FE\u5C42",
  layerCreateApply: "\u6682\u5B58\u65B0\u56FE\u5C42",
  layerName: "\u540D\u79F0",
  layerColor: "\u989C\u8272\u7D22\u5F15",
  layerRenameApply: "\u6682\u5B58\u91CD\u547D\u540D",
  layerColorApply: "\u6682\u5B58\u989C\u8272",
  layerHideAll: "\u9690\u85CF\u6240\u6709\u56FE\u5C42",
  layerReadOnlyHint: "\u56FE\u5C42\u53EF\u89C1\u6027\u548C\u5F53\u524D\u56FE\u5C42\u662F\u672C\u5730\u9762\u677F\u72B6\u6001\uFF1B\u65B0\u5EFA\u6216\u91CD\u547D\u540D\u56FE\u5C42\u9700\u8981\u542F\u7528\u5199\u5165\u3002",
  layerOpPending: "\u5F15\u64CE\u64CD\u4F5C {op} \u5C1A\u4E0D\u53EF\u7528\uFF1B\u672A\u6682\u5B58\u4EFB\u4F55\u66F4\u6539\u3002",
  layerInvalidName: '\u56FE\u5C42\u540D\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E5F\u4E0D\u80FD\u5305\u542B\u5B57\u7B26 < > / \\ " : ; ? * | , = `',
  layerColorInvalid: "\u989C\u8272\u7D22\u5F15\u5FC5\u987B\u662F 1 \u5230 255 \u7684\u6574\u6570\u3002",
  print: "\u6253\u5370",
  printHint: "\u6253\u5370\u5F53\u524D\u56FE\u7EB8\u89C6\u56FE",
  printHeader: "{path} \xB7 {layout}",
  printFooter: "{format} \xB7 {width} \xD7 {height} {unit} \xB7 {selection}",
  exportSvg: "\u5BFC\u51FA SVG",
  exportSvgHint: "\u5C06\u5F53\u524D\u56FE\u7EB8\u89C6\u56FE\u4E0B\u8F7D\u4E3A SVG \u56FE\u7EB8",
  exportPng: "\u5BFC\u51FA PNG",
  exportPngHint: "\u5C06\u5F53\u524D\u56FE\u7EB8\u89C6\u56FE\u4E0B\u8F7D\u4E3A PNG \u56FE\u50CF",
  exportSvgTitle: "{path} \xB7 {layout}",
  exportFailed: "\u6B64\u6D4F\u89C8\u5668\u65E0\u6CD5\u5BFC\u51FA\u8BE5\u56FE\u7EB8\u3002",
  exportName: "{name}-{layout}",
  zoomExtents: "\u7F29\u653E\u5230\u8303\u56F4",
  zoomExtentsHint: "\u7F29\u653E\u4EE5\u663E\u793A\u6574\u5F20\u56FE\u7EB8",
  blockPlacementTitle: "\u5728 {point} \u63D2\u5165\u5757",
  blockPlacementLabel: "\u5757",
  blockRotation: "\u65CB\u8F6C\u89D2\uFF08\xB0\uFF09",
  blockScale: "\u6BD4\u4F8B",
  stageBlockPlacement: "\u6682\u5B58\u5757\u63D2\u5165",
  noBlocks: "\u6B64\u56FE\u7EB8\u6CA1\u6709\u5757\u5B9A\u4E49\u3002"
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
      const payload = unwrapRemoteValue(await call("capabilities", sessionId));
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
  const readSheetSet = async (sessionId) => {
    const call = await ready;
    if (call === void 0) return void 0;
    try {
      const [sheets, capabilities] = await Promise.all([
        call("sheets", sessionId, 500),
        call("capabilities", sessionId).catch(() => void 0)
      ]);
      return sheetSetOf(unwrapRemoteValue(sheets), capabilities === void 0 ? void 0 : unwrapRemoteValue(capabilities));
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
      payload = unwrapRemoteValue(await call("apply", file.sessionId, file.path, baseVersion, ops));
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
      const raw = await call("open", file.sessionId, file.path);
      payload = unwrapRemoteValue(raw);
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
    const [revision, setRevision] = (0, import_react5.useState)(0);
    return (0, import_react5.createElement)(EcadBody, {
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
  ctx.effect(() => ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "ecad-sheet-set",
    order: 12,
    locale: NS,
    inject: () => ({ readSheetSet })
  }, EcadSheetDock)), "ecad-preview: sheet-set dock");
  ctx.effect(() => ctx.slots.inject("tool.call.toolview", () => ECAD_TOOL_NAMES.map((name) => ctx.slots.register(
    { name: "tool.call.toolview", key: name, locale: NS },
    EcadToolCardView
  ))), "ecad-preview: tool cards");
}

    return module.exports
  },
})
