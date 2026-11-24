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
var React2 = __toESM(require("react"), 1);

// packages/ftview-viewer/face/display.ts
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
  const document2 = root.children[0];
  if (document2 === void 0) throw new Error("empty display XML");
  return document2;
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

// packages/ftview-viewer/src/vocabulary.generated.ts
var ELEMENTS = {
  "acknowledgeAlarmButton": { type: "HMIServiceLinkedButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "acknowledgeAllAlarmsButton": { type: "ackAllAlarmButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "filteredTriggers", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "activeX": { type: "activeXObjectType", family: "activeX", attributes: ["classId", "focusHighlight", "height", "isReferenceObject", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "top", "visible", "wallpaper", "width"], children: ["animations", "connections", "data", "parameters"], requiredChildren: [] },
  "addUserGroupButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "alarmBanner": { type: "alarmBannerType", family: "list", attributes: ["alignment", "backColor", "backStyle", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "displayAlarmState", "displayAlarmTime", "displayInactiveAlarms", "displayTriggerLabel", "displayTriggerValue", "endColor", "filteredTriggers", "fontFamily", "fontSize", "foreColor", "formatAlarmTime", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "queueNewAlarms", "strikethrough", "top", "underline", "useAlarmColors", "useAlarmIdentifier", "visible", "wallpaper", "width", "wordWrap"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "alarmList": { type: "alarmListType", family: "list", attributes: ["ackSymbol", "activeAckedBackColor", "activeAckedBlink", "activeAckedForeColor", "activeAckedUseAlarmColors", "activeSymbol", "activeUnackedBackColor", "activeUnackedBlink", "activeUnackedForeColor", "activeUnackedUseAlarmColors", "backColor", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "displayAckSymbol", "displayAckTime", "displayActiveAckedAlarms", "displayActiveSymbol", "displayActiveUnackedAlarms", "displayAlarmTime", "displayHeader", "displayInactiveAckedAlarms", "displayInactiveUnackedAlarms", "endColor", "fillStyle", "filteredTriggers", "fontFamily", "fontSize", "formatAckTime", "formatAlarmTime", "gradientDirection", "gradientShadingStyle", "gradientStop", "headerBackColor", "headerForeColor", "headerTextAckTime", "headerTextAlarmTime", "headerTextMessage", "height", "inactiveAckedBackColor", "inactiveAckedBlink", "inactiveAckedForeColor", "inactiveAckedUseAlarmColors", "inactiveUnackedBackColor", "inactiveUnackedBlink", "inactiveUnackedForeColor", "inactiveUnackedUseAlarmColors", "isReferenceObject", "italic", "keyNavigation", "left", "linesPerAlarm", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "selectedAlarmIndicator", "selectionBackColor", "selectionForeColor", "strikethrough", "top", "underline", "useAlarmIdentifier", "visible", "wallpaper", "width", "wordWrap", "wrapAround"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "alarmStatusList": { type: "alarmStatusListType", family: "list", attributes: ["alarmListMode", "backColor", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "displayAccumulatedTime", "displayAlarmQuantity", "displayAlarmState", "displayHeader", "displayMessage", "displayTitle", "displayTriggerLabel", "displayTriggerValue", "endColor", "fillStyle", "filteredTriggers", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "headerBackColor", "headerForeColor", "headerTextAccumulatedTime", "headerTextAlarmQuantity", "headerTextAlarmState", "headerTextMessage", "headerTextTriggerLabel", "headerTextTriggerValue", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linesPerAlarm", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "selectionBackColor", "selectionForeColor", "strikethrough", "titleActiveAlarmsMode", "titleAllAlarmsMode", "titlePastAlarmsMode", "top", "underline", "useAlarmColors", "useAlarmIdentifier", "visible", "wallpaper", "width", "widthAccumulatedTime", "widthAlarmQuantity", "widthAlarmState", "widthMessage", "widthTriggerLabel", "widthTriggerValue", "wordWrap", "wrapAround"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "alarmStatusModeButton": { type: "linkedButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "arc": { type: "angleDrawingObjectType", family: "angle", attributes: ["backColor", "backStyle", "endAngle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "startAngle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters", "rotation", "transform"], requiredChildren: [] },
  "auditTrailDetail": { type: "auditTrailDetailType", family: "list", attributes: ["backColor", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "displayAuditLocation", "displayAuditMessage", "displayAuditOccurredTime", "displayAuditResource", "displayAuditSource", "displayAuditUsername", "displayHeader", "endColor", "fillStyle", "fontFamily", "fontSize", "foreColor", "formatAuditOccurredTime", "gradientDirection", "gradientShadingStyle", "gradientStop", "headerBackColor", "headerForeColor", "headerTextAuditLocation", "headerTextAuditMessage", "headerTextAuditOccurredTime", "headerTextAuditResource", "headerTextAuditSource", "headerTextAuditUsername", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linesPerAudit", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "receiveSelectionFrom", "selectionBackColor", "selectionForeColor", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wordWrap", "wrapAround"], children: ["animations"], requiredChildren: [] },
  "auditTrailList": { type: "auditTrailListType", family: "list", attributes: ["backColor", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "columnWidthAuditLocation", "columnWidthAuditResource", "columnWidthAuditSource", "columnWidthAuditUsername", "displayAuditLocation", "displayAuditMessage", "displayAuditOccurredTime", "displayAuditResource", "displayAuditSource", "displayAuditUsername", "displayHeader", "endColor", "fillStyle", "fontFamily", "fontSize", "foreColor", "formatAuditOccurredTime", "gradientDirection", "gradientShadingStyle", "gradientStop", "headerBackColor", "headerForeColor", "headerTextAuditLocation", "headerTextAuditMessage", "headerTextAuditOccurredTime", "headerTextAuditResource", "headerTextAuditSource", "headerTextAuditUsername", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linesPerAudit", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "selectionBackColor", "selectionForeColor", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wordWrap", "wrapAround"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "backspaceKey": { type: "keyButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "barGraph": { type: "barGraphType", family: "chart", attributes: ["backColor", "backStyle", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "fillColor", "fillDirection", "fillEndColor", "fillGradientDirection", "fillGradientShadingStyle", "fillGradientStop", "fillStyle", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "maxValue", "minValue", "name", "numberOfThresholds", "thresh1EndColor", "thresh1GradientDirection", "thresh1GradientShadingStyle", "thresh1GradientStop", "thresh2EndColor", "thresh2GradientDirection", "thresh2GradientShadingStyle", "thresh2GradientStop", "thresholdType", "top", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "threshold"], requiredChildren: [] },
  "changeUserPropertiesButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "clearAlarmBannerButton": { type: "linkedButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "clearAlarmHistoryButton": { type: "clearAlarmHistButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "filteredTriggers", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "resetAlarmStatus", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "clearAuditTrailButton": { type: "clearAuditTrailButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "closeButton": { type: "closeButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "closeValue", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width", "writeOnClose"], children: ["animations", "caption", "connections", "imageSettings", "parameters"], requiredChildren: [] },
  "controlListSelector": { type: "controlListSelectorType", family: "list", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "backColor", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionTruncate", "description", "endColor", "enterKeyControlDelay", "enterKeyHandshakeTime", "enterKeyHoldTime", "fillStyle", "fontFamily", "fontSize", "gradientDirection", "gradientShadingStyle", "gradientStop", "handshakeReset", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "selectionBackColor", "selectionForeColor", "setLastStateId", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wrapAround", "writeOnEnter"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "deleteUserGroupButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "diagnosticsClearAllButton": { type: "simpleButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "diagnosticsClearButton": { type: "linkedButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "diagnosticsList": { type: "diagnosticsListType", family: "list", attributes: ["backColor", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "fontFamily", "fontSize", "foreColor", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "selectionBackColor", "selectionForeColor", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wrapAround"], children: ["animations", "parameters"], requiredChildren: [] },
  "disableUserButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "displayListSelector": { type: "displayListSelectorType", family: "list", attributes: ["backColor", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionTruncate", "description", "endColor", "fillStyle", "fontFamily", "fontSize", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "selectionBackColor", "selectionForeColor", "setLastStateId", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wrapAround"], children: ["animations", "parameters", "states"], requiredChildren: [] },
  "displayPrintButton": { type: "pveSimpleButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "ellipse": { type: "rotationDrawingObjectType", family: "ellipse", attributes: ["backColor", "backStyle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters", "rotation", "transform"], requiredChildren: [] },
  "enableUserButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "endKey": { type: "keyButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "enterKey": { type: "keyButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "freehand": { type: "pathDrawingObjectType", family: "path", attributes: ["backColor", "backStyle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "path", "patternColor", "patternStyle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "gauge": { type: "gaugeType", family: "chart", attributes: ["backColor", "backStyle", "bold", "description", "digitsAfterDecimalPoint", "endColor", "fillColor", "fillEndColor", "fillGradientDirection", "fillGradientShadingStyle", "fillGradientStop", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "left", "legendColor", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "majorTicks", "maxValue", "minValue", "minorTicks", "name", "needleColor", "needleWidth", "numberOfThresholds", "showLegend", "strikethrough", "sweepStyle", "thresh1EndColor", "thresh1GradientDirection", "thresh1GradientShadingStyle", "thresh1GradientStop", "thresh2EndColor", "thresh2GradientDirection", "thresh2GradientShadingStyle", "thresh2GradientStop", "thresholdType", "top", "underline", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "threshold"], requiredChildren: [] },
  "gotoButton": { type: "gotoButtonType", family: "button", attributes: ["UseVariableDisplay", "UseVariableDisplayPosition", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "description", "display", "displayLeftPosition", "displayPosition", "displayTopPosition", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "parameterFile", "parameterList", "parameterType", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "connections", "imageSettings", "parameters"], requiredChildren: [] },
  "gotoConfigureModeButton": { type: "gotoConfigureButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "group": { type: "groupType", family: "group", attributes: ["height", "isReferenceObject", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "top", "visible", "wallpaper", "width"], children: ["acknowledgeAlarmButton", "acknowledgeAllAlarmsButton", "activeX", "addUserGroupButton", "alarmBanner", "alarmList", "alarmStatusList", "alarmStatusModeButton", "animations", "arc", "auditTrailDetail", "auditTrailList", "backspaceKey", "barGraph", "changeUserPropertiesButton", "clearAlarmBannerButton", "clearAlarmHistoryButton", "clearAuditTrailButton", "closeButton", "controlListSelector", "deleteUserGroupButton", "diagnosticsClearAllButton", "diagnosticsClearButton", "diagnosticsList", "disableUserButton", "displayListSelector", "displayPrintButton", "ellipse", "enableUserButton", "endKey", "enterKey", "freehand", "gauge", "gotoButton", "gotoConfigureModeButton", "group", "homeKey", "image", "informationAckButton", "informationMessageDisplay", "interlockedButton", "languageSwitchButton", "latchedButton", "line", "listIndicator", "localMessageDisplay", "loginButton", "logoutButton", "macroButton", "maintainedButton", "modifyGroupMembershipButton", "momentaryButton", "moveDownKey", "moveLeftKey", "moveRightKey", "moveUpKey", "multistateButton", "multistateIndicator", "numericDisplay", "numericInputCursorPoint", "numericInputEnable", "pageDownKey", "pageUpKey", "panel", "parameters", "passwordButton", "pilotedControlListSelector", "polyPolygon", "polygon", "polyline", "printAlarmHistory", "printAlarmStatus", "rampButton", "recipePlusButton", "recipePlusSelector", "recipePlusTable", "rectangle", "resetAlarmStatusButton", "returnToButton", "roundedRectangle", "scale", "shutdownButton", "silenceAlarmsButton", "sortAlarmsButton", "stringDisplay", "stringInputEnable", "symbol", "text", "timeAndDateDisplay", "trendNextPenButton", "trendPauseButton", "unlockUserButton", "wedge"], requiredChildren: [] },
  "homeKey": { type: "keyButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "image": { type: "imageDrawingObjectType", family: "image", attributes: ["description", "height", "imageBackColor", "imageBackStyle", "imageBlink", "imageColor", "imageName", "isReferenceObject", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "informationAckButton": { type: "simpleButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "informationMessageDisplay": { type: "messageDisplayType", family: "list", attributes: ["alignment", "backColor", "backStyle", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wordWrap"], children: ["animations", "parameters"], requiredChildren: [] },
  "interlockedButton": { type: "interlockedButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backStyle", "borderStyle", "borderUsesBackColor", "borderWidth", "buttonValue", "captionOnBorder", "currentStateId", "description", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "languageSwitchButton": { type: "languageSwitchButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "language", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "latchedButton": { type: "latchedButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backStyle", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "cornerRadius", "currentStateId", "description", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "latchResetType", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "line": { type: "lineDrawingObjectType", family: "line", attributes: ["backColor", "backStyle", "foreColor", "height", "isReferenceObject", "left", "line", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "listIndicator": { type: "listIndicatorType", family: "indicator", attributes: ["backColor", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionTruncate", "description", "endColor", "fillStyle", "fontFamily", "fontSize", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "selectionBackColor", "selectionForeColor", "setLastStateId", "strikethrough", "top", "triggerType", "underline", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "localMessageDisplay": { type: "localMessageDisplayType", family: "field", attributes: ["UseEchoMessage", "UseVariableMesssageFile", "alignment", "backColor", "backStyle", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "messageFile", "name", "patternColor", "patternStyle", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wordWrap"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "loginButton": { type: "loginButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "domainName", "domainNameDisable", "domainNameVisible", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "hideUserNameEntry", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "useVariableDomainName", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "connections", "imageSettings", "parameters"], requiredChildren: [] },
  "logoutButton": { type: "logoutButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "display", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "parameterFile", "parameterList", "parameterType", "patternColor", "patternStyle", "shape", "showDisplayOnLogout", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "macroButton": { type: "macroButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "UseVariableMacro", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "macro", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "connections", "imageSettings", "parameters"], requiredChildren: [] },
  "maintainedButton": { type: "maintainedButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backStyle", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "cornerRadius", "currentStateId", "description", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "nextStateBasedOn", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "modifyGroupMembershipButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "momentaryButton": { type: "momentaryButtonType", family: "button", attributes: ["audio", "backStyle", "borderStyle", "borderUsesBackColor", "borderWidth", "buttonAction", "captionOnBorder", "cornerRadius", "currentStateId", "description", "height", "highlightColor", "holdTime", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "moveDownKey": { type: "timedKeyButtonType", family: "button", attributes: ["audio", "autoRepeatDelay", "autoRepeatRate", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "moveLeftKey": { type: "timedKeyButtonType", family: "button", attributes: ["audio", "autoRepeatDelay", "autoRepeatRate", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "moveRightKey": { type: "timedKeyButtonType", family: "button", attributes: ["audio", "autoRepeatDelay", "autoRepeatRate", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "moveUpKey": { type: "timedKeyButtonType", family: "button", attributes: ["audio", "autoRepeatDelay", "autoRepeatRate", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "multistateButton": { type: "multistateButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "autoRepeatDelay", "autoRepeatRate", "backStyle", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "currentStateId", "description", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "nextStateBasedOn", "setLastStateId", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "multistateIndicator": { type: "multistateIndicatorType", family: "indicator", attributes: ["backStyle", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "currentStateId", "description", "height", "isReferenceObject", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "setLastStateId", "shape", "top", "triggerType", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "numericDisplay": { type: "numericDisplayType", family: "field", attributes: ["alignment", "backColor", "backStyle", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "decimalPlaces", "description", "endColor", "fillLeftWith", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "numberOfDigits", "patternColor", "patternStyle", "strikethrough", "top", "underline", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "numericInputCursorPoint": { type: "numericInputCursorPointType", family: "field", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "alignment", "audio", "backColor", "backStyle", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnPad", "decimalPlaces", "decimalPoint", "description", "digitsAfterDecimalPoint", "endColor", "enterKeyControlDelay", "enterKeyHandshakeTime", "enterKeyHoldTime", "fillLeftWith", "fixedPosition", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "handshakeReset", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "italic", "keyAssignment", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "maxValue", "minValue", "name", "numberOfDigits", "numericPopup", "patternColor", "patternStyle", "rampValue", "strikethrough", "top", "touch", "underline", "useVariableMinMax", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "numericInputEnable": { type: "numericInputEnableType", family: "field", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "decimalPoint", "description", "digitsAfterDecimalPoint", "endColor", "enterKeyControlDelay", "enterKeyHandshakeTime", "enterKeyHoldTime", "fixedPosition", "gradientDirection", "gradientShadingStyle", "gradientStop", "handshakeReset", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "maxValue", "minValue", "name", "numericPopup", "patternColor", "patternStyle", "rampValue", "shape", "takeFocusOnPress", "top", "touch", "useVariableMinMax", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "connections", "imageSettings", "parameters"], requiredChildren: [] },
  "pageDownKey": { type: "timedKeyButtonType", family: "button", attributes: ["audio", "autoRepeatDelay", "autoRepeatRate", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "pageUpKey": { type: "timedKeyButtonType", family: "button", attributes: ["audio", "autoRepeatDelay", "autoRepeatRate", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "panel": { type: "panelDrawingObjectType", family: "panel", attributes: ["backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "cornerRadius", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "passwordButton": { type: "passwordButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "modeType", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "pilotedControlListSelector": { type: "pilotedControlListSelectorType", family: "list", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "backColor", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionTruncate", "description", "endColor", "enterKeyControlDelay", "enterKeyHandshakeTime", "enterKeyHoldTime", "fillStyle", "fontFamily", "fontSize", "gradientDirection", "gradientShadingStyle", "gradientStop", "handshakeReset", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "selectionBackColor", "selectionForeColor", "setLastStateId", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wrapAround", "writeOnEnter"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "polyPolygon": { type: "polyPolygonDrawingObjectType", family: "polyPolygon", attributes: ["backColor", "backStyle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "top", "visible", "wallpaper", "width"], children: ["animations", "innerPolygon", "parameters"], requiredChildren: ["innerPolygon"] },
  "polygon": { type: "polygonDrawingObjectType", family: "polygon", attributes: ["backColor", "backStyle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "path", "patternColor", "patternStyle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "polyline": { type: "pathDrawingObjectType", family: "path", attributes: ["backColor", "backStyle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "path", "patternColor", "patternStyle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "printAlarmHistory": { type: "printAlarmHistoryType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "filteredTriggers", "gradientDirection", "gradientShadingStyle", "gradientStop", "headingTitle", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "printAcknowledgeTime", "printAlarmTime", "printMessage", "printTriggerLabel", "printTriggerValue", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width", "widthTriggerLabel", "widthTriggerValue"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "printAlarmStatus": { type: "printAlarmStatusType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "filteredTriggers", "gradientDirection", "gradientShadingStyle", "gradientStop", "headingTitle", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "printAccumulatedTime", "printAlarmQuantity", "printAlarmState", "printMessage", "printTriggerLabel", "printTriggerValue", "printType", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width", "widthTriggerLabel", "widthTriggerValue"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "rampButton": { type: "rampButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "autoRepeatDelay", "autoRepeatRate", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "limitValue", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "rampType", "rampValue", "shape", "top", "touch", "useVariableLimit", "useVariableRamp", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "connections", "imageSettings", "parameters"], requiredChildren: [] },
  "recipePlusButton": { type: "recipePlusButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "action", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "recipePlusSelector": { type: "recipePlusSelectorType", family: "list", attributes: ["backColor", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "displayHeader", "endColor", "fillStyle", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "headerBackColor", "headerForeColor", "headerTextRecipe", "headerTextUnit", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linesPerItem", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "selectionBackColor", "selectionForeColor", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "widthRecipe", "widthUnit", "wordWrap", "wrapAround"], children: ["animations", "parameters"], requiredChildren: [] },
  "recipePlusTable": { type: "recipePlusTableType", family: "list", attributes: ["backColor", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "displayCompareStatus", "displayCurrentValue", "displayFooter", "displayHeader", "displayIngredientName", "displayRecipeValue", "displayTagName", "endColor", "fillStyle", "fontFamily", "fontSize", "footerBackColor", "footerForeColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "gridColor", "headerBackColor", "headerForeColor", "headerTextCompareStatus", "headerTextCurrentValue", "headerTextIngredientName", "headerTextRecipeValue", "headerTextTagName", "height", "isReferenceObject", "italic", "keyNavigation", "left", "linesPerItem", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "selectionBackColor", "selectionForeColor", "strikethrough", "top", "underline", "viewOnly", "visible", "wallpaper", "width", "widthCompareStatus", "widthCurrentValue", "widthIngredientName", "widthRecipeValue", "widthTagName", "wordWrap", "wrapAround"], children: ["animations", "parameters"], requiredChildren: [] },
  "rectangle": { type: "drawingObjectType", family: "rectangle", attributes: ["backColor", "backStyle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "resetAlarmStatusButton": { type: "HMIServiceButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "returnToButton": { type: "pveSimpleButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "roundedRectangle": { type: "roundedRectangleDrawingObjectType", family: "roundedRectangle", attributes: ["backColor", "backStyle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "roundingHeight", "roundingWidth", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "scale": { type: "scaleType", family: "chart", attributes: ["backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "majorTicks", "minorTicks", "name", "tickDirection", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters"], requiredChildren: [] },
  "shutdownButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "silenceAlarmsButton": { type: "simpleButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "sortAlarmsButton": { type: "simpleButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "stringDisplay": { type: "stringDisplayType", family: "field", attributes: ["alignment", "backColor", "backStyle", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wordWrap"], children: ["animations", "connections", "parameters"], requiredChildren: [] },
  "stringInputEnable": { type: "stringInputEnableType", family: "field", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "captionOnBorder", "description", "endColor", "enterKeyControlDelay", "enterKeyHandshakeTime", "enterKeyHoldTime", "fillCharacter", "gradientDirection", "gradientShadingStyle", "gradientStop", "handshakeReset", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "keyNavigation", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "maskScratchpad", "name", "numberOfInputCharacters", "patternColor", "patternStyle", "shape", "stringPopup", "takeFocusOnPress", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "connections", "imageSettings", "parameters"], requiredChildren: [] },
  "symbol": { type: "symbolIndicatorType", family: "indicator", attributes: ["borderStyle", "borderWidth", "currentStateId", "description", "height", "imageName", "isReferenceObject", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "setLastStateId", "shape", "top", "triggerType", "visible", "wallpaper", "width"], children: ["animations", "connections", "parameters", "states"], requiredChildren: [] },
  "text": { type: "textDrawingObjectType", family: "text", attributes: ["alignment", "backColor", "backStyle", "bold", "caption", "charHeight", "charWidth", "fontFamily", "fontSize", "foreColor", "height", "isReferenceObject", "italic", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "sizeToFit", "strikethrough", "top", "underline", "visible", "wallpaper", "width", "wordWrap"], children: ["animations", "parameters"], requiredChildren: [] },
  "timeAndDateDisplay": { type: "timeAndDateDisplayType", family: "field", attributes: ["alignment", "backColor", "backStyle", "blink", "bold", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "fontFamily", "fontSize", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "italic", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "strikethrough", "timeAndDateFormat", "top", "underline", "visible", "wallpaper", "width", "wordWrap"], children: ["animations", "parameters"], requiredChildren: [] },
  "trendNextPenButton": { type: "linkedButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "trendPauseButton": { type: "linkedButtonType", family: "button", attributes: ["audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "linkedObject", "name", "patternColor", "patternStyle", "sendPressTo", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "unlockUserButton": { type: "GenericButtonType", family: "button", attributes: ["AllowBlankComment", "AuthorizedGroup", "ESDomainName", "ESDomainNameDisable", "ESDomainNameType", "ESDomainNameVisible", "RequireCounterSignature", "RequireElectronicSignature", "RequireReAuthentication", "VariableDomainName", "audio", "backColor", "backStyle", "blink", "borderColor", "borderStyle", "borderUsesBackColor", "borderWidth", "description", "endColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "highlightColor", "horizontalMargin", "isReferenceObject", "keyAssignment", "left", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "shape", "top", "touch", "verticalMargin", "visible", "wallpaper", "width"], children: ["animations", "caption", "imageSettings", "parameters"], requiredChildren: [] },
  "wedge": { type: "angleDrawingObjectType", family: "angle", attributes: ["backColor", "backStyle", "endAngle", "endColor", "foreColor", "gradientDirection", "gradientShadingStyle", "gradientStop", "height", "isReferenceObject", "left", "lineStyle", "lineWidth", "linkAnimations", "linkBaseObject", "linkConnections", "linkSize", "name", "patternColor", "patternStyle", "startAngle", "top", "visible", "wallpaper", "width"], children: ["animations", "parameters", "rotation", "transform"], requiredChildren: [] }
};
var PART_NAMES = ["animateColor", "animateFill", "animateHeight", "animateHorizontalPosition", "animateHorizontalSlider", "animateHyperlink", "animateRotation", "animateTouch", "animateVerticalPosition", "animateVerticalSlider", "animateVisibility", "animateWidth", "animations", "caption", "color", "connection", "connections", "constantExpressionRange", "data", "defaultExpressionRange", "imageSettings", "innerPolygon", "parameter", "parameters", "property", "readFromTagExpressionRange", "rotation", "state", "states", "threshold", "transform"];
function elementFacts(name) {
  return Object.hasOwn(ELEMENTS, name) ? ELEMENTS[name] : void 0;
}

// packages/ftview-viewer/src/geometry.ts
function parsePoints(value) {
  if (value === void 0) return [];
  const numbers = [];
  for (const token of value.trim().split(/\s+/u)) {
    if (token === "") continue;
    const parsed = Number.parseFloat(token);
    if (Number.isFinite(parsed)) numbers.push(parsed);
  }
  return numbers;
}
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
function percentPoint(x, y, box) {
  return {
    x: box.left + clamp(x, 0, 100) / 100 * box.width,
    y: box.top + clamp(y, 0, 100) / 100 * box.height
  };
}
function pair(numbers) {
  const pairs = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    pairs.push([numbers[index], numbers[index + 1]]);
  }
  return pairs;
}
function allPercent(numbers) {
  return numbers.length > 0 && numbers.every((value) => value >= 0 && value <= 100);
}
function lineSegment(value, box, mode) {
  const numbers = parsePoints(value);
  if (numbers.length < 4) return void 0;
  const [x1, y1, x2, y2] = numbers;
  if (mode === "draft" && allPercent(numbers.slice(0, 4))) {
    return { points: [percentPoint(x1, y1, box), percentPoint(x2, y2, box)], rule: "percent" };
  }
  return { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], rule: "absolute" };
}
function pathPoints(value, box, mode) {
  const numbers = parsePoints(value);
  const pairs = pair(numbers);
  if (pairs.length === 0) return { points: [], rule: mode === "draft" ? "percent" : "absolute" };
  if (mode === "draft") return { points: pairs.map(([x, y]) => percentPoint(x, y, box)), rule: "percent" };
  return { points: pairs.map(([x, y]) => ({ x, y })), rule: "absolute" };
}
function polygonPoints(value, box, mode) {
  return pathPoints(value, box, mode);
}
function boxDiagonal(box, inset = 1) {
  return {
    points: [
      { x: box.left + inset, y: box.top + inset },
      { x: box.left + box.width - inset, y: box.top + box.height - inset }
    ],
    rule: "box-diagonal"
  };
}
function roundedRectPath(box, radius) {
  const r = clamp(radius, 0, Math.min(box.width, box.height) / 2);
  const { left: x, top: y, width: w, height: h3 } = box;
  if (r <= 0) return `M ${x} ${y} H ${x + w} V ${y + h3} H ${x} Z`;
  return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h3 - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h3} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h3 - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}
function anglePoint(box, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: box.left + box.width / 2 + Math.cos(radians) * box.width / 2,
    y: box.top + box.height / 2 + Math.sin(radians) * box.height / 2
  };
}
function arcPath(box, startAngle, endAngle) {
  const start = anglePoint(box, startAngle);
  const end = anglePoint(box, endAngle);
  const large = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = endAngle >= startAngle ? 1 : 0;
  return `M ${start.x} ${start.y} A ${box.width / 2} ${box.height / 2} 0 ${large} ${sweep} ${end.x} ${end.y}`;
}
function wedgePath(box, startAngle, endAngle) {
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const start = anglePoint(box, startAngle);
  const end = anglePoint(box, endAngle);
  const large = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = endAngle >= startAngle ? 1 : 0;
  return `M ${centre.x} ${centre.y} L ${start.x} ${start.y} A ${box.width / 2} ${box.height / 2} 0 ${large} ${sweep} ${end.x} ${end.y} Z`;
}
function pointsToPath(points, close) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y}${rest.map((point) => ` L ${point.x} ${point.y}`).join("")}${close ? " Z" : ""}`;
}
function documentMode(hasSettings, objectCount, referenceFlags) {
  if (hasSettings) return { mode: "export", reason: "settings" };
  if (objectCount > 0 && referenceFlags > 0) return { mode: "export", reason: "imported-flags" };
  return { mode: "draft", reason: "staged" };
}

// packages/ftview-viewer/src/render.ts
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
var WRAPPERS = /* @__PURE__ */ new Set(["objects", "displaySettings"]);
var PART_SET = new Set(PART_NAMES);
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
function annotationColour(fill) {
  const hex = fill !== void 0 && /^#[0-9a-f]{6}$/u.test(fill) ? fill.slice(1) : void 0;
  if (hex === void 0) return "#606060";
  const [red, green, blue] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const luma = 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  return luma < 0.45 ? "#f0f0f0" : "#606060";
}
function isObjectNode(node) {
  if (WRAPPERS.has(node.tag)) return false;
  if (/^thresh\d+Value$/u.test(node.tag)) return false;
  return !PART_SET.has(node.tag);
}
function alignmentOf(value) {
  const text = (value ?? "middleCenter").toLowerCase();
  const horizontal = text.includes("left") ? "start" : text.includes("right") ? "end" : "middle";
  const vertical = text.startsWith("top") || text.includes("top") ? "top" : text.includes("bottom") ? "bottom" : "middle";
  return { horizontal, vertical };
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
      ...attribute(caption, "charHeight") === void 0 ? {} : { charHeight: numberAttribute(caption, "charHeight", 12) },
      ...attribute(caption, "charWidth") === void 0 ? {} : { charWidth: numberAttribute(caption, "charWidth", 7) },
      bold: attribute(caption, "bold") === "true",
      italic: attribute(caption, "italic") === "true",
      underline: attribute(caption, "underline") === "true",
      strikethrough: attribute(caption, "strikethrough") === "true",
      wordWrap: attribute(caption, "wordWrap") === "true",
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
function metricsOf(node, state) {
  const own = child(node, "caption");
  const source = state !== void 0 && state.caption !== void 0 ? void 0 : own;
  const charHeight = state?.charHeight ?? (source === void 0 ? void 0 : numberAttribute(source, "charHeight", Number.NaN));
  const charWidth = state?.charWidth ?? (source === void 0 ? void 0 : numberAttribute(source, "charWidth", Number.NaN));
  const size = Number.isFinite(charHeight) ? charHeight : state?.fontSize ?? numberAttribute(source ?? node, "fontSize", numberAttribute(node, "fontSize", 12));
  const alignment = alignmentOf(state?.alignment ?? attribute(source ?? node, "alignment"));
  return {
    family: state?.fontFamily ?? attribute(source ?? node, "fontFamily") ?? attribute(node, "fontFamily") ?? "Arial Unicode MS",
    size,
    ...Number.isFinite(charHeight) ? { charHeight } : {},
    ...Number.isFinite(charWidth) ? { charWidth } : {},
    color: state?.captionColor ?? (source === void 0 ? void 0 : colourOf(attribute(source, "color"))) ?? colourOf(attribute(node, "foreColor")) ?? "#000000",
    bold: state?.bold ?? attribute(source ?? node, "bold") === "true",
    italic: state?.italic ?? attribute(source ?? node, "italic") === "true",
    underline: state?.underline ?? attribute(source ?? node, "underline") === "true",
    strikethrough: state?.strikethrough ?? attribute(source ?? node, "strikethrough") === "true",
    wordWrap: state?.wordWrap ?? attribute(source ?? node, "wordWrap") !== "false",
    ...alignment
  };
}
function captionOf(node, state) {
  const own = child(node, "caption");
  return attribute(node, "caption") ?? (own === void 0 ? void 0 : attribute(own, "caption")) ?? state?.caption ?? "";
}
function textX(left, width, horizontal, margin) {
  if (horizontal === "start") return left + margin;
  if (horizontal === "end") return left + width - margin;
  return left + width / 2;
}
function wrapText(text, metrics, width, margin) {
  const hard = text.split(/\r?\n/u);
  if (metrics.wordWrap !== true) return hard;
  const advance = Math.max(1, metrics.charWidth ?? metrics.size * 0.55);
  const perLine = Math.max(1, Math.floor((width - margin * 2) / advance));
  const lines = [];
  for (const paragraph of hard) {
    if (paragraph.length <= perLine) {
      lines.push(paragraph);
      continue;
    }
    let rest = paragraph;
    while (rest.length > perLine) {
      const cut = rest.lastIndexOf(" ", perLine);
      const at = cut > 0 ? cut : perLine;
      lines.push(rest.slice(0, at).trimEnd());
      rest = rest.slice(at).trimStart();
    }
    lines.push(rest);
  }
  return lines;
}
function textElement(text, metrics, box, margin, verticalMargin = 2) {
  if (text === "") return "";
  const lines = wrapText(text, metrics, box.width, margin);
  const lineHeight = (metrics.charHeight ?? metrics.size) * 1.25;
  const block = lines.length * lineHeight;
  const anchorX = textX(box.left, box.width, metrics.horizontal, margin);
  const firstY = metrics.vertical === "top" ? box.top + verticalMargin + lineHeight / 2 : metrics.vertical === "bottom" ? box.top + box.height - verticalMargin - block + lineHeight / 2 : box.top + box.height / 2 - block / 2 + lineHeight / 2;
  const parts = lines.map((line, index) => `<tspan x="${anchorX}" y="${firstY + index * lineHeight}">${escapeXml(line)}</tspan>`);
  const decoration = [
    ...metrics.underline ? ["underline"] : [],
    ...metrics.strikethrough ? ["line-through"] : []
  ];
  return `<text text-anchor="${metrics.horizontal === "start" ? "start" : metrics.horizontal === "end" ? "end" : "middle"}" dominant-baseline="middle" font-family="${escapeXml(metrics.family)}" font-size="${metrics.size}" fill="${metrics.color}"${metrics.bold ? ' font-weight="bold"' : ""}${metrics.italic ? ' font-style="italic"' : ""}${decoration.length === 0 ? "" : ` text-decoration="${decoration.join(" ")}"`}>${parts.join("")}</text>`;
}
function markerBox(box, label, detail, dashed = true) {
  const stroke = detail === void 0 ? "4 3" : "2 2";
  const perLine = Math.max(6, Math.floor((box.width - 10) / 4.8));
  const rows = detail === void 0 ? [] : foldText(detail, perLine, 3);
  const labelText = foldText(label, Math.max(6, Math.floor((box.width - 10) / 5)), 1).join(" ");
  return `<g><rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="#f6f6f6" fill-opacity="0.55" stroke="#909090"${dashed ? ` stroke-dasharray="${stroke}"` : ""}/><text x="${box.left + 5}" y="${box.top + 14}" font-family="Segoe UI" font-size="10" fill="#606060">${escapeXml(labelText)}</text>` + rows.map((row, index) => `<text x="${box.left + 5}" y="${box.top + 27 + index * 11}" font-family="Segoe UI" font-size="9" fill="#808080">${escapeXml(row)}</text>`).join("") + "</g>";
}
function foldText(text, width, lines) {
  const words = text.split(/\s+/u).filter((word) => word !== "");
  const rows = [];
  let row = "";
  for (const word of words) {
    if (rows.length === lines) break;
    if (row === "") row = word;
    else if (row.length + 1 + word.length <= width) row = `${row} ${word}`;
    else {
      rows.push(row);
      row = word;
    }
  }
  if (rows.length < lines && row !== "") rows.push(row);
  const joined = rows.join(" ");
  if (joined.length < text.length && rows.length > 0) rows[rows.length - 1] = `${(rows[rows.length - 1] ?? "").replace(/\.$/u, "")}\u2026`;
  return rows;
}
function imageElement(node, options, box) {
  const settings = child(node, "imageSettings");
  const name = attribute(node, "imageName") ?? (settings === void 0 ? void 0 : attribute(settings, "imageName")) ?? "";
  const href = name === "" ? void 0 : options.imageHref === void 0 ? `Images/${name}` : options.imageHref(name);
  if (href !== void 0) return `<image x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" href="${escapeXml(href)}" preserveAspectRatio="none"/>`;
  return `<g><rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="#f0f0f0" stroke="#909090" stroke-dasharray="4 3"/><text x="${box.left + box.width / 2}" y="${box.top + box.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI" font-size="10" fill="#606060">image ${escapeXml(name || "(unnamed)")}</text></g>`;
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
function barGraphElement(node, options, box, paint, pass) {
  const { left, top, width, height } = box;
  const minimum = numberAttribute(node, "minValue", 0);
  const maximum = numberAttribute(node, "maxValue", 100);
  const reading = numericValue(connectionOf(node, "Value"), options);
  const value = reading ?? minimum;
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
  const stands = reading === void 0 ? `<rect x="${left + 2}" y="${top + 2}" width="${Math.max(1, width - 4)}" height="${Math.max(1, height - 4)}" fill="none" stroke="#909090" stroke-dasharray="3 3" stroke-width="1"/><text x="${left + 6}" y="${top + Math.min(height - 6, 18)}" font-family="Segoe UI" font-size="9" fill="${annotationColour(paint.fill)}">${escapeXml(`${node.tag} \xB7 no value`)}</text>` : "";
  if (stands !== "") markMarker(pass, node, "The bar needs a controller value, and this preview has none, so the frame is drawn in place of the bar.");
  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>` + (fraction > 0 ? `<rect x="${filled.x}" y="${filled.y}" width="${filled.width}" height="${filled.height}" fill="${fill}"/>` : "") + marks.join("") + stands;
}
function gaugeElement(node, options, box) {
  const minimum = numberAttribute(node, "minValue", 0);
  const maximum = numberAttribute(node, "maxValue", 100);
  const value = numericValue(connectionOf(node, "Value"), options) ?? minimum;
  const fraction = maximum === minimum ? 0 : clamp((value - minimum) / (maximum - minimum), 0, 1);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const radius = Math.min(box.width, box.height) / 2 - 4;
  const start = Math.PI * 0.75;
  const end = Math.PI * 2.25;
  const angle = start + (end - start) * fraction;
  const point = (at, r) => `${cx + Math.cos(at) * r},${cy + Math.sin(at) * r}`;
  const arc = `M ${point(start, radius)} A ${radius} ${radius} 0 1 1 ${point(end, radius)}`;
  return `<path d="${arc}" fill="none" stroke="#808080" stroke-width="2"/><line x1="${cx}" y1="${cy}" x2="${point(angle, radius - 2).split(",")[0]}" y2="${point(angle, radius - 2).split(",")[1]}" stroke="#c00000" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="3" fill="#202020"/>`;
}
function trendElement(box, paint) {
  const lines = [];
  for (let index = 1; index < 4; index += 1) {
    const y = box.top + box.height / 4 * index;
    lines.push(`<line x1="${box.left}" y1="${y}" x2="${box.left + box.width}" y2="${y}" stroke="#b0b0b0" stroke-width="1"/>`);
  }
  return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>${lines.join("")}<text x="${box.left + 6}" y="${box.top + 14}" font-family="Segoe UI" font-size="10" fill="#606060">trend</text>`;
}
function valueElement(node, text, metrics, box, margin, options) {
  const expression = attribute(node, "expression") ?? connectionOf(node, "Value") ?? "";
  const value = expression === "" ? void 0 : options.tagValues?.[expression];
  const shown = value === void 0 ? "####" : String(value);
  return textElement(shown, metrics, box, margin);
}
function resolveReference(node, options) {
  if (attribute(node, "isReferenceObject") !== "true") return node;
  const link = attribute(node, "linkBaseObject");
  const base = link === void 0 ? void 0 : options.globals?.[link];
  if (base === void 0) return node;
  const attributes = { ...base.attributes, ...node.attributes };
  return {
    tag: base.tag,
    attributes,
    // Keep the base object's visuals and only take the local bindings: a
    // reference group carries its own <animations>/<connections>, and taking
    // those instead of the base children is what dropped the header bar.
    children: [
      ...base.children,
      ...node.children.filter((candidate) => candidate.tag === "animations" || candidate.tag === "connections")
    ],
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
function animatedFill(node, options) {
  const animations = child(node, "animations");
  if (animations === void 0) return void 0;
  for (const animation of animations.children) {
    if (animation.tag !== "animateFill" && animation.tag !== "animateColor") continue;
    const expression = attribute(animation, "expression");
    if (expression === void 0) continue;
    if (evaluate(expression, options.tagValues ?? {}) !== true) continue;
    const colour = colourOf(attribute(animation, "expressionTrueState") ?? attribute(animation, "color"));
    if (colour !== void 0) return colour;
  }
  return void 0;
}
function animatedCaption(node, options) {
  const animations = child(node, "animations");
  if (animations === void 0) return void 0;
  for (const animation of animations.children) {
    if (animation.tag !== "animateString" && animation.tag !== "animateCaption") continue;
    const expression = attribute(animation, "expression");
    if (expression === void 0) continue;
    const value = options.tagValues?.[expression];
    if (value !== void 0) return String(value);
  }
  return void 0;
}
function placeholder(pass, node, box, reason) {
  const name = attribute(node, "name");
  pass.markers.push({ ...name === void 0 ? {} : { name }, type: node.tag, family: elementFacts(node.tag)?.family ?? "unknown", reason });
  if (pass.options.markers === false) return "";
  return markerBox(box, name === void 0 ? node.tag : `${node.tag} ${name}`, reason);
}
function noteGeometry(pass, node, attributeName, rule) {
  const name = attribute(node, "name");
  pass.geometry.push({ ...name === void 0 ? {} : { name }, type: node.tag, attribute: attributeName, rule });
}
function markUnknown(pass, node, reason) {
  const name = attribute(node, "name");
  pass.unknown.push({
    ...name === void 0 ? {} : { name },
    type: node.tag,
    family: "unknown",
    reason
  });
}
function markMarker(pass, node, reason) {
  const name = attribute(node, "name");
  pass.markers.push({
    ...name === void 0 ? {} : { name },
    type: node.tag,
    family: elementFacts(node.tag)?.family ?? "unknown",
    reason
  });
}
function strokeOf(paint) {
  return paint.stroke === "none" ? paint.fill : paint.stroke;
}
function bodyOf(node, box, pass) {
  const options = pass.options;
  const state = stateOf(node);
  const paint = paintOf(node, state);
  const fill = animatedFill(node, options) ?? paint.fill;
  const captionText = animatedCaption(node, options) ?? captionOf(node, state);
  const metrics = metricsOf(node, state);
  const margin = numberAttribute(node, "horizontalMargin", 4);
  const verticalMargin = numberAttribute(node, "verticalMargin", 2);
  const facts = elementFacts(node.tag);
  const family = facts?.family ?? "box";
  const shape = (attribute(node, "shape") ?? "").toLowerCase();
  const rounded = shape.includes("round");
  const circle = shape === "ellipse" || shape === "circle";
  const boxOf = () => {
    if (circle) return `<ellipse cx="${box.left + box.width / 2}" cy="${box.top + box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
    const radius = numberAttribute(node, "cornerRadius", rounded ? 4 : 0);
    if (radius > 0) return `<path d="${roundedRectPath(box, radius)}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
    return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
  };
  const frame = `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
  switch (family) {
    case "line": {
      const segment = lineSegment(attribute(node, "line"), box, pass.mode);
      if (segment === void 0) {
        const diagonal = boxDiagonal(box);
        noteGeometry(pass, node, "line", "box-diagonal");
        const [from2, to2] = diagonal.points;
        return `<line x1="${from2.x}" y1="${from2.y}" x2="${to2.x}" y2="${to2.y}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, "lineWidth", 1))}"/>`;
      }
      noteGeometry(pass, node, "line", segment.rule);
      const pen = Math.max(1, numberAttribute(node, "lineWidth", 1));
      const [from, to] = segment.points;
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${strokeOf(paint)}" stroke-width="${pen}"/>`;
    }
    case "path": {
      const resolved = pathPoints(attribute(node, "path"), box, pass.mode);
      if (resolved.points.length < 2) {
        const diagonal = boxDiagonal(box);
        noteGeometry(pass, node, "path", "box-diagonal");
        const [from, to] = diagonal.points;
        return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, "lineWidth", 1))}"/>`;
      }
      noteGeometry(pass, node, "path", resolved.rule);
      return `<path d="${pointsToPath(resolved.points, false)}" fill="none" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, "lineWidth", 1))}"/>`;
    }
    case "polygon": {
      const resolved = polygonPoints(attribute(node, "path"), box, pass.mode);
      if (resolved.points.length < 2) return placeholder(pass, node, box, "The polygon carries no path coordinates, so its outline is unknown.");
      noteGeometry(pass, node, "path", resolved.rule);
      return `<path d="${pointsToPath(resolved.points, true)}" fill="${fill}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, "lineWidth", 1))}"/>`;
    }
    case "polyPolygon": {
      const parts = node.children.filter((candidate) => candidate.tag === "innerPolygon");
      if (parts.length < 2) return placeholder(pass, node, box, `The schema requires at least two innerPolygon parts; this object carries ${parts.length}.`);
      const paths = parts.map((part) => {
        const resolved = polygonPoints(attribute(part, "polygon"), box, pass.mode);
        noteGeometry(pass, node, "innerPolygon", resolved.rule);
        return `<path d="${pointsToPath(resolved.points, true)}" fill="${fill}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, "lineWidth", 1))}"/>`;
      });
      return paths.join("");
    }
    case "angle": {
      const start = numberAttribute(node, "startAngle", 0);
      const end = numberAttribute(node, "endAngle", 90);
      if (start === end) {
        markMarker(pass, node, "startAngle and endAngle are equal, which the editor draws as a full ellipse rather than a sweep.");
        return `<ellipse cx="${box.left + box.width / 2}" cy="${box.top + box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, "lineWidth", 1))}"/>`;
      }
      const path = node.tag === "wedge" ? wedgePath(box, start, end) : arcPath(box, start, end);
      markMarker(pass, node, "The angle is drawn clockwise from 3 o'clock; the vendor does not document the zero direction.");
      return `<path d="${path}" fill="${node.tag === "wedge" ? fill : "none"}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, "lineWidth", 1))}"/>`;
    }
    case "ellipse":
      return `<ellipse cx="${box.left + box.width / 2}" cy="${box.top + box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
    case "roundedRectangle": {
      const rx = numberAttribute(node, "roundingWidth", numberAttribute(node, "cornerRadius", 4));
      const ry = numberAttribute(node, "roundingHeight", rx);
      return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`;
    }
    case "rectangle":
      return frame;
    case "panel": {
      const radius = numberAttribute(node, "cornerRadius", 0);
      const body = radius > 0 ? `<path d="${roundedRectPath(box, radius)}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>` : frame;
      const text = textElement(captionText, metrics, box, margin, verticalMargin);
      const blink = attribute(node, "blink") === "true" ? `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="none" stroke="#c00000" stroke-dasharray="6 4" stroke-width="1"/>` : "";
      return body + blink + text;
    }
    case "image":
      return imageElement(node, options, box);
    case "group":
      return "";
    case "text":
      return textElement(captionText, metrics, box, margin, verticalMargin);
    case "button":
      return boxOf() + (captionText === "" ? "" : textElement(captionText, metrics, box, margin, verticalMargin));
    case "indicator":
      return boxOf() + (captionText === "" ? "" : textElement(captionText, metrics, box, margin, verticalMargin));
    case "field":
      return frame + valueElement(node, captionText, metrics, box, margin, options);
    case "chart":
      if (node.tag === "barGraph") return barGraphElement(node, options, box, paint, pass);
      if (node.tag === "gauge") return gaugeElement(node, options, box);
      return placeholder(pass, node, box, "The preview draws charts only for a bar graph and a gauge.");
    case "list": {
      const own = attribute(node, "caption");
      const named = own !== void 0 && own !== "";
      const label = named ? own : node.tag;
      const style = named ? { ...metrics, horizontal: "start", vertical: "top" } : { ...metrics, color: annotationColour(colourOf(attribute(node, "backColor")) ?? fill), horizontal: "start", vertical: "top" };
      return frame + textElement(label, style, box, margin, verticalMargin + 2);
    }
    case "activeX":
      return placeholder(pass, node, box, "An ActiveX control is drawn by its host, not by a display export.");
    case "box":
    default: {
      if (facts === void 0) {
        markUnknown(pass, node, "The element is not in the installed Gfx-ME schema.");
        return frame + textElement(captionText === "" ? node.tag : captionText, metrics, box, margin, verticalMargin);
      }
      return boxOf() + (captionText === "" ? "" : textElement(captionText, metrics, box, margin, verticalMargin));
    }
  }
}
function renderObject(rawNode, depth, pass) {
  const node = resolveReference(rawNode, pass.options);
  if (animatedVisibility(node, pass.options) === false) return "";
  const visible = attribute(node, "visible");
  if (visible === "false" || visible === "0" || visible === "no") return "";
  pass.objects += 1;
  const box = {
    left: numberAttribute(node, "left", 0),
    top: numberAttribute(node, "top", 0),
    width: numberAttribute(node, "width", 0),
    height: numberAttribute(node, "height", 0)
  };
  if (node.tag === "trend") {
    markUnknown(pass, node, "The element is not in the installed Gfx-ME schema; the preview draws its frame and grid, not its series.");
    const name2 = attribute(node, "name");
    const paint = paintOf(node, stateOf(node));
    pass.drawn += 1;
    return `<g data-ftv-type="trend"${name2 === void 0 ? "" : ` data-ftv-name="${escapeXml(name2)}"`}>${trendElement(box, paint)}</g>`;
  }
  const own = bodyOf(node, box, pass);
  if (own !== "") pass.drawn += 1;
  const nested = node.children.filter(isObjectNode).map((candidate) => renderObject(candidate, depth + 1, pass)).join("");
  const content = own + (nested === "" ? "" : `<g transform="translate(${box.left},${box.top})">${nested}</g>`);
  if (content === "") return "";
  const name = attribute(node, "name");
  const identity = `data-ftv-type="${escapeXml(node.tag)}"${name === void 0 ? "" : ` data-ftv-name="${escapeXml(name)}"`}`;
  return `<g ${identity}>${content}</g>`;
}
function readDisplay(source) {
  const display = parseXml(source);
  if (display.tag !== "gfx" && display.tag !== "display") throw new Error(`not a FactoryTalk View display: root element is <${display.tag}>`);
  const settings = child(display, "displaySettings");
  const width = settings === void 0 ? numberAttribute(display, "width", 640) : numberAttribute(settings, "width", numberAttribute(display, "width", 640));
  const height = settings === void 0 ? numberAttribute(display, "height", 480) : numberAttribute(settings, "height", numberAttribute(display, "height", 480));
  return { display, settings, width, height };
}
function renderDisplayWithReport(source, options = {}) {
  const { display, settings, width, height } = readDisplay(source);
  const container = child(display, "objects") ?? display;
  const objects = container.children.filter(isObjectNode);
  const flags = objects.filter((object) => attribute(object, "isReferenceObject") !== void 0).length;
  const detected = documentMode(settings !== void 0, objects.length, flags);
  const forced = options.mode !== void 0 && options.mode !== "auto";
  const mode = forced ? options.mode : detected.mode;
  const pass = { options, mode, markers: [], unknown: [], geometry: [], objects: 0, drawn: 0 };
  const background = colourOf(attribute(display, "backColor") ?? (settings === void 0 ? void 0 : attribute(settings, "backColor"))) ?? "#c6c6c6";
  const body = objects.map((object) => renderObject(object, 0, pass)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/>${body}</svg>`;
  return {
    svg,
    report: {
      mode,
      modeReason: forced ? "forced" : detected.reason,
      objects: pass.objects,
      drawn: pass.drawn,
      markers: pass.markers,
      unknown: pass.unknown,
      geometry: pass.geometry
    }
  };
}
function renderDisplay(source, options = {}) {
  return renderDisplayWithReport(source, options).svg;
}
function responsiveSvg(svg) {
  return svg.replace("<svg ", '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet" ');
}
function detectArtifact(source) {
  if (/<alarms[\s>]/iu.test(source)) {
    const alarms = (source.match(/<alarm[\s>]/gu) ?? []).length;
    const id = /<alarms[^>]*\bid="([^"]*)"/iu.exec(source)?.[1];
    const version = /<alarms[^>]*\bversion="([^"]*)"/iu.exec(source)?.[1];
    return {
      kind: "alarms",
      title: "Alarm configuration export",
      details: [
        `${alarms} alarm definition(s)`,
        ...id === void 0 ? [] : [`id: ${id}`],
        ...version === void 0 ? [] : [`schema version ${version}`]
      ]
    };
  }
  if (/;\s*Tag Type\s*,/iu.test(source)) {
    const rows = source.split(/\r?\n/u).filter((line) => /^"?[DAS]"?,/u.test(line)).length;
    return { kind: "tags", title: "HMI tag database (CSV)", details: [`${rows} tag row(s)`] };
  }
  if (/<gfxImport[\s>]/iu.test(source)) {
    const entries = (source.match(/<import[\s>]/gu) ?? []).length;
    return { kind: "batch", title: "Display batch import file", details: [`${entries} import entry(ies)`] };
  }
  try {
    const root = parseXml(source);
    if (root.tag === "gfx" || root.tag === "display") return { kind: "display", title: "FactoryTalk View display", details: [] };
    return { kind: "unknown", title: `Unrecognised XML: <${root.tag}>`, details: [] };
  } catch {
    return { kind: "unknown", title: "Unrecognised file", details: [] };
  }
}

// packages/ftview-viewer/face/display.ts
var h = React.createElement;
var T = {
  canvas: "var(--dsw-alias-bg-document-preview, #202020)",
  border: "var(--dsw-alias-border-l3, rgba(128,128,128,.25))",
  rule: "var(--dsw-alias-border-l3, rgba(128,128,128,.35))",
  text: "var(--dsw-alias-label-primary, inherit)",
  muted: "var(--dsw-alias-label-secondary, #666)",
  faint: "var(--dsw-alias-label-tertiary, #888)",
  hover: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16))",
  error: "var(--dsw-alias-state-error-primary, #a00)",
  warn: "var(--dsw-alias-state-warn-primary, #b26b00)",
  warnText: "var(--dsw-alias-state-warn-label, #b26b00)",
  layer: "var(--dsw-alias-bg-layer-1, transparent)",
  font: "var(--dsw-font-family, system-ui)",
  radius: "var(--dsw-radius-sm, 6px)",
  focusRing: "var(--dsw-focus-ring-color, currentColor)"
};
function ToolbarButton(props) {
  return h("button", {
    type: "button",
    title: props.title,
    onClick: props.onClick,
    disabled: props.disabled === true,
    "aria-pressed": props.active === void 0 ? void 0 : props.active,
    "aria-expanded": props.expanded,
    style: {
      minWidth: 24,
      height: 24,
      padding: "0 8px",
      font: "inherit",
      fontSize: 11,
      fontFamily: T.font,
      color: props.active === true ? T.text : T.muted,
      background: props.active === true ? T.hover : "transparent",
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      cursor: props.disabled === true ? "default" : "pointer",
      opacity: props.disabled === true ? 0.45 : 1,
      fontWeight: props.active === true ? 600 : 400,
      outlineColor: T.focusRing
    }
  }, props.label);
}
function CoveragePanel(props) {
  const { report, t } = props;
  const known = report.drawn;
  const sections = [];
  if (report.markers.length > 0) {
    sections.push(h(
      "div",
      { key: "markers" },
      h("div", { style: { color: T.warnText, fontWeight: 600, marginTop: 6 } }, `${report.markers.length} ${t("placeholders")}`),
      ...report.markers.map((marker, index) => h(
        "div",
        { key: `m${index}`, style: { marginTop: 2 } },
        h("code", { style: { color: T.text } }, marker.name === void 0 ? marker.type : `${marker.type} ${marker.name}`),
        h("span", { style: { color: T.muted } }, ` \u2014 ${marker.reason}`)
      ))
    ));
  }
  if (report.unknown.length > 0) {
    sections.push(h(
      "div",
      { key: "unknown" },
      h("div", { style: { color: T.warnText, fontWeight: 600, marginTop: 6 } }, `${report.unknown.length} ${t("unknownTypes")}`),
      ...report.unknown.map((entry, index) => h(
        "div",
        { key: `u${index}`, style: { marginTop: 2 } },
        h("code", { style: { color: T.text } }, entry.name === void 0 ? entry.type : `${entry.type} ${entry.name}`),
        h("span", { style: { color: T.muted } }, ` \u2014 ${entry.reason}`)
      ))
    ));
  }
  if (report.geometry.length > 0) {
    sections.push(h(
      "div",
      { key: "geometry" },
      h("div", { style: { fontWeight: 600, marginTop: 6 } }, t("coordinates")),
      ...report.geometry.map((note, index) => h(
        "div",
        { key: `g${index}`, style: { marginTop: 2 } },
        h("code", { style: { color: T.text } }, `${note.type}${note.name === void 0 ? "" : ` ${note.name}`}`),
        h("span", { style: { color: T.muted } }, ` \xB7 ${note.attribute}: ${ruleLabel(note, t)}`)
      ))
    ));
  }
  if (sections.length === 0) sections.push(h("div", { key: "none", style: { marginTop: 6, color: T.muted } }, t("nothingSkipped")));
  return h(
    "div",
    {
      style: {
        flex: "none",
        maxHeight: "40%",
        overflow: "auto",
        padding: "6px 10px 8px",
        borderBottom: `1px solid ${T.border}`,
        background: T.layer,
        fontSize: 11,
        fontFamily: T.font,
        color: T.text
      }
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 8 } },
      h("strong", null, t("coverage")),
      h("span", { style: { color: T.muted, marginLeft: "auto" } }, `${known}/${report.objects} ${t("drawn")}`),
      h(ToolbarButton, { label: "\xD7", title: t("close"), onClick: props.onClose })
    ),
    ...sections
  );
}
function ruleLabel(note, t) {
  if (note.rule === "percent") return t("rulePercent");
  if (note.rule === "box-diagonal") return t("ruleDiagonal");
  return t("ruleAbsolute");
}
function decodeSource(data) {
  if (typeof data === "string") return data;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder("utf-8").decode(bytes);
}
function exportRootOf(address) {
  if (address === void 0 || address === "") return void 0;
  const match = /^(.*?)[\\/]Displays[\\/][^\\/]+$/u.exec(address);
  return match?.[1];
}
function referencedTags(node, out) {
  for (const value of Object.values(node.attributes)) {
    for (const match of value.matchAll(/\{([^}]+)\}/gu)) out.add((match[1] ?? "").trim());
    const name = value.trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) out.add(name);
  }
  for (const child2 of node.children) referencedTags(child2, out);
  return out;
}
function indexObjects(display) {
  const index = /* @__PURE__ */ new Map();
  const walk = (node) => {
    const name = attribute(node, "name");
    if (name !== void 0 && !index.has(name)) {
      const states = node.children.find((child2) => child2.tag === "states");
      const connections = node.children.find((child2) => child2.tag === "connections");
      index.set(name, {
        name,
        type: node.tag,
        attributes: node.attributes,
        connections: (connections?.children ?? []).map((connection) => ({
          name: attribute(connection, "name"),
          expression: attribute(connection, "expression")
        })),
        states: states?.children.length ?? 0
      });
    }
    for (const child2 of node.children) walk(child2);
  };
  walk(display);
  return index;
}
function downloadPng(container, name) {
  const svg = container?.querySelector("svg");
  if (svg === null || svg === void 0) return;
  const size = /width="(\d+)" height="(\d+)"/u.exec(svg.outerHTML);
  const width = Number(size?.[1] ?? 1280);
  const height = Number(size?.[2] ?? 1024);
  const blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((result) => {
      if (result === null) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(result);
      link.download = `${name || "display"}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1e3);
    }, "image/png");
  };
  image.src = url;
}
function DisplaySurface(props) {
  const { source, t, address } = props;
  const root = exportRootOf(address);
  const [xml, setXml] = React.useState(source);
  const [displayName, setDisplayName] = React.useState("");
  const [history, setHistory] = React.useState([]);
  const [selected, setSelected] = React.useState(void 0);
  const [fit, setFit] = React.useState(true);
  const [live, setLive] = React.useState(false);
  const [liveValues, setLiveValues] = React.useState({});
  const [liveNotice, setLiveNotice] = React.useState("");
  const [globals, setGlobals] = React.useState({});
  const [coverageOpen, setCoverageOpen] = React.useState(false);
  const container = React.useRef(null);
  const [compare2, setCompare] = React.useState(void 0);
  const parsed = React.useMemo(() => {
    try {
      const display = parseXml(xml);
      return { display, index: indexObjects(display), tags: [...referencedTags(display, /* @__PURE__ */ new Set())], error: "" };
    } catch (error) {
      return { display: void 0, index: /* @__PURE__ */ new Map(), tags: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [xml]);
  React.useEffect(() => {
    if (!live || root === void 0) return void 0;
    let cancelled = false;
    const stored = (() => {
      try {
        const raw = window.localStorage.getItem("ftview.live.controller");
        if (raw === null) return void 0;
        const value = JSON.parse(raw);
        return typeof value.ip === "string" ? { ip: value.ip, slot: typeof value.slot === "number" ? value.slot : 0 } : void 0;
      } catch {
        return void 0;
      }
    })();
    const controller = stored ?? { ip: window.prompt(t("controllerPrompt")) ?? "", slot: 0 };
    if (controller.ip === "") {
      setLive(false);
      return void 0;
    }
    try {
      window.localStorage.setItem("ftview.live.controller", JSON.stringify(controller));
    } catch {
    }
    const tick = async () => {
      const query = `root=${encodeURIComponent(root)}&ip=${encodeURIComponent(controller.ip)}&slot=${controller.slot}&tags=${encodeURIComponent(parsed.tags.join(","))}`;
      try {
        const response = await fetch(`/engineering/ftview/live?${query}`, { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setLiveNotice(body.error ?? `${t("liveReadFailed")} (${response.status})`);
          return;
        }
        const values = {};
        let good = 0;
        let bad = 0;
        for (const [hmi, entry] of Object.entries(body.values ?? {})) {
          if (entry.quality === "good" && entry.value !== void 0) {
            values[hmi] = entry.value;
            good += 1;
          } else bad += 1;
        }
        setLiveValues(values);
        const parts = [`${good} ${t("live")}`];
        if (bad > 0) parts.push(`${bad} ${t("liveFailed")}`);
        if ((body.not_live?.length ?? 0) > 0) parts.push(`${(body.not_live ?? []).length} ${t("liveNotLive")}`);
        setLiveNotice(parts.join(", "));
      } catch (error) {
        if (!cancelled) setLiveNotice(error instanceof Error ? error.message : String(error));
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live, root, parsed.tags]);
  const rendered = React.useMemo(() => {
    try {
      const result = renderDisplayWithReport(xml, { tagValues: liveValues, globals, imageHref, mode: "auto" });
      return { svg: result.svg, report: result.report, count: parsed.index.size, error: "" };
    } catch (error) {
      return { svg: "", report: void 0, count: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }, [xml, liveValues, globals, parsed.index.size]);
  const navigate = React.useCallback(async (target) => {
    if (root === void 0 || target === "") return;
    try {
      const response = await fetch(`/engineering/ftview/display?root=${encodeURIComponent(root)}&name=${encodeURIComponent(target)}`, { cache: "no-store" });
      if (!response.ok) {
        setLiveNotice(`${target}: ${t("cannotOpen")} (${response.status})`);
        return;
      }
      const text = await response.text();
      setHistory((entries) => [...entries, { name: displayName, xml }]);
      setXml(text);
      setDisplayName(target);
      setSelected(void 0);
      setLiveNotice("");
    } catch (error) {
      setLiveNotice(error instanceof Error ? error.message : String(error));
    }
  }, [root, xml, displayName, t]);
  const back = () => {
    const previous = history[history.length - 1];
    if (previous === void 0) return;
    setHistory((entries) => entries.slice(0, -1));
    setXml(previous.xml);
    setDisplayName(previous.name);
    setSelected(void 0);
  };
  React.useEffect(() => {
    if (root === void 0) return void 0;
    let cancelled = false;
    const globalsOf = {};
    const walk = (node, file) => {
      const name = node.attributes?.name;
      if (typeof name === "string" && name !== "") globalsOf[`${file}.${name}`] = node;
      for (const child2 of node.children) walk(child2, file);
    };
    fetch(`/engineering/ftview/globals?root=${encodeURIComponent(root)}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : { files: [] }).then((body) => {
      if (cancelled) return;
      for (const entry of body.files ?? []) {
        try {
          walk(parseXml(entry.xml), entry.name);
        } catch {
        }
      }
      setGlobals(globalsOf);
    }).catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [root]);
  function imageHref(name) {
    return root === void 0 ? void 0 : `/engineering/ftview/image?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`;
  }
  const startCompare = React.useCallback(async () => {
    if (root === void 0) return;
    const other = window.prompt(t("comparePrompt"));
    if (other === null || other.trim() === "") return;
    const name = displayName !== "" ? displayName : ((address ?? "").split(/[\\/]/u).pop() ?? "").replace(/\.xml$/iu, "");
    try {
      const response = await fetch(`/engineering/ftview/display?root=${encodeURIComponent(other.trim())}&name=${encodeURIComponent(name)}`, { cache: "no-store" });
      if (!response.ok) {
        setLiveNotice(`${name}: ${t("compareMissing")} (${response.status})`);
        return;
      }
      setCompare({ name, xml: await response.text() });
    } catch (error) {
      setLiveNotice(error instanceof Error ? error.message : String(error));
    }
  }, [root, displayName, address, t]);
  const compareSvg = React.useMemo(() => {
    if (compare2 === void 0) return "";
    try {
      return renderDisplay(compare2.xml, { globals, imageHref });
    } catch {
      return "";
    }
  }, [compare2]);
  if (rendered.error !== "") {
    return h(
      "div",
      { style: { padding: 16, fontFamily: T.font, fontSize: 13, color: T.error } },
      h("p", null, t("invalid")),
      h("pre", { style: { whiteSpace: "pre-wrap", color: T.muted } }, rendered.error)
    );
  }
  const report = rendered.report;
  const size = /width="(\d+)" height="(\d+)"/u.exec(rendered.svg);
  const width = Number(size?.[1] ?? 0);
  const height = Number(size?.[2] ?? 0);
  const chosen = selected === void 0 ? void 0 : parsed.index.get(selected);
  const modeDraft = report?.mode === "draft";
  const issues = (report?.markers.length ?? 0) + (report?.unknown.length ?? 0);
  const note = chosen === void 0 ? void 0 : report?.geometry.find((entry) => entry.name === chosen.name);
  const marker = chosen === void 0 ? void 0 : report?.markers.find((entry) => entry.name === chosen.name);
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: T.font } },
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 32,
          padding: "4px 8px",
          fontSize: 11,
          color: T.muted,
          borderBottom: `1px solid ${T.border}`,
          flex: "none"
        }
      },
      displayName === "" ? null : h("span", { style: { fontWeight: 600, color: T.text } }, displayName),
      h("span", null, `${width}\xD7${height}`),
      report === void 0 ? null : h("span", null, `${report.drawn}/${report.objects} ${t("drawn")}`),
      report === void 0 ? null : h("span", {
        title: modeDraft ? t("modeDraftHint") : t("modeExportHint"),
        style: {
          padding: "0 6px",
          height: 18,
          lineHeight: "18px",
          borderRadius: T.radius,
          border: `1px solid ${T.border}`,
          color: T.text,
          fontWeight: 600
        }
      }, modeDraft ? t("modeDraft") : t("modeExport")),
      h(
        "span",
        { style: { marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" } },
        live && liveNotice !== "" ? h("span", { style: { color: T.muted } }, liveNotice) : null,
        report === void 0 ? null : h(ToolbarButton, {
          label: issues === 0 ? t("coverage") : `${t("coverage")} ${issues}`,
          title: t("coverage"),
          onClick: () => setCoverageOpen(!coverageOpen),
          active: coverageOpen || issues > 0,
          expanded: coverageOpen
        }),
        history.length > 0 ? h(ToolbarButton, { label: `\u2190 ${t("back")}`, onClick: back }) : null,
        h(ToolbarButton, {
          label: compare2 === void 0 ? t("compare") : t("compareOff"),
          disabled: root === void 0,
          active: compare2 !== void 0,
          onClick: () => {
            if (compare2 === void 0) void startCompare();
            else setCompare(void 0);
          }
        }),
        h(ToolbarButton, { label: t("png"), onClick: () => downloadPng(container.current, displayName) }),
        h(ToolbarButton, {
          label: live ? t("liveOn") : t("live"),
          title: root === void 0 ? t("liveNeedsExport") : `${parsed.tags.length} ${t("tags")}`,
          disabled: root === void 0,
          active: live,
          onClick: () => setLive(!live)
        }),
        h(ToolbarButton, { label: t("fit"), onClick: () => setFit(true), active: fit }),
        h(ToolbarButton, { label: t("actual"), onClick: () => {
          setFit(false);
        }, active: !fit })
      )
    ),
    coverageOpen && report !== void 0 ? h(CoveragePanel, { report, t, onClose: () => setCoverageOpen(false) }) : null,
    h(
      "div",
      { style: { flex: 1, minHeight: 0, display: "flex", gap: 6 } },
      h(
        "div",
        {
          ref: container,
          onClick: (event) => {
            const element = event.target.closest("[data-ftv-name]");
            setSelected(element?.getAttribute("data-ftv-name") ?? void 0);
          },
          onDoubleClick: (event) => {
            const element = event.target.closest("[data-ftv-type]");
            if (element?.getAttribute("data-ftv-type") !== "gotoButton") return;
            const name = element.getAttribute("data-ftv-name") ?? "";
            const object = parsed.index.get(name);
            const target = object === void 0 ? void 0 : attribute({ tag: "gotoButton", attributes: object.attributes, children: [], text: "" }, "display");
            if (target !== void 0) void navigate(target);
          },
          style: { flex: 1, minWidth: 0, overflow: "auto", background: T.canvas, padding: 8 }
        },
        compare2 === void 0 ? null : h("div", { style: { fontSize: 10, color: T.faint, marginBottom: 4 } }, displayName === "" ? t("current") : displayName),
        h("div", {
          style: fit ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } : { width, height },
          dangerouslySetInnerHTML: { __html: fit ? responsiveSvg(rendered.svg) : rendered.svg }
        })
      ),
      compare2 === void 0 ? null : h(
        "div",
        { style: { flex: 1, minWidth: 0, overflow: "auto", background: T.canvas, padding: 8, borderLeft: `1px solid ${T.rule}` } },
        h("div", { style: { fontSize: 10, color: T.faint, marginBottom: 4 } }, `${t("compareLabel")}: ${compare2.name}`),
        h("div", {
          style: fit ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } : { width, height },
          dangerouslySetInnerHTML: { __html: fit ? responsiveSvg(compareSvg) : compareSvg }
        })
      ),
      chosen === void 0 ? null : h(
        "div",
        { style: { width: 260, flex: "none", borderLeft: `1px solid ${T.border}`, overflow: "auto", padding: 8, fontSize: 11, color: T.text } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 6 } },
          h("strong", null, chosen.type),
          h("span", { style: { color: T.muted } }, chosen.name),
          h(ToolbarButton, { label: "\xD7", title: t("close"), onClick: () => setSelected(void 0) })
        ),
        h("div", { style: { color: T.muted, marginTop: 2 } }, `${t("family")}: ${elementFacts(chosen.type)?.family ?? "\u2014"}`),
        marker === void 0 ? null : h("div", { style: { color: T.warnText, marginTop: 4 } }, `${t("placeholders")}: ${marker.reason}`),
        note === void 0 ? null : h("div", { style: { color: T.muted, marginTop: 4 } }, `${note.attribute}: ${ruleLabel(note, t)}`),
        chosen.type === "gotoButton" && attribute({ tag: "gotoButton", attributes: chosen.attributes, children: [], text: "" }, "display") !== void 0 ? h("div", { style: { margin: "6px 0" } }, h(ToolbarButton, {
          label: t("openDisplay"),
          onClick: () => {
            const target = attribute({ tag: "gotoButton", attributes: chosen.attributes, children: [], text: "" }, "display");
            if (target !== void 0) void navigate(target);
          }
        })) : null,
        h(
          "table",
          { style: { borderCollapse: "collapse", width: "100%", marginTop: 6 } },
          h("tbody", null, Object.entries(chosen.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => h("tr", { key }, h("td", { style: { color: T.muted, paddingRight: 6, verticalAlign: "top" } }, key), h("td", null, value))))
        ),
        chosen.connections.length === 0 ? null : h(
          "div",
          { style: { marginTop: 6 } },
          h("strong", null, t("connections")),
          chosen.connections.map((connection, index) => h("div", { key: index }, `${connection.name ?? "?"} \u2190 ${connection.expression ?? "?"}`))
        ),
        h("div", { style: { color: T.faint, marginTop: 4 } }, `${chosen.states} ${t("states")}`)
      )
    )
  );
}
function ArtifactCard(props) {
  const { artifact } = props;
  return h(
    "div",
    { style: { padding: 16, fontFamily: T.font, fontSize: 13, color: T.text, display: "flex", flexDirection: "column", gap: 6 } },
    h("div", { style: { fontWeight: 600, fontSize: 14 } }, artifact.title),
    ...artifact.details.map((line, index) => h("div", { key: `d${index}`, style: { color: T.muted } }, line)),
    h(
      "div",
      { style: { color: T.faint, fontSize: 11, marginTop: 8 } },
      props.address === void 0 || props.address === "" ? props.t("detectedFrom") : props.address
    ),
    h("div", { style: { color: T.faint, fontSize: 11 } }, artifact.kind === "unknown" ? props.t("invalid") : props.t("notDisplay"))
  );
}
function Display(props) {
  const artifact = detectArtifact(props.source);
  if (artifact.kind === "display") return h(DisplaySurface, props);
  return h(ArtifactCard, { artifact, t: props.t, address: props.address });
}

// packages/ftview-viewer/face/face.ts
var NS = "factorytalkView";
var ID = "dsh-engineering-ftview-viewer/display";
var en = {
  title: "FactoryTalk View display",
  fit: "Fit",
  actual: "100%",
  objects: "objects",
  invalid: "This file is not a FactoryTalk View display export.",
  back: "Back",
  compare: "Compare",
  compareOff: "Stop comparing",
  compareLabel: "compare",
  compareMissing: "not in that export",
  png: "PNG",
  live: "Live",
  liveOn: "Live on",
  liveNeedsExport: "Open the export folder, not a single file",
  liveReadFailed: "live read failed",
  liveFailed: "failed",
  liveNotLive: "not live",
  tags: "tag(s) bound",
  openDisplay: "Open display",
  connections: "Connections",
  current: "current",
  states: "state(s)",
  family: "family",
  drawn: "drawn",
  placeholders: "placeholder(s)",
  unknownTypes: "not in the installed schema",
  coverage: "Coverage",
  nothingSkipped: "Every object in this display is drawn from the installed schema.",
  coordinates: "Coordinates",
  rulePercent: "a percentage of the object box",
  ruleAbsolute: "display pixels",
  ruleDiagonal: "the object box diagonal",
  modeDraft: "Draft",
  modeExport: "Export",
  modeDraftHint: "Staged coordinates: a value inside an object is a percentage of its box.",
  modeExportHint: "Exported coordinates: a value inside an object is a display pixel.",
  close: "Close",
  controllerPrompt: "Controller IPv4 address",
  comparePrompt: "Compare with another export folder",
  detectedFrom: "Detected from file content",
  notDisplay: "Not a display, so nothing is drawn. Open a file under Displays/ to render."
};
var zh = {
  title: "FactoryTalk View \u753B\u9762",
  fit: "\u9002\u5E94",
  actual: "100%",
  objects: "\u4E2A\u5BF9\u8C61",
  invalid: "\u8BE5\u6587\u4EF6\u4E0D\u662F FactoryTalk View \u753B\u9762\u5BFC\u51FA\u3002",
  back: "\u8FD4\u56DE",
  compare: "\u5BF9\u6BD4",
  compareOff: "\u7ED3\u675F\u5BF9\u6BD4",
  compareLabel: "\u5BF9\u6BD4",
  compareMissing: "\u4E0D\u5728\u8BE5\u5BFC\u51FA\u4E2D",
  png: "PNG",
  live: "\u5B9E\u65F6",
  liveOn: "\u5B9E\u65F6\u5F00",
  liveNeedsExport: "\u8BF7\u6253\u5F00\u5BFC\u51FA\u6587\u4EF6\u5939\uFF0C\u800C\u4E0D\u662F\u5355\u4E2A\u6587\u4EF6",
  liveReadFailed: "\u5B9E\u65F6\u8BFB\u53D6\u5931\u8D25",
  liveFailed: "\u5931\u8D25",
  liveNotLive: "\u975E\u5B9E\u65F6",
  tags: "\u4E2A\u5DF2\u7ED1\u5B9A\u6807\u7B7E",
  openDisplay: "\u6253\u5F00\u753B\u9762",
  connections: "\u8FDE\u63A5",
  current: "\u5F53\u524D",
  states: "\u4E2A\u72B6\u6001",
  family: "\u7C7B\u522B",
  drawn: "\u5DF2\u7ED8\u5236",
  placeholders: "\u4E2A\u5360\u4F4D",
  unknownTypes: "\u4E2A\u4E0D\u5728\u5DF2\u5B89\u88C5\u67B6\u6784\u4E2D",
  coverage: "\u8986\u76D6\u60C5\u51B5",
  nothingSkipped: "\u6B64\u753B\u9762\u4E2D\u7684\u6BCF\u4E2A\u5BF9\u8C61\u90FD\u6309\u5DF2\u5B89\u88C5\u67B6\u6784\u7ED8\u5236\u3002",
  coordinates: "\u5750\u6807",
  rulePercent: "\u76F8\u5BF9\u4E8E\u5BF9\u8C61\u6846\u7684\u767E\u5206\u6BD4",
  ruleAbsolute: "\u753B\u9762\u50CF\u7D20",
  ruleDiagonal: "\u5BF9\u8C61\u6846\u5BF9\u89D2\u7EBF",
  modeDraft: "\u8349\u7A3F",
  modeExport: "\u5BFC\u51FA",
  modeDraftHint: "\u8349\u7A3F\u5750\u6807\uFF1A\u5BF9\u8C61\u5185\u90E8\u7684\u503C\u76F8\u5BF9\u4E8E\u5176\u5BF9\u8C61\u6846\u7684\u767E\u5206\u6BD4\u3002",
  modeExportHint: "\u5BFC\u51FA\u5750\u6807\uFF1A\u5BF9\u8C61\u5185\u90E8\u7684\u503C\u662F\u753B\u9762\u50CF\u7D20\u3002",
  close: "\u5173\u95ED",
  controllerPrompt: "\u63A7\u5236\u5668 IPv4 \u5730\u5740",
  comparePrompt: "\u4E0E\u53E6\u4E00\u4E2A\u5BFC\u51FA\u6587\u4EF6\u5939\u5BF9\u6BD4",
  detectedFrom: "\u4ECE\u6587\u4EF6\u5185\u5BB9\u8BC6\u522B",
  notDisplay: "\u8FD9\u4E0D\u662F\u753B\u9762\uFF0C\u56E0\u6B64\u6CA1\u6709\u7ED8\u5236\u4EFB\u4F55\u5185\u5BB9\u3002\u8BF7\u6253\u5F00 Displays/ \u4E0B\u7684\u6587\u4EF6\u8FDB\u884C\u6E32\u67D3\u3002"
};
var h2 = React2.createElement;
function Body(props) {
  const { content, t } = props;
  const source = React2.useMemo(() => {
    if (content === void 0 || content.kind !== "bytes" || content.data === void 0) return null;
    return decodeSource(content.data);
  }, [content]);
  if (source === null) return null;
  return h2(Display, { source, address: props.resourceAddress, t: typeof t === "function" ? t : (key) => key });
}
function fileViewer(t) {
  return function FtViewFile(props) {
    if (typeof props.content !== "string") return null;
    return h2(Display, { source: props.content, t, address: typeof props.path === "string" ? props.path : void 0 });
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
