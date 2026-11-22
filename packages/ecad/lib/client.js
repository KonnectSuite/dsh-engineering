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
var import_react2 = require("react");

// src/remote/ecad-contract.js
var ECAD_PACKAGE = "@aryacode/dsh-engineering";
var ECAD_NAMESPACE = "ecad";
var ECAD_CONTRACT_VERSION = 2;
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
var import_react = require("react");

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
  const body = scene.primitives.map((primitive) => `<g>${shapeOf(primitive)}${textOf(primitive)}</g>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" role="img" aria-label="${escapeXml(options.title)}">
<title>${escapeXml(options.title)}</title>
<rect width="${options.width}" height="${options.height}" fill="#ffffff"/>
<g transform="translate(${fmt(view.panX)} ${fmt(view.panY)}) scale(${fmt(view.zoom)})">
<g transform="translate(${fmt(fit.translateX)} ${fmt(fit.translateY)}) scale(${fmt(fit.scale)} ${fmt(-fit.scale)})">
${body}
</g>
</g>
</svg>
`;
}

var css = "/* The ECAD drawing pane.\n *\n * Tokens only: every surface, label, border and accent comes from the theme's\n * --dsw-alias-* set, so the pane follows light and dark without a second palette.\n * The drawing sheet is a local surface pair because a CAD sheet is its own\n * ground: its ink and paper follow the theme, and a layer colour is tinted\n * toward the theme ink by the renderer (see palette.ts) so linework stays\n * readable on either ground.\n */\n\n._0qoF0J_root {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--dsw-font-family, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);\n  font-size: 12px;\n  line-height: 1.45;\n  container-type: inline-size;\n  /* The drawing's ground and ink. The sheet surface is a theme layer, never a\n     literal paper colour: dark mode gets a dark sheet, not a white flash. */\n  --ecad-paper: var(--dsw-alias-bg-layer-1);\n  --ecad-ink: var(--dsw-alias-label-primary);\n  --ecad-ink-tint: 55%;\n  --ecad-accent: var(--dsw-alias-state-business-primary);\n}\n\n/* Toolbar: one quiet row of view controls, the drawing's own status, and the\n   one action that leaves the pane. No product chrome \u2014 the document preview\n   header above already owns the path, reload and renderer controls. */\n/* The full-window CAD surface. The sidebar is the default mount point; focus\n   mode gives a print-sized sheet the room a CAD drawing needs. */\n._0qoF0J_focused {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483000;\n  width: 100vw;\n  height: 100vh;\n  box-shadow: var(--dsw-elevation-panel);\n}\n\n._0qoF0J_focused ._0qoF0J_toolbar {\n  padding-left: 16px;\n  padding-right: 16px;\n}\n\n._0qoF0J_toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  min-height: 40px;\n  box-sizing: border-box;\n  padding: 5px 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow: hidden;\n}\n\n._0qoF0J_toolbarGroup {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n}\n\n._0qoF0J_coverage {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n}\n\n._0qoF0J_toolbarSpacer {\n  flex: 1;\n  min-width: 0;\n}\n\n/* Badges carry a text label as well as the accent colour, so state never rides\n   on colour alone and the label can be localized. */\n._0qoF0J_badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n  height: 18px;\n  padding: 0 6px;\n  box-sizing: border-box;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  white-space: nowrap;\n}\n\n._0qoF0J_badgeWarn {\n  border-color: var(--dsw-alias-state-warn-primary);\n  color: var(--dsw-alias-state-warn-label);\n}\n\n._0qoF0J_badgeDot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: currentColor;\n  corner-shape: round;\n}\n\n._0qoF0J_button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  box-sizing: border-box;\n  min-width: 24px;\n  min-height: 24px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n}\n\n._0qoF0J_button:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n._0qoF0J_button[aria-pressed='true'] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_iconButton {\n  width: 24px;\n  padding: 0;\n}\n\n._0qoF0J_primaryButton {\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_button:focus-visible,\n._0qoF0J_primaryButton:focus-visible,\n._0qoF0J_layoutTab:focus-visible,\n._0qoF0J_layerToggle:focus-visible,\n._0qoF0J_canvasWrap:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n._0qoF0J_icon {\n  display: block;\n  width: 14px;\n  height: 14px;\n  flex: none;\n}\n\n/* Layout tabs: only for a multi-layout drawing, printed the way a drawing\n   application prints them, above the sheet. */\n._0qoF0J_layoutTabs {\n  display: flex;\n  align-items: stretch;\n  gap: 2px;\n  flex: none;\n  min-height: 28px;\n  padding: 0 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  overflow-x: auto;\n  overflow-y: hidden;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_layoutTab {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  box-sizing: border-box;\n  padding: 0 9px;\n  min-height: 27px;\n  border: 0;\n  border-bottom: 2px solid transparent;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 11px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n._0qoF0J_layoutTabActive {\n  border-bottom-color: var(--ecad-accent);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n._0qoF0J_tabCount {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n/* The stage holds the sheet and the panels. The sheet keeps every spare pixel;\n   the panels give way first on a narrow preview tab. */\n._0qoF0J_stage {\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  min-width: 0;\n  position: relative;\n}\n\n._0qoF0J_canvasWrap {\n  position: relative;\n  flex: 1;\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  background: var(--ecad-paper);\n  cursor: grab;\n  touch-action: none;\n}\n\n._0qoF0J_canvasWrap:focus-visible {\n  outline-offset: -2px;\n}\n\n._0qoF0J_panning {\n  cursor: grabbing;\n}\n\n._0qoF0J_canvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n._0qoF0J_primitive {\n  pointer-events: none;\n}\n\n/* A selection is drawn as a paper-coloured halo under an accent stroke, so it\n   reads as a highlight state on top of any layer colour and never as a colour\n   the drawing itself uses. */\n._0qoF0J_selectionHalo {\n  fill: none;\n  stroke: var(--ecad-paper);\n  stroke-width: 5;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n._0qoF0J_selection {\n  fill: none;\n  stroke: var(--ecad-accent);\n  stroke-width: 2.5;\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n/* Quiet state surfaces: the same centered rhythm the document previewers use\n   for loading, empty and failure states. */\n._0qoF0J_state {\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 24px;\n  text-align: center;\n}\n\n._0qoF0J_stateTitle {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n._0qoF0J_stateBody {\n  margin: 0;\n  max-width: 54ch;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_stateCode {\n  margin: 0;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: var(--dsw-radius-xs);\n  color: var(--dsw-alias-label-tertiary);\n  font-family: var(--dsh-font-family-code, ui-monospace, 'SF Mono', Consolas, monospace);\n  font-size: 10px;\n}\n\n._0qoF0J_stateActions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 2px;\n}\n\n._0qoF0J_spinner {\n  width: 18px;\n  height: 18px;\n  box-sizing: border-box;\n  border: 2px solid var(--dsw-alias-border-l2);\n  border-top-color: var(--dsw-alias-state-business-primary);\n  border-radius: 50%;\n  corner-shape: round;\n  animation: spin 900ms linear infinite;\n}\n\n@keyframes spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n/* Floating notice over the sheet: truncation and approximation are warnings the\n   reader must see, so they sit on the sheet's top edge, on an elevated surface. */\n._0qoF0J_notice {\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  right: 8px;\n  z-index: 2;\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  padding: 6px 9px;\n  border: 0.5px solid var(--dsw-alias-state-warn-primary);\n  border-radius: var(--dsw-radius-sm);\n  background: var(--dsw-alias-state-warn-tertiary);\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n  line-height: 1.4;\n  box-shadow: var(--dsw-elevation-panel);\n  pointer-events: none;\n}\n\n._0qoF0J_noticeText {\n  overflow-wrap: anywhere;\n}\n\n/* Side panel: layers, the selected primitive, and the title block. Quiet\n   neutral surface, hairline divider, long lists scroll inside themselves. */\n._0qoF0J_sidePanel {\n  display: flex;\n  flex-direction: column;\n  flex: none;\n  width: 228px;\n  min-height: 0;\n  border-left: 0.5px solid var(--dsw-alias-border-l2);\n  overflow-x: hidden;\n  overflow-y: auto;\n  scrollbar-width: thin;\n}\n\n._0qoF0J_sidePanelHidden {\n  display: none;\n}\n\n._0qoF0J_panelSection {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n}\n\n._0qoF0J_layersSection {\n  flex: none;\n  max-height: 46%;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_panelHeading {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  padding: 8px 10px 4px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n._0qoF0J_panelHeadingSpacer {\n  flex: 1;\n}\n\n/* The column layout is dismissed from the toolbar; only the overlay needs its\n   own close control. */\n._0qoF0J_panelClose {\n  display: none;\n}\n\n._0qoF0J_panelHeadingButton {\n  min-height: 20px;\n  height: 20px;\n  padding: 0 4px;\n  font-size: 10px;\n  letter-spacing: 0;\n  text-transform: none;\n  font-weight: 400;\n}\n\n._0qoF0J_layerList {\n  min-height: 0;\n  overflow: auto;\n  padding: 0 4px 8px;\n}\n\n._0qoF0J_layerToggle {\n  display: grid;\n  grid-template-columns: 20px 12px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 5px;\n  width: 100%;\n  box-sizing: border-box;\n  min-height: 24px;\n  padding: 0 4px;\n  border: 0;\n  border-radius: var(--dsw-radius-xs);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n._0qoF0J_layerToggle[aria-pressed='false'] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n._0qoF0J_layerToggle[aria-pressed='false'] ._0qoF0J_layerName {\n  text-decoration: line-through;\n}\n\n._0qoF0J_layerEye {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: inherit;\n}\n\n._0qoF0J_swatch {\n  width: 10px;\n  height: 10px;\n  box-sizing: border-box;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: 2px;\n}\n\n._0qoF0J_layerName {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11px;\n}\n\n._0qoF0J_layerCount {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n._0qoF0J_propertyRow {\n  display: grid;\n  grid-template-columns: 74px minmax(0, 1fr);\n  gap: 8px;\n  align-items: baseline;\n  padding: 3px 0;\n  font-size: 11px;\n}\n\n._0qoF0J_propertyLabel {\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n}\n\n._0qoF0J_propertyValue {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* The title block summary is read, not operated: rows only, no controls. */\n._0qoF0J_sheetSection {\n  flex: none;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n._0qoF0J_sheetRows {\n  padding: 0 10px 8px;\n}\n\n._0qoF0J_sheetValue {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* The coverage sentence is read, not scanned: wrap it instead of clipping it. */\n._0qoF0J_sheetValueWrap {\n  white-space: normal;\n  overflow-wrap: anywhere;\n  line-height: 1.4;\n}\n\n/* Hover and press feedback belongs to pointers that have hover. */\n@media (hover: hover) {\n  ._0qoF0J_button:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_primaryButton:hover:not(:disabled) {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n\n  ._0qoF0J_layoutTab:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n    color: var(--dsw-alias-label-primary);\n  }\n\n  ._0qoF0J_layerToggle:hover {\n    background: var(--dsw-alias-interactive-bg-hover);\n  }\n}\n\n._0qoF0J_button:active:not(:disabled),\n._0qoF0J_layerToggle:active,\n._0qoF0J_layoutTab:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n/* The sheet outranks the coverage text first. */\n@container (max-width: 720px) {\n  ._0qoF0J_coverage {\n    display: none;\n  }\n}\n\n/* Only a genuinely narrow preview pane gives the panel the overlay treatment:\n   above this width the panel keeps its own column and never covers the sheet. */\n@container (max-width: 520px) {\n  ._0qoF0J_sidePanel {\n    position: absolute;\n    top: 0;\n    right: 0;\n    bottom: 0;\n    z-index: 3;\n    width: min(260px, 82%);\n    background: var(--dsw-alias-bg-document-preview);\n    border-left: 0.5px solid var(--dsw-alias-border-l2);\n    box-shadow: var(--dsw-elevation-panel);\n  }\n\n  ._0qoF0J_toolbarLabel {\n    display: none;\n  }\n\n  ._0qoF0J_panelClose {\n    display: inline-flex;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  ._0qoF0J_spinner {\n    animation: none;\n    border-top-color: var(--dsw-alias-border-l2);\n    border-left-color: var(--dsw-alias-state-business-primary);\n  }\n}\n\n._0qoF0J_formInput {\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 24px;\n  padding: 2px 6px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-xs);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 11px;\n}\n\n._0qoF0J_formInput:focus-visibl {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));\n  outline-offset: 1px;\n}\n\n/* The CAD workspace \u2014 selection, navigation, drawing aids, the tool palette and\n * the command surfaces. Appended as one block, tokens only, like the panes above.\n */\n\n/* The sheet column: the canvas keeps every spare pixel and the status line is a\n   single quiet footer under it. */\n._0qoF0J_canvasColumn {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-width: 0;\n  min-height: 0;\n  position: relative;\n}\n\n/* Status footer: coordinates, sheet size and the drawing-aid state. State is a\n   labelled chip with aria-pressed, never colour alone. */\n._0qoF0J_statusBar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  min-height: 24px;\n  box-sizing: border-box;\n  padding: 2px 8px;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-document-preview);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n  overflow-x: auto;\n  overflow-y: hidden;\n  white-space: nowrap;\n  scrollbar-width: none;\n}\n\n._0qoF0J_statusItem {\n  flex: none;\n}\n\n/* Canvas overlays: the selection outline, the marquee rectangle, the snap marker\n   and the grip handles all live in screen space on top of the transformed scene. */\n._0qoF0J_selectionOverlay {\n  pointer-events: none;\n}\n\n._0qoF0J_layerRow {\n  display: flex;\n  align-items: center;\n  gap: 1px;\n}\n\n._0qoF0J_layerRow ._0qoF0J_layerToggle {\n  flex: 1;\n  min-width: 0;\n}\n\n/* Print: only the drawing page goes to the printer. The sheet column fills the\n   page, the header names what is printed, and every control is hidden. */\n@media print {\n  ._0qoF0J_noPrint {\n    display: none !important;\n  }\n\n  ._0qoF0J_printOnly {\n    display: block !important;\n  }\n\n  /* The sheet is the printed page: selection, snaps, grips, ghosts, the command\n     bar and the written-drawing banner are screen chrome, not drawing content. */\n  ._0qoF0J_selectionOverlay,\n  ._0qoF0J_notice {\n    display: none !important;\n  }\n\n  ._0qoF0J_root {\n    height: auto;\n    min-height: 0;\n    background: #ffffff;\n  }\n\n  ._0qoF0J_stage {\n    display: block;\n  }\n\n  ._0qoF0J_canvasColumn {\n    display: block;\n  }\n\n  ._0qoF0J_canvasWrap {\n    height: 84vh;\n    border: 0;\n    outline: none;\n    background: #ffffff;\n  }\n\n  /* The focused canvas keeps no focus ring on paper. */\n  ._0qoF0J_canvasWrap:focus-visible {\n    outline: none;\n  }\n\n  ._0qoF0J_statusBar {\n    display: none;\n  }\n}\n\n._0qoF0J_printOnly {\n  display: none;\n}\n\n._0qoF0J_printHeader {\n  padding: 6px 0 4px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-primary);\n  font-size: 11px;\n}\n\n._0qoF0J_printTitle {\n  font-weight: 600;\n}\n\n._0qoF0J_printMeta {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 10px;\n}\n\n/* The tool rail yields its width to the sheet on a genuinely narrow pane. */\n\n";
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
  "focused": "_0qoF0J_focused",
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
  "panelHeading": "_0qoF0J_panelHeading",
  "panelHeadingSpacer": "_0qoF0J_panelHeadingSpacer",
  "panelClose": "_0qoF0J_panelClose",
  "panelHeadingButton": "_0qoF0J_panelHeadingButton",
  "layerList": "_0qoF0J_layerList",
  "layerName": "_0qoF0J_layerName",
  "layerEye": "_0qoF0J_layerEye",
  "swatch": "_0qoF0J_swatch",
  "layerCount": "_0qoF0J_layerCount",
  "propertyRow": "_0qoF0J_propertyRow",
  "propertyLabel": "_0qoF0J_propertyLabel",
  "propertyValue": "_0qoF0J_propertyValue",
  "sheetSection": "_0qoF0J_sheetSection",
  "sheetRows": "_0qoF0J_sheetRows",
  "sheetValue": "_0qoF0J_sheetValue",
  "sheetValueWrap": "_0qoF0J_sheetValueWrap",
  "toolbarLabel": "_0qoF0J_toolbarLabel",
  "formInput": "_0qoF0J_formInput",
  "canvasColumn": "_0qoF0J_canvasColumn",
  "statusBar": "_0qoF0J_statusBar",
  "statusItem": "_0qoF0J_statusItem",
  "selectionOverlay": "_0qoF0J_selectionOverlay",
  "layerRow": "_0qoF0J_layerRow",
  "noPrint": "_0qoF0J_noPrint",
  "printOnly": "_0qoF0J_printOnly",
  "printHeader": "_0qoF0J_printHeader",
  "printTitle": "_0qoF0J_printTitle",
  "printMeta": "_0qoF0J_printMeta"
};
var EcadBody_default = classes;

