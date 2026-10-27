window.__ModuleLoader__.load({
  id: '@aryacode/dsh-engineering-ftview-viewer',
  factory: (require) => {
    const module = { exports: {} }
    ;(function (module, exports, require) {
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/ftview-viewer/face/face.ts
var face_exports = {};
__export(face_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(face_exports);
var React = __toESM(require("react"), 1);

// packages/ftview-viewer/src/xml.ts
var ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'"
};
function decode(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (whole, body) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}
function attributesOf(body) {
  const attributes = {};
  for (const match of body.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/gu)) {
    const name = match[1] ?? "";
    const value = match[3] ?? match[4] ?? "";
    attributes[name] = decode(value);
  }
  return attributes;
}
function parseXml(source) {
  const root = { tag: "#root", attributes: {}, children: [], text: "" };
  const stack = [root];
  const pattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_:][-A-Za-z0-9_:.]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gu;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) {
      const text = source.slice(last, index);
      const parent2 = stack[stack.length - 1];
      if (parent2 !== void 0) parent2.text += decode(text);
    }
    last = index + match[0].length;
    if (match[0].startsWith("<!--") || match[0].startsWith("<?")) continue;
    if (match[1] !== void 0) {
      const parent2 = stack[stack.length - 1];
      if (parent2 !== void 0) parent2.text += match[1];
      continue;
    }
    const closing = match[2] === "/";
    const tag = match[3] ?? "";
    if (closing) {
      const open = stack.pop();
      if (open === void 0 || open.tag !== tag) throw new Error(`mismatched </${tag}> in display XML`);
      continue;
    }
    const node = { tag, attributes: attributesOf(match[4] ?? ""), children: [], text: "" };
    const parent = stack[stack.length - 1];
    if (parent === void 0) throw new Error(`unexpected <${tag}>`);
    parent.children.push(node);
    if (match[5] !== "/") stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1]?.tag ?? ""}> in display XML`);
  const document = root.children[0];
  if (document === void 0) throw new Error("empty display XML");
  return document;
}
function child(node, tag) {
  return node.children.find((candidate) => candidate.tag === tag);
}
function attribute(node, name) {
  const value = node.attributes[name];
  if (value === void 0) return void 0;
  const trimmed = value.trim();
  return trimmed === "" ? void 0 : trimmed;
}
function numberAttribute(node, name, fallback) {
  const value = attribute(node, name);
  if (value === void 0) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// packages/ftview-viewer/src/expression.ts
var COMPARISON = /^\s*(.+?)\s*(<=|>=|<>|!=|=|<|>)\s*(.+?)\s*$/u;
function operand(text, values) {
  const trimmed = text.trim();
  const tag = /^\{([^}]+)\}$/u.exec(trimmed);
  if (tag !== null) {
    const value = values[(tag[1] ?? "").trim()];
    return value === void 0 ? { known: false, value: 0 } : { known: true, value: typeof value === "boolean" ? Number(value) : value };
  }
  const quoted = /^['"](.*)['"]$/u.exec(trimmed);
  if (quoted !== null) return { known: true, value: quoted[1] ?? "" };
  const number = Number(trimmed);
  if (Number.isFinite(number)) return { known: true, value: number };
  return void 0;
}
function compare(left, operator, right) {
  const bothNumeric = typeof left === "number" && typeof right === "number";
  const a = bothNumeric ? left : String(left);
  const b = bothNumeric ? right : String(right);
  switch (operator) {
    case "=":
      return a === b;
    case "<>":
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
    default:
      return false;
  }
}
function clause(text, values) {
  const match = COMPARISON.exec(text);
  if (match === null) return void 0;
  const left = operand(match[1] ?? "", values);
  const right = operand(match[3] ?? "", values);
  if (left === void 0 || right === void 0 || !left.known || !right.known) return void 0;
  return compare(left.value, match[2] ?? "=", right.value);
}
function evaluate(expression, values) {
  const text = expression.trim();
  if (text === "") return void 0;
  const parts = text.split(/\s+(AND|OR)\s+/iu);
  if (parts.length === 1) return clause(text, values);
  const results = [];
  const operators = [];
  for (const part of parts) {
    if (/^(AND|OR)$/iu.test(part)) operators.push(part.toUpperCase());
    else results.push(clause(part, values));
  }
  if (results.some((result) => result === void 0)) return void 0;
  return operators.reduce((combined, operator, index) => {
    const next = results[index + 1] ?? false;
    return operator === "AND" ? combined && next : combined || next;
  }, results[0] ?? false);
}

// packages/ftview-viewer/src/render.ts
var OBJECTS = /* @__PURE__ */ new Set([
  "panel",
  "text",
  "group",
  "momentaryButton",
  "gotoButton",
  "multistateButton",
  "latchedButton",
  "maintainButton",
  "numericDisplay",
  "numericInput",
  "stringDisplay",
  "stringInput",
  "image",
  "line",
  "rectangle",
  "ellipse",
  "polygon",
  "arc",
  "barGraph",
  "gauge",
  "listSelector",
  "trend",
  "alarmList",
  "alarmStatusList",
  "alarmBanner",
  "clearAlarmBannerButton",
  "recipe",
  "activeX",
  "symbol",
  "referenceObject",
  "globalObject",
  "rampButton"
]);
var NAMED_COLORS = {
  white: "#ffffff",
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  maroon: "#800000",
  navy: "#000080",
  teal: "#008080",
  lime: "#00ff00",
  olive: "#808000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  aqua: "#00ffff",
  orange: "#ffa500"
};
function escapeXml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function colourOf(value) {
  if (value === void 0) return void 0;
  const text = value.trim().toLowerCase();
  if (text === "" || text === "none" || text === "transparent") return void 0;
  const named = NAMED_COLORS[text];
  if (named !== void 0) return named;
  if (/^#[0-9a-f]{6}$/u.test(text)) return text;
  if (/^#[0-9a-f]{8}$/u.test(text)) return `#${text.slice(3)}`;
  if (/^#[0-9a-f]{3}$/u.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  return void 0;
}
function stateOf(node) {
  const states = child(node, "states");
  if (states === void 0) return void 0;
  const list = states.children.filter((candidate) => candidate.tag === "state");
  if (list.length === 0) return void 0;
  const current = attribute(node, "currentStateId") ?? attribute(node, "stateId") ?? "0";
  const exact = list.find((candidate) => attribute(candidate, "stateId") === current);
  const selected = exact ?? list.find((candidate) => attribute(candidate, "stateId") === "0") ?? list[0];
  if (selected === void 0) return void 0;
  const caption = child(selected, "caption");
  const id = attribute(selected, "stateId") ?? "0";
  return {
    id,
    backColor: colourOf(attribute(selected, "backColor")),
    borderColor: colourOf(attribute(selected, "borderColor")),
    ...caption === void 0 ? {} : {
      caption: attribute(caption, "caption"),
      captionColor: colourOf(attribute(caption, "color")),
      ...attribute(caption, "fontFamily") === void 0 ? {} : { fontFamily: attribute(caption, "fontFamily") },
      fontSize: numberAttribute(caption, "fontSize", 12),
      bold: attribute(caption, "bold") === "true",
      italic: attribute(caption, "italic") === "true",
      alignment: attribute(caption, "alignment")
    }
  };
}
function paintOf(node, state) {
  const backStyle = attribute(node, "backStyle") ?? "solid";
  const fill = backStyle === "transparent" ? "none" : colourOf(state?.backColor ?? attribute(node, "backColor")) ?? "#d4d0c8";
  const borderStyle = attribute(node, "borderStyle") ?? "none";
  const stroke = borderStyle === "none" ? "none" : colourOf(state?.borderColor ?? attribute(node, "borderColor") ?? attribute(node, "foreColor")) ?? "#808080";
  const strokeWidth = borderStyle === "none" ? 0 : Math.max(1, numberAttribute(node, "borderWidth", 1));
  return { fill, stroke, strokeWidth };
}
function captionOf(node, state) {
  const own = child(node, "caption");
  const text = attribute(node, "caption") ?? (own === void 0 ? void 0 : attribute(own, "caption")) ?? state?.caption ?? "";
  const anchor = (() => {
    const alignment = state?.alignment ?? attribute(own ?? node, "alignment") ?? "middleCenter";
    if (alignment.toLowerCase().includes("left")) return "start";
    if (alignment.toLowerCase().includes("right")) return "end";
    return "middle";
  })();
  return {
    text,
    color: colourOf(state?.captionColor ?? (own === void 0 ? void 0 : attribute(own, "color")) ?? attribute(node, "foreColor")) ?? "#000000",
    family: state?.fontFamily ?? attribute(own ?? node, "fontFamily") ?? attribute(node, "fontFamily") ?? "Arial Unicode MS",
    size: state?.fontSize ?? numberAttribute(own ?? node, "fontSize", numberAttribute(node, "fontSize", 12)),
    bold: state?.bold ?? attribute(own ?? node, "bold") === "true",
    italic: state?.italic ?? attribute(own ?? node, "italic") === "true",
    anchor
  };
}
function textX(left, width, anchor, margin) {
  if (anchor === "start") return left + margin;
  if (anchor === "end") return left + width - margin;
  return left + width / 2;
}
function textElement(caption, left, top, width, height, margin) {
  const lines = caption.text.split(/\r?\n/u);
  const lineHeight = caption.size * 1.25;
  const startY = top + height / 2 - (lines.length - 1) * lineHeight / 2;
  const parts = lines.map((line, index) => `<tspan x="${textX(left, width, caption.anchor, margin)}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`);
  return `<text text-anchor="${caption.anchor}" dominant-baseline="middle" font-family="${escapeXml(caption.family)}" font-size="${caption.size}" fill="${caption.color}"${caption.bold ? ' font-weight="bold"' : ""}${caption.italic ? ' font-style="italic"' : ""}>${parts.join("")}</text>`;
}
function imageElement(node, options, left, top, width, height) {
  const settings = child(node, "imageSettings");
  const name = attribute(node, "imageName") ?? (settings === void 0 ? void 0 : attribute(settings, "imageName")) ?? "";
  const href = name === "" ? void 0 : options.imageHref === void 0 ? `Images/${name}` : options.imageHref(name);
  if (href !== void 0) return `<image x="${left}" y="${top}" width="${width}" height="${height}" href="${escapeXml(href)}" preserveAspectRatio="none"/>`;
  return `<g><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#f0f0f0" stroke="#909090" stroke-dasharray="4 3"/><text x="${left + width / 2}" y="${top + height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI" font-size="10" fill="#606060">image ${escapeXml(name || "(unnamed)")}</text></g>`;
}
function connectionOf(node, name) {
  const connections = child(node, "connections");
  if (connections === void 0) return void 0;
  const connection = connections.children.find((candidate) => candidate.tag === "connection" && attribute(candidate, "name") === name);
  return connection === void 0 ? void 0 : attribute(connection, "expression");
}
function numericValue(expression, options) {
  if (expression === void 0) return void 0;
  const value = options.tagValues?.[expression];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : void 0;
}
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
function barGraphElement(node, options, left, top, width, height, paint) {
  const minimum = numberAttribute(node, "minValue", 0);
  const maximum = numberAttribute(node, "maxValue", 100);
  const value = numericValue(connectionOf(node, "Value"), options) ?? minimum;
  const fraction = maximum === minimum ? 0 : clamp((value - minimum) / (maximum - minimum), 0, 1);
  const fill = colourOf(attribute(node, "fillColor")) ?? colourOf(attribute(node, "foreColor")) ?? "#00c000";
  const direction = attribute(node, "fillDirection") ?? "leftToRight";
  const filled = (() => {
    switch (direction) {
      case "rightToLeft":
        return { x: left + width * (1 - fraction), y: top, width: width * fraction, height };
      case "topToBottom":
        return { x: left, y: top, width, height: height * fraction };
      case "bottomToTop":
        return { x: left, y: top + height * (1 - fraction), width, height: height * fraction };
      default:
        return { x: left, y: top, width: width * fraction, height };
    }
  })();
  const thresholds = Number.parseInt(attribute(node, "numberOfThresholds") ?? "0", 10) || 0;
  const marks = [];
  for (let index = 1; index <= thresholds; index += 1) {
    const element = node.children.find((candidate) => candidate.tag === `thresh${index}Value`);
    const fromElement = element === void 0 ? Number.NaN : Number.parseFloat(element.text.trim());
    const at = Number.isFinite(fromElement) ? fromElement : numberAttribute(node, `thresh${index}Value`, Number.NaN);
    if (!Number.isFinite(at) || maximum === minimum) continue;
    const fractionOfMark = clamp((at - minimum) / (maximum - minimum), 0, 1);
    const x = left + width * fractionOfMark;
    marks.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" stroke="#ff0000" stroke-width="1"/>`);
  }
  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>` + (fraction > 0 ? `<rect x="${filled.x}" y="${filled.y}" width="${filled.width}" height="${filled.height}" fill="${fill}"/>` : "") + marks.join("");
}
function gaugeElement(node, options, left, top, width, height) {
  const minimum = numberAttribute(node, "minValue", 0);
  const maximum = numberAttribute(node, "maxValue", 100);
  const value = numericValue(connectionOf(node, "Value"), options) ?? minimum;
  const fraction = maximum === minimum ? 0 : clamp((value - minimum) / (maximum - minimum), 0, 1);
  const cx = left + width / 2;
  const cy = top + height / 2;
  const radius = Math.min(width, height) / 2 - 4;
  const start = Math.PI * 0.75;
  const end = Math.PI * 2.25;
  const angle = start + (end - start) * fraction;
  const point = (at, r) => `${cx + Math.cos(at) * r},${cy + Math.sin(at) * r}`;
  const arc = `M ${point(start, radius)} A ${radius} ${radius} 0 1 1 ${point(end, radius)}`;
  return `<path d="${arc}" fill="none" stroke="#808080" stroke-width="2"/><line x1="${cx}" y1="${cy}" x2="${point(angle, radius - 2).split(",")[0]}" y2="${point(angle, radius - 2).split(",")[1]}" stroke="#c00000" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="3" fill="#202020"/>`;
}
function trendElement(node, left, top, width, height, paint) {
  const lines = [];
  for (let index = 1; index < 4; index += 1) {
    const y = top + height / 4 * index;
    lines.push(`<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="#b0b0b0" stroke-width="1"/>`);
  }
  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>${lines.join("")}<text x="${left + 6}" y="${top + 14}" font-family="Segoe UI" font-size="10" fill="#606060">trend</text>`;
}
function valueElement(node, caption, left, top, width, height, margin, options) {
  const expression = attribute(node, "expression") ?? connectionOf(node, "Value") ?? "";
  const value = options.tagValues?.[expression];
  const shown = value === void 0 ? "####" : String(value);
  return textElement({ ...caption, text: shown }, left, top, width, height, margin);
}
function resolveReference(node, options) {
  if (attribute(node, "isReferenceObject") !== "true") return node;
  const link = attribute(node, "linkBaseObject");
  const base = link === void 0 ? void 0 : options.globals?.[link];
  if (base === void 0) return node;
  const placement = /* @__PURE__ */ new Set(["name", "left", "top", "width", "height", "visible", "isReferenceObject", "linkBaseObject", "linkSize", "linkConnections", "linkAnimations"]);
  const attributes = { ...base.attributes };
  for (const [key, value] of Object.entries(node.attributes)) {
    if (placement.has(key)) attributes[key] = value;
  }
  return {
    tag: base.tag,
    attributes,
    children: node.children.length > 0 ? node.children : base.children,
    text: base.text
  };
}
function animatedVisibility(node, options) {
  const animations = child(node, "animations");
  if (animations === void 0) return void 0;
  for (const animation of animations.children) {
    if (animation.tag !== "animateVisibility") continue;
    const expression = attribute(animation, "expression");
    if (expression === void 0) continue;
    const result = evaluate(expression, options.tagValues ?? {});
    if (result === void 0) continue;
    const trueState = attribute(animation, "expressionTrueState") ?? "visible";
    return result ? trueState === "visible" : trueState !== "visible";
  }
  return void 0;
}
function renderObject(rawNode, depth, options) {
  const node = resolveReference(rawNode, options);
  if (animatedVisibility(node, options) === false) return "";
  const left = numberAttribute(node, "left", 0);
  const top = numberAttribute(node, "top", 0);
  const width = numberAttribute(node, "width", 0);
  const height = numberAttribute(node, "height", 0);
  const visible = attribute(node, "visible");
  if (visible === "false" || visible === "0" || visible === "no") return "";
  const state = stateOf(node);
  const paint = paintOf(node, state);
  const caption = captionOf(node, state);
  const margin = numberAttribute(node, "horizontalMargin", 4);
  const shape = (() => {
    switch (node.tag) {
      case "panel":
      case "rectangle":
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
      case "ellipse":
        return `<ellipse cx="${left + width / 2}" cy="${top + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
      case "line":
        return `<line x1="${left}" y1="${top}" x2="${left + width}" y2="${top + height}" stroke="${paint.stroke === "none" ? paint.fill : paint.stroke}" stroke-width="${Math.max(1, paint.strokeWidth)}"/>`;
      case "image":
        return imageElement(node, options, left, top, width, height);
      case "numericDisplay":
      case "numericInput":
      case "stringDisplay":
      case "stringInput":
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>` + valueElement(node, caption, left, top, width, height, margin, options);
      case "barGraph":
        return barGraphElement(node, options, left, top, width, height, paint);
      case "gauge":
        return gaugeElement(node, options, left, top, width, height);
      case "trend":
        return trendElement(node, left, top, width, height, paint);
      case "listSelector": {
        const body = `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
        const label = caption.text === "" ? "list" : caption.text;
        return body + textElement({ ...caption, text: label, anchor: "start" }, left, top, width, height, margin);
      }
      case "alarmList":
      case "alarmStatusList":
      case "alarmBanner":
      case "clearAlarmBannerButton":
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#f4f4f4" stroke="#a0a0a0"/><text x="${left + 8}" y="${top + 18}" font-family="Segoe UI" font-size="11" fill="#505050">${escapeXml(node.tag)}</text>`;
      case "group":
        return "";
      default:
        break;
    }
    if (OBJECTS.has(node.tag)) {
      const body = `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
      return caption.text === "" ? body : body + textElement(caption, left, top, width, height, margin);
    }
    return "";
  })();
  const own = shape === "" ? "" : shape;
  const nested = node.children.filter((candidate) => OBJECTS.has(candidate.tag));
  if (nested.length === 0) return own;
  return own + `<g transform="translate(${left},${top})">${nested.map((candidate) => renderObject(candidate, depth + 1, options)).join("")}</g>`;
}
function renderDisplay(source, options = {}) {
  const display = parseXml(source);
  if (display.tag !== "gfx" && display.tag !== "display") throw new Error(`not a FactoryTalk View display: root element is <${display.tag}>`);
  const settings = child(display, "displaySettings");
  const width = settings === void 0 ? numberAttribute(display, "width", 640) : numberAttribute(settings, "width", numberAttribute(display, "width", 640));
  const height = settings === void 0 ? numberAttribute(display, "height", 480) : numberAttribute(settings, "height", numberAttribute(display, "height", 480));
  const background = colourOf(attribute(display, "backColor") ?? (settings === void 0 ? void 0 : attribute(settings, "backColor"))) ?? "#c6c6c6";
  const container = child(display, "objects") ?? display;
  const objects = container.children.filter((candidate) => OBJECTS.has(candidate.tag));
  const body = objects.map((object) => renderObject(object, 0, options)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/>${body}</svg>`;
}

// packages/ftview-viewer/face/face.ts
var NS = "factorytalkView";
var ID = "dsh-engineering-ftview-viewer/display";
var en = {
  title: "FactoryTalk View display",
  fit: "Fit",
  actual: "100%",
  objects: "objects",
  invalid: "This file is not a FactoryTalk View display export."
};
var zh = {
  title: "FactoryTalk View \u753B\u9762",
  fit: "\u9002\u5E94",
  actual: "100%",
  objects: "\u4E2A\u5BF9\u8C61",
  invalid: "\u8BE5\u6587\u4EF6\u4E0D\u662F FactoryTalk View \u753B\u9762\u5BFC\u51FA\u3002"
};
var h = React.createElement;
function decodeSource(data) {
  if (typeof data === "string") return data;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder("utf-8").decode(bytes);
}
function objectCount(source) {
  try {
    const display = parseXml(source);
    return display.children.filter((child2) => child2.tag !== "displaySettings").length;
  } catch {
    return 0;
  }
}
function Display(props) {
  const { source, t } = props;
  const rendered = React.useMemo(() => {
    try {
      return { svg: renderDisplay(source), count: objectCount(source), error: "" };
    } catch (error) {
      return { svg: "", count: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }, [source]);
  const [fit, setFit] = React.useState(true);
  if (rendered.error !== "") {
    return h(
      "div",
      { style: { padding: 16, font: "13px system-ui", color: "#a00" } },
      h("p", null, t("invalid")),
      h("pre", { style: { whiteSpace: "pre-wrap", color: "#666" } }, rendered.error)
    );
  }
  const size = /width="(\d+)" height="(\d+)"/u.exec(rendered.svg);
  const width = Number(size?.[1] ?? 0);
  const height = Number(size?.[2] ?? 0);
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } },
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          fontSize: 11,
          borderBottom: "1px solid rgba(128,128,128,.25)",
          flex: "none",
          opacity: 0.85
        }
      },
      h("span", null, `${width}\xD7${height}`),
      h("span", null, `${rendered.count} ${t("objects")}`),
      h(
        "span",
        { style: { marginLeft: "auto", display: "flex", gap: 4 } },
        h("button", { type: "button", onClick: () => setFit(true), style: { font: "inherit" } }, t("fit")),
        h("button", { type: "button", onClick: () => setFit(false), style: { font: "inherit" } }, t("actual"))
      )
    ),
    h(
      "div",
      { style: { flex: 1, minHeight: 0, overflow: "auto", background: "#202020", padding: 8 } },
      h("div", {
        style: fit ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } : { width, height },
        // The renderer returns a complete SVG document; no untrusted input reaches
        // this string beyond the display file the user opened.
        dangerouslySetInnerHTML: { __html: rendered.svg }
      })
    )
  );
}
function Body(props) {
  const { content, t } = props;
  const source = React.useMemo(() => {
    if (content === void 0 || content.kind !== "bytes" || content.data === void 0) return null;
    return decodeSource(content.data);
  }, [content]);
  if (source === null) return null;
  return h(Display, { source, t: typeof t === "function" ? t : (key) => key });
}
function fileViewer(t) {
  return function FtViewFile(props) {
    if (typeof props.content !== "string") return null;
    return h(Display, { source: props.content, t });
  };
}
var inject = ["slots", "locale", "documentPreviews"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "factorytalk-view: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.documentPreviews.register({
    id: ID,
    extensions: ["xml"],
    priority: "extension",
    title: () => t("title"),
    loading: "bytes-complete"
  }), "factorytalk-view: document viewer");
  ctx.inject(["betterSidebar"], (scope) => scope.effect?.(() => scope.betterSidebar?.registerFileViewer({
    id: ID,
    title: () => t("title"),
    exts: ["xml"],
    priority: 0,
    fetchStrategy: "fsRead",
    component: fileViewer(t)
  }), "factorytalk-view: sidebar file viewer"));
  ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register(
    { name: "sidebar.right.tab.document", key: ID, locale: NS },
    Body
  )), "factorytalk-view: document body");
}

    })(module, module.exports, require)
    return module.exports
  },
})