// packages/ecad/src/client/EcadBody.tsx
var FIT_MARGIN = 24;
var MIN_ZOOM = 0.25;
var MAX_ZOOM = 60;
var PAN_STEP = 40;
var HIGHLIGHT_LIMIT = 400;
function MinusIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M3.5 8h9" })
  );
}
function PlusIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M8 3.5v9M3.5 8h9" })
  );
}
function FitIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" })
  );
}
function LayersIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M8 2.5 14 6l-6 3.5L2 6l6-3.5ZM2 10l6 3.5L14 10" })
  );
}
function ExpandIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M9.5 2.5h4v4M6.5 13.5h-4v-4" })
  );
}
function CollapseIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M13.5 6.5h-4v4M2.5 9.5h4v-4" })
  );
}
function WarningIcon({ size = 13 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M8 2.5 14.5 14h-13L8 2.5ZM8 6.5v3.5M8 11.8v.6" })
  );
}
function ChatIcon({ size = 14 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M2.5 4.5h11v7h-6l-3 2.5v-2.5h-2v-7Z" })
  );
}
function CloseIcon({ size = 13 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M4 4l8 8M12 4l-8 8" })
  );
}
function SearchIcon({ size = 13 }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", "aria-hidden": true },
    (0, import_react.createElement)("path", { d: "M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10.5 10.5 14 14" })
  );
}
function EyeGlyph({ open }) {
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.icon, width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    open ? (0, import_react.createElement)("path", { d: "M1.5 8C3.4 4.9 5.6 3.4 8 3.4c2.4 0 4.6 1.5 6.5 4.6-1.9 3.1-4.1 4.6-6.5 4.6-2.4 0-4.6-1.5-6.5-4.6Zm6.5 1.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" }) : (0, import_react.createElement)("path", { d: "M2 3l12 10M6.2 4.2A6.9 6.9 0 0 1 8 3.9c2.4 0 4.6 1.5 6.5 4.6-.7 1.2-1.5 2.1-2.4 2.8M4.3 5.6C3.4 6.4 2.5 7.2 1.5 8c1.9 3.1 4.1 4.6 6.5 4.6.8 0 1.5-.2 2.2-.5" })
  );
}
function useElementSize(element) {
  const [size, setSize] = (0, import_react.useState)({ width: 0, height: 0 });
  (0, import_react.useEffect)(() => {
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
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
function zoomAt(view, factor, cx, cy) {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === view.zoom || !Number.isFinite(cx) || !Number.isFinite(cy)) return view;
  const ratio = zoom / view.zoom;
  return { zoom, panX: cx - ratio * (cx - view.panX), panY: cy - ratio * (cy - view.panY) };
}
function paintOf(primitive, forFill) {
  const dash = primitive.approx ? "4 2" : void 0;
  if (forFill) {
    return {
      fill: primitive.ink,
      fillOpacity: primitive.geometry.t === "path" && primitive.geometry.hatch ? 0.22 : 0.9,
      stroke: "none",
      strokeWidth: 0
    };
  }
  return {
    fill: "none",
    stroke: primitive.ink,
    strokeWidth: 1,
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
      return (0, import_react.createElement)("line", { ...shared, x1: geometry.x1, y1: geometry.y1, x2: geometry.x2, y2: geometry.y2 });
    case "path":
      return (0, import_react.createElement)("path", { ...shared, d: geometry.d });
    case "rect":
      return (0, import_react.createElement)("rect", { ...shared, x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, rx: 0 });
    case "circle":
      return (0, import_react.createElement)("circle", { ...shared, cx: geometry.cx, cy: geometry.cy, r: geometry.r });
    case "ellipse":
      return (0, import_react.createElement)("ellipse", {
        ...shared,
        cx: geometry.cx,
        cy: geometry.cy,
        rx: geometry.rx,
        ry: geometry.ry,
        transform: `rotate(${Number(geometry.degrees.toFixed(4))} ${geometry.cx} ${geometry.cy})`
      });
    case "dot":
      return (0, import_react.createElement)("circle", {
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
function textRuns(primitive, fill) {
  return primitive.text.map((line, index) => (0, import_react.createElement)(
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
      "aria-hidden": true
    },
    line.text
  ));
}
function ScenePrimitive({ primitive }) {
  const filled = primitive.geometry.t === "path" && (primitive.geometry.fill || primitive.geometry.hatch);
  return (0, import_react.createElement)(
    "g",
    {
      className: EcadBody_default.primitive,
      "data-ecad-id": primitive.id,
      "data-ecad-kind": primitive.kind,
      "data-ecad-layer": primitive.layer,
      ...primitive.approx ? { "data-ecad-approx": "true" } : {}
    },
    primitive.geometry.t === "none" ? null : (0, import_react.createElement)(SceneShape, { geometry: primitive.geometry, paint: paintOf(primitive, filled) }),
    textRuns(primitive, primitive.ink)
  );
}
var MemoPrimitive = (0, import_react.memo)(ScenePrimitive);
function SceneView({ scene, fit, view, label, highlight }) {
  const base = (0, import_react.useMemo)(() => scene.primitives.map((primitive) => (0, import_react.createElement)(MemoPrimitive, { key: primitive.id, primitive })), [scene]);
  return (0, import_react.createElement)(
    "svg",
    { className: EcadBody_default.canvas, role: "img", "aria-label": label, "data-ecad-canvas": "true" },
    (0, import_react.createElement)(
      "g",
      { transform: `translate(${view.panX} ${view.panY}) scale(${view.zoom})`, "data-ecad-view": "true" },
      (0, import_react.createElement)(
        "g",
        { transform: `translate(${fit.translateX} ${fit.translateY}) scale(${fit.scale} ${-fit.scale})` },
        base,
        highlight.map((primitive) => primitive.geometry.t === "none" ? (0, import_react.createElement)("g", { key: `find-text-${primitive.id}`, className: EcadBody_default.selectionOverlay, "data-ecad-found": primitive.id }, textRuns(primitive, "var(--ecad-accent)")) : (0, import_react.createElement)(
          "g",
          { key: `find-${primitive.id}`, className: EcadBody_default.selectionOverlay, "data-ecad-found": primitive.id },
          (0, import_react.createElement)(SceneShape, { geometry: primitive.geometry, paint: { fill: "none", stroke: "var(--ecad-paper)", strokeWidth: 5 }, className: EcadBody_default.selectionHalo }),
          (0, import_react.createElement)(SceneShape, { geometry: primitive.geometry, paint: { fill: "none", stroke: "var(--ecad-accent)", strokeWidth: 2.5 }, className: EcadBody_default.selection }),
          textRuns(primitive, "var(--ecad-accent)")
        ))
      )
    )
  );
}
function CadToolbar({ coverage, coverageText, coverageTitle, ready, format, conversion, panelsOpen, chatUnavailable, query, onQuery, matchText, onPrint, onExportSvg, onExportPng, onFit, onZoom, onTogglePanels, onAsk, focused, onToggleFocus, t }) {
  return (0, import_react.createElement)(
    "div",
    { className: `${EcadBody_default.toolbar} ${EcadBody_default.noPrint}` },
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.toolbarGroup },
      ready && format !== void 0 ? (0, import_react.createElement)("span", { className: EcadBody_default.badge, title: formatTitleOf(format, conversion, t) }, format.toUpperCase()) : null,
      ready ? (0, import_react.createElement)("span", { className: EcadBody_default.badge, title: t("readOnlyHint") }, (0, import_react.createElement)(LayersIcon, {}), t("readOnly")) : null,
      ready && coverage.truncated ? (0, import_react.createElement)("span", { className: `${EcadBody_default.badge} ${EcadBody_default.badgeWarn}` }, (0, import_react.createElement)(WarningIcon, {}), t("truncatedBadge")) : null,
      ready && coverage.approximate > 0 ? (0, import_react.createElement)("span", { className: EcadBody_default.badge, title: t("approximateHint", { count: coverage.approximate }) }, (0, import_react.createElement)("span", { className: EcadBody_default.badgeDot }), t("approximateBadge")) : null
    ),
    ready ? (0, import_react.createElement)("span", { className: EcadBody_default.coverage, title: coverageTitle }, coverageText) : (0, import_react.createElement)("span", { className: EcadBody_default.coverage }),
    (0, import_react.createElement)("span", { className: EcadBody_default.toolbarSpacer }),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.toolbarGroup, "data-ecad-search": "true" },
      (0, import_react.createElement)(SearchIcon, {}),
      (0, import_react.createElement)("input", {
        type: "search",
        className: EcadBody_default.formInput,
        value: query,
        placeholder: t("searchHint"),
        "aria-label": t("search"),
        disabled: !ready,
        onChange: (event) => {
          onQuery(event.target.value);
        }
      }),
      matchText === void 0 ? null : (0, import_react.createElement)("span", { className: EcadBody_default.badge, "data-ecad-match": "true" }, matchText)
    ),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.toolbarGroup },
      (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomExtentsHint"), "aria-label": t("zoomExtents"), disabled: !ready, onClick: onFit }, (0, import_react.createElement)(FitIcon, {})),
      (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomOut"), "aria-label": t("zoomOut"), disabled: !ready, onClick: () => {
        onZoom(1 / 1.3);
      } }, (0, import_react.createElement)(MinusIcon, {})),
      (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, title: t("zoomIn"), "aria-label": t("zoomIn"), disabled: !ready, onClick: () => {
        onZoom(1.3);
      } }, (0, import_react.createElement)(PlusIcon, {})),
      (0, import_react.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`,
        title: t("panels"),
        "aria-label": t("panels"),
        "aria-pressed": panelsOpen,
        disabled: !ready,
        onClick: onTogglePanels
      }, (0, import_react.createElement)(LayersIcon, {})),
      (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button}`, title: t("printHint"), disabled: !ready, onClick: onPrint }, t("print")),
      (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button}`, title: t("exportSvgHint"), disabled: !ready, onClick: onExportSvg }, t("exportSvg")),
      (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button}`, title: t("exportPngHint"), disabled: !ready, onClick: onExportPng }, t("exportPng")),
      (0, import_react.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`,
        title: focused ? t("focusExit") : t("focusEnter"),
        "aria-label": focused ? t("focusExit") : t("focusEnter"),
        "aria-pressed": focused,
        disabled: !ready,
        onClick: onToggleFocus,
        "data-ecad-focus": "true"
      }, focused ? (0, import_react.createElement)(CollapseIcon, {}) : (0, import_react.createElement)(ExpandIcon, {})),
      (0, import_react.createElement)("button", {
        type: "button",
        className: `${EcadBody_default.button} ${EcadBody_default.primaryButton}`,
        title: chatUnavailable ? t("askUnavailable") : t("ask"),
        disabled: !ready || chatUnavailable,
        onClick: onAsk
      }, (0, import_react.createElement)(ChatIcon, {}), (0, import_react.createElement)("span", { className: EcadBody_default.toolbarLabel }, t("ask")))
    )
  );
}
function LoadingState({ label }) {
  return (0, import_react.createElement)(
    "div",
    { className: EcadBody_default.state, role: "status" },
    (0, import_react.createElement)("span", { className: EcadBody_default.spinner }),
    (0, import_react.createElement)("p", { className: EcadBody_default.stateBody }, label)
  );
}
function FailureState({ error, onRetry, onAsk, chatUnavailable, t }) {
  const unavailable = error.code === "ECAD_DISABLED";
  return (0, import_react.createElement)(
    "div",
    { className: EcadBody_default.state, role: "alert" },
    (0, import_react.createElement)("h3", { className: EcadBody_default.stateTitle }, unavailable ? t("unavailable") : t("errorTitle")),
    (0, import_react.createElement)("code", { className: EcadBody_default.stateCode }, `${t("errorCode")}: ${error.code}`),
    (0, import_react.createElement)("p", { className: EcadBody_default.stateBody }, error.message),
    (0, import_react.createElement)("p", { className: EcadBody_default.stateBody }, `${t("errorFix")}: ${unavailable ? t("unavailableFix") : error.fix}`),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.stateActions },
      (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: onRetry }, t("retry")),
      (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, disabled: chatUnavailable, onClick: onAsk }, (0, import_react.createElement)(ChatIcon, {}), t("ask"))
    ),
    chatUnavailable ? (0, import_react.createElement)("p", { className: EcadBody_default.stateBody }, t("askUnavailable")) : null
  );
}
function NoticeView({ notice, onDismiss, t }) {
  return (0, import_react.createElement)(
    "div",
    { className: EcadBody_default.notice, role: "status" },
    (0, import_react.createElement)(WarningIcon, {}),
    (0, import_react.createElement)("span", { className: EcadBody_default.noticeText }, notice.text),
    (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.iconButton}`, "aria-label": t("retry"), onClick: onDismiss }, (0, import_react.createElement)(CloseIcon, {}))
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
  return (0, import_react.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.sheetSection}` },
    (0, import_react.createElement)("div", { className: EcadBody_default.panelHeading }, t("sheet")),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.sheetRows },
      rows.map((row) => (0, import_react.createElement)(
        "div",
        { key: row.label, className: EcadBody_default.propertyRow, title: row.value },
        (0, import_react.createElement)("span", { className: EcadBody_default.propertyLabel }, row.label),
        (0, import_react.createElement)("span", { className: `${EcadBody_default.propertyValue} ${row.wrap === true ? EcadBody_default.sheetValueWrap : EcadBody_default.sheetValue}` }, row.value)
      ))
    )
  );
}
function LayerPanel({ model, counts, hidden, onToggle, onShowAll, onHideAll, t }) {
  const anyHidden = model.layers.some((layer) => hidden.has(layer.name.toUpperCase()));
  return (0, import_react.createElement)(
    "section",
    { className: `${EcadBody_default.panelSection} ${EcadBody_default.layersSection}`, "data-ecad-layers": "true" },
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.panelHeading },
      t("layers"),
      (0, import_react.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
      anyHidden ? (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.panelHeadingButton}`, onClick: onShowAll }, t("layersShowAll")) : null,
      (0, import_react.createElement)("button", { type: "button", className: `${EcadBody_default.button} ${EcadBody_default.panelHeadingButton}`, onClick: onHideAll }, t("layerHideAll"))
    ),
    (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.layerList, role: "group", "aria-label": t("layers") },
      model.layers.map((layer) => {
        const key = layer.name.toUpperCase();
        const visible = !hidden.has(key);
        const title = `${visible ? t("layerHide", { layer: layer.name }) : t("layerShow", { layer: layer.name })}${layer.frozen === true ? ` \xB7 ${t("layerFrozen")}` : ""}${layer.locked === true ? ` \xB7 ${t("layerLocked")}` : ""}`;
        return (0, import_react.createElement)(
          "div",
          { key: layer.name, className: EcadBody_default.layerRow, "data-ecad-layer-row": layer.name },
          (0, import_react.createElement)(
            "button",
            {
              type: "button",
              className: EcadBody_default.layerToggle,
              "aria-pressed": visible,
              title,
              onClick: () => {
                onToggle(layer.name);
              }
            },
            (0, import_react.createElement)("span", { className: EcadBody_default.layerEye }, (0, import_react.createElement)(EyeGlyph, { open: visible })),
            (0, import_react.createElement)("span", { className: EcadBody_default.swatch, style: { background: layerInk(layer) } }),
            (0, import_react.createElement)("span", { className: EcadBody_default.layerName }, layer.name),
            (0, import_react.createElement)("span", { className: EcadBody_default.layerCount }, String(counts.get(key) ?? 0))
          )
        );
      })
    )
  );
}
function EcadBody(props) {
  const { resourceAddress, content, t, open, ask } = props;
  const request = content?.kind === "renderer" ? content : void 0;
  const revision = request?.revision ?? 0;
  const [localRevision, setLocalRevision] = (0, import_react.useState)(0);
  const [state, setState] = (0, import_react.useState)({ phase: "loading" });
  const [layoutId, setLayoutId] = (0, import_react.useState)(void 0);
  const [hidden, setHidden] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [panelsOpen, setPanelsOpen] = (0, import_react.useState)(true);
  const panelsTouchedRef = (0, import_react.useRef)(false);
  const [chatUnavailable, setChatUnavailable] = (0, import_react.useState)(false);
  const [view, setView] = (0, import_react.useState)({ zoom: 1, panX: 0, panY: 0 });
  const [panning, setPanning] = (0, import_react.useState)(false);
  const [focused, setFocused] = (0, import_react.useState)(false);
  const [query, setQuery] = (0, import_react.useState)("");
  const [notice, setNotice] = (0, import_react.useState)(void 0);
  const gestureRef = (0, import_react.useRef)(void 0);
  const [canvasElement, setCanvasElement] = (0, import_react.useState)(null);
  const size = useElementSize(canvasElement);
  (0, import_react.useEffect)(() => {
    if (panelsTouchedRef.current) return;
    const paneWidth = canvasElement?.parentElement?.clientWidth ?? 0;
    if (paneWidth === 0) return;
    if (paneWidth <= 520) setPanelsOpen(false);
  }, [canvasElement, size.width]);
  (0, import_react.useEffect)(() => {
    if (!focused) return;
    setPanelsOpen(true);
    const onKey = (event) => {
      if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [focused]);
  const retry = (0, import_react.useCallback)(() => {
    if (request !== void 0) request.reload();
    else setLocalRevision((value) => value + 1);
    setState({ phase: "loading" });
  }, [request]);
  const resetSheetState = (0, import_react.useCallback)(() => {
    setView({ zoom: 1, panX: 0, panY: 0 });
    setHidden(/* @__PURE__ */ new Set());
    setLayoutId(void 0);
    setQuery("");
    setNotice(void 0);
    gestureRef.current = void 0;
    setPanning(false);
  }, []);
  (0, import_react.useEffect)(() => {
    if (resourceAddress === "") return;
    const controller = new AbortController();
    setState({ phase: "loading" });
    resetSheetState();
    void open(resourceAddress, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) {
        setState({ phase: "ready", summary: result.summary, model: result.model });
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
    };
  }, [resourceAddress, revision, localRevision, open, resetSheetState, t]);
  const model = state.phase === "ready" ? state.model : void 0;
  const summary = state.phase === "ready" ? state.summary : void 0;
  const format = summary === void 0 ? void 0 : sourceFormatOf(summary);
  const conversion = summary === void 0 ? void 0 : conversionOf(summary.converted);
  const formatLabel = format === void 0 ? "ECAD" : format.toUpperCase();
  const layers = (0, import_react.useMemo)(() => model === void 0 ? /* @__PURE__ */ new Map() : layersOf(model), [model]);
  const activeLayout = (0, import_react.useMemo)(() => {
    if (model === void 0) return void 0;
    return model.layouts.find((layout) => layout.id === layoutId) ?? model.layouts.find((layout) => layout.kind === "model") ?? model.layouts[0];
  }, [model, layoutId]);
  const activeLayoutId = activeLayout?.id;
  const scene = (0, import_react.useMemo)(
    () => activeLayout === void 0 ? void 0 : sceneOf(activeLayout, layers, hidden),
    [activeLayout, layers, hidden]
  );
  const counts = (0, import_react.useMemo)(() => activeLayout === void 0 ? /* @__PURE__ */ new Map() : layerCounts(activeLayout.entities), [activeLayout]);
  const coverage = (0, import_react.useMemo)(() => model === void 0 ? void 0 : coverageOf(model), [model]);
  const coverageText = coverage === void 0 ? "" : coverage.unsupportedTotal > 0 ? t("coverage", { entities: coverage.entities.toLocaleString(), approximate: coverage.approximate, unsupported: coverage.unsupportedTotal }) : t("coverageClean", { entities: coverage.entities.toLocaleString() });
  const coverageTitle = coverage === void 0 || coverage.unsupportedTotal === 0 ? void 0 : t("coverageUndrawn", { list: coverage.unsupported.map(([kind, count]) => `${kind} \xD7${count}`).join(", ") });
  const fit = (0, import_react.useMemo)(() => {
    if (scene === void 0) return { scale: 1, translateX: 0, translateY: 0 };
    return fitBox(scene.bounds, Math.max(size.width, 1), Math.max(size.height, 1), FIT_MARGIN);
  }, [scene, size.width, size.height]);
  const matches = (0, import_react.useMemo)(() => {
    if (scene === void 0) return [];
    const needle = query.trim().toLowerCase();
    if (needle === "") return [];
    const found = [];
    for (const primitive of scene.primitives) {
      if (primitive.text.length === 0) continue;
      if (primitive.text.some((line) => line.text.toLowerCase().includes(needle))) found.push(primitive);
    }
    return found;
  }, [scene, query]);
  const matchText = query.trim() === "" ? void 0 : matches.length === 0 ? t("searchNoMatches") : matches.length === 1 ? t("searchMatchOne") : matches.length > HIGHLIGHT_LIMIT ? t("searchManyMatches", { count: matches.length.toLocaleString() }) : t("searchMatches", { count: matches.length });
  const zoomBy = (0, import_react.useCallback)((factor) => {
    setView((current) => zoomAt(current, factor, size.width / 2, size.height / 2));
  }, [size.width, size.height]);
  const fitView = (0, import_react.useCallback)(() => {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, []);
  (0, import_react.useEffect)(() => {
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
  const localPoint = (0, import_react.useCallback)((clientX, clientY) => {
    const rect = canvasElement?.getBoundingClientRect();
    if (rect === void 0) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, [canvasElement]);
  const onPointerDown = (0, import_react.useCallback)((event) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    const current = event.currentTarget;
    current?.focus();
    setView((current2) => {
      gestureRef.current = { startX: event.clientX, startY: event.clientY, panX: current2.panX, panY: current2.panY, pointerId: event.pointerId };
      return current2;
    });
    setPanning(true);
    current?.setPointerCapture?.(event.pointerId);
  }, []);
  const onPointerMove = (0, import_react.useCallback)((event) => {
    const gesture = gestureRef.current;
    if (gesture === void 0 || gesture.pointerId !== event.pointerId) return;
    setView((current) => ({
      zoom: current.zoom,
      panX: gesture.panX + (event.clientX - gesture.startX),
      panY: gesture.panY + (event.clientY - gesture.startY)
    }));
  }, []);
  const endGesture = (0, import_react.useCallback)((event) => {
    const gesture = gestureRef.current;
    if (gesture === void 0 || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = void 0;
    setPanning(false);
  }, []);
  const onKeyDown = (0, import_react.useCallback)((event) => {
    if (event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "+":
      case "=":
        event.preventDefault();
        zoomBy(1.3);
        return;
      case "-":
        event.preventDefault();
        zoomBy(1 / 1.3);
        return;
      case "0":
        event.preventDefault();
        fitView();
        return;
      case "ArrowLeft":
        event.preventDefault();
        setView((current) => ({ ...current, panX: current.panX + PAN_STEP }));
        return;
      case "ArrowRight":
        event.preventDefault();
        setView((current) => ({ ...current, panX: current.panX - PAN_STEP }));
        return;
      case "ArrowUp":
        event.preventDefault();
        setView((current) => ({ ...current, panY: current.panY + PAN_STEP }));
        return;
      case "ArrowDown":
        event.preventDefault();
        setView((current) => ({ ...current, panY: current.panY - PAN_STEP }));
        return;
      default:
        return;
    }
  }, [fitView, zoomBy]);
  const toggleLayer = (0, import_react.useCallback)((name) => {
    const key = name.toUpperCase();
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const showAllLayers = (0, import_react.useCallback)(() => {
    setHidden(/* @__PURE__ */ new Set());
  }, []);
  const hideAllLayers = (0, import_react.useCallback)(() => {
    setHidden(new Set((model?.layers ?? []).map((layer) => layer.name.toUpperCase())));
  }, [model]);
  const askReview = (0, import_react.useCallback)(() => {
    const path = pathOf2(resourceAddress);
    const ok = ask(resourceAddress, t("askReview", { format: formatLabel, path }));
    if (!ok) setChatUnavailable(true);
  }, [ask, formatLabel, resourceAddress, t]);
  const fileStem = (0, import_react.useMemo)(() => {
    const path = pathOf2(resourceAddress);
    const name = path.split("/").pop() ?? "drawing";
    return name.replace(/\.[^.]+$/u, "") || "drawing";
  }, [resourceAddress]);
  const sheetLabel = (0, import_react.useMemo)(() => {
    if (scene === void 0) return "";
    const width = scene.bounds.max[0] - scene.bounds.min[0];
    const height = scene.bounds.max[1] - scene.bounds.min[1];
    const unit = model === void 0 ? void 0 : unitLabel(model.units);
    return t("statusSheet", { width: fmt(width), height: fmt(height), unit: unit ?? "" });
  }, [model, scene, t]);
  const printSheet = (0, import_react.useCallback)(() => {
    window.print();
  }, []);
  const downloadText = (0, import_react.useCallback)((name, text, mime) => {
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
    } catch (error) {
      void error;
      setNotice({ kind: "error", text: t("exportFailed") });
    }
  }, [t]);
  const exportSvg = (0, import_react.useCallback)(() => {
    if (scene === void 0 || model === void 0) return;
    try {
      const svg = svgDocumentOf(scene, fit, view, {
        title: t("exportSvgTitle", { path: pathOf2(resourceAddress), layout: activeLayout?.name ?? "" }),
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height))
      });
      downloadText(`${t("exportName", { name: fileStem, layout: activeLayout?.id ?? "Model" })}.svg`, svg, "image/svg+xml");
    } catch (error) {
      void error;
      setNotice({ kind: "error", text: t("exportFailed") });
    }
  }, [activeLayout, downloadText, fileStem, fit, model, resourceAddress, scene, size.height, size.width, t, view]);
  const exportPng = (0, import_react.useCallback)(() => {
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
        } catch (error) {
          void error;
          URL.revokeObjectURL(url);
          setNotice({ kind: "error", text: t("exportFailed") });
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        setNotice({ kind: "error", text: t("exportFailed") });
      };
      image.src = url;
    } catch (error) {
      void error;
      setNotice({ kind: "error", text: t("exportFailed") });
    }
  }, [activeLayout, fileStem, fit, resourceAddress, scene, size.height, size.width, t, view]);
  const layouts = model?.layouts ?? [];
  const layoutTabs = layouts.length > 1 ? (0, import_react.createElement)(
    "div",
    { className: `${EcadBody_default.layoutTabs} ${EcadBody_default.noPrint}`, role: "tablist", "aria-label": t("layout") },
    layouts.map((layout) => (0, import_react.createElement)(
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
          setView({ zoom: 1, panX: 0, panY: 0 });
        }
      },
      layout.kind === "model" ? t("modelSpace") : layout.name,
      (0, import_react.createElement)("span", { className: EcadBody_default.tabCount }, String(layout.entities.length))
    ))
  ) : null;
  const sheetUnit = model === void 0 ? void 0 : unitLabel(model.units);
  const printMeta = t("printFooter", {
    format: formatLabel,
    width: scene === void 0 ? "" : fmt(scene.bounds.max[0] - scene.bounds.min[0]),
    height: scene === void 0 ? "" : fmt(scene.bounds.max[1] - scene.bounds.min[1]),
    unit: sheetUnit ?? "",
    selection: sheetLabel
  });
  let stage;
  if (state.phase === "loading") {
    stage = (0, import_react.createElement)(LoadingState, { label: t("loading") });
  } else if (state.phase === "error") {
    stage = (0, import_react.createElement)(FailureState, {
      error: state.error,
      onRetry: retry,
      onAsk: askReview,
      chatUnavailable,
      t
    });
  } else if (scene === void 0 || coverage === void 0 || summary === void 0) {
    stage = (0, import_react.createElement)(LoadingState, { label: t("loadingModel") });
  } else if (scene.primitives.length === 0) {
    stage = (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.state, role: "status" },
      (0, import_react.createElement)("h3", { className: EcadBody_default.stateTitle }, t("empty")),
      (0, import_react.createElement)("p", { className: EcadBody_default.stateBody }, t("emptyHint", { entities: coverage.entities.toLocaleString() })),
      (0, import_react.createElement)("div", { className: EcadBody_default.stateActions }, (0, import_react.createElement)("button", { type: "button", className: EcadBody_default.button, onClick: retry }, t("retry")))
    );
  } else {
    const panelToggle = panelsOpen ? "" : ` ${EcadBody_default.sidePanelHidden}`;
    const canvasLabel = t("canvasLabel", { path: pathOf2(resourceAddress) });
    stage = (0, import_react.createElement)(
      "div",
      { className: EcadBody_default.stage },
      (0, import_react.createElement)(
        "div",
        { className: EcadBody_default.canvasColumn },
        (0, import_react.createElement)(
          "div",
          {
            ref: setCanvasElement,
            className: `${EcadBody_default.canvasWrap}${panning ? ` ${EcadBody_default.panning}` : ""}`,
            tabIndex: 0,
            role: "group",
            "aria-label": canvasLabel,
            title: t("panHint"),
            style: { cursor: panning ? "grabbing" : "grab" },
            onKeyDown,
            onPointerDown,
            onPointerMove,
            onPointerUp: endGesture,
            onPointerCancel: endGesture
          },
          (0, import_react.createElement)(SceneView, {
            scene,
            fit,
            view,
            label: canvasLabel,
            highlight: matches.length > HIGHLIGHT_LIMIT ? matches.slice(0, HIGHLIGHT_LIMIT) : matches
          }),
          coverage.truncated ? (0, import_react.createElement)(
            "div",
            { className: EcadBody_default.notice, role: "status" },
            (0, import_react.createElement)(WarningIcon, {}),
            (0, import_react.createElement)("span", { className: EcadBody_default.noticeText }, t("truncated"))
          ) : null,
          notice === void 0 ? null : (0, import_react.createElement)(NoticeView, { t, notice, onDismiss: () => {
            setNotice(void 0);
          } })
        ),
        (0, import_react.createElement)(
          "div",
          { className: EcadBody_default.statusBar, role: "status", "aria-label": t("statusBarLabel") },
          (0, import_react.createElement)("span", { className: EcadBody_default.statusItem }, sheetLabel),
          (0, import_react.createElement)("span", { className: EcadBody_default.statusItem }, `${t("zoomIn")}: ${Math.round(view.zoom * 100)}%`),
          ...matches.length === 0 || query.trim() === "" ? [] : [(0, import_react.createElement)("span", { className: EcadBody_default.statusItem }, matchText ?? "")]
        )
      ),
      (0, import_react.createElement)(
        "div",
        { className: `${EcadBody_default.sidePanel}${panelToggle} ${EcadBody_default.noPrint}` },
        (0, import_react.createElement)(
          "div",
          { className: EcadBody_default.panelHeading },
          (0, import_react.createElement)("span", { className: EcadBody_default.panelHeadingSpacer }),
          (0, import_react.createElement)("button", {
            type: "button",
            className: `${EcadBody_default.button} ${EcadBody_default.iconButton} ${EcadBody_default.panelClose}`,
            title: t("panels"),
            "aria-label": t("panels"),
            onClick: () => {
              panelsTouchedRef.current = true;
              setPanelsOpen(false);
            }
          }, (0, import_react.createElement)(CloseIcon, {}))
        ),
        (0, import_react.createElement)(LayerPanel, {
          t,
          model,
          counts,
          hidden,
          onToggle: toggleLayer,
          onShowAll: showAllLayers,
          onHideAll: hideAllLayers
        }),
        (0, import_react.createElement)(SheetSection, {
          titleBlock: summary.titleBlock,
          coverage,
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
  return (0, import_react.createElement)(
    "div",
    {
      className: `${EcadBody_default.root}${focused ? ` ${EcadBody_default.focused}` : ""}`,
      "data-ecad-pane": "drawing",
      "data-ecad-state": state.phase,
      ...format === void 0 ? {} : { "data-ecad-format": format }
    },
    (0, import_react.createElement)(
      "div",
      { className: `${EcadBody_default.printOnly} ${EcadBody_default.printHeader}` },
      (0, import_react.createElement)("div", { className: EcadBody_default.printTitle }, t("printHeader", { path: pathOf2(resourceAddress), layout: activeLayout?.name ?? "" })),
      (0, import_react.createElement)("div", { className: EcadBody_default.printMeta }, printMeta)
    ),
    (0, import_react.createElement)(CadToolbar, {
      coverage: coverage ?? { entities: 0, approximate: 0, unsupportedTotal: 0, unsupported: [], truncated: false },
      coverageText,
      coverageTitle,
      ready: state.phase === "ready" && coverage !== void 0,
      format,
      conversion,
      panelsOpen,
      chatUnavailable,
      query,
      onQuery: setQuery,
      matchText,
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
      focused,
      onToggleFocus: () => {
        setFocused((value) => !value);
      },
      t
    }),
    layoutTabs,
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
  retry: "Retry",
  unavailable: "The ECAD service is unavailable in this composition.",
  unavailableFix: "Open this drawing in a full AryaCode profile with the engineering bundle mounted.",
  errorTitle: "Could not open this drawing",
  errorCode: "Code",
  errorFix: "What to do",
  invalidArtifact: "The cached preview is not a readable sheet model.",
  modelSpace: "Model",
  layout: "Layout",
  layoutTab: "Show layout {name}",
  coverage: "{entities} entities \xB7 {approximate} approximate \xB7 {unsupported} undrawn",
  coverageClean: "{entities} entities \xB7 all drawn as carried geometry",
  coverageUndrawn: "Undrawn source types: {list}",
  coverageLabel: "Coverage",
  truncatedBadge: "Truncated",
  truncated: "The sheet model was truncated at the entity cap; some geometry is not shown.",
  approximateBadge: "Approximate",
  approximateHint: "{count} primitives are drawn from approximate geometry (tessellated splines, hatch outlines, placeholder dimensions).",
  readOnly: "Read-only",
  readOnlyHint: "This pane views drawings. Edit the drawing in AryaCAD Electrical, then reload it here to review the change.",
  writes: "Writes enabled",
  layers: "Layers",
  layersShowAll: "Show every layer",
  layerShow: "Show layer {layer}",
  layerHide: "Hide layer {layer}",
  layerFrozen: "Frozen in the drawing",
  layerLocked: "Locked in the drawing",
  text: "Text",
  sheet: "Sheet",
  sheetNumber: "Sheet",
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
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  panels: "Show or hide the drawing panels",
  focusEnter: "Expand drawing to the whole window",
  focusExit: "Return drawing to the sidebar",
  panHint: "Drag to pan \xB7 wheel to zoom \xB7 + and \u2212 zoom, 0 frames the whole sheet, arrow keys pan",
  search: "Find text on the sheet",
  searchHint: "Find text\u2026",
  searchMatches: "{count} text matches",
  searchMatchOne: "one text match",
  searchManyMatches: "{count} text matches \xB7 too many to highlight",
  searchNoMatches: "No text matches",
  canvasLabel: "Drawing canvas for {path}",
  empty: "This drawing has no drawable entities.",
  emptyHint: "The sheet model carries {entities} entities and none of them is geometry this preview draws.",
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
  outputPath: "Output",
  cardTitleOpen: "Drawing opened",
  cardTitleScan: "Workspace indexed",
  cardTitleChecks: "Review findings",
  cardTitleCrossReference: "Cross-reference candidates",
  cardTitleRender: "Drawing rendered",
  cardTitleTool: "{tool} result",
  cardPreparing: "Preparing call\u2026",
  cardRunning: "Running\u2026",
  cardToolError: "The tool reported an error.",
  cardOpenDrawing: "Open drawing",
  cardOpenWritten: "Open written drawing",
  cardOpenHint: "Open {path} from the drawing panel.",
  cardDrawing: "Drawing",
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
  dockDrawings: "{count} drawings",
  dockDwg: "{count} DWG",
  dockProfileConfirmed: "profile confirmed",
  dockProfileDefault: "default profile",
  dockWritesOn: "writes on",
  dockWritesOff: "writes off",
  dockLabel: "Workspace drawings: {count}, {dwg} DWG",
  // -- CAD workspace --------------------------------------------------------
  statusBarLabel: "Drawing status",
  statusSheet: "{width} \xD7 {height} {unit}",
  layerHideAll: "Hide every layer",
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
  zoomExtentsHint: "Frame the whole sheet"
};
var zh = {
  title: "ECAD \u56FE\u7EB8",
  loading: "\u6B63\u5728\u8BFB\u53D6\u56FE\u7EB8\u2026",
  loadingModel: "\u6B63\u5728\u7ED8\u5236\u56FE\u7EB8\u2026",
  retry: "\u91CD\u8BD5",
  unavailable: "\u6B64\u7EC4\u5408\u4E2D\u6CA1\u6709\u53EF\u7528\u7684 ECAD \u670D\u52A1\u3002",
  unavailableFix: "\u8BF7\u5728\u5B8C\u6574\u6302\u8F7D\u5DE5\u7A0B\u63D2\u4EF6\u7684 AryaCode \u914D\u7F6E\u4E2D\u6253\u5F00\u6B64\u56FE\u7EB8\u3002",
  errorTitle: "\u65E0\u6CD5\u6253\u5F00\u6B64\u56FE\u7EB8",
  errorCode: "\u9519\u8BEF\u7801",
  errorFix: "\u5904\u7406\u5EFA\u8BAE",
  invalidArtifact: "\u7F13\u5B58\u7684\u9884\u89C8\u6587\u4EF6\u4E0D\u662F\u53EF\u8BFB\u53D6\u7684\u56FE\u7EB8\u6A21\u578B\u3002",
  modelSpace: "\u6A21\u578B",
  layout: "\u5E03\u5C40",
  layoutTab: "\u663E\u793A\u5E03\u5C40 {name}",
  coverage: "{entities} \u4E2A\u56FE\u5143 \xB7 {approximate} \u4E2A\u8FD1\u4F3C \xB7 {unsupported} \u4E2A\u672A\u7ED8\u5236",
  coverageClean: "{entities} \u4E2A\u56FE\u5143 \xB7 \u5168\u90E8\u6309\u539F\u6709\u51E0\u4F55\u7ED8\u5236",
  coverageUndrawn: "\u672A\u7ED8\u5236\u7684\u6E90\u7C7B\u578B\uFF1A{list}",
  coverageLabel: "\u8986\u76D6\u8303\u56F4",
  truncatedBadge: "\u5DF2\u622A\u65AD",
  truncated: "\u56FE\u7EB8\u6A21\u578B\u5728\u5B9E\u4F53\u4E0A\u9650\u5904\u88AB\u622A\u65AD\uFF0C\u90E8\u5206\u51E0\u4F55\u672A\u663E\u793A\u3002",
  approximateBadge: "\u8FD1\u4F3C",
  approximateHint: "{count} \u4E2A\u56FE\u5143\u7531\u8FD1\u4F3C\u51E0\u4F55\u7ED8\u5236\uFF08\u6837\u6761\u7EC6\u5206\u3001\u586B\u5145\u8F6E\u5ED3\u3001\u5360\u4F4D\u6807\u6CE8\uFF09\u3002",
  readOnly: "\u53EA\u8BFB",
  readOnlyHint: "\u6B64\u9762\u677F\u53EA\u67E5\u770B\u56FE\u7EB8\u3002\u8BF7\u5728 AryaCAD Electrical \u4E2D\u7F16\u8F91\u56FE\u7EB8\uFF0C\u7136\u540E\u5728\u6B64\u91CD\u65B0\u52A0\u8F7D\u4EE5\u67E5\u770B\u66F4\u6539\u3002",
  writes: "\u5199\u5165\u5DF2\u542F\u7528",
  layers: "\u56FE\u5C42",
  layersShowAll: "\u663E\u793A\u6240\u6709\u56FE\u5C42",
  layerShow: "\u663E\u793A\u56FE\u5C42 {layer}",
  layerHide: "\u9690\u85CF\u56FE\u5C42 {layer}",
  layerFrozen: "\u56FE\u7EB8\u4E2D\u5DF2\u51BB\u7ED3",
  layerLocked: "\u56FE\u7EB8\u4E2D\u5DF2\u9501\u5B9A",
  text: "\u6587\u5B57",
  sheet: "\u56FE\u7EB8\u4FE1\u606F",
  sheetNumber: "\u56FE\u53F7",
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
  zoomIn: "\u653E\u5927",
  zoomOut: "\u7F29\u5C0F",
  panels: "\u663E\u793A\u6216\u9690\u85CF\u56FE\u7EB8\u9762\u677F",
  focusEnter: "\u5C06\u56FE\u7EB8\u5C55\u5F00\u5230\u6574\u4E2A\u7A97\u53E3",
  focusExit: "\u5C06\u56FE\u7EB8\u6536\u56DE\u4FA7\u680F",
  panHint: "\u62D6\u52A8\u5E73\u79FB \xB7 \u6EDA\u8F6E\u7F29\u653E \xB7 + \u548C \u2212 \u7F29\u653E\uFF0C0 \u7F29\u653E\u81F3\u6574\u5F20\u56FE\u7EB8\uFF0C\u65B9\u5411\u952E\u5E73\u79FB",
  search: "\u5728\u56FE\u7EB8\u4E2D\u67E5\u627E\u6587\u5B57",
  searchHint: "\u67E5\u627E\u6587\u5B57\u2026",
  searchMatches: "{count} \u5904\u6587\u5B57\u5339\u914D",
  searchMatchOne: "\u4E00\u5904\u6587\u5B57\u5339\u914D",
  searchManyMatches: "{count} \u5904\u6587\u5B57\u5339\u914D \xB7 \u6570\u91CF\u8FC7\u591A\u4E0D\u518D\u9AD8\u4EAE",
  searchNoMatches: "\u6CA1\u6709\u6587\u5B57\u5339\u914D",
  canvasLabel: "{path} \u7684\u7ED8\u56FE\u753B\u5E03",
  empty: "\u6B64\u56FE\u7EB8\u6CA1\u6709\u53EF\u7ED8\u5236\u7684\u56FE\u5143\u3002",
  emptyHint: "\u56FE\u7EB8\u6A21\u578B\u5305\u542B {entities} \u4E2A\u56FE\u5143\uFF0C\u4F46\u6CA1\u6709\u6B64\u9884\u89C8\u53EF\u7ED8\u5236\u7684\u51E0\u4F55\u3002",
  dxfVersionLabel: "DXF \u7248\u672C",
  units: "\u5355\u4F4D",
  unitsUnset: "\u672A\u8BBE\u7F6E\u5355\u4F4D",
  outputPath: "\u8F93\u51FA",
  cardTitleOpen: "\u5DF2\u6253\u5F00\u56FE\u7EB8",
  cardTitleScan: "\u5DE5\u4F5C\u533A\u5DF2\u7D22\u5F15",
  cardTitleChecks: "\u5BA1\u67E5\u53D1\u73B0",
  cardTitleCrossReference: "\u4EA4\u53C9\u5F15\u7528\u5019\u9009",
  cardTitleRender: "\u56FE\u7EB8\u5DF2\u6E32\u67D3",
  cardTitleTool: "{tool} \u7ED3\u679C",
  cardPreparing: "\u6B63\u5728\u51C6\u5907\u8C03\u7528\u2026",
  cardRunning: "\u6B63\u5728\u8FD0\u884C\u2026",
  cardToolError: "\u5DE5\u5177\u62A5\u544A\u4E86\u9519\u8BEF\u3002",
  cardOpenDrawing: "\u6253\u5F00\u56FE\u7EB8",
  cardOpenWritten: "\u6253\u5F00\u5DF2\u5199\u5165\u7684\u56FE\u7EB8",
  cardOpenHint: "\u5728\u56FE\u7EB8\u9762\u677F\u4E2D\u6253\u5F00 {path}\u3002",
  cardDrawing: "\u56FE\u7EB8",
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
  dockDrawings: "{count} \u5F20\u56FE\u7EB8",
  dockDwg: "{count} DWG",
  dockProfileConfirmed: "\u914D\u7F6E\u5DF2\u786E\u8BA4",
  dockProfileDefault: "\u9ED8\u8BA4\u914D\u7F6E",
  dockWritesOn: "\u5199\u5165\u5F00\u542F",
  dockWritesOff: "\u5199\u5165\u5173\u95ED",
  dockLabel: "\u5DE5\u4F5C\u533A\u56FE\u7EB8\uFF1A{count} \u5F20\uFF0C{dwg} \u5F20 DWG",
  // -- CAD 工作区 -----------------------------------------------------------
  statusBarLabel: "\u7ED8\u56FE\u72B6\u6001",
  statusSheet: "{width} \xD7 {height} {unit}",
  layerHideAll: "\u9690\u85CF\u6240\u6709\u56FE\u5C42",
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
  zoomExtentsHint: "\u7F29\u653E\u4EE5\u663E\u793A\u6574\u5F20\u56FE\u7EB8"
};

// packages/ecad/src/client/index.tsx
var ID = "dsh-engineering-ecad/drawing";
var NS = "sidebarEcad";
var MOUNT_TIMEOUT_MS = 15e3;
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
      return { ok: true, summary, model: artifact.model };
    } catch (error) {
      if (signal.aborted) throw error;
      return { ok: false, error: failureOf(error, { code: "ECAD_PREVIEW_READ", fix: "Reload the drawing; the preview artifact could not be read." }) };
    }
  };
  const injected = {
    open,
    ask: (address, context) => draft(address, context)
  };
  function WorkspaceEcadBody(props) {
    const [revision, setRevision] = (0, import_react2.useState)(0);
    return (0, import_react2.createElement)(EcadBody, {
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
