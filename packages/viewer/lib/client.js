window.__ModuleLoader__.load({
  id: "dsh-engineering-l5x-viewer",
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

// packages/viewer/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react2 = require("react");

// packages/viewer/src/client/vendor/workspace-path.ts
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

// packages/viewer/src/client/L5xBody.tsx
var import_react = require("react");
var import_react_dom = require("react-dom");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// packages/viewer/src/client/model.ts
var children = (parent, name) => parent === null ? [] : Array.from(parent.children).filter((child2) => child2.tagName === name);
var child = (parent, name) => children(parent, name)[0] ?? null;
var attr = (element, name) => element?.getAttribute(name) ?? "";
var content = (element) => element?.textContent.trim() ?? "";
var description = (element) => content(child(element, "Description")) || attr(element, "Description");
var dataKey = (scope, symbol) => `${scope.toLowerCase()}::${symbol.toLowerCase()}`;
function exportedDatum(project, scope, symbol) {
  return project.exportedData.get(dataKey(scope, symbol)) ?? (scope === "controller" ? void 0 : project.exportedData.get(dataKey("controller", symbol)));
}
function timerState(project, scope, symbol) {
  const read = (member) => exportedDatum(project, scope, `${symbol}.${member}`)?.value;
  const preset = read("PRE");
  const accum = read("ACC");
  if (preset === void 0 && accum === void 0) return void 0;
  return { preset: preset ?? "", accum: accum ?? "", enabled: read("EN") === "1", timing: read("TT") === "1", done: read("DN") === "1" };
}
function dimensionsOf(element) {
  const written = attr(element, "Dimensions") || attr(element, "Dimension");
  return written === "0" ? "" : written;
}
function parseProject(xml) {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const error = parsed.getElementsByTagName("parsererror")[0];
  if (error !== void 0) throw new Error(`Invalid XML: ${content(error)}`);
  const root = parsed.documentElement;
  if (root.tagName !== "RSLogix5000Content") throw new Error("This file is not an L5X export.");
  const controller = child(root, "Controller");
  if (controller === null) throw new Error("The L5X export has no controller.");
  const exportedData = /* @__PURE__ */ new Map();
  const collectValues = (tag, scope) => {
    const decorated = children(tag, "Data").find((data) => attr(data, "Format") === "Decorated");
    if (decorated === void 0) return;
    const limit = 6e4;
    const visit = (node, path) => {
      if (exportedData.size >= limit) return;
      const name = attr(node, "Name");
      const index = attr(node, "Index");
      const next = name !== "" ? `${path}.${name}` : index !== "" ? `${path}${index}` : path;
      const value = node.getAttribute("Value");
      if (value !== null && value.length <= 256) exportedData.set(dataKey(scope, next), {
        value,
        type: attr(node, "DataType") || attr(tag, "DataType")
      });
      for (const member of Array.from(node.children)) visit(member, next);
    };
    const tagName = attr(tag, "Name");
    for (const node of Array.from(decorated.children)) visit(node, tagName);
  };
  const tagsOf = (element, scope) => children(child(element, "Tags"), "Tag").map((tag) => {
    collectValues(tag, scope);
    return {
      name: attr(tag, "Name"),
      type: attr(tag, "DataType"),
      scope,
      description: description(tag),
      alias: attr(tag, "AliasFor"),
      dimensions: dimensionsOf(tag)
    };
  });
  const programs = children(child(controller, "Programs"), "Program").map((program) => {
    const name = attr(program, "Name");
    const routines = children(child(program, "Routines"), "Routine").map((routine2) => ({
      name: attr(routine2, "Name"),
      type: attr(routine2, "Type"),
      description: description(routine2),
      rungs: children(child(routine2, "RLLContent"), "Rung").map((rung) => ({
        number: attr(rung, "Number"),
        comment: content(child(rung, "Comment")) || attr(rung, "Comment"),
        text: content(child(rung, "Text"))
      })),
      code: children(child(routine2, "STContent"), "Line").map((line) => line.textContent).join("\n")
    }));
    return { name, main: attr(program, "MainRoutineName"), description: description(program), routines, tags: tagsOf(program, name) };
  });
  const tasks = children(child(controller, "Tasks"), "Task").map((task) => ({
    name: attr(task, "Name"),
    type: attr(task, "Type"),
    rate: attr(task, "Rate"),
    priority: attr(task, "Priority"),
    watchdog: attr(task, "Watchdog"),
    programs: children(child(task, "ScheduledPrograms"), "ScheduledProgram").map((program) => attr(program, "Name"))
  }));
  const modules = children(child(controller, "Modules"), "Module").map((module2) => ({
    name: attr(module2, "Name"),
    catalog: attr(module2, "CatalogNumber"),
    parent: attr(module2, "ParentModule"),
    description: description(module2),
    slot: attr(child(module2, "Ports"), "Address") || attr(child(child(module2, "Ports"), "Port"), "Address")
  }));
  const aoiDefinitions = children(child(controller, "AddOnInstructionDefinitions"), "AddOnInstructionDefinition");
  const aoiPins = new Map(aoiDefinitions.map((definition) => [
    attr(definition, "Name").toUpperCase(),
    children(child(definition, "Parameters"), "Parameter").map((parameter) => attr(parameter, "Name")).filter((name) => name !== "" && name !== "EnableIn" && name !== "EnableOut")
  ]));
  const dataTypes = new Map(children(child(controller, "DataTypes"), "DataType").map((type) => [
    attr(type, "Name"),
    children(child(type, "Members"), "Member").map((member) => ({
      name: attr(member, "Name"),
      type: attr(member, "DataType"),
      dimensions: dimensionsOf(member),
      description: description(member)
    }))
  ]));
  const aoiParameters = new Map(aoiDefinitions.map((definition) => [
    attr(definition, "Name").toUpperCase(),
    children(child(definition, "Parameters"), "Parameter").filter((parameter) => attr(parameter, "Name") !== "EnableIn" && attr(parameter, "Name") !== "EnableOut").map((parameter) => ({
      name: attr(parameter, "Name"),
      type: attr(parameter, "DataType"),
      dimensions: dimensionsOf(parameter),
      description: description(parameter),
      usage: attr(parameter, "Usage")
    }))
  ]));
  return {
    name: attr(controller, "Name"),
    processor: attr(controller, "ProcessorType"),
    exportRevision: attr(root, "SoftwareRevision"),
    revision: [attr(controller, "MajorRev"), attr(controller, "MinorRev")].filter(Boolean).join("."),
    programs,
    tasks,
    tags: tagsOf(controller, "controller"),
    modules,
    exportedData,
    aoiPins,
    dataTypes,
    aoiParameters,
    aois: aoiDefinitions.map((aoi) => attr(aoi, "Name")),
    types: children(child(controller, "DataTypes"), "DataType").map((type) => attr(type, "Name"))
  };
}
function findReferences(project, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [];
  const hits = [];
  for (const program of project.programs) for (const routine2 of program.routines) {
    if (routine2.type === "RLL") for (const rung of routine2.rungs) {
      if (rung.text.toLocaleLowerCase().includes(needle)) hits.push({
        program: program.name,
        routine: routine2.name,
        location: `Rung ${rung.number}`,
        text: rung.text
      });
    }
    if (routine2.type === "ST") routine2.code.split("\n").forEach((line, index) => {
      if (line.toLocaleLowerCase().includes(needle)) hits.push({
        program: program.name,
        routine: routine2.name,
        location: `Line ${index + 1}`,
        text: line
      });
    });
  }
  return hits;
}
function ladderSegments(text) {
  const source = text.trim().replace(/;$/, "");
  let cursor = 0;
  const skip = () => {
    while (/\s/.test(source[cursor] ?? "")) cursor++;
  };
  const marker = () => {
    skip();
    const value = source.slice(cursor, cursor + 3).toUpperCase();
    return value === "BST" || value === "NXB" || value === "BND" ? value : void 0;
  };
  const sequence = (nested) => {
    const segments = [];
    while (cursor < source.length) {
      skip();
      if (cursor >= source.length) break;
      const next = marker();
      if (next === "NXB" || next === "BND") return nested === "bst" ? segments : null;
      if (source[cursor] === "," || source[cursor] === "]") return nested === "bracket" ? segments : null;
      if (next === "BST") {
        cursor += 3;
        const paths = [];
        while (true) {
          const path = sequence("bst");
          if (path === null) return null;
          paths.push(path);
          const end = marker();
          if (end === void 0) return null;
          cursor += 3;
          if (end === "BND") break;
          if (end !== "NXB") return null;
        }
        segments.push({ paths });
        continue;
      }
      if (source[cursor] === "[") {
        cursor++;
        const paths = [];
        while (true) {
          const path = sequence("bracket");
          if (path === null) return null;
          paths.push(path);
          skip();
          const separator = source[cursor];
          if (separator !== "," && separator !== "]") return null;
          cursor++;
          if (separator === "]") break;
        }
        segments.push({ paths });
        continue;
      }
      const match = /^[A-Za-z_][\w]*\(/.exec(source.slice(cursor));
      if (match === null) return null;
      const mnemonic = match[0].slice(0, -1);
      cursor += match[0].length;
      const start = cursor;
      let depth = 1;
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === "(") depth++;
        if (source[cursor] === ")") depth--;
        cursor++;
      }
      if (depth !== 0) return null;
      segments.push({ mnemonic, operands: source.slice(start, cursor - 1) });
    }
    return nested === null ? segments : null;
  };
  const result = sequence(null);
  return result !== null && result.length > 0 ? result : null;
}

// packages/l5x/src/engine/instruction-set.ts
var TABLE = [
  ["Contacts and coils", "UID= UIE="],
  ["Math", "NEG=SD ABS=SD XPY=ABD LN=SD LOG=SD DEG=SD RAD=SD TOD=SD FRD=SD TRUNC=SD SIN=SD COS=SD TAN=SD ASN=SD ACS=SD ATN=SD "],
  ["Program control", "BRK= NOP= TND="],
  ["Communications", "MSG=K"]
];
var slot = (code) => {
  switch (code) {
    case "A":
      return { name: "Source A", kind: "NUMBER" };
    case "B":
      return { name: "Source B", kind: "NUMBER" };
    case "S":
      return { name: "Source", kind: "NUMBER" };
    case "D":
      return { name: "Dest", kind: "NUMBER", writable: true };
    case "L":
      return { name: "Length", kind: "NUMBER" };
    case "P":
      return { name: "Position", kind: "NUMBER" };
    case "T":
      return { name: "Timer", kind: "TIMER" };
    case "C":
      return { name: "Counter", kind: "COUNTER" };
    case "K":
      return { name: "Control", kind: "ANY", writable: true, types: ["MESSAGE"] };
    case "X":
      return { name: "Expression", kind: "EXPRESSION" };
    case "R":
      return { name: "Routine Name", kind: "ROUTINE" };
    default:
      return { name: "Tag", kind: "BOOL" };
  }
};
var MORE_INSTRUCTIONS = TABLE.flatMap(([category, list]) => list.trim().split(/\s+/u).filter((token) => token !== "").map((token) => {
  const [name, codes = ""] = token.split("=");
  return { name, category, slots: [...codes].map(slot) };
}));

// packages/l5x/src/engine/mnemonics.ts
var MNEMONIC_PAIRS = [
  { legacy: "ACS", modern: "ACOS" },
  { legacy: "ASN", modern: "ASIN" },
  { legacy: "ATN", modern: "ATAN" },
  { legacy: "EQU", modern: "EQ" },
  { legacy: "FRD", modern: "BCD_TO" },
  { legacy: "GEQ", modern: "GE" },
  { legacy: "GRT", modern: "GT" },
  { legacy: "LEQ", modern: "LE" },
  { legacy: "LES", modern: "LT" },
  { legacy: "LIM", modern: "LIMIT" },
  { legacy: "MOV", modern: "MOVE" },
  { legacy: "NEQ", modern: "NE" },
  { legacy: "SQR", modern: "SQRT" },
  { legacy: "TOD", modern: "TO_BCD" },
  { legacy: "TRN", modern: "TRUNC" },
  { legacy: "XPY", modern: "EXPT" }
];
var BY_LEGACY = new Map(MNEMONIC_PAIRS.map((pair) => [pair.legacy, pair]));
var BY_MODERN = new Map(MNEMONIC_PAIRS.map((pair) => [pair.modern, pair]));

// packages/l5x/src/engine/instructions.ts
var bool = (name = "Tag") => ({ name, kind: "BOOL" });
var num = (name = "Source") => ({ name, kind: "NUMBER" });
var any = (name) => ({ name, kind: "ANY" });
var numW = (name) => ({ name, kind: "NUMBER", writable: true });
var str = (name) => ({ name, kind: "STRING" });
var expression = (name = "Expression") => ({ name, kind: "EXPRESSION" });
var routine = (name = "Routine") => ({ name, kind: "ROUTINE" });
var label = (name = "Label") => ({ name, kind: "LABEL" });
var keyword = (name) => ({ name, kind: "KEYWORD" });
var INSTRUCTIONS = [
  // Contacts and coils
  { name: "XIC", category: "Contacts and coils", summary: "Examine if closed: true when the BOOL tag is true.", operands: [bool()] },
  { name: "XIO", category: "Contacts and coils", summary: "Examine if open: true when the BOOL tag is false.", operands: [bool()] },
  { name: "OTE", category: "Contacts and coils", summary: "Output energize: sets the BOOL tag to the rung condition.", operands: [bool()] },
  { name: "OTL", category: "Contacts and coils", summary: "Output latch: sets the BOOL tag when the rung is true and holds it.", operands: [bool()] },
  { name: "OTU", category: "Contacts and coils", summary: "Output unlatch: clears a latched BOOL tag when the rung is true.", operands: [bool()] },
  { name: "ONS", category: "Contacts and coils", summary: "One shot: true for one scan when the rung goes true.", operands: [{ name: "Storage", kind: "BOOL" }] },
  { name: "AFI", category: "Contacts and coils", summary: "Always false instruction: disables the rung and its outputs.", operands: [] },
  // Comparison
  { name: "EQU", category: "Comparison", summary: "Equal: true when source A equals source B.", operands: [num("Source A"), num("Source B")] },
  { name: "NEQ", category: "Comparison", summary: "Not equal.", operands: [num("Source A"), num("Source B")] },
  { name: "GRT", category: "Comparison", summary: "Greater than.", operands: [num("Source A"), num("Source B")] },
  { name: "GEQ", category: "Comparison", summary: "Greater than or equal.", operands: [num("Source A"), num("Source B")] },
  { name: "LES", category: "Comparison", summary: "Less than.", operands: [num("Source A"), num("Source B")] },
  { name: "LEQ", category: "Comparison", summary: "Less than or equal.", operands: [num("Source A"), num("Source B")] },
  { name: "LIM", category: "Comparison", summary: "Limit test: true when the test value lies between the limits.", operands: [num("Low limit"), num("Test"), num("High limit")] },
  { name: "CMP", category: "Comparison", summary: "Compare: true when the expression is true.", operands: [expression()] },
  { name: "ISINF", category: "Comparison", summary: "True when the source is infinite.", operands: [{ name: "Source", kind: "NUMBER", types: ["REAL"] }] },
  { name: "ISNAN", category: "Comparison", summary: "True when the source is not a number.", operands: [{ name: "Source", kind: "NUMBER", types: ["REAL"] }] },
  // ASCII serial port. These need a controller with a serial port: they build on ControlLogix 5570
  // (1756-L73) and are refused on CompactLogix 5380 (5069) and ControlLogix 5580 (1756-L83E), where
  // the compiler answers RxCMP_E_AUDIT_INVALIDOPTYPE for every operand combination tried.
  { name: "ABL", category: "ASCII", summary: "Count the characters in the serial port buffer until a line terminator.", operands: [num("Channel"), any("Serial Port Control"), num("Character Count")] },
  { name: "ACB", category: "ASCII", summary: "Count the characters still in the serial port buffer.", operands: [num("Channel"), any("Serial Port Control"), num("Character Count")] },
  { name: "ARD", category: "ASCII", summary: "Read characters from the serial port buffer into a destination.", operands: [num("Channel"), { name: "Destination", kind: "STRING", writable: true }, any("Serial Port Control"), num("Serial Port Control Length"), num("Characters Read")] },
  { name: "ACL", category: "ASCII", summary: "Clear the serial port read buffer and the read and write queues.", operands: [num("Channel"), bool("Clear Serial Port Read"), bool("Clear Serial Port Write")] },
  { name: "AHL", category: "ASCII", summary: "Apply an AND and OR mask to the serial port control lines.", operands: [num("Channel"), num("ANDMask"), num("ORMask"), any("Serial Port Control"), num("Channel Status")] },
  { name: "ARL", category: "ASCII", summary: "Read a line from the serial port buffer into a destination.", operands: [num("Channel"), { name: "Destination", kind: "STRING", writable: true }, any("Serial Port Control"), num("Serial Port Control Length"), num("Characters Read")] },
  { name: "AWA", category: "ASCII", summary: "Write characters to the serial port buffer, appended.", operands: [num("Channel"), str("Source"), any("Serial Port Control"), num("Serial Port Control Length"), num("Characters Sent")] },
  { name: "AWT", category: "ASCII", summary: "Write characters to the serial port buffer.", operands: [num("Channel"), str("Source"), any("Serial Port Control"), num("Serial Port Control Length"), num("Characters Sent")] },
  // Math
  { name: "ADD", category: "Math", summary: "Add source A and source B into the destination.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "SUB", category: "Math", summary: "Subtract source B from source A into the destination.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "MUL", category: "Math", summary: "Multiply source A by source B into the destination.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "DIV", category: "Math", summary: "Divide source A by source B into the destination.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "MOD", category: "Math", summary: "Remainder of source A divided by source B.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "SQR", category: "Math", summary: "Square root of the source into the destination.", operands: [num("Source"), numW("Destination")] },
  { name: "CPT", category: "Math", summary: "Compute an expression into the destination; the destination comes first in the rung text.", operands: [numW("Destination"), expression()] },
  { name: "STD", category: "File and array", summary: "Standard deviation of the array elements into a REAL destination.", operands: [{ name: "Array", kind: "ANY", tagOnly: true }, { name: "Dimension to Vary", kind: "NUMBER", maximum: 2 }, { name: "Destination", kind: "NUMBER", writable: true, types: ["REAL"] }, { name: "Control", kind: "ANY", writable: true, types: ["CONTROL"] }, num("Length"), num("Position")] },
  { name: "SIZE", category: "File and array", summary: "Number of elements in one dimension of an array into the size tag.", operands: [{ name: "Source", kind: "ANY", tagOnly: true, arrayTag: true }, { name: "Dimension to Vary", kind: "NUMBER", maximum: 2 }, numW("Size")] },
  { name: "JXR", category: "Program control", summary: "Run an external routine; parameters and a return tag may follow the control structure.", operands: [routine("External routine name"), { name: "External routine control", kind: "ANY", writable: true }] },
  { name: "PID", category: "Process", summary: "PID loop: the structure, the process variable, the tieback, the control variable, an optional master loop, and the inhold bit and value.", operands: [{ name: "PID", kind: "ANY", writable: true, types: ["PID"] }, num("Process variable"), num("Tieback"), { name: "Control variable", kind: "NUMBER", writable: true }, { name: "PID master loop", kind: "ANY", types: ["PID"] }, bool("Inhold bit"), num("Inhold value")] },
  { name: "ALMA", category: "Alarm", summary: "Analog alarm: the input is compared with the limits in the ALARM_ANALOG structure.", operands: [{ name: "Alarm", kind: "ANY", writable: true, types: ["ALARM_ANALOG"] }, num("In"), bool("ProgAckAll"), bool("ProgDisable"), bool("ProgEnable")] },
  { name: "ALMD", category: "Alarm", summary: "Digital alarm: the condition in the ALARM_DIGITAL structure, acknowledged and reset from the program.", operands: [{ name: "Alarm", kind: "ANY", writable: true, types: ["ALARM_DIGITAL"] }, bool("ProgAck"), bool("ProgReset"), bool("ProgDisable"), bool("ProgEnable")] },
  // Audited against the installed help and a Studio build: the compact table had these wrong.
  { name: "SRT", category: "File and array", summary: "Sort the elements of an array in place, using a control structure for length and position.", operands: [{ name: "Array", kind: "ANY", tagOnly: true }, { name: "Dimension to Vary", kind: "NUMBER", maximum: 2 }, { name: "Control", kind: "ANY", writable: true, types: ["CONTROL"] }, num("Length"), num("Position")] },
  { name: "SWPB", category: "Move", summary: "Rearrange the bytes of the source into the destination; the order mode is a number (0 or 1), not the word HIGHLOW.", operands: [num("Source"), num("Order Mode"), { name: "Dest", kind: "NUMBER", writable: true }] },
  { name: "STOD", category: "String", summary: "Convert a string to an integer value in the destination.", operands: [str("Source"), { name: "Dest", kind: "NUMBER", writable: true }] },
  { name: "DTOS", category: "String", summary: "Convert an integer value to its decimal string in the destination.", operands: [num("Source"), { name: "Dest", kind: "STRING", writable: true }] },
  { name: "STOR", category: "String", summary: "Convert a string to a REAL value in the destination.", operands: [str("Source"), numW("Destination")] },
  // Move
  { name: "MOV", category: "Move", summary: "Move the source value into the destination.", operands: [num("Source"), numW("Destination")] },
  { name: "COP", category: "Move", summary: "Copy elements from the source to the destination.", operands: [{ name: "Source", kind: "ANY", tagOnly: true, arrayElement: true }, { name: "Destination", kind: "ANY", writable: true, arrayElement: true }, num("Length")] },
  { name: "CPS", category: "Move", summary: "Synchronous copy: copy Source to Dest without allowing the source to change during the copy.", operands: [{ name: "Source", kind: "ANY", tagOnly: true, arrayElement: true }, { name: "Dest", kind: "ANY", writable: true, arrayElement: true }, num("Length")] },
  { name: "CLR", category: "Move", summary: "Clear the destination to zero.", operands: [numW("Destination")] },
  // Timer and counter
  { name: "TON", category: "Timer and counter", summary: "Timer on delay: accumulates while the rung is true; the accumulator operand is written as 0.", operands: [{ name: "Timer", kind: "TIMER" }, num("Preset"), num("Accum")] },
  { name: "TOF", category: "Timer and counter", summary: "Timer off delay: accumulates after the rung goes false; the accumulator operand is written as 0.", operands: [{ name: "Timer", kind: "TIMER" }, num("Preset"), num("Accum")] },
  { name: "RTO", category: "Timer and counter", summary: "Retentive timer on: accumulates and holds its value; the accumulator operand is written as 0.", operands: [{ name: "Timer", kind: "TIMER" }, num("Preset"), num("Accum")] },
  { name: "RES", category: "Timer and counter", summary: "Reset a timer or counter structure.", operands: [{ name: "Structure", kind: "ANY", writable: true }] },
  { name: "CTU", category: "Timer and counter", summary: "Count up on each false-to-true rung transition.", operands: [{ name: "Counter", kind: "COUNTER" }, num("Preset"), num("Accum")] },
  { name: "CTD", category: "Timer and counter", summary: "Count down on each false-to-true rung transition.", operands: [{ name: "Counter", kind: "COUNTER" }, num("Preset"), num("Accum")] },
  // Program control
  { name: "JSR", category: "Program control", summary: "Jump to a subroutine; the second operand is the return parameter, written 0 when the routine returns nothing.", operands: [routine("Routine Name"), { name: "Return Par", kind: "ANY" }] },
  { name: "RET", category: "Program control", summary: "Return from a subroutine.", operands: [] },
  { name: "JMP", category: "Program control", summary: "Jump to a label in the same routine.", operands: [label()] },
  { name: "LBL", category: "Program control", summary: "Label target for a JMP.", operands: [label()] },
  { name: "MCR", category: "Program control", summary: "Master control relay zone boundary.", operands: [] },
  // Bit
  { name: "AND", category: "Bit", summary: "Bitwise AND of two sources into the destination.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "OR", category: "Bit", summary: "Bitwise OR of two sources into the destination.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "XOR", category: "Bit", summary: "Bitwise exclusive OR of two sources into the destination.", operands: [num("Source A"), num("Source B"), numW("Destination")] },
  { name: "NOT", category: "Bit", summary: "Bitwise complement of the source into the destination.", operands: [num("Source"), numW("Destination")] },
  { name: "BSL", category: "Bit", summary: "Bit shift left through an array.", operands: [{ name: "Array", kind: "ANY", tagOnly: true }, { name: "Control", kind: "ANY", writable: true, types: ["CONTROL"] }, bool("Source bit"), num("Length")] },
  { name: "BSR", category: "Bit", summary: "Bit shift right through an array.", operands: [{ name: "Array", kind: "ANY", tagOnly: true }, { name: "Control", kind: "ANY", writable: true, types: ["CONTROL"] }, bool("Source bit"), num("Length")] },
  // String. Operand order is the order the vendor's own instruction metadata uses, so a
  // composed rung reads the way an export from Studio does.
  { name: "CONCAT", category: "String", summary: "Concatenate: append source B to source A and write the joined string to the destination.", operands: [str("Source A"), str("Source B"), { name: "Dest", kind: "STRING", writable: true }] },
  { name: "MID", category: "String", summary: "Extract part of a string: copy Qty characters from Start into the destination string.", operands: [str("Source"), num("Qty"), { name: "Start", kind: "NUMBER", minimum: 1 }, { name: "Dest", kind: "STRING", writable: true }] },
  { name: "FIND", category: "String", summary: "Find: search the source string and write the first position of Search to the result.", operands: [str("Source"), str("Search"), { name: "Start", kind: "NUMBER", minimum: 1 }, { name: "Result", kind: "ANY", writable: true, types: ["DINT"] }] },
  { name: "INSERT", category: "String", summary: "Insert source B into source A at Start and write the result to the destination.", operands: [str("Source A"), str("Source B"), { name: "Start", kind: "NUMBER", minimum: 1 }, { name: "Dest", kind: "STRING", writable: true }] },
  { name: "DELETE", category: "String", summary: "Delete Qty characters from the source starting at Start into the destination.", operands: [str("Source"), num("Qty"), { name: "Start", kind: "NUMBER", minimum: 1 }, { name: "Dest", kind: "STRING", writable: true }] },
  { name: "LOWER", category: "String", summary: "Lower case: copy the source string to the destination in lower case.", operands: [str("Source"), { name: "Dest", kind: "STRING", writable: true }] },
  { name: "UPPER", category: "String", summary: "Upper case: copy the source string to the destination in upper case.", operands: [str("Source"), { name: "Dest", kind: "STRING", writable: true }] },
  { name: "RTOS", category: "String", summary: "Real to string: convert a REAL value into the destination string.", operands: [num("Source"), { name: "Dest", kind: "STRING", writable: true }] },
  // File and array
  { name: "FLL", category: "File and array", summary: "File fill: fill Length elements at the destination with the source value.", operands: [num("Source"), { name: "Dest", kind: "ANY", writable: true, arrayElement: true }, num("Length")] },
  // Program control. SBR carries no operands: its parameters are the JSR arguments.
  { name: "SBR", category: "Program control", summary: "Subroutine label a JSR calls; its parameters are the arguments the JSR passes.", operands: [] },
  // Masked, array and system instructions. Their operand lists are the vendor operand
  // fields in written order, including the Length and Position fields that a control
  // structure carries: the compact table below had several of these wrong, and a wrong
  // count is only caught by Studio.
  { name: "MVM", category: "Move", summary: "Masked move: copy the source through the mask into the destination.", operands: [num("Source"), num("Mask"), { name: "Dest", kind: "NUMBER", writable: true }] },
  { name: "GSV", category: "Communications", summary: "Get system value: read one attribute of a class instance into the destination.", operands: [keyword("Class"), keyword("Instance"), keyword("Attribute"), { name: "Dest", kind: "ANY", writable: true }] },
  { name: "SSV", category: "Communications", summary: "Set system value: write the source into one attribute of a class instance.", operands: [keyword("Class"), keyword("Instance"), keyword("Attribute"), { name: "Source", kind: "ANY", tagOnly: true }] },
  { name: "SQO", category: "Sequencer", summary: "Sequencer output: drive the destination from one masked step of the array.", operands: [{ name: "Array", kind: "ANY", tagOnly: true }, num("Mask"), { name: "Dest", kind: "NUMBER", writable: true, noArray: true }, { name: "Control", kind: "ANY", writable: true, types: ["CONTROL"] }, num("Length"), num("Position")] },
  { name: "SQL", category: "Sequencer", summary: "Sequencer load: store the source into the current step of the array.", operands: [any("Array"), num("Source"), any("Control"), num("Length"), num("Position")] },
  { name: "FAL", category: "File and array", summary: "File arithmetic and logic. Not modelled: eight operand shapes were refused by the compiler, so write this one by hand until a real export shows the accepted form.", notModelled: true, operands: [] },
  { name: "DCM", category: "Safety", summary: "Dual Channel Input Monitor. GuardLogix safety instruction. Not modelled: its safety-function and input-type operands are drop-down names, not tags, so the composer refuses it; the operand count comes from production usage and the vendor help table.", notModelled: true, operands: [{ name: "DCM", kind: "ANY" }, { name: "Safety Function", kind: "ANY" }, { name: "Input Type", kind: "ANY" }, { name: "Input Delay", kind: "NUMBER" }, { name: "Channel A", kind: "ANY" }, { name: "Channel B", kind: "ANY" }, { name: "Status", kind: "ANY" }, { name: "Reset", kind: "ANY" }] },
  { name: "DCS", category: "Safety", summary: "Dual Channel Input Stop. GuardLogix safety instruction. Not modelled: its safety-function and input-type operands are drop-down names, not tags, so the composer refuses it; the operand count comes from production usage and the vendor help table.", notModelled: true, operands: [{ name: "DCS", kind: "ANY" }, { name: "Safety Function", kind: "ANY" }, { name: "Input Type", kind: "ANY" }, { name: "Input Delay", kind: "NUMBER" }, { name: "Startup Inhibit", kind: "ANY" }, { name: "Reset Type", kind: "ANY" }, { name: "Channel A", kind: "ANY" }, { name: "Channel B", kind: "ANY" }, { name: "Status", kind: "ANY" }, { name: "Reset", kind: "ANY" }] },
  { name: "CROUT", category: "Safety", summary: "Configurable Redundant Output. GuardLogix safety instruction. Not modelled: its safety-function and input-type operands are drop-down names, not tags, so the composer refuses it; the operand count comes from production usage and the vendor help table.", notModelled: true, operands: [{ name: "CROUT", kind: "ANY" }, { name: "Feedback Type", kind: "ANY" }, { name: "Feedback Reaction Time", kind: "NUMBER" }, { name: "Enable", kind: "ANY" }, { name: "Channel A", kind: "ANY" }, { name: "Channel B", kind: "ANY" }, { name: "Input Status", kind: "ANY" }, { name: "Output Status", kind: "ANY" }, { name: "Reset", kind: "ANY" }] },
  { name: "FSC", category: "File and array", summary: "File search and compare. Not modelled: six operand shapes were refused or crashed the compiler, so write this one by hand until a real export shows the accepted form.", notModelled: true, operands: [] },
  // Operand lists the vendor fields give in full. One-shot storage/output, a masked
  // compare and the bit-distribute and average forms each had too few operands, which the
  // composer's own arity check then defended.
  { name: "OSR", category: "Contacts and coils", summary: "One shot rising: true for one scan when the storage bit goes false to true.", operands: [{ name: "Storage", kind: "BOOL" }, { name: "Dest", kind: "BOOL", writable: true }] },
  { name: "OSF", category: "Contacts and coils", summary: "One shot falling: true for one scan when the storage bit goes true to false.", operands: [{ name: "Storage", kind: "BOOL" }, { name: "Dest", kind: "BOOL", writable: true }] },
  { name: "MEQ", category: "Comparison", summary: "Masked equal: true when source and compare agree through the mask.", operands: [num("Source"), num("Mask"), num("Compare")] },
  { name: "BTD", category: "Move", summary: "Bit distribute: copy Length bits from the source bit position to the destination bit position.", operands: [num("Source"), num("Source bit"), { name: "Dest", kind: "NUMBER", writable: true }, { name: "Dest bit", kind: "NUMBER", writable: true }, num("Length")] },
  { name: "AVE", category: "File and array", summary: "Average: average the array along one dimension into the destination.", operands: [any("Array"), num("Dimension"), any("Dest"), any("Control"), num("Length"), num("Position")] },
  // Motion. Every operand is a field of the instruction box, in the order the vendor
  // metadata writes them, so the count and order are right and the type is left open: this
  // catalogue cannot verify AXIS, MOTION_GROUP or the enumerated unit types.
  { name: "MAJ", category: "Motion", summary: "Motion axis jog: run the axis continuously at a speed until a stop.", operands: [any("Axis"), any("MotionControl"), any("Direction"), any("Speed"), any("SpeedUnits"), any("AccelRate"), any("AccelUnits"), any("DecelRate"), any("DecelUnits"), any("Profile"), any("AccelJerk"), any("DecelJerk"), any("JerkUnits"), any("Merge"), any("MergeSpeed"), any("LockPosition"), any("LockDirection")] },
  { name: "MAM", category: "Motion", summary: "Motion axis move: one positioning move with the given type, speed, acceleration and merge.", operands: [any("Axis"), any("MotionControl"), any("MoveType"), any("Position"), any("Speed"), any("SpeedUnits"), any("AccelRate"), any("AccelUnits"), any("DecelRate"), any("DecelUnits"), any("Profile"), any("AccelJerk"), any("DecelJerk"), any("JerkUnits"), any("Merge"), any("MergeSpeed"), any("LockPosition"), any("LockDirection"), any("EventDistance"), any("CalculatedData")] },
  { name: "MAPC", category: "Motion", summary: "Motion axis position cam: slave the axis to a master through a cam profile.", operands: [any("SlaveAxis"), any("MasterAxis"), any("MotionControl"), any("Direction"), any("CamProfile"), any("SlaveScaling"), any("MasterScaling"), any("ExecutionMode"), any("ExecutionSchedule"), any("MasterLockPosition"), any("CamLockPosition"), any("CamType"), any("MasterReference"), any("MasterDirection")] },
  { name: "MAS", category: "Motion", summary: "Motion axis stop: stop the axis with the given stop type and deceleration.", operands: [any("Axis"), any("MotionControl"), any("StopType"), any("ChangeDecel"), any("DecelRate"), any("DecelUnits"), any("ChangeDecelJerk"), any("DecelJerk"), any("JerkUnits")] },
  { name: "MATC", category: "Motion", summary: "Motion axis time cam: drive the axis from a cam profile against time.", operands: [any("Axis"), any("MotionControl"), any("Direction"), any("CamProfile"), any("DistanceScaling"), any("TimeScaling"), any("ExecutionMode"), any("ExecutionSchedule"), any("LockPosition"), any("CamType"), any("LockDirection"), any("InstructionMode")] },
  { name: "MAH", category: "Motion", summary: "Motion axis home: home the axis using the configured home sequence.", operands: [any("Axis"), any("MotionControl")] },
  { name: "MDF", category: "Motion", summary: "Motion axis disarm: disarm the axis so motion is no longer commanded.", operands: [any("Axis"), any("MotionControl")] },
  { name: "MDW", category: "Motion", summary: "Motion axis dwell: hold the axis at its position for a time.", operands: [any("Axis"), any("MotionControl")] },
  { name: "MGS", category: "Motion", summary: "Motion group stop: stop every axis in the group.", operands: [any("Group"), any("MotionControl"), any("StopMode")] },
  { name: "MGSP", category: "Motion", summary: "Motion group shutdown: shut the group down.", operands: [any("Group"), any("MotionControl")] },
  { name: "MRP", category: "Motion", summary: "Motion redefinition of position: redefine the axis position.", operands: [any("Axis"), any("MotionControl"), any("Type"), any("PositionSelect"), any("Position")] },
  { name: "MSF", category: "Motion", summary: "Motion axis shutdown: shut the axis down.", operands: [any("Axis"), any("MotionControl")] },
  { name: "MSO", category: "Motion", summary: "Motion servo on: turn the axis servo drive on.", operands: [any("Axis"), any("MotionControl")] },
  // FOR runs a named routine until the index passes the terminal value, so its first
  // operand is a routine, not an address. The compact table had a routine name, a source
  // and an expression, which is neither the right count nor the right meaning.
  { name: "FOR", category: "Program control", summary: "For loop: run the named routine, adding the step to the index, until the index passes the terminal value.", operands: [routine(), numW("Index"), num("Initial value"), num("Terminal value"), num("Step size")] },
  // Mnemonics the catalogue knows but cannot model. Each needs operands this catalogue has no
  // source for, and the compact table's empty slot list made them claim "takes 0 operands" -
  // a confident wrong answer with no way forward. Drafting the rung text still works.
  { name: "EOT", category: "Program control", summary: "End of transition, for a Sequential Function Chart step.", operands: [], notModelled: true },
  { name: "SFR", category: "Program control", summary: "Reset an SFC routine to a target state.", operands: [], notModelled: true },
  { name: "SFP", category: "Program control", summary: "Pause an SFC routine at a target state.", operands: [], notModelled: true },
  // Operand lists transcribed from the installed Logix 5000 instruction help (Help\ENU\rs5000),
  // which states each slot by name; pseudo-operands Length and Position are real operands here.
  { name: "FFL", category: "File and array", summary: "FIFO load: copy the source into the next FIFO element.", operands: [any("Source"), any("FIFO"), any("Control"), num("Length"), num("Position")] },
  { name: "FFU", category: "File and array", summary: "FIFO unload: move the oldest FIFO element into the destination.", operands: [any("FIFO"), any("Destination"), any("Control"), num("Length"), num("Position")] },
  { name: "LFL", category: "File and array", summary: "LIFO load: push the source onto a LIFO stack.", operands: [any("Source"), any("LIFO"), any("Control"), num("Length"), num("Position")] },
  { name: "LFU", category: "File and array", summary: "LIFO unload: pop the most recent LIFO element into the destination.", operands: [any("LIFO"), any("Destination"), any("Control"), num("Length"), num("Position")] },
  { name: "DTR", category: "Compare", summary: "Data transition: pass source bits through the mask and compare them with the reference.", operands: [any("Source"), any("Mask"), any("Reference")] },
  { name: "ATAN2", category: "Math", summary: "Two-argument arctangent: the angle of Source Y over Source X.", operands: [any("Source Y"), any("Source X"), any("Dest")] },
  { name: "SQI", category: "Sequencer", summary: "Sequencer input: compare the source with one masked step of the array.", operands: [any("Array"), any("Mask"), any("Source"), any("Control"), num("Length"), num("Position")] },
  { name: "EVENT", category: "Program control", summary: "Trigger an event task.", operands: [keyword("Task")] },
  // The rest of the set, declared compactly in instruction-set.ts so this table stays readable.
  ...MORE_INSTRUCTIONS.map((instruction) => ({
    name: instruction.name,
    category: instruction.category,
    summary: `${instruction.name} from the Logix instruction set.`,
    operands: instruction.slots
  }))
];
var CATALOG_NAMES = new Set(INSTRUCTIONS.map((instruction) => instruction.name));
var ALIASES = Object.fromEntries(
  MNEMONIC_PAIRS.flatMap(({ legacy, modern }) => {
    const hasLegacy = CATALOG_NAMES.has(legacy);
    const hasModern = CATALOG_NAMES.has(modern);
    if (hasLegacy === hasModern) return [];
    return hasLegacy ? [[modern, legacy]] : [[legacy, modern]];
  })
);

// packages/viewer/src/client/instructions.ts
var SLOT_KEYS = {
  "Source A": "operand.sourceA",
  "Source B": "operand.sourceB",
  Source: "operand.source",
  Dest: "operand.destination",
  Destination: "operand.destination",
  Length: "operand.length",
  Position: "operand.position",
  Timer: "operand.timer",
  Counter: "operand.counter",
  Control: "operand.control",
  Expression: "operand.expression",
  "Routine Name": "operand.routine",
  Array: "operand.a",
  Test: "operand.b",
  "Low limit": "operand.a",
  "High limit": "operand.b"
};
var OVERRIDES = {
  OSR: ["operand.storage", "operand.destination"],
  OSF: ["operand.storage", "operand.destination"],
  ONS: ["operand.storage"],
  TON: ["operand.timer", "operand.preset", "operand.accum"],
  TOF: ["operand.timer", "operand.preset", "operand.accum"],
  RTO: ["operand.timer", "operand.preset", "operand.accum"],
  CTU: ["operand.counter", "operand.preset", "operand.accum"],
  CTD: ["operand.counter", "operand.preset", "operand.accum"],
  MSG: ["operand.control"]
};
var instructionPins = Object.fromEntries(
  INSTRUCTIONS.map((instruction) => [
    instruction.name,
    OVERRIDES[instruction.name] ?? instruction.operands.map((operand) => SLOT_KEYS[operand.name] ?? operand.name)
  ])
);

// packages/viewer/src/client/inspection.ts
function inspectProject(project) {
  const findings = [];
  const programs = new Map(project.programs.map((program) => [program.name.toLowerCase(), program]));
  const scheduled = /* @__PURE__ */ new Map();
  for (const task of project.tasks) for (const name of task.programs) {
    const key = name.toLowerCase();
    scheduled.set(key, [...scheduled.get(key) ?? [], task.name]);
    if (!programs.has(key)) findings.push({
      severity: "warning",
      code: "missing-scheduled-program",
      location: `Task ${task.name}`,
      message: `Scheduled program ${name} is absent from this export.`,
      evidence: `${task.name} \u2192 ${name}`
    });
  }
  for (const program of project.programs) {
    const location = `Program ${program.name}`;
    const owners = scheduled.get(program.name.toLowerCase()) ?? [];
    if (owners.length === 0) findings.push({
      severity: "info",
      code: "unscheduled-program",
      location,
      message: "Program is not scheduled by an exported task.",
      evidence: program.name
    });
    if (owners.length > 1) findings.push({
      severity: "warning",
      code: "duplicate-schedule",
      location,
      message: "Program appears in more than one task schedule.",
      evidence: owners.join(", ")
    });
    if (program.main !== "" && !program.routines.some((routine2) => routine2.name.toLowerCase() === program.main.toLowerCase()))
      findings.push({
        severity: "warning",
        code: "missing-main-routine",
        location,
        message: `Main routine ${program.main} is absent from this export.`,
        evidence: program.main
      });
    const routineNames = new Set(program.routines.map((routine2) => routine2.name.toLowerCase()));
    for (const routine2 of program.routines) {
      const routineLocation = `${program.name}/${routine2.name}`;
      if (routine2.type !== "RLL" && routine2.type !== "ST") findings.push({
        severity: "info",
        code: "unsupported-diagram",
        location: routineLocation,
        message: `${routine2.type} is listed but is not diagrammed.`,
        evidence: routine2.type
      });
      if (routine2.type !== "RLL") continue;
      for (const rung of routine2.rungs) {
        for (const match of rung.text.matchAll(/\bJSR\s*\(\s*([^,()\s]+)/giu)) {
          const target = match[1];
          if (target !== void 0 && !routineNames.has(target.toLowerCase())) findings.push({
            severity: "warning",
            code: "unresolved-jsr",
            location: `${routineLocation} rung ${rung.number}`,
            message: `Called routine ${target} is absent from this program export.`,
            evidence: match[0]
          });
        }
      }
    }
  }
  return findings;
}

// css-module:C:\Users\KNPhu\.arya\github\KonnectSuite\dsh-engineering\packages\viewer\src\client\L5xBody.module.css
var css = "._5LXDM7_root { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; min-width:0; color:var(--dsw-alias-label-primary); font-size:12px; }\n._5LXDM7_toolbar { display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:0.5px solid var(--dsw-alias-border-l2); white-space:nowrap; overflow:hidden; }\n._5LXDM7_toolbar strong { overflow:hidden; text-overflow:ellipsis; }\n._5LXDM7_toolbar span { color:var(--dsw-alias-label-secondary); }\n._5LXDM7_toolbar button { border:0.5px solid var(--dsw-alias-border-l2); background:transparent; color:inherit; border-radius:4px; padding:4px 8px; cursor:pointer; }\n._5LXDM7_offline { margin-left:auto; }\n._5LXDM7_notice { padding:8px 12px; border-bottom:0.5px solid var(--dsw-alias-border-l2); }\n._5LXDM7_layout { display:grid; grid-template-columns:minmax(190px,23%) minmax(300px,1fr) minmax(200px,22%); min-height:0; flex:1; }\n._5LXDM7_tree,._5LXDM7_inspector { overflow:auto; min-width:0; border-right:0.5px solid var(--dsw-alias-border-l2); padding:8px; }\n._5LXDM7_inspector { border-right:0; border-left:0.5px solid var(--dsw-alias-border-l2); }\n._5LXDM7_treeHeading,._5LXDM7_inspectorHeading { font-weight:600; padding:6px 5px; }\n._5LXDM7_tree details { margin:3px 0; }\n._5LXDM7_tree summary { cursor:pointer; padding:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n._5LXDM7_nested { margin-left:12px !important; }\n._5LXDM7_leaf,._5LXDM7_leafButton,._5LXDM7_selected { display:block; box-sizing:border-box; width:100%; padding:5px 5px 5px 20px; text-align:left; color:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n._5LXDM7_leafButton,._5LXDM7_selected { border:0; background:transparent; cursor:pointer; }\n._5LXDM7_selected,._5LXDM7_leafButton:hover,._5LXDM7_reference:hover { background:var(--dsw-alias-interactive-bg-hover); }\n._5LXDM7_leafButton small,._5LXDM7_selected small { color:var(--dsw-alias-label-secondary); margin-left:5px; }\n._5LXDM7_main { overflow:auto; min-width:0; min-height:0; padding:0 12px 24px; }\n._5LXDM7_description { margin:12px 4px; color:var(--dsw-alias-label-secondary); }\n._5LXDM7_rung { display:grid; grid-template-columns:32px minmax(0,1fr); border-bottom:0.5px solid var(--dsw-alias-border-l2); min-height:110px; }\n._5LXDM7_rungNumber { color:var(--dsw-alias-label-secondary); padding-top:36px; }\n._5LXDM7_rungBody { border-left:2px solid var(--dsw-alias-label-primary); border-right:2px solid var(--dsw-alias-label-primary); min-width:0; padding:12px; }\n._5LXDM7_comment { color:var(--dsw-alias-label-secondary); white-space:pre-wrap; margin-bottom:10px; overflow-wrap:anywhere; }\n._5LXDM7_rail { display:flex; align-items:center; gap:0; overflow:auto; padding:8px 0; }\n._5LXDM7_path { display:flex; align-items:center; min-width:max-content; }\n._5LXDM7_branch { display:flex; flex-direction:column; border-left:1px solid var(--dsw-alias-label-primary); border-right:1px solid var(--dsw-alias-label-primary); }\n._5LXDM7_branchPath { display:flex; min-height:54px; align-items:center; border-bottom:0.5px solid var(--dsw-alias-border-l2); }\n._5LXDM7_branchPath:last-child { border-bottom:0; }\n._5LXDM7_instruction { min-width:100px; display:flex; flex-direction:column; align-items:center; position:relative; padding:0 7px; cursor:context-menu; }\n._5LXDM7_instruction::before { content:''; height:1px; background:var(--dsw-alias-label-primary); position:absolute; left:0; right:0; top:15px; }\n._5LXDM7_glyph { z-index:1; background:var(--dsw-alias-bg-document-preview); font-family:monospace; font-size:17px; height:25px; }\n._5LXDM7_instruction strong { font-size:10px; }\n._5LXDM7_instruction code { font-size:11px; white-space:nowrap; }\n._5LXDM7_source { display:block; margin-top:12px; font-size:10px; color:var(--dsw-alias-label-secondary); white-space:pre-wrap; overflow-wrap:anywhere; }\n._5LXDM7_neutral,._5LXDM7_structured { font-family:monospace; white-space:pre-wrap; overflow-wrap:anywhere; }\n._5LXDM7_structured { padding:15px; }\n._5LXDM7_status { padding:20px; color:var(--dsw-alias-label-secondary); }\n._5LXDM7_status button { margin-left:8px; }\n._5LXDM7_searchLabel { display:flex; flex-direction:column; gap:5px; font-weight:600; }\n._5LXDM7_searchLabel input { width:100%; box-sizing:border-box; padding:6px; border:0.5px solid var(--dsw-alias-border-l2); background:transparent; color:inherit; border-radius:4px; }\n._5LXDM7_reference { display:flex; flex-direction:column; gap:3px; width:100%; text-align:left; padding:8px 5px; background:transparent; color:inherit; border:0; border-bottom:0.5px solid var(--dsw-alias-border-l2); cursor:pointer; }\n._5LXDM7_reference span,._5LXDM7_reference code,._5LXDM7_empty { color:var(--dsw-alias-label-secondary); }\n._5LXDM7_reference code { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n._5LXDM7_menu { position:fixed; z-index:1000; min-width:150px; display:flex; flex-direction:column; padding:5px; }\n._5LXDM7_menuItem { border:0; color:inherit; background:transparent; text-align:left; padding:7px 10px; cursor:pointer; }\n._5LXDM7_menuItem:hover { background:var(--dsw-alias-interactive-bg-hover); }\n\n/* Studio-inspired workspace, adapted to the Arya file tab and agent workflow. */\n._5LXDM7_root { background:var(--dsw-alias-bg-document-preview); container-type:inline-size; }\n._5LXDM7_toolbar { min-height:43px; box-sizing:border-box; border-bottom:0.5px solid var(--dsw-alias-border-l2); }\n._5LXDM7_productMark { font-size:10px; font-weight:800; letter-spacing:.1em; padding-right:10px; border-right:0.5px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary) !important; }\n._5LXDM7_productMark b { color:#3983c9; }\n._5LXDM7_offline { border:1px solid #83a9c8; background:#eaf4fc; color:#225e87 !important; border-radius:3px; padding:3px 7px; font-size:10px; font-weight:700; text-transform:uppercase; }\n._5LXDM7_sourceBar { display:flex; align-items:center; gap:16px; flex:none; min-height:27px; padding:0 12px; border-bottom:0.5px solid var(--dsw-alias-border-l2); background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 85%,#a4bed4); color:var(--dsw-alias-label-secondary); font-size:10px; white-space:nowrap; overflow:hidden; }\n._5LXDM7_sourceBar span:last-child { margin-left:auto; }\n._5LXDM7_layout { grid-template-columns:minmax(190px,22%) minmax(320px,1fr) minmax(190px,19%); }\n._5LXDM7_tree { display:flex; flex-direction:column; overflow:hidden; background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 94%,#b6cbe0); padding:0; }\n._5LXDM7_treeHeading { display:flex; flex-direction:column; gap:2px; padding:11px 12px 7px; text-transform:uppercase; font-size:10px; letter-spacing:.07em; }\n._5LXDM7_treeHeading span { font-weight:400; text-transform:none; letter-spacing:0; font-size:11px; color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; }\n._5LXDM7_organizerSearch { box-sizing:border-box; width:calc(100% - 20px); margin:0 10px 8px; padding:6px 8px; border:0.5px solid var(--dsw-alias-border-l2); border-radius:4px; background:var(--dsw-alias-bg-document-preview); color:inherit; }\n._5LXDM7_treeScroll { min-height:0; flex:1; overflow:auto; padding:0 6px 16px; }\n._5LXDM7_tree summary { font-weight:600; }\n._5LXDM7_tree summary:hover { background:var(--dsw-alias-interactive-bg-hover); }\n._5LXDM7_controllerRoot>summary { font-weight:700; margin:2px 0 6px; }._5LXDM7_controllerRoot>._5LXDM7_nested { margin-left:11px !important; }._5LXDM7_unexportedLeaf { padding:5px 5px 5px 24px; color:var(--dsw-alias-label-secondary); opacity:.65; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; cursor:help; }._5LXDM7_unexportedLeaf::before { content:'\u25C7'; margin-right:6px; }\n._5LXDM7_tree summary small { float:right; padding-left:5px; font-size:10px; font-weight:400; color:var(--dsw-alias-label-secondary); }\n._5LXDM7_leaf,._5LXDM7_leafButton,._5LXDM7_selected { font-size:11px; }\n._5LXDM7_selected { border-left:2px solid #3b88d1; font-weight:700; }\n._5LXDM7_routineIcon { display:inline-block; min-width:20px; color:#3a75a4; font-family:monospace; }\n._5LXDM7_editor { display:flex; flex-direction:column; min-width:0; min-height:0; }\n._5LXDM7_tabStrip { display:flex; flex:none; height:33px; overflow-x:auto; overflow-y:hidden; border-bottom:0.5px solid var(--dsw-alias-border-l2); background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 88%,#bac9d8); }\n._5LXDM7_tab,._5LXDM7_activeTab { display:flex; align-items:center; flex:none; max-width:220px; border-right:0.5px solid var(--dsw-alias-border-l2); }\n._5LXDM7_activeTab { background:var(--dsw-alias-bg-document-preview); border-top:2px solid #3b88d1; }\n._5LXDM7_tab button,._5LXDM7_activeTab button { border:0; background:transparent; color:inherit; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:7px 9px; font-size:11px; }\n._5LXDM7_tab ._5LXDM7_closeTab,._5LXDM7_activeTab ._5LXDM7_closeTab { padding:6px; font-size:16px; color:var(--dsw-alias-label-secondary); }\n._5LXDM7_editorTools { display:flex; align-items:center; gap:9px; flex:none; min-height:34px; padding:2px 10px; border-bottom:0.5px solid var(--dsw-alias-border-l2); }\n._5LXDM7_editorTools strong { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }\n._5LXDM7_editorTools span { color:var(--dsw-alias-label-secondary); }._5LXDM7_toolSpacer { flex:1; }\n._5LXDM7_editorTools button { border:0.5px solid var(--dsw-alias-border-l2); background:transparent; color:inherit; border-radius:4px; padding:3px 7px; cursor:pointer; font-size:11px; }\n._5LXDM7_main { flex:1; padding:0 13px 24px; }\n._5LXDM7_rung { grid-template-columns:34px minmax(0,1fr); min-height:100px; }._5LXDM7_rungNumber { padding:14px 4px 0 0; text-align:right; }\n._5LXDM7_rungBody { padding:12px 15px; }._5LXDM7_comment { text-align:center; font-size:11px; }\n._5LXDM7_rail { min-height:70px; }._5LXDM7_branch { border-left-width:2px; border-right-width:2px; }._5LXDM7_branchPath { min-height:68px; }\n._5LXDM7_instruction { min-width:132px; text-align:center; }._5LXDM7_instruction::before { top:31px; height:2px; }\n._5LXDM7_glyph { font-size:20px; height:28px; min-width:54px; line-height:28px; }._5LXDM7_functionBlock ._5LXDM7_glyph { border:1px solid var(--dsw-alias-label-primary); min-width:70px; font-size:12px; font-weight:700; }\n._5LXDM7_instruction code { max-width:none; overflow:visible; text-overflow:clip; }\n._5LXDM7_path { min-width:100%; width:max-content; }._5LXDM7_outputInstruction { margin-left:auto; }\n._5LXDM7_blockCard { z-index:1; min-width:128px; max-width:220px; border:1px solid var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-document-preview); text-align:left; box-shadow:0 1px 2px #0002; }\n._5LXDM7_blockCard>strong { display:block; padding:3px 6px; background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 75%,#8399ad); border-bottom:0.5px solid var(--dsw-alias-border-l2); font-size:11px; }\n._5LXDM7_blockCard>div { display:grid; grid-template-columns:45px minmax(65px,1fr); gap:4px; padding:2px 5px; border-bottom:0.5px solid var(--dsw-alias-border-l2); }._5LXDM7_blockCard>div:last-child { border:0; }._5LXDM7_blockCard small { font-size:9px; color:var(--dsw-alias-label-secondary); }._5LXDM7_blockCard code { font-size:10px; }\n._5LXDM7_glyph { display:flex; align-items:center; justify-content:center; min-width:66px; background:var(--dsw-alias-bg-document-preview); }._5LXDM7_wireLead { display:block; width:16px; height:2px; background:var(--dsw-alias-label-primary); }._5LXDM7_contact { display:block; width:16px; height:25px; border-left:2px solid var(--dsw-alias-label-primary); border-right:2px solid var(--dsw-alias-label-primary); position:relative; }._5LXDM7_contact.negated::after { content:''; position:absolute; top:11px; left:-4px; height:2px; width:25px; transform:rotate(-50deg); background:var(--dsw-alias-label-primary); }._5LXDM7_coil { display:flex; align-items:center; justify-content:center; width:23px; height:26px; border-left:2px solid var(--dsw-alias-label-primary); border-right:2px solid var(--dsw-alias-label-primary); border-radius:50%; corner-shape: round; font:700 10px monospace; }\n._5LXDM7_source { padding:6px; border:0.5px solid var(--dsw-alias-border-l2); border-radius:3px; }._5LXDM7_loadMore { display:block; margin:14px auto; padding:7px 14px; border:0.5px solid var(--dsw-alias-border-l2); border-radius:4px; background:transparent; color:inherit; cursor:pointer; }\n._5LXDM7_tagTableView { min-width:0; }._5LXDM7_tagTableToolbar { display:flex; align-items:center; gap:14px; position:sticky; top:0; z-index:2; padding:8px 4px; background:var(--dsw-alias-bg-document-preview); border-bottom:0.5px solid var(--dsw-alias-border-l2); }._5LXDM7_tagTableToolbar input { margin-left:5px; padding:4px 6px; width:min(220px,30vw); color:inherit; background:transparent; border:0.5px solid var(--dsw-alias-border-l2); border-radius:3px; }._5LXDM7_tagTableToolbar span { color:var(--dsw-alias-label-secondary); }\n._5LXDM7_tagTable { border-collapse:collapse; table-layout:fixed; width:100%; min-width:720px; font-size:11px; }._5LXDM7_tagTable th,._5LXDM7_tagTable td { text-align:left; padding:6px 8px; border:0.5px solid var(--dsw-alias-border-l2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }._5LXDM7_tagTable thead { position:sticky; top:42px; z-index:1; background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 70%,#a4bed4); }._5LXDM7_tagTable tbody tr:hover { background:var(--dsw-alias-interactive-bg-hover); }._5LXDM7_tagTable th:first-child { width:22%; }._5LXDM7_tagTable td:nth-child(2) { width:12%; }._5LXDM7_tagTable td:nth-child(3) { width:12%; }._5LXDM7_tagTable td:nth-child(4) { width:14%; }._5LXDM7_tagTable td:nth-child(5) { width:25%; }._5LXDM7_tagTable ._5LXDM7_noValue { color:var(--dsw-alias-label-secondary); font-style:italic; }._5LXDM7_tagActions { display:flex; gap:5px; }._5LXDM7_tagActions button { border:0.5px solid var(--dsw-alias-border-l2); background:transparent; color:inherit; border-radius:3px; padding:2px 4px; cursor:pointer; font-size:10px; }\n._5LXDM7_inspector { display:flex; flex-direction:column; gap:4px; min-height:0; overflow:auto; padding:7px 9px; background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 94%,#b6cbe0); }\n._5LXDM7_inspectorHeading { padding:7px 4px 5px; text-transform:uppercase; letter-spacing:.05em; font-size:10px; border-bottom:0.5px solid var(--dsw-alias-border-l2); }\n._5LXDM7_propertyList { display:flex; flex-direction:column; gap:8px; padding:8px 4px 14px; overflow-wrap:anywhere; }._5LXDM7_propertyList span,._5LXDM7_propertyList p { color:var(--dsw-alias-label-secondary); margin:0; }\n._5LXDM7_actionButton { width:100%; text-align:left; padding:7px 8px; border:0.5px solid var(--dsw-alias-border-l2); border-radius:4px; background:var(--dsw-alias-bg-document-preview); color:inherit; cursor:pointer; }._5LXDM7_actionButton:hover,._5LXDM7_loadMore:hover { background:var(--dsw-alias-interactive-bg-hover); }\n._5LXDM7_inspectorHelp { margin:7px 4px; color:var(--dsw-alias-label-secondary); font-size:11px; line-height:1.35; }\n._5LXDM7_bottomPanel { display:flex; flex-direction:column; flex:none; height:190px; min-height:100px; border-top:2px solid #314c67; }._5LXDM7_bottomTabs { display:flex; flex:none; background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 55%,#314c67); border-bottom:0.5px solid var(--dsw-alias-border-l2); overflow-x:auto; }\n._5LXDM7_bottomTabs button { color:inherit; border:0; border-right:0.5px solid var(--dsw-alias-border-l2); background:transparent; padding:8px 13px; cursor:pointer; white-space:nowrap; font-size:11px; }._5LXDM7_bottomTabs ._5LXDM7_bottomActive { background:var(--dsw-alias-bg-document-preview); box-shadow:inset 0 2px #3b88d1; font-weight:700; }\n._5LXDM7_bottomContent { overflow:auto; min-height:0; padding:6px 13px 12px; }._5LXDM7_panelNote,._5LXDM7_empty { margin:4px 0 8px; color:var(--dsw-alias-label-secondary); font-size:11px; }\n._5LXDM7_finding { display:flex; gap:10px; align-items:baseline; border-bottom:0.5px solid var(--dsw-alias-border-l2); padding:5px 1px; font-size:11px; }._5LXDM7_finding strong { flex:none; min-width:160px; }._5LXDM7_finding code { margin-left:auto; max-width:30%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-secondary); }\n._5LXDM7_warning,._5LXDM7_info { text-transform:uppercase; font-size:9px; font-weight:800; }._5LXDM7_warning { color:#bb7426; }._5LXDM7_info { color:#3983c9; }\n._5LXDM7_searchLabel { flex-direction:row; align-items:center; }._5LXDM7_searchLabel input { width:min(410px,100%); }._5LXDM7_reference { flex-direction:row; align-items:baseline; gap:12px; }._5LXDM7_reference strong { min-width:160px; }._5LXDM7_reference span { min-width:65px; }\n._5LXDM7_watchTable { border-collapse:collapse; width:100%; min-width:670px; font-size:11px; }._5LXDM7_watchTable th,._5LXDM7_watchTable td { text-align:left; border:0.5px solid var(--dsw-alias-border-l2); padding:5px 7px; }._5LXDM7_watchTable thead { background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 70%,#a4bed4); }._5LXDM7_watchTable ._5LXDM7_noValue { color:var(--dsw-alias-label-secondary); font-style:italic; }\n/* Ladder canvas: Studio 5000 geometry \u2014 one wire per row, comments above it. */\n._5LXDM7_main { background:#fff; color:#1d2730; overflow:auto; }\n._5LXDM7_rung { position:relative; min-height:96px; border-bottom:1px solid #d7dbdf; }\n._5LXDM7_rung.focusedRung { box-shadow:inset 3px 0 #0a5c99; }\n._5LXDM7_rung.focusedRung ._5LXDM7_rail ._5LXDM7_path::before { background:#0066cc; }\n._5LXDM7_rung.focusedRung ._5LXDM7_rungNumber { background:#0a5c99; color:#fff; }\n._5LXDM7_rungNumber { padding-top:12px; min-width:34px; color:#6d7780; font-variant-numeric:tabular-nums; }\n._5LXDM7_rungBody { padding:8px 16px; border-left:1px solid #9aa3ab; border-right:1px solid #9aa3ab; }\n._5LXDM7_comment { margin:0 0 8px; color:#3f4750; font-size:11px; line-height:1.3; text-align:center; white-space:pre-wrap; }\n._5LXDM7_rail { position:relative; min-height:0; margin-top:0; }\n._5LXDM7_rail::before { display:none; }\n._5LXDM7_path { position:relative; display:flex; align-items:flex-start; min-height:calc(var(--l5x-band, 24px) + 104px); min-width:100%; width:max-content; }\n._5LXDM7_path::before { content:''; position:absolute; left:0; right:0; top:calc(var(--l5x-band, 24px) + 52px); height:1px; background:#333; }\n._5LXDM7_nestedPath { min-width:max-content; width:max-content; }\n._5LXDM7_instruction { position:relative; flex:0 0 auto; display:flex; flex-direction:column; align-items:center; height:auto; min-height:calc(var(--l5x-band, 24px) + 104px); width:auto; min-width:140px; max-width:215px; padding:calc(var(--l5x-band, 24px) + 60px) 8px 4px; }\n._5LXDM7_instruction::before { display:none; }\n._5LXDM7_branch { position:relative; display:flex; flex-direction:column; flex:0 0 auto; }\n._5LXDM7_branch::before,._5LXDM7_branch::after { content:''; position:absolute; top:calc(var(--l5x-band, 24px) + 52px); bottom:52px; width:1px; background:#333; }\n._5LXDM7_branch::before { left:0; }\n._5LXDM7_branch::after { right:0; }\n._5LXDM7_branchPath { display:flex; align-items:flex-start; }\n._5LXDM7_path > ._5LXDM7_branch:last-child:has(._5LXDM7_outputInstruction) { margin-left:auto; }\n._5LXDM7_branchPath:has(._5LXDM7_outputInstruction) { justify-content:flex-end; }\n._5LXDM7_outputInstruction { margin-left:auto; }\n._5LXDM7_glyph { position:absolute; left:50%; top:calc(var(--l5x-band, 24px) + 52px); display:flex; align-items:center; justify-content:center; height:16px; transform:translate(-50%,-50%); padding:0 1px; }\n/* Studio draws a contact as two short bars with the wire running into them, and a slash across a negated one. */\n._5LXDM7_glyph:has(._5LXDM7_contact) { background:#fff; }\n._5LXDM7_wireLead { display:block; width:14px; height:1px; background:#333; }\n._5LXDM7_contact { display:block; width:11px; height:15px; border:0; border-left:1.5px solid #17703a; border-right:1.5px solid #17703a; background:transparent; position:relative; }\n._5LXDM7_contact.negated::after { content:''; position:absolute; left:-4px; top:6px; width:19px; height:1.5px; transform:rotate(-35deg); background:#17703a; }\n/* A coil is two facing arcs, so the wire reads as continuous through the gap. */\n._5LXDM7_coil { position:relative; display:flex; align-items:center; justify-content:center; width:26px; height:16px; background:transparent; color:#17703a; font:700 8px/16px Segoe UI, sans-serif; }\n._5LXDM7_coil::before, ._5LXDM7_coil::after { content:''; position:absolute; top:0; width:8px; height:16px; box-sizing:border-box; border:1.5px solid #17703a; }\n._5LXDM7_coil::before { left:0; border-right:0; border-radius:8px 0 0 8px; }\n._5LXDM7_coil::after { right:0; border-left:0; border-radius:0 8px 8px 0; }\n._5LXDM7_tagBlock { position:static; display:flex; flex-direction:column; align-items:center; gap:1px; max-width:100%; }\n._5LXDM7_outputInstruction ._5LXDM7_tagBlock { align-items:flex-end; }\n._5LXDM7_instruction ._5LXDM7_tagName { width:auto; color:#12233a; font-family:inherit; font-size:11px; font-weight:700; line-height:1.25; text-align:center; white-space:normal; overflow-wrap:anywhere; }\n._5LXDM7_outputInstruction ._5LXDM7_tagName { text-align:right; }\n._5LXDM7_instruction ._5LXDM7_tagValue { display:inline-flex; align-items:center; gap:2px; color:#0b5cad; font-family:inherit; font-size:10px; font-weight:700; line-height:1.2; white-space:nowrap; }\n._5LXDM7_tagValue i,._5LXDM7_blockCard b i { font-style:normal; font-size:9px; }\n._5LXDM7_instructionComment { position:absolute; left:50%; top:calc(var(--l5x-band, 24px) - 2px); transform:translate(-50%,-100%); width:140px; overflow-wrap:anywhere; color:#3f4750; font-size:10px; line-height:1.2; text-align:center; white-space:pre-wrap; overflow-wrap:anywhere; }\n._5LXDM7_functionBlock { justify-content:flex-start; max-width:none; padding-top:calc(var(--l5x-band, 24px) + 38px); }\n._5LXDM7_functionBlock ._5LXDM7_blockCard { position:relative; left:auto; top:auto; transform:none; margin:0 auto; }\n/* Instruction selection is visual evidence only; wire colors never imply live controller state. */\n._5LXDM7_tree ._5LXDM7_leafButton small { float:right; }\n._5LXDM7_instruction { box-sizing:border-box; border:0; border-radius:2px; background:transparent; color:inherit; font:inherit; cursor:pointer; }\n._5LXDM7_instruction:hover { z-index:4; background:var(--dsw-alias-interactive-bg-hover); }\n._5LXDM7_instruction:focus-visible,._5LXDM7_focusedInstruction { outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary); outline-offset:1px; z-index:5; }\n._5LXDM7_focusedInstruction { background:var(--dsw-alias-interactive-bg-hover); }\n._5LXDM7_focusedRung ._5LXDM7_rungNumber { color:var(--dsw-alias-state-business-primary); font-weight:700; }\n._5LXDM7_rungNumber { border:0; background:transparent; cursor:pointer; font:inherit; }\n._5LXDM7_rungNumber:hover,._5LXDM7_rungNumber:focus-visible { background:var(--dsw-alias-interactive-bg-hover); outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary); outline-offset:-2px; }\n._5LXDM7_rail { overflow:visible; }\n._5LXDM7_instructionTooltip { display:none; position:absolute; z-index:20; left:50%; top:calc(100% + 5px); transform:translateX(-50%); width:max-content; max-width:300px; min-width:190px; padding:8px 10px; border:0.5px solid var(--dsw-alias-border-l2); border-radius:var(--dsw-radius-sm); box-shadow:0 5px 18px color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent); background:var(--dsw-alias-bg-document-preview); color:var(--dsw-alias-label-primary); text-align:left; white-space:normal; pointer-events:none; font-size:11px; line-height:1.35; }\n._5LXDM7_instructionTooltip strong,._5LXDM7_instructionTooltip span { display:block; overflow-wrap:anywhere; }\n._5LXDM7_instructionTooltip span { color:var(--dsw-alias-label-secondary); margin-top:3px; }\n._5LXDM7_instruction:hover ._5LXDM7_instructionTooltip { display:block; }\n._5LXDM7_focusBar { display:flex; align-items:center; flex-wrap:wrap; gap:5px 10px; min-height:35px; padding:5px 10px; border-bottom:0.5px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-interactive-bg-hover); font-size:11px; }\n._5LXDM7_focusBar code { max-width:32%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n._5LXDM7_focusBar button { border:0.5px solid var(--dsw-alias-border-l2); border-radius:3px; background:var(--dsw-alias-bg-document-preview); color:inherit; cursor:pointer; padding:3px 6px; font-size:10px; }\n._5LXDM7_focusBar button:disabled { opacity:.5; cursor:default; }\n._5LXDM7_focusBadge { font-size:9px; text-transform:uppercase; font-weight:800; letter-spacing:.04em; color:var(--dsw-alias-state-business-primary); }\n._5LXDM7_focusValue { font-weight:600; margin-left:auto; }\n._5LXDM7_inspectorCaution { font-size:10px; line-height:1.4; }\n._5LXDM7_operandDetails { display:flex; flex-direction:column; gap:7px; }\n._5LXDM7_operandDetails>div { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 7px; padding:6px; border:0.5px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-document-preview); }\n._5LXDM7_operandDetails code { overflow-wrap:anywhere; }\n._5LXDM7_operandDetails strong { text-align:right; }\n._5LXDM7_operandDetails span,._5LXDM7_operandDetails p { grid-column:1/-1; margin:0; color:var(--dsw-alias-label-secondary); font-size:10px; }\n._5LXDM7_menuHeading { padding:5px 9px; border-bottom:0.5px solid var(--dsw-alias-border-l2); font-size:10px; font-weight:700; color:var(--dsw-alias-label-secondary); }\n._5LXDM7_blockCard { position:absolute; left:50%; top:52px; transform:translate(-50%,-50%); z-index:2; width:max-content; min-width:118px; max-width:340px; border:1px solid #6f767d; background:#ececec; box-shadow:none; text-align:left; }\n._5LXDM7_blockCard>strong { display:block; padding:1px 6px; background:#dcdcdc; border-bottom:1px solid #6f767d; color:#14181c; font-size:10px; font-weight:700; letter-spacing:.02em; }\n._5LXDM7_blockCard>span { display:grid; grid-template-columns:auto minmax(0,1fr) auto; column-gap:6px; align-items:baseline; gap:2px 8px; padding:2px 6px; border-bottom:0.5px solid #d5d8db; }\n._5LXDM7_blockCard>span:last-child { border-bottom:0; }\n._5LXDM7_blockCard small { color:#4b5563; font-family:inherit; font-size:10px; font-weight:400; line-height:1.25; white-space:nowrap; }\n._5LXDM7_blockCard code { max-width:none; color:#14181c; font-family:inherit; font-size:11px; font-weight:700; line-height:1.25; white-space:normal; overflow-wrap:anywhere; overflow:visible; text-overflow:clip; }\n._5LXDM7_blockCard b { display:inline-flex; align-items:center; gap:2px; color:#0b5cad; font-size:11px; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }\n._5LXDM7_pinTail { display:inline-flex; align-items:baseline; justify-content:flex-end; gap:4px; }\n._5LXDM7_pinTail i { font-style:normal; font-size:9px; font-weight:700; padding:0 2px; border-radius:2px; }\n._5LXDM7_flagOn { background:#17703a; color:#fff; }\n._5LXDM7_flagOff { background:#e6e7e8; color:#9aa3ab; }\n._5LXDM7_nestedPath { min-width:max-content; width:max-content; }\n._5LXDM7_outputInstruction ._5LXDM7_instructionTooltip { left:auto; right:0; transform:none; }\n\n/* A document pane is often narrower than a desktop; the ladder is the point, so\n   the navigator and the inspector give way before it does. */\n@container (max-width: 980px) {\n  ._5LXDM7_layout { grid-template-columns:minmax(150px,18%) minmax(0,1fr); }\n  ._5LXDM7_inspector { display:none; }\n}\n@container (max-width: 700px) {\n  ._5LXDM7_layout { grid-template-columns:minmax(0,1fr); }\n  ._5LXDM7_tree { display:none; }\n}\n/* Studio prints the tag an alias resolves to under the name it was written with. */\n._5LXDM7_instruction ._5LXDM7_tagAlias { max-width:100%; color:#5b6570; font-family:inherit; font-size:9px; font-weight:400; line-height:1.15; text-align:center; white-space:normal; overflow-wrap:anywhere; }\n._5LXDM7_outputInstruction ._5LXDM7_tagAlias { text-align:right; }\n/* Tag organizer drill-down: the chevron sits in the name cell, so a member reads as a child of its tag. */\n._5LXDM7_tagToggle { display:inline-flex; width:16px; height:16px; margin-right:2px; align-items:center; justify-content:center; border:0; background:none; color:#3f4750; font-size:10px; line-height:1; cursor:pointer; padding:0; }\n._5LXDM7_tagToggle:hover { color:#0b5cad; }\n";
var tagId = "dsh-engineering-l5x-viewer/L5xBody.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-engineering-l5x-viewer";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var classes = {
  "root": "_5LXDM7_root",
  "toolbar": "_5LXDM7_toolbar",
  "offline": "_5LXDM7_offline",
  "notice": "_5LXDM7_notice",
  "layout": "_5LXDM7_layout",
  "tree": "_5LXDM7_tree",
  "inspector": "_5LXDM7_inspector",
  "treeHeading": "_5LXDM7_treeHeading",
  "inspectorHeading": "_5LXDM7_inspectorHeading",
  "nested": "_5LXDM7_nested",
  "leaf": "_5LXDM7_leaf",
  "leafButton": "_5LXDM7_leafButton",
  "selected": "_5LXDM7_selected",
  "reference": "_5LXDM7_reference",
  "main": "_5LXDM7_main",
  "description": "_5LXDM7_description",
  "rung": "_5LXDM7_rung",
  "rungNumber": "_5LXDM7_rungNumber",
  "rungBody": "_5LXDM7_rungBody",
  "comment": "_5LXDM7_comment",
  "rail": "_5LXDM7_rail",
  "path": "_5LXDM7_path",
  "branch": "_5LXDM7_branch",
  "branchPath": "_5LXDM7_branchPath",
  "instruction": "_5LXDM7_instruction",
  "glyph": "_5LXDM7_glyph",
  "source": "_5LXDM7_source",
  "neutral": "_5LXDM7_neutral",
  "structured": "_5LXDM7_structured",
  "status": "_5LXDM7_status",
  "searchLabel": "_5LXDM7_searchLabel",
  "empty": "_5LXDM7_empty",
  "menu": "_5LXDM7_menu",
  "menuItem": "_5LXDM7_menuItem",
  "productMark": "_5LXDM7_productMark",
  "sourceBar": "_5LXDM7_sourceBar",
  "organizerSearch": "_5LXDM7_organizerSearch",
  "treeScroll": "_5LXDM7_treeScroll",
  "controllerRoot": "_5LXDM7_controllerRoot",
  "unexportedLeaf": "_5LXDM7_unexportedLeaf",
  "routineIcon": "_5LXDM7_routineIcon",
  "editor": "_5LXDM7_editor",
  "tabStrip": "_5LXDM7_tabStrip",
  "tab": "_5LXDM7_tab",
  "activeTab": "_5LXDM7_activeTab",
  "closeTab": "_5LXDM7_closeTab",
  "editorTools": "_5LXDM7_editorTools",
  "toolSpacer": "_5LXDM7_toolSpacer",
  "functionBlock": "_5LXDM7_functionBlock",
  "outputInstruction": "_5LXDM7_outputInstruction",
  "blockCard": "_5LXDM7_blockCard",
  "wireLead": "_5LXDM7_wireLead",
  "contact": "_5LXDM7_contact",
  "coil": "_5LXDM7_coil",
  "loadMore": "_5LXDM7_loadMore",
  "tagTableView": "_5LXDM7_tagTableView",
  "tagTableToolbar": "_5LXDM7_tagTableToolbar",
  "tagTable": "_5LXDM7_tagTable",
  "noValue": "_5LXDM7_noValue",
  "tagActions": "_5LXDM7_tagActions",
  "propertyList": "_5LXDM7_propertyList",
  "actionButton": "_5LXDM7_actionButton",
  "inspectorHelp": "_5LXDM7_inspectorHelp",
  "bottomPanel": "_5LXDM7_bottomPanel",
  "bottomTabs": "_5LXDM7_bottomTabs",
  "bottomActive": "_5LXDM7_bottomActive",
  "bottomContent": "_5LXDM7_bottomContent",
  "panelNote": "_5LXDM7_panelNote",
  "finding": "_5LXDM7_finding",
  "warning": "_5LXDM7_warning",
  "info": "_5LXDM7_info",
  "watchTable": "_5LXDM7_watchTable",
  "nestedPath": "_5LXDM7_nestedPath",
  "tagBlock": "_5LXDM7_tagBlock",
  "tagName": "_5LXDM7_tagName",
  "tagValue": "_5LXDM7_tagValue",
  "instructionComment": "_5LXDM7_instructionComment",
  "focusedInstruction": "_5LXDM7_focusedInstruction",
  "focusedRung": "_5LXDM7_focusedRung",
  "instructionTooltip": "_5LXDM7_instructionTooltip",
  "focusBar": "_5LXDM7_focusBar",
  "focusBadge": "_5LXDM7_focusBadge",
  "focusValue": "_5LXDM7_focusValue",
  "inspectorCaution": "_5LXDM7_inspectorCaution",
  "operandDetails": "_5LXDM7_operandDetails",
  "menuHeading": "_5LXDM7_menuHeading",
  "pinTail": "_5LXDM7_pinTail",
  "flagOn": "_5LXDM7_flagOn",
  "flagOff": "_5LXDM7_flagOff",
  "tagAlias": "_5LXDM7_tagAlias",
  "tagToggle": "_5LXDM7_tagToggle"
};
var L5xBody_default = classes;

// packages/viewer/src/client/L5xBody.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function operandParts(operands) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < operands.length; index++) {
    if ("([{".includes(operands[index] ?? "")) depth++;
    if (")]}".includes(operands[index] ?? "")) depth--;
    if (operands[index] === "," && depth === 0) {
      parts.push(operands.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(operands.slice(start).trim());
  return parts;
}
function displayOperands(mnemonic, operands) {
  const parts = operandParts(operands);
  return mnemonic.toUpperCase() === "JSR" && parts[1] === "0" ? [parts[0] ?? ""] : parts;
}
var operandKeys = {
  MOV: ["operand.source", "operand.destination"],
  MOVE: ["operand.source", "operand.destination"],
  COP: ["operand.source", "operand.destination", "operand.length"],
  CPS: ["operand.source", "operand.destination", "operand.length"],
  TON: ["operand.timer", "operand.preset", "operand.accum"],
  TOF: ["operand.timer", "operand.preset", "operand.accum"],
  RTO: ["operand.timer", "operand.preset", "operand.accum"],
  RES: ["operand.timer"],
  ADD: ["operand.a", "operand.b", "operand.destination"],
  SUB: ["operand.a", "operand.b", "operand.destination"],
  MUL: ["operand.a", "operand.b", "operand.destination"],
  DIV: ["operand.a", "operand.b", "operand.destination"],
  EQU: ["operand.sourceA", "operand.sourceB"],
  EQ: ["operand.sourceA", "operand.sourceB"],
  NEQ: ["operand.sourceA", "operand.sourceB"],
  NE: ["operand.sourceA", "operand.sourceB"],
  GRT: ["operand.sourceA", "operand.sourceB"],
  GT: ["operand.sourceA", "operand.sourceB"],
  LES: ["operand.sourceA", "operand.sourceB"],
  LT: ["operand.sourceA", "operand.sourceB"],
  GEQ: ["operand.sourceA", "operand.sourceB"],
  GE: ["operand.sourceA", "operand.sourceB"],
  LEQ: ["operand.sourceA", "operand.sourceB"],
  LE: ["operand.sourceA", "operand.sourceB"],
  JSR: ["operand.routine", "operand.parameter"],
  /* Migrated PLC-5 and SLC instructions, which is where a bare index reads worst. */
  FLL: ["operand.source", "operand.destination", "operand.length"],
  FIL: ["operand.source", "operand.destination", "operand.control", "operand.length", "operand.position"],
  OSR: ["operand.storage"],
  OSF: ["operand.storage"],
  CTU: ["operand.counter", "operand.preset", "operand.accum"],
  CTD: ["operand.counter", "operand.preset", "operand.accum"],
  CLR: ["operand.destination"],
  MSG: ["operand.message"]
};
var terminalInstructions = /* @__PURE__ */ new Set(["OTE", "OTL", "OTU", "JSR", "MOV", "MOVE", "COP", "CPS", "CLR", "FLL", "FIL", "RES", "MSG", "GSV", "SSV", "TON", "TOF", "RTO", "ADD", "SUB", "MUL", "DIV", "CTU", "CTD"]);
function operandDetail(project, tags, expression2) {
  const text = expression2.trim();
  const root = /^[A-Za-z_][\w:]*/u.exec(text)?.[0]?.toLowerCase();
  const tag = root === void 0 ? void 0 : tags.program.get(root) ?? tags.controller.get(root);
  const datum = tag === void 0 ? void 0 : exportedDatum(project, tag.scope, text) ?? (tag.alias !== "" ? exportedDatum(project, tag.scope, tag.alias + text.slice(tag.name.length)) : void 0);
  return { text, ...tag === void 0 ? {} : { tag }, ...datum === void 0 ? {} : { datum } };
}
function instructionSymbols(mnemonic, operands) {
  if (mnemonic.toUpperCase() === "JSR") return [];
  return operandParts(operands).filter((part) => /^[A-Za-z_][\w:]*/u.test(part));
}
function L5xBody(props) {
  const { resourceAddress, content: content2, t, read, ask, scrollportRef } = props;
  const request = content2.kind === "renderer" ? content2 : void 0;
  const [loaded, setLoaded] = (0, import_react.useState)();
  const [failure, setFailure] = (0, import_react.useState)();
  const [choice, setChoice] = (0, import_react.useState)();
  const [query, setQuery] = (0, import_react.useState)("");
  const [showReferences, setShowReferences] = (0, import_react.useState)(false);
  const [context, setContext] = (0, import_react.useState)();
  const [chatUnavailable, setChatUnavailable] = (0, import_react.useState)(false);
  const [organizerQuery, setOrganizerQuery] = (0, import_react.useState)("");
  const [tabs, setTabs] = (0, import_react.useState)([]);
  const [inspector, setInspector] = (0, import_react.useState)();
  const [bottomPane, setBottomPane] = (0, import_react.useState)("search");
  const [watch, setWatch] = (0, import_react.useState)([]);
  const [rungLimit, setRungLimit] = (0, import_react.useState)(80);
  const [showSource, setShowSource] = (0, import_react.useState)(false);
  const [tagView, setTagView] = (0, import_react.useState)();
  const [tagFilter, setTagFilter] = (0, import_react.useState)("");
  const [expandedTags, setExpandedTags] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [targetRung, setTargetRung] = (0, import_react.useState)();
  const [focused, setFocused] = (0, import_react.useState)();
  const [focusedRung, setFocusedRung] = (0, import_react.useState)();
  const isAcd = resourceAddress.toLocaleLowerCase().endsWith(".acd");
  (0, import_react.useEffect)(() => {
    if (request === void 0 || isAcd) return;
    const controller = new AbortController();
    setLoaded(void 0);
    setFailure(void 0);
    setChoice(void 0);
    setTabs([]);
    setInspector(void 0);
    setTagView(void 0);
    setFocused(void 0);
    setFocusedRung(void 0);
    void read(resourceAddress, controller.signal).then(({ xml, version }) => {
      if (controller.signal.aborted) return;
      const project2 = parseProject(xml);
      setLoaded({ revision: request.revision, project: project2, version });
      request.loaded(version);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setFailure(error instanceof Error ? error.message : t("invalid"));
      request.failed();
    });
    return () => {
      controller.abort();
    };
  }, [request?.revision, resourceAddress, read, isAcd]);
  (0, import_react.useEffect)(() => {
    if (context === void 0) return;
    const close = () => {
      setContext(void 0);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [context]);
  const project = loaded !== void 0 && loaded.revision === request?.revision ? loaded.project : void 0;
  const firstProgram = project?.programs[0];
  const firstRoutine = firstProgram?.routines.find((routine2) => routine2.name === firstProgram.main) ?? firstProgram?.routines[0];
  const current = choice === null ? void 0 : choice ?? (firstProgram !== void 0 && firstRoutine !== void 0 ? { program: firstProgram.name, routine: firstRoutine.name } : void 0);
  const selected = project?.programs.find((program) => program.name === current?.program)?.routines.find((routine2) => routine2.name === current?.routine);
  const selectedProgram = project?.programs.find((program) => program.name === current?.program);
  const tagIndex = (0, import_react.useMemo)(() => ({
    controller: new Map(project?.tags.map((tag) => [tag.name.toLowerCase(), tag]) ?? []),
    program: new Map(selectedProgram?.tags.map((tag) => [tag.name.toLowerCase(), tag]) ?? [])
  }), [project, selectedProgram]);
  (0, import_react.useEffect)(() => {
    if (targetRung === void 0) return;
    const frame = requestAnimationFrame(() => {
      Array.from(document.querySelectorAll("[data-l5x-project-view] [data-rung]")).find((element) => element.dataset.rung === targetRung)?.scrollIntoView({ block: "center" });
      setTargetRung(void 0);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [targetRung, current?.program, current?.routine, rungLimit]);
  const detailFor = (value) => project === void 0 ? void 0 : operandDetail(project, tagIndex, value);
  const describeOperand = (value) => detailFor(value)?.tag?.description ?? "";
  const pinsFor = (mnemonic) => project?.aoiPins.get(mnemonic) ?? project?.aoiPins.get(mnemonic.toUpperCase());
  const resolveTimer = (value) => project === void 0 ? void 0 : timerState(project, selectedProgram?.name ?? "controller", value);
  const tagChildren = (tag) => {
    const dimensions = tag.dimensions.split(/\s+/u).filter((part) => part !== "");
    if (dimensions.length > 0) {
      const count = Math.min(Number(dimensions[0]) || 0, 64);
      const rest = dimensions.slice(1).join(" ");
      return Array.from({ length: count }, (_, index) => ({
        name: `${tag.name}[${index}]`,
        type: tag.type,
        scope: tag.scope,
        description: "",
        alias: "",
        dimensions: rest
      }));
    }
    const members = project?.dataTypes.get(tag.type) ?? project?.aoiParameters.get(tag.type.toUpperCase());
    return (members ?? []).map((member) => ({
      name: `${tag.name}.${member.name}`,
      type: member.type,
      scope: tag.scope,
      description: member.description,
      alias: "",
      dimensions: member.dimensions
    }));
  };
  const TAG_DEPTH = 4;
  const tagRows = (tags) => {
    const rows = [];
    const walk = (tag, depth) => {
      if (rows.length >= 400) return;
      const children2 = depth < TAG_DEPTH ? tagChildren(tag) : [];
      const open = expandedTags.has(`${tag.scope}/${tag.name}`);
      rows.push({ tag, depth, expandable: children2.length > 0, open });
      if (open) for (const member of children2) walk(member, depth + 1);
    };
    for (const tag of tags) walk(tag, 0);
    return rows;
  };
  const focusedOperands = focused === void 0 ? [] : displayOperands(focused.mnemonic, focused.operands).map((operand) => detailFor(operand)).filter((item) => item !== void 0);
  const references = (0, import_react.useMemo)(() => project === void 0 ? [] : findReferences(project, query), [project, query]);
  const findings = (0, import_react.useMemo)(() => project === void 0 ? [] : inspectProject(project), [project]);
  const scheduled = (0, import_react.useMemo)(() => new Set(project?.tasks.flatMap((task) => task.programs.map((name) => name.toLowerCase())) ?? []), [project]);
  const visibleTabs = tabs.length > 0 ? tabs : current === void 0 ? [] : [current];
  const select = (program, routine2) => {
    const next = { program: program.name, routine: routine2.name };
    setChoice(next);
    setTagView(void 0);
    setTabs((previous) => {
      const opened = previous.length === 0 && current !== void 0 ? [current] : previous;
      return opened.some((tab) => tab.program === next.program && tab.routine === next.routine) ? opened : [...opened, next];
    });
    setInspector(void 0);
    setFocused(void 0);
    setFocusedRung(void 0);
    setRungLimit(80);
    setContext(void 0);
  };
  const find = (symbol) => {
    setQuery(symbol);
    setShowReferences(true);
    setBottomPane("search");
    setContext(void 0);
  };
  const selectReference = (programName, routineName, location) => {
    const program = project?.programs.find((item) => item.name === programName);
    const routine2 = program?.routines.find((item) => item.name === routineName);
    if (program !== void 0 && routine2 !== void 0) {
      select(program, routine2);
      const rungNumber = /^Rung (.+)$/u.exec(location)?.[1];
      if (rungNumber !== void 0) {
        const index = routine2.rungs.findIndex((rung) => rung.number === rungNumber);
        if (index >= 80) setRungLimit(Math.ceil((index + 1) / 80) * 80);
        setTargetRung(rungNumber);
      }
    }
  };
  const closeTab = (tab) => {
    const remaining = visibleTabs.filter((item) => item.program !== tab.program || item.routine !== tab.routine);
    setTabs(remaining);
    if (current?.program === tab.program && current.routine === tab.routine) {
      setChoice(remaining.at(-1) ?? null);
      setFocused(void 0);
      setFocusedRung(void 0);
    }
  };
  const addWatch = (symbol) => {
    const name = symbol.trim();
    if (name !== "") setWatch((previous) => previous.includes(name) ? previous : [...previous, name]);
    setBottomPane("watch");
    setContext(void 0);
  };
  const openTags = (scope, symbol = "") => {
    setTagView(scope);
    setTagFilter(symbol);
    setInspector(void 0);
    setFocused(void 0);
    setFocusedRung(void 0);
  };
  const focusInstruction = (instruction) => {
    setFocused(instruction);
    setFocusedRung(instruction.rung);
    setInspector(void 0);
  };
  const focusRung = (number) => {
    setFocused(void 0);
    setFocusedRung(number);
    setInspector(void 0);
  };
  const contextFor = (event, text, symbol, instruction, rung, target) => {
    event.preventDefault();
    if (instruction !== void 0) setFocused(instruction);
    setContext({
      x: event.clientX,
      y: event.clientY,
      text,
      ...symbol === void 0 ? {} : { symbol },
      ...instruction === void 0 ? {} : { instruction },
      ...rung === void 0 ? {} : { rung },
      ...target === void 0 ? {} : { target }
    });
  };
  const rungSymbols = (number) => {
    const rung = selected?.rungs.find((item) => item.number === number);
    if (rung === void 0) return [];
    const segments = ladderSegments(rung.text);
    if (segments === null) return [];
    const found = [];
    const walk = (list) => {
      for (const segment of list) {
        if ("paths" in segment) {
          for (const path of segment.paths) walk(path);
          continue;
        }
        for (const operand of displayOperands(segment.mnemonic, segment.operands)) {
          const symbol = operand.trim();
          if (symbol === "" || symbol === "?" || /^-?\d/u.test(symbol)) continue;
          found.push(symbol);
        }
      }
    };
    walk(segments);
    return [...new Set(found)];
  };
  if (request === void 0) return null;
  if (isAcd) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.status, role: "status", children: [
    t("acd"),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
      setChatUnavailable(!ask(resourceAddress, "Check whether the Logix Designer SDK is installed. If available, prepare a new offline L5X export from this ACD for review. Do not overwrite the ACD, connect online, download, or modify controller state."));
    }, children: t("exportAcd") }),
    chatUnavailable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("chatUnavailable") })
  ] });
  if (failure !== void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.status, role: "alert", children: [
    failure,
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: request.reload, children: t("retry") })
  ] });
  if (project === void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.status, role: "status", children: t("loading") });
  const filter = organizerQuery.trim().toLowerCase();
  const matches = (name) => filter === "" || name.toLowerCase().includes(filter);
  const programMatches = (program) => matches(program.name) || program.routines.some((routine2) => matches(routine2.name)) || program.tags.some((tag) => matches(tag.name));
  const orderedRoutines = (program) => [...program.routines].sort((left, right) => left.name === program.main ? -1 : right.name === program.main ? 1 : left.name.localeCompare(right.name));
  const treeProgram = (program) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, open: filter !== "" || program.name === current?.program, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { title: program.description, onContextMenu: (event) => {
      contextFor(event, program.name, void 0, void 0, void 0, { kind: "program", program: program.name });
    }, children: [
      program.name,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: program.routines.length })
    ] }),
    (filter === "" || program.tags.some((tag) => matches(tag.name))) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: L5xBody_default.leafButton,
        onClick: () => {
          setChoice({ program: program.name, routine: program.main || program.routines[0]?.name || "" });
          openTags("program", filter);
        },
        children: [
          t("programTags"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: program.tags.length })
        ]
      }
    ),
    orderedRoutines(program).filter((routine2) => matches(program.name) || matches(routine2.name)).map((routine2) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: current?.program === program.name && current.routine === routine2.name ? L5xBody_default.selected : L5xBody_default.leafButton,
        onClick: () => {
          select(program, routine2);
        },
        onContextMenu: (event) => {
          contextFor(event, `${program.name}/${routine2.name}`, void 0, void 0, void 0, { kind: "routine", program: program.name, routine: routine2.name });
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.routineIcon, children: routine2.type === "RLL" ? "\u2261" : routine2.type === "ST" ? "{ }" : "\u25C7" }),
          routine2.name,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: routine2.type })
        ]
      },
      routine2.name
    )),
    program.routines.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.leaf, children: t("noRoutines") })
  ] }, program.name);
  const unscheduled = project.programs.filter((program) => !scheduled.has(program.name.toLowerCase()));
  const moduleNames = new Set(project.modules.map((module2) => module2.name.toLowerCase()));
  const treeModule = (module2, ancestors = [], seat = "0") => {
    const key = `${seat}:${module2.name}`;
    const descendants = project.modules.filter((childModule) => childModule.parent.toLowerCase() === module2.name.toLowerCase() && !ancestors.includes(childModule.name.toLowerCase()) && childModule.name !== module2.name);
    const shown = descendants.filter((childModule) => matches(childModule.name) || matches(childModule.catalog) || filter === "");
    if (shown.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: L5xBody_default.leafButton,
        onClick: () => {
          setInspector({ kind: "module", module: module2 });
        },
        title: module2.catalog,
        onContextMenu: (event) => {
          contextFor(event, module2.name, void 0, void 0, void 0, { kind: "module", module: module2.name });
        },
        children: [
          module2.name,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: module2.catalog })
        ]
      },
      key
    );
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, open: filter !== "" ? true : void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { title: module2.catalog, onContextMenu: (event) => {
        contextFor(event, module2.name, void 0, void 0, void 0, { kind: "module", module: module2.name });
      }, children: [
        module2.name,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: module2.catalog })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.leafButton, onClick: () => {
        setInspector({ kind: "module", module: module2 });
      }, children: t("inspect") }),
      shown.map((childModule, index) => treeModule(childModule, [...ancestors, module2.name.toLowerCase()], `${seat}.${index}`))
    ] }, key);
  };
  const rootModules = project.modules.filter((module2) => module2.parent === "" || !moduleNames.has(module2.parent.toLowerCase()) || module2.parent === module2.name);
  const selectedRung = selected?.rungs.find((rung) => rung.number === focusedRung);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.root, "data-l5x-project-view": true, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.productMark, children: [
        t("productMark"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: t("workspaceMark") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: project.name }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        project.processor,
        " \xB7 ",
        t("revision", { revision: project.revision })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.offline, children: t("offline") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Review the offline L5X export for ${project.name}. Start with the current routine ${current?.program ?? ""}/${current?.routine ?? ""}. Use the L5X engineering plugin tools and cite the export identity and source locations.`));
      }, children: t("ask") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: request.reload, children: t("reloadFile") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.sourceBar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("offlineSource") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { title: loaded?.version, children: [
        t("sourceVersion"),
        ": ",
        loaded?.version.slice(0, 12) ?? "\u2014",
        "\u2026"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        t("exportRevision"),
        ": ",
        project.exportRevision || "\u2014"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("manualImport") })
    ] }),
    chatUnavailable && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.notice, role: "status", children: t("chatUnavailable") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.layout, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { className: L5xBody_default.tree, "aria-label": t("controller"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.treeHeading, children: [
          t("organizer"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: project.name })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: L5xBody_default.organizerSearch,
            value: organizerQuery,
            onChange: (event) => {
              setOrganizerQuery(event.target.value);
            },
            placeholder: t("organizerSearch"),
            "aria-label": t("organizerSearch")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.treeScroll, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, className: L5xBody_default.controllerRoot, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { children: [
            t("controller"),
            " ",
            project.name
          ] }),
          (filter === "" || project.tags.some((tag) => matches(tag.name))) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: L5xBody_default.leafButton,
              onClick: () => {
                openTags("controller", filter);
              },
              children: [
                t("tags"),
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: project.tags.length })
              ]
            }
          ),
          filter === "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.unexportedLeaf, title: t("notExported"), children: t("controllerFault") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.unexportedLeaf, title: t("notExported"), children: t("powerUp") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, className: L5xBody_default.nested, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("tasks") }),
            project.tasks.filter((task) => matches(task.name) || task.programs.some((name) => {
              const program = project.programs.find((item) => item.name === name);
              return program !== void 0 && programMatches(program);
            })).map((task) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, open: filter !== "" || task.programs.includes(current?.program ?? ""), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { title: `${task.type} \xB7 ${task.rate}`, children: [
                task.name,
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: task.rate ? `${task.rate} ${t("milliseconds")}` : task.type })
              ] }),
              task.programs.map((name) => project.programs.find((program) => program.name === name)).filter((program) => program !== void 0 && programMatches(program)).map(treeProgram)
            ] }, task.name)),
            (filter === "" || unscheduled.some(programMatches)) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, open: filter !== "" ? true : void 0, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("unscheduled") }),
              unscheduled.filter(programMatches).map(treeProgram),
              unscheduled.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.leaf, children: t("none") })
            ] })
          ] }),
          filter === "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.unexportedLeaf, title: t("notExported"), children: t("motionGroups") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.unexportedLeaf, title: t("notExported"), children: t("alarmManager") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.unexportedLeaf, title: t("notExported"), children: t("assets") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.unexportedLeaf, title: t("notExported"), children: t("logicalModel") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, open: filter !== "" ? true : void 0, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { children: [
              t("modules"),
              " (",
              project.modules.length,
              ")"
            ] }),
            rootModules.filter((module2) => filter === "" || matches(module2.name) || matches(module2.catalog) || project.modules.some((childModule) => childModule.parent === module2.name && (matches(childModule.name) || matches(childModule.catalog)))).map((module2, index) => treeModule(module2, [], String(index)))
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, open: filter !== "" ? true : void 0, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { children: [
              t("aois"),
              " (",
              project.aois.length,
              ")"
            ] }),
            project.aois.filter(matches).map((name) => {
              const parameters = project.aoiParameters.get(name.toUpperCase()) ?? [];
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: name }),
                parameters.map((parameter) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.leaf, title: parameter.description, children: [
                  parameter.name,
                  " ",
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
                    parameter.type,
                    parameter.dimensions !== "" && `[${parameter.dimensions}]`,
                    parameter.usage !== "" && ` \xB7 ${parameter.usage}`
                  ] })
                ] }, parameter.name)),
                parameters.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.leaf, children: t("none") })
              ] }, name);
            })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: L5xBody_default.nested, open: filter !== "" ? true : void 0, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { children: [
              t("types"),
              " (",
              project.types.length,
              ")"
            ] }),
            project.types.filter(matches).map((name) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.leaf, children: name }, name))
          ] })
        ] }) }, filter)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: L5xBody_default.editor, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.tabStrip, children: [
          tagView !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.activeTab, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", children: tagView === "controller" ? t("tags") : `${current?.program} / ${t("programTags")}` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.closeTab, onClick: () => {
              setTagView(void 0);
            }, "aria-label": t("closeTab"), children: "\xD7" })
          ] }),
          visibleTabs.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: tagView === void 0 && tab.program === current?.program && tab.routine === current.routine ? L5xBody_default.activeTab : L5xBody_default.tab, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", onClick: () => {
              setTagView(void 0);
              setChoice(tab);
              setInspector(void 0);
              setFocused(void 0);
              setFocusedRung(void 0);
              setRungLimit(80);
            }, children: [
              tab.program,
              " / ",
              tab.routine
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.closeTab, onClick: () => {
              closeTab(tab);
            }, "aria-label": `${t("closeTab")} ${tab.routine}`, children: "\xD7" })
          ] }, `${tab.program}/${tab.routine}`))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.editorTools, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: tagView === void 0 ? `${current?.program} / ${selected?.name ?? t("noSelection")}` : tagView === "controller" ? t("tags") : `${current?.program} / ${t("programTags")}` }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: tagView === void 0 ? selected?.type ?? "\u2014" : t("offlineValues") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.toolSpacer }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
            setShowSource((value) => !value);
          }, "aria-pressed": showSource, children: t("source") }),
          tagView === void 0 && selected?.type === "RLL" && selected.rungs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              onClick: () => {
                void navigator.clipboard.writeText(selected.rungs.map((rung) => rung.text).join("\n"));
              },
              children: t("copyAllRungs")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
            setChatUnavailable(!ask(resourceAddress, `Explain and review the offline routine ${current?.program}/${current?.routine} in the current L5X export. Use the L5X engineering plugin tools for references and checks. Do not change a controller.`));
          }, children: t("askRoutine") })
        ] }),
        tagView === void 0 && focused !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.focusBar, role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.focusBadge, children: t("focusedInstruction") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: focused.mnemonic }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: focused.operands }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("rung"),
            " ",
            focused.rung
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.focusValue, children: [
            focused.symbol !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: focused.symbol }),
              " \xB7 "
            ] }),
            t("exportedValue"),
            ": ",
            focused.symbol === void 0 ? t("noExportedValue") : detailFor(focused.symbol)?.datum?.value ?? t("noExportedValue")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: focused.symbol === void 0, onClick: () => {
            if (focused.symbol !== void 0) find(focused.symbol);
          }, children: t("references") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: focused.symbol === void 0, onClick: () => {
            if (focused.symbol !== void 0) addWatch(focused.symbol);
          }, children: t("addWatch") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
            setFocused(void 0);
            setFocusedRung(void 0);
          }, "aria-label": t("clearFocus"), children: "\xD7" })
        ] }),
        tagView === void 0 && focused === void 0 && focusedRung !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.focusBar, role: "status", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.focusBadge, children: t("focusedRung") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
            t("rung"),
            " ",
            focusedRung
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: selectedRung?.comment || selectedRung?.text }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
            void navigator.clipboard.writeText(selectedRung?.text ?? "");
          }, children: t("copyRung") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
            setFocusedRung(void 0);
          }, "aria-label": t("clearFocus"), children: "\xD7" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", { className: L5xBody_default.main, ref: scrollportRef, children: tagView !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          TagTable,
          {
            tags: tagView === "controller" ? project.tags : selectedProgram?.tags ?? [],
            filter: tagFilter,
            setFilter: setTagFilter,
            onContext: contextFor,
            onWatch: addWatch,
            onFind: find,
            rows: tagRows((tagView === "controller" ? project.tags : selectedProgram?.tags ?? []).filter((tag) => {
              const needle = tagFilter.trim().toLowerCase();
              return needle === "" || tag.name.toLowerCase().includes(needle) || tag.type.toLowerCase().includes(needle);
            })),
            onToggle: (tag) => {
              setExpandedTags((previous) => {
                const key = `${tag.scope}/${tag.name}`;
                const next = new Set(previous);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            },
            getDatum: (tag) => exportedDatum(project, tag.scope, tag.name),
            t
          }
        ) : selected === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.status, children: t("noSelection") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          selected.description !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.description, children: selected.description }),
          selected.type === "RLL" && (selected.rungs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.status, children: t("noRungs") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            selected.rungs.slice(0, rungLimit).map((rung) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              RungView,
              {
                rung,
                showSource,
                describeOperand,
                detailFor,
                resolveTimer,
                pinsFor,
                focused,
                focusedRung,
                onFocusRung: focusRung,
                onFocusInstruction: focusInstruction,
                onContext: contextFor,
                t
              },
              rung.number
            )),
            selected.rungs.length > rungLimit && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: L5xBody_default.loadMore, onClick: () => {
              setRungLimit((limit) => limit + 80);
            }, children: [
              t("loadMore"),
              " (",
              selected.rungs.length - rungLimit,
              ")"
            ] })
          ] })),
          selected.type === "ST" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: L5xBody_default.structured, onContextMenu: (event) => {
            contextFor(event, selected.code);
          }, children: selected.code }),
          selected.type !== "RLL" && selected.type !== "ST" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.status, children: [
            t("unsupported"),
            " (",
            selected.type,
            ")"
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { className: L5xBody_default.inspector, "aria-label": t("inspect"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.inspectorHeading, children: t("inspect") }),
        focused !== void 0 && tagView === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.propertyList, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
            focused.mnemonic,
            "(",
            focused.operands,
            ")"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            current?.program,
            " / ",
            current?.routine,
            " \xB7 ",
            t("rung"),
            " ",
            focused.rung
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.inspectorCaution, children: t("exportedValueScope") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.operandDetails, children: focusedOperands.map((operand, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: operand.text }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: operand.datum?.value ?? (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u.test(operand.text) ? operand.text : t("noExportedValue")) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              operand.datum?.type ?? operand.tag?.type ?? t("literal"),
              " \xB7 ",
              operand.tag?.scope ?? "\u2014"
            ] }),
            operand.tag?.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: operand.tag.description })
          ] }, index)) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.actionButton, onClick: () => {
            setChatUnavailable(!ask(resourceAddress, `Explain ${focused.mnemonic}(${focused.operands}) at ${current?.program}/${current?.routine} rung ${focused.rung} in this offline L5X. Identify operand scope, cross references, and evidence. Do not assume exported values are live.`));
          }, children: t("askInstruction") }),
          focused.symbol !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.actionButton, onClick: () => {
            setChatUnavailable(!ask(resourceAddress, `Read the current value of ${focused.symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report the observed timestamp and limitations. Do not write data, force, download, or change controller mode.`));
          }, children: t("askLiveRead") })
        ] }) : focusedRung !== void 0 && tagView === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.propertyList, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
            t("rung"),
            " ",
            focusedRung
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            current?.program,
            " / ",
            current?.routine
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: selectedRung?.comment || t("noDescription") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: selectedRung?.text })
        ] }) : inspector?.kind === "tag" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.propertyList, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: inspector.tag.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("type"),
            ": ",
            inspector.tag.type
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("scope"),
            ": ",
            inspector.tag.scope
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("exportedValue"),
            ": ",
            exportedDatum(project, inspector.tag.scope, inspector.tag.name)?.value ?? t("noExportedValue")
          ] }),
          inspector.tag.alias !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("alias"),
            ": ",
            inspector.tag.alias
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: inspector.tag.description || t("noDescription") })
        ] }) : inspector?.kind === "module" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.propertyList, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: inspector.module.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("type"),
            ": ",
            inspector.module.catalog
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("parent"),
            ": ",
            inspector.module.parent || "\u2014"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("slot"),
            ": ",
            inspector.module.slot || "\u2014"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: inspector.module.description || t("noDescription") })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.propertyList, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: selected?.name ?? project.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("type"),
            ": ",
            selected?.type ?? project.processor
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("programs"),
            ": ",
            selectedProgram?.name ?? "\u2014"
          ] }),
          selected?.type === "RLL" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("rungCount"),
            ": ",
            selected.rungs.length
          ] }),
          selectedProgram !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            t("mainRoutine"),
            ": ",
            selectedProgram.main || "\u2014"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: selected?.description || selectedProgram?.description || t("noDescription") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.inspectorHeading, children: t("aryaActions") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.actionButton, onClick: () => {
          setChatUnavailable(!ask(resourceAddress, `Review ${current?.program}/${current?.routine} in the offline L5X using the engineering plugin. Explain the logic and cite source rungs.`));
        }, children: t("explainRoutine") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.actionButton, onClick: () => {
          setChatUnavailable(!ask(resourceAddress, `Propose an offline edit to ${current?.program}/${current?.routine} in this L5X. Show the before/after and validation evidence. Do not connect online or download.`));
        }, children: t("askChange") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.inspectorHelp, children: t("agentEdits") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: L5xBody_default.bottomPanel, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.bottomTabs, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: bottomPane === "search" ? L5xBody_default.bottomActive : "", onClick: () => {
          setBottomPane("search");
        }, children: [
          t("references"),
          " ",
          query !== "" && `(${references.length})`
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: bottomPane === "watch" ? L5xBody_default.bottomActive : "", onClick: () => {
          setBottomPane("watch");
        }, children: [
          t("offlineWatch"),
          " (",
          watch.length,
          ")"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: bottomPane === "diagnostics" ? L5xBody_default.bottomActive : "", onClick: () => {
          setBottomPane("diagnostics");
        }, children: [
          t("reviewHints"),
          " (",
          findings.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.bottomContent, children: [
        bottomPane === "diagnostics" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.panelNote, children: t("reviewHintScope") }),
          findings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.empty, children: t("noFindings") }) : findings.slice(0, 100).map((finding, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.finding, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: finding.severity === "warning" ? L5xBody_default.warning : L5xBody_default.info, children: finding.severity }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: finding.location }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: finding.message }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: finding.evidence })
          ] }, `${finding.code}/${finding.location}/${index}`)),
          findings.length > 100 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: L5xBody_default.empty, children: [
            t("moreFindings"),
            " (",
            findings.length - 100,
            ")"
          ] })
        ] }),
        bottomPane === "search" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: L5xBody_default.searchLabel, children: [
            t("find"),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: query, onChange: (event) => {
              setQuery(event.target.value);
              setShowReferences(true);
            }, placeholder: t("findPlaceholder") })
          ] }),
          showReferences && query !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.panelNote, children: t("referenceScope") }),
          showReferences && query !== "" && (references.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.empty, children: t("noResults") }) : references.slice(0, 200).map((reference, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: L5xBody_default.reference,
              onClick: () => {
                selectReference(reference.program, reference.routine, reference.location);
              },
              onContextMenu: (event) => {
                contextFor(event, reference.text, query);
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
                  reference.program,
                  " / ",
                  reference.routine
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: reference.location }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: reference.text })
              ]
            },
            `${reference.program}/${reference.routine}/${reference.location}/${index}`
          ))),
          references.length > 200 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: L5xBody_default.empty, children: [
            t("moreResults"),
            " (",
            references.length - 200,
            ")"
          ] })
        ] }),
        bottomPane === "watch" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.panelNote, children: t("watchScope") }),
          watch.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.empty, children: t("watchEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: L5xBody_default.watchTable, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("name") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("scope") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("type") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("exportedValue") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("context") })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: watch.map((symbol) => {
              const detail = detailFor(symbol);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: symbol }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: detail?.tag?.scope ?? "\u2014" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: detail?.datum?.type ?? detail?.tag?.type ?? "\u2014" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: L5xBody_default.noValue, children: detail?.datum?.value ?? t("noExportedValue") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: L5xBody_default.tagActions, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
                    find(symbol);
                  }, children: t("references") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
                    setChatUnavailable(!ask(resourceAddress, `Read the current value of ${symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report the observed timestamp and limitations. Do not write data, force, download, or change controller mode.`));
                  }, children: t("askLiveRead") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
                    setWatch((previous) => previous.filter((item) => item !== symbol));
                  }, "aria-label": `${t("removeWatch")} ${symbol}`, children: "\xD7" })
                ] })
              ] }, symbol);
            }) })
          ] })
        ] })
      ] })
    ] }),
    context !== void 0 && (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.MenuSurface, { className: L5xBody_default.menu, role: "menu", style: { left: context.x, top: context.y }, onPointerDown: (event) => {
      event.stopPropagation();
    }, children: [
      context.target !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.menuHeading, children: context.target.kind === "routine" ? `${context.target.program}/${context.target.routine}` : context.target.kind === "program" ? context.target.program : context.target.module }),
      context.target?.kind === "routine" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, "data-l5x-menu": "ask-routine", onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Explain routine ${context.target?.kind === "routine" ? context.target.routine : ""} of program ${context.target?.kind === "routine" ? context.target.program : ""} in this offline L5X export: what it does, what it calls, which tags it reads and writes, and what the export recorded about them. Do not present a saved value as the controller's current state.`));
        setContext(void 0);
      }, children: t("askRoutine") }),
      context.target?.kind === "routine" && (current?.program !== context.target.program || current.routine !== context.target.routine) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        const program = project?.programs.find((item) => item.name === (context.target?.kind === "routine" ? context.target.program : ""));
        const routine2 = program?.routines.find((item) => item.name === (context.target?.kind === "routine" ? context.target.routine : ""));
        if (program !== void 0 && routine2 !== void 0) select(program, routine2);
        setContext(void 0);
      }, children: t("openRoutine") }),
      context.target?.kind === "program" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, "data-l5x-menu": "ask-program", onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Explain program ${context.target?.kind === "program" ? context.target.program : ""} in this offline L5X export: its routines, the tags it owns, how its scans are scheduled, and what the export recorded. Do not present a saved value as the controller's current state.`));
        setContext(void 0);
      }, children: t("askProgram") }),
      context.target?.kind === "module" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, "data-l5x-menu": "ask-module", onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Explain the I/O module ${context.target?.kind === "module" ? context.target.module : ""} in this offline L5X export: its catalog, slot, parent chassis, the controller tags that alias its points, and what the export recorded. Do not connect to the controller.`));
        setContext(void 0);
      }, children: t("askModule") }),
      context.instruction !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.menuHeading, children: [
        context.instruction.mnemonic,
        " \xB7 ",
        t("rung"),
        " ",
        context.instruction.rung
      ] }),
      context.rung !== void 0 && context.instruction === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.menuHeading, children: [
        t("rung"),
        " ",
        context.rung,
        " \xB7 ",
        current?.program,
        "/",
        current?.routine
      ] }),
      context.rung !== void 0 && context.instruction === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, "data-l5x-menu": "ask-rung", onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Explain rung ${context.rung} of ${current?.program}/${current?.routine} in this offline L5X export. Its NeutralText is:
${context.text}
Name every symbol it touches, say which values the export recorded, and do not present a saved value as the controller's current state.`));
        setContext(void 0);
      }, children: t("askRung") }),
      context.rung !== void 0 && context.instruction === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, "data-l5x-menu": "watch-rung", onClick: () => {
        const symbols = rungSymbols(context.rung ?? -1);
        setWatch((previous) => [...previous, ...symbols.filter((symbol) => !previous.includes(symbol))]);
        setBottomPane("watch");
        setContext(void 0);
      }, children: t("watchRung") }),
      context.rung !== void 0 && context.instruction === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        setShowSource(!showSource);
        setContext(void 0);
      }, children: showSource ? t("hideNeutralText") : t("showNeutralText") }),
      context.rung !== void 0 && context.instruction === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Propose a new rung comment for rung ${context.rung} of ${current?.program}/${current?.routine} in this L5X export, in the voice the surrounding comments already use. Show the exact before/after text and where it would be written. Do not connect online or download.`));
        setContext(void 0);
      }, children: t("editRungComment") }),
      context.instruction === void 0 && context.rung === void 0 && context.target === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Context: ${context.text}`));
        setContext(void 0);
      }, children: t("ask") }),
      context.instruction !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Explain ${context.text} at ${current?.program}/${current?.routine} rung ${context.instruction?.rung} using the offline L5X engineering tools. Identify symbols, scope, and evidence. Do not assume exported values are live.`));
        setContext(void 0);
      }, children: t("askInstruction") }),
      context.instruction?.mnemonic.toUpperCase() === "JSR" && selectedProgram?.routines.some((routine2) => routine2.name === displayOperands("JSR", context.instruction?.operands ?? "")[0]) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          role: "menuitem",
          className: L5xBody_default.menuItem,
          onClick: () => {
            const called = selectedProgram.routines.find((routine2) => routine2.name === displayOperands("JSR", context.instruction?.operands ?? "")[0]);
            if (called !== void 0) select(selectedProgram, called);
            setContext(void 0);
          },
          children: t("openCalledRoutine")
        }
      ),
      context.rung === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        find(context.symbol ?? context.text);
      }, children: t("references") }),
      context.symbol !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          role: "menuitem",
          className: L5xBody_default.menuItem,
          onClick: () => {
            addWatch(context.symbol ?? "");
          },
          children: t("addWatch")
        }
      ),
      context.symbol !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Read the current value of ${context.symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report timestamp and limitations; do not write, force, download, or change controller mode.`));
        setContext(void 0);
      }, children: t("askLiveRead") }),
      context.symbol !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        void navigator.clipboard.writeText(context.symbol ?? "");
        setContext(void 0);
      }, children: t("copyOperand") }),
      context.rung === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        void navigator.clipboard.writeText(context.text);
        setContext(void 0);
      }, children: context.instruction === void 0 ? t("copy") : t("copyInstruction") }),
      context.instruction !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        void navigator.clipboard.writeText(selected?.rungs.find((rung) => rung.number === context.instruction?.rung)?.text ?? context.text);
        setContext(void 0);
      }, children: t("copyRung") }),
      context.rung !== void 0 && context.instruction === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        void navigator.clipboard.writeText(context.text);
        setContext(void 0);
      }, children: t("copyRung") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", role: "menuitem", className: L5xBody_default.menuItem, onClick: () => {
        setChatUnavailable(!ask(resourceAddress, `Propose an offline change for ${context.text}${context.instruction === void 0 ? "" : ` at ${current?.program}/${current?.routine} rung ${context.instruction.rung}`} in this L5X export. Show the exact before/after and validation evidence. Do not connect online or download.`));
        setContext(void 0);
      }, children: t("askChange") })
    ] }), document.body)
  ] });
}
function TagTable({ tags, rows, filter, setFilter, onContext, onWatch, onFind, onToggle, getDatum, t }) {
  const visible = rows;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.tagTableView, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.tagTableToolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
        t("find"),
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "data-l5x-tag-filter": true, value: filter, onChange: (event) => {
          setFilter(event.target.value);
        }, placeholder: t("findTag") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        visible.filter((row) => row.depth === 0).length,
        " / ",
        tags.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("exportedValueScope") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: L5xBody_default.tagTable, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("name") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("exportedValue") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("type") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("alias") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("description") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("context") })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: visible.slice(0, 400).map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { onContextMenu: (event) => {
        onContext(event, row.tag.name, row.tag.name);
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { title: row.depth === 0 ? row.tag.scope : row.tag.name, style: { paddingLeft: `${8 + row.depth * 14}px` }, "data-l5x-tag-row": row.depth, children: [
          row.expandable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: L5xBody_default.tagToggle, "aria-expanded": row.open, "aria-label": row.open ? t("collapse") : t("expand"), onClick: () => {
            onToggle(row.tag);
          }, children: row.open ? "\u25BE" : "\u25B8" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.tagToggle, "aria-hidden": "true" }),
          row.tag.name
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: L5xBody_default.noValue, children: getDatum(row.tag)?.value ?? t("noExportedValue") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          row.tag.type,
          row.tag.dimensions !== "" && `[${row.tag.dimensions}]`
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: row.tag.alias }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { title: row.tag.description, children: row.tag.description }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: L5xBody_default.tagActions, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
            onWatch(row.tag.name);
          }, children: t("addWatch") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
            onFind(row.tag.name);
          }, children: t("references") })
        ] })
      ] }, `${row.tag.scope}/${row.tag.name}`)) })
    ] }),
    tags.length > 250 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: L5xBody_default.panelNote, children: t("filterMore") })
  ] });
}
var booleanMnemonics = ["XIC", "XIO", "OTE", "OTL", "OTU"];
var timerMnemonics = ["TON", "TOF", "RTO"];
function pinRows(mnemonic, operands, detailFor, resolveTimer, pinsFor, t) {
  const upper = mnemonic.toUpperCase();
  const keys = pinsFor(upper) ?? operandKeys[upper] ?? instructionPins[upper];
  const shown = displayOperands(mnemonic, operands);
  const parts = keys === void 0 ? shown : shown.slice(0, keys.length);
  const timer = timerMnemonics.includes(upper) ? resolveTimer(parts[0] ?? "") : void 0;
  const rows = parts.map((operand, index) => {
    const raw = operand.trim();
    const missing = raw === "" || raw === "?";
    const resolved = index === 1 && missing && timer !== void 0 ? timer.preset : index === 2 && missing && timer !== void 0 ? timer.accum : raw;
    const key = keys?.[index];
    const datum = resolved === "" || resolved === "?" ? void 0 : detailFor(resolved)?.datum;
    const literal = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u.test(resolved);
    return {
      label: key === void 0 ? `${t("operand.operand")} ${index + 1}` : key.startsWith("operand.") ? t(key) : key,
      text: resolved === "" || resolved === "?" ? t("noExportedValue") : resolved,
      value: datum?.value ?? (literal ? resolved : ""),
      title: resolved === "" || resolved === "?" ? t("exportedValueScope") : datum === void 0 ? resolved : `${resolved} \xB7 ${t("exportedValue")}: ${datum.value} ${t("exportedValueScope")}`
    };
  });
  if (timer === void 0) return rows;
  const flags = [{ label: "EN", on: timer.enabled }, { label: "TT", on: timer.timing }, { label: "DN", on: timer.done }];
  return rows.map((row, index) => index === 0 ? { ...row, flags } : row);
}
var COMMENT_CHARS = 27;
function commentLines(text, width) {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const lines = [];
  for (const word of trimmed.split(/\s+/u)) {
    const last = lines.at(-1);
    if (last !== void 0 && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}
function commentBand(describeOperand, segment) {
  const symbol = instructionSymbols(segment.mnemonic, segment.operands)[0];
  const lines = commentLines(describeOperand(symbol ?? segment.operands), COMMENT_CHARS);
  return Math.max(24, Math.min(190, Math.round(lines.length * 12.4 + 10)));
}
function rungBand(segments, describeOperand) {
  return segments.reduce((tallest, segment) => "paths" in segment ? segment.paths.reduce((inner, branch) => Math.max(inner, rungBand(branch, describeOperand)), tallest) : Math.max(tallest, commentBand(describeOperand, segment)), 24);
}
function RungView({ rung, showSource, describeOperand, detailFor, resolveTimer, pinsFor, focused, focusedRung, onFocusRung, onFocusInstruction, onContext, t }) {
  const segments = ladderSegments(rung.text);
  const band = segments === null ? 24 : rungBand(segments, describeOperand);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "section",
    {
      className: `${L5xBody_default.rung} ${focusedRung === rung.number ? L5xBody_default.focusedRung : ""}`,
      "data-rung": rung.number,
      "data-l5x-rung": rung.number,
      style: { "--l5x-band": `${band}px` },
      onContextMenu: (event) => {
        onContext(event, rung.text, void 0, void 0, rung.number);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: L5xBody_default.rungNumber,
            "aria-pressed": focusedRung === rung.number && focused === void 0,
            "aria-label": `${t("focusRung")} ${rung.number}`,
            onClick: () => {
              onFocusRung(rung.number);
            },
            onContextMenu: (event) => {
              event.stopPropagation();
              onFocusRung(rung.number);
              onContext(event, rung.text, void 0, void 0, rung.number);
            },
            children: rung.number
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: L5xBody_default.rungBody, children: [
          rung.comment !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.comment, "data-l5x-rung-comment": true, children: rung.comment }),
          segments === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: L5xBody_default.neutral, children: rung.text }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.rail, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            LadderPath,
            {
              segments,
              path: rung.number,
              rung: rung.number,
              depth: 0,
              resolveTimer,
              pinsFor,
              describeOperand,
              detailFor,
              focused,
              onFocusInstruction,
              onContext,
              t
            }
          ) }),
          showSource && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: L5xBody_default.source, children: rung.text })
        ] })
      ]
    }
  );
}
function LadderPath({ segments, path, rung, depth, describeOperand, detailFor, resolveTimer, pinsFor, focused, onFocusInstruction, onContext, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${L5xBody_default.path} ${depth > 0 ? L5xBody_default.nestedPath : ""}`, children: segments.map((segment, index) => "paths" in segment ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.branch, children: segment.paths.map((branchSegments, pathIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: L5xBody_default.branchPath, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    LadderPath,
    {
      segments: branchSegments,
      path: `${path}/${index}/${pathIndex}`,
      rung,
      depth: depth + 1,
      resolveTimer,
      pinsFor,
      describeOperand,
      detailFor,
      focused,
      onFocusInstruction,
      onContext,
      t
    }
  ) }, `branch-path-${path}-${index}-${pathIndex}`)) }, `branch-${path}-${index}`) : (() => {
    const id = `${path}/${index}`;
    const upper = segment.mnemonic.toUpperCase();
    const isBoolean = booleanMnemonics.includes(upper);
    const symbol = instructionSymbols(segment.mnemonic, segment.operands)[0];
    const instruction = {
      id,
      rung,
      mnemonic: segment.mnemonic,
      operands: segment.operands,
      ...symbol === void 0 ? {} : { symbol }
    };
    const detail = symbol === void 0 ? void 0 : detailFor(symbol);
    const selected = focused?.id === id;
    const description2 = describeOperand(symbol ?? segment.operands);
    const rows = isBoolean ? [] : pinRows(segment.mnemonic, segment.operands, detailFor, resolveTimer, pinsFor, t);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        "data-l5x-instruction": true,
        "data-instruction-id": id,
        "aria-pressed": selected,
        "aria-label": `${segment.mnemonic} ${segment.operands}${description2 === "" ? "" : ` \u2014 ${description2}`}`,
        className: `${L5xBody_default.instruction} ${isBoolean ? "" : L5xBody_default.functionBlock} ${index === segments.length - 1 && terminalInstructions.has(upper) ? L5xBody_default.outputInstruction : ""} ${selected ? L5xBody_default.focusedInstruction : ""}`,
        onFocus: () => {
          onFocusInstruction(instruction);
        },
        onClick: () => {
          onFocusInstruction(instruction);
        },
        onKeyDown: (event) => {
          const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
          if (!keys.includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.closest("[data-l5x-project-view]")?.querySelectorAll("button[data-l5x-instruction]") ?? []);
          const position = buttons.indexOf(event.currentTarget);
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, position + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1)));
          event.preventDefault();
          buttons[next]?.focus();
        },
        onContextMenu: (event) => {
          event.stopPropagation();
          event.currentTarget.focus();
          onContext(event, `${segment.mnemonic}(${segment.operands})`, symbol, instruction);
        },
        children: [
          description2 !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.instructionComment, "data-l5x-instruction-comment": true, title: description2, children: description2 }),
          isBoolean ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.glyph, "aria-hidden": "true", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: L5xBody_default.wireLead }),
            upper.startsWith("X") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: `${L5xBody_default.contact} ${upper === "XIO" ? L5xBody_default.negated : ""}` }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: L5xBody_default.coil, children: upper === "OTL" ? t("latchGlyph") : upper === "OTU" ? t("unlatchGlyph") : "" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: L5xBody_default.wireLead })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.blockCard, "data-l5x-block": true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: segment.mnemonic }),
            rows.map((row, rowIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { "data-l5x-operand-row": true, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { "data-l5x-operand-label": true, children: row.label }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { "data-l5x-operand": true, title: row.title, onClick: (event) => {
                event.stopPropagation();
                event.currentTarget.closest("button")?.focus();
                onFocusInstruction(instruction);
              }, onContextMenu: (event) => {
                event.stopPropagation();
                event.currentTarget.closest("button")?.focus();
                onContext(event, `${segment.mnemonic}(${segment.operands})`, symbol, instruction);
              }, children: row.text }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.pinTail, children: [
                row.flags?.map((flag) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: flag.on ? L5xBody_default.flagOn : L5xBody_default.flagOff, children: flag.label }, `${id}-pin-${rowIndex}-${flag.label}`)),
                row.value !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { "data-l5x-operand-value": true, title: row.title, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "aria-hidden": "true", children: "\u25C0" }),
                  row.value
                ] })
              ] })
            ] }, `${id}-pin-${rowIndex}`))
          ] }),
          isBoolean && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.tagBlock, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: L5xBody_default.tagName, "data-l5x-tag-name": true, title: detail?.tag?.description ?? segment.operands, children: segment.operands }),
            detail?.tag?.alias ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: L5xBody_default.tagAlias, "data-l5x-operand-alias": true, title: t("alias"), children: detail.tag.alias }) : null,
            detail?.datum !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.tagValue, "data-l5x-operand-value": true, title: t("exportedValueScope"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "aria-hidden": "true", children: "\u25C0" }),
              detail.datum.value
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: L5xBody_default.instructionTooltip, role: "tooltip", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
              segment.mnemonic,
              "(",
              segment.operands,
              ")"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              t("rung"),
              " ",
              rung
            ] }),
            detail?.tag !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              t("scope"),
              ": ",
              detail.tag.scope,
              " \xB7 ",
              t("type"),
              ": ",
              detail.datum?.type ?? detail.tag.type
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              t("exportedValue"),
              ": ",
              detail?.datum?.value ?? t("noExportedValue")
            ] }),
            detail?.tag?.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: detail.tag.description })
          ] })
        ]
      },
      id
    );
  })()) });
}

// packages/viewer/src/client/locales.ts
var en = {
  "operand.source": "Source",
  "operand.destination": "Dest",
  "operand.length": "Length",
  "operand.timer": "Timer",
  "operand.a": "A",
  "operand.b": "B",
  "operand.sourceA": "Source A",
  "operand.sourceB": "Source B",
  "operand.routine": "Routine Name",
  "operand.parameter": "Param",
  "operand.preset": "Preset",
  "operand.accum": "Accum",
  "operand.operand": "Operand",
  "operand.counter": "Counter",
  "operand.storage": "Storage Bit",
  "operand.control": "Control",
  "operand.position": "Position",
  "operand.message": "Message",
  "productMark": "LOGIX",
  "workspaceMark": "WORKSPACE",
  "milliseconds": "ms",
  "latchGlyph": "L",
  "unlatchGlyph": "U",
  title: "Logix project",
  loading: "Reading Logix project\u2026",
  invalid: "Could not read this L5X export.",
  retry: "Retry",
  acd: "ACD is a binary Studio 5000 project. Export an L5X in Studio 5000 to browse it here.",
  exportAcd: "Ask Arya to prepare an L5X",
  chatUnavailable: "Arya chat is unavailable in this session.",
  controller: "Controller",
  tasks: "Tasks",
  programs: "Programs",
  tags: "Controller Tags",
  programTags: "Parameters and Local Tags",
  modules: "I/O Configuration",
  aois: "Add-On Instructions",
  types: "Data Types",
  noRoutines: "No routines in this program.",
  noRungs: "No rungs in this routine.",
  unsupported: "This routine language is not diagrammed in this view.",
  find: "Find All",
  findPlaceholder: "Find symbol or text",
  references: "Cross References",
  noResults: "No references found in ladder or Structured Text.",
  ask: "Ask Arya",
  copy: "Copy source",
  referenceScope: "Text matches in ladder and Structured Text; confirm scope in the engineering tools.",
  monitor: "Monitor",
  monitorUnavailable: "Live monitor is not connected to this offline export.",
  source: "Source",
  inspect: "Inspect",
  offline: "Offline export",
  changed: "The file changed while it was being read. Reload this view.",
  tooLarge: "This export is too large for the project viewer.",
  routine: "Routine",
  rung: "Rung",
  context: "Actions",
  noSelection: "Select a routine in the project tree.",
  revision: "Revision {revision}",
  reloadFile: "Reload export",
  offlineSource: "OFFLINE \xB7 exported source",
  sourceVersion: "File version",
  exportRevision: "Studio export",
  manualImport: "Review and import in Studio 5000",
  organizer: "Controller Organizer",
  organizerSearch: "Find task, routine, tag, or module",
  unscheduled: "Unscheduled Programs",
  filterMore: "Search to show additional tags",
  expand: "Expand",
  collapse: "Collapse",
  closeTab: "Close",
  askRoutine: "Ask Arya about routine",
  loadMore: "Load more rungs",
  type: "Type",
  scope: "Scope",
  alias: "Alias for",
  parent: "Parent",
  slot: "Address",
  rungCount: "Rungs",
  mainRoutine: "Main routine",
  noDescription: "No exported description.",
  aryaActions: "Work with Arya",
  explainRoutine: "Explain this routine",
  askChange: "Ask Arya to change offline file",
  agentEdits: "Arya edits the L5X in the workspace. Reload the export to inspect the saved result before importing it in Studio 5000.",
  reviewHints: "Source review",
  reviewHintScope: "Hints from this export only. Use the engineering plugin and Studio 5000 to validate changes.",
  noFindings: "No source review hints for the structures shown here.",
  moreFindings: "Additional hints",
  moreResults: "Additional matches",
  offlineWatch: "Offline watch",
  watchScope: "Values shown here come from the saved export. Current controller values are unavailable in this view.",
  watchEmpty: "Right-click an operand or tag to add it here.",
  notLive: "No live value",
  removeWatch: "Remove",
  addWatch: "Add to offline watch",
  openTagTable: "Open tag table",
  offlineValues: "Offline \xB7 saved export",
  findTag: "Find tag or data type",
  name: "Name",
  value: "Value",
  description: "Description",
  askLiveRead: "Ask Arya to read",
  focusedInstruction: "Selected instruction",
  focusedRung: "Selected rung",
  focusRung: "Select rung",
  clearFocus: "Clear selection",
  exportedValue: "Exported value",
  noExportedValue: "Not present in export",
  exportedValueScope: "Saved export value; this is not the current controller state.",
  literal: "Literal",
  askInstruction: "Ask Arya about instruction",
  copyOperand: "Copy operand",
  copyInstruction: "Copy instruction",
  copyRung: "Copy rung source",
  openCalledRoutine: "Open called routine",
  copyAllRungs: "Copy all rungs as NeutralText",
  askRung: "Ask Arya about rung",
  watchRung: "Watch every tag on this rung",
  editRungComment: "Ask Arya to change the rung comment",
  showNeutralText: "Show NeutralText",
  hideNeutralText: "Hide NeutralText",
  openRoutine: "Open this routine",
  askProgram: "Ask Arya about program",
  askModule: "Ask Arya about module",
  "operand.expression": "Expression",
  controllerFault: "Controller Fault Handler",
  powerUp: "Power-Up Handler",
  motionGroups: "Motion Groups",
  alarmManager: "Alarm Manager",
  assets: "Assets",
  logicalModel: "Logical Model",
  notExported: "Not included in this L5X export",
  none: "None"
};
var zh = {
  "operand.source": "\u6E90",
  "operand.destination": "\u76EE\u6807",
  "operand.length": "\u957F\u5EA6",
  "operand.timer": "\u5B9A\u65F6\u5668",
  "operand.a": "A",
  "operand.b": "B",
  "operand.sourceA": "\u6E90 A",
  "operand.sourceB": "\u6E90 B",
  "operand.routine": "\u4F8B\u7A0B\u540D\u79F0",
  "operand.parameter": "\u53C2\u6570",
  "operand.preset": "\u9884\u7F6E",
  "operand.accum": "\u7D2F\u52A0",
  "operand.operand": "\u64CD\u4F5C\u6570",
  "operand.counter": "\u8BA1\u6570\u5668",
  "operand.storage": "\u5B58\u50A8\u4F4D",
  "operand.control": "\u63A7\u5236",
  "operand.position": "\u4F4D\u7F6E",
  "operand.message": "\u6D88\u606F",
  "productMark": "LOGIX",
  "workspaceMark": "\u5DE5\u4F5C\u533A",
  "milliseconds": "ms",
  "latchGlyph": "L",
  "unlatchGlyph": "U",
  title: "Logix \u9879\u76EE",
  loading: "\u6B63\u5728\u8BFB\u53D6 Logix \u9879\u76EE\u2026",
  invalid: "\u65E0\u6CD5\u8BFB\u53D6\u6B64 L5X \u5BFC\u51FA\u6587\u4EF6\u3002",
  retry: "\u91CD\u8BD5",
  acd: "ACD \u662F Studio 5000 \u4E8C\u8FDB\u5236\u9879\u76EE\u3002\u8BF7\u5728 Studio 5000 \u4E2D\u5BFC\u51FA L5X \u540E\u5728\u6B64\u6D4F\u89C8\u3002",
  exportAcd: "\u8BF7 Arya \u51C6\u5907 L5X",
  chatUnavailable: "\u6B64\u4F1A\u8BDD\u4E2D\u65E0\u6CD5\u4F7F\u7528 Arya \u804A\u5929\u3002",
  controller: "\u63A7\u5236\u5668",
  tasks: "\u4EFB\u52A1",
  programs: "\u7A0B\u5E8F",
  tags: "\u63A7\u5236\u5668\u6807\u7B7E",
  programTags: "\u53C2\u6570\u548C\u672C\u5730\u6807\u7B7E",
  modules: "I/O \u914D\u7F6E",
  aois: "\u9644\u52A0\u6307\u4EE4",
  types: "\u6570\u636E\u7C7B\u578B",
  noRoutines: "\u6B64\u7A0B\u5E8F\u6CA1\u6709\u4F8B\u7A0B\u3002",
  noRungs: "\u6B64\u4F8B\u7A0B\u6CA1\u6709\u68AF\u7EA7\u3002",
  unsupported: "\u6B64\u4F8B\u7A0B\u8BED\u8A00\u5C1A\u672A\u5728\u6B64\u89C6\u56FE\u4E2D\u7ED8\u5236\u3002",
  find: "\u67E5\u627E\u5168\u90E8",
  findPlaceholder: "\u67E5\u627E\u7B26\u53F7\u6216\u6587\u672C",
  references: "\u4EA4\u53C9\u5F15\u7528",
  noResults: "\u68AF\u5F62\u56FE\u548C\u7ED3\u6784\u5316\u6587\u672C\u4E2D\u6CA1\u6709\u627E\u5230\u5F15\u7528\u3002",
  ask: "\u8BE2\u95EE Arya",
  copy: "\u590D\u5236\u6E90\u4EE3\u7801",
  referenceScope: "\u68AF\u5F62\u56FE\u548C\u7ED3\u6784\u5316\u6587\u672C\u4E2D\u7684\u6587\u672C\u5339\u914D\uFF1B\u8BF7\u5728\u5DE5\u7A0B\u5DE5\u5177\u4E2D\u786E\u8BA4\u4F5C\u7528\u57DF\u3002",
  monitor: "\u76D1\u89C6",
  monitorUnavailable: "\u6B64\u79BB\u7EBF\u5BFC\u51FA\u6587\u4EF6\u672A\u8FDE\u63A5\u5B9E\u65F6\u76D1\u89C6\u3002",
  source: "\u6E90\u4EE3\u7801",
  inspect: "\u68C0\u67E5",
  offline: "\u79BB\u7EBF\u5BFC\u51FA",
  changed: "\u8BFB\u53D6\u671F\u95F4\u6587\u4EF6\u53D1\u751F\u53D8\u5316\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u6B64\u89C6\u56FE\u3002",
  tooLarge: "\u6B64\u5BFC\u51FA\u6587\u4EF6\u5BF9\u4E8E\u9879\u76EE\u67E5\u770B\u5668\u8FC7\u5927\u3002",
  routine: "\u4F8B\u7A0B",
  rung: "\u68AF\u7EA7",
  context: "\u64CD\u4F5C",
  noSelection: "\u5728\u9879\u76EE\u6811\u4E2D\u9009\u62E9\u4E00\u4E2A\u4F8B\u7A0B\u3002",
  revision: "\u7248\u672C {revision}",
  reloadFile: "\u91CD\u65B0\u52A0\u8F7D\u5BFC\u51FA",
  offlineSource: "\u79BB\u7EBF \xB7 \u5BFC\u51FA\u6E90\u7801",
  sourceVersion: "\u6587\u4EF6\u7248\u672C",
  exportRevision: "Studio \u5BFC\u51FA\u7248\u672C",
  manualImport: "\u5728 Studio 5000 \u4E2D\u5BA1\u6838\u5E76\u5BFC\u5165",
  organizer: "\u63A7\u5236\u5668\u7EC4\u7EC7\u5668",
  organizerSearch: "\u67E5\u627E\u4EFB\u52A1\u3001\u4F8B\u7A0B\u3001\u6807\u7B7E\u6216\u6A21\u5757",
  unscheduled: "\u672A\u8C03\u5EA6\u7A0B\u5E8F",
  filterMore: "\u641C\u7D22\u4EE5\u663E\u793A\u5176\u4ED6\u6807\u7B7E",
  expand: "\u5C55\u5F00",
  collapse: "\u6298\u53E0",
  closeTab: "\u5173\u95ED",
  askRoutine: "\u8BE2\u95EE Arya \u6B64\u4F8B\u7A0B",
  loadMore: "\u52A0\u8F7D\u66F4\u591A\u68AF\u7EA7",
  type: "\u7C7B\u578B",
  scope: "\u4F5C\u7528\u57DF",
  alias: "\u522B\u540D\u6307\u5411",
  parent: "\u7236\u6A21\u5757",
  slot: "\u5730\u5740",
  rungCount: "\u68AF\u7EA7\u6570",
  mainRoutine: "\u4E3B\u4F8B\u7A0B",
  noDescription: "\u6CA1\u6709\u5BFC\u51FA\u7684\u8BF4\u660E\u3002",
  aryaActions: "\u4E0E Arya \u534F\u4F5C",
  explainRoutine: "\u89E3\u91CA\u6B64\u4F8B\u7A0B",
  askChange: "\u8BF7 Arya \u4FEE\u6539\u79BB\u7EBF\u6587\u4EF6",
  agentEdits: "Arya \u4FEE\u6539\u5DE5\u4F5C\u533A\u4E2D\u7684 L5X\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u5BFC\u51FA\u5E76\u68C0\u67E5\u4FDD\u5B58\u7ED3\u679C\uFF0C\u7136\u540E\u5728 Studio 5000 \u4E2D\u5BFC\u5165\u3002",
  reviewHints: "\u6E90\u6587\u4EF6\u68C0\u67E5",
  reviewHintScope: "\u4EC5\u4F9D\u636E\u6B64\u5BFC\u51FA\u63D0\u4F9B\u63D0\u793A\u3002\u8BF7\u4F7F\u7528\u5DE5\u7A0B\u63D2\u4EF6\u548C Studio 5000 \u9A8C\u8BC1\u4FEE\u6539\u3002",
  noFindings: "\u5F53\u524D\u5C55\u793A\u7684\u7ED3\u6784\u6CA1\u6709\u6E90\u6587\u4EF6\u68C0\u67E5\u63D0\u793A\u3002",
  moreFindings: "\u5176\u4ED6\u63D0\u793A",
  moreResults: "\u5176\u4ED6\u5339\u914D",
  offlineWatch: "\u79BB\u7EBF\u76D1\u89C6\u5217\u8868",
  watchScope: "\u6B64\u5904\u663E\u793A\u7684\u6570\u503C\u6765\u81EA\u5DF2\u4FDD\u5B58\u7684\u5BFC\u51FA\u6587\u4EF6\uFF1B\u5F53\u524D\u63A7\u5236\u5668\u6570\u503C\u5728\u6B64\u89C6\u56FE\u4E2D\u4E0D\u53EF\u7528\u3002",
  watchEmpty: "\u53F3\u952E\u5355\u51FB\u64CD\u4F5C\u6570\u6216\u6807\u7B7E\u4EE5\u6DFB\u52A0\u3002",
  notLive: "\u65E0\u5B9E\u65F6\u6570\u503C",
  removeWatch: "\u79FB\u9664",
  addWatch: "\u6DFB\u52A0\u5230\u79BB\u7EBF\u76D1\u89C6\u5217\u8868",
  openTagTable: "\u6253\u5F00\u6807\u7B7E\u8868",
  offlineValues: "\u79BB\u7EBF \xB7 \u5DF2\u4FDD\u5B58\u7684\u5BFC\u51FA\u6587\u4EF6",
  findTag: "\u67E5\u627E\u6807\u7B7E\u6216\u6570\u636E\u7C7B\u578B",
  name: "\u540D\u79F0",
  value: "\u6570\u503C",
  description: "\u8BF4\u660E",
  askLiveRead: "\u8BF7 Arya \u8BFB\u53D6",
  focusedInstruction: "\u9009\u4E2D\u7684\u6307\u4EE4",
  focusedRung: "\u9009\u4E2D\u7684\u68AF\u7EA7",
  focusRung: "\u9009\u62E9\u68AF\u7EA7",
  clearFocus: "\u6E05\u9664\u9009\u62E9",
  exportedValue: "\u5BFC\u51FA\u65F6\u7684\u6570\u503C",
  noExportedValue: "\u5BFC\u51FA\u6587\u4EF6\u4E2D\u672A\u5305\u542B",
  exportedValueScope: "\u6B64\u503C\u6765\u81EA\u5DF2\u4FDD\u5B58\u7684\u5BFC\u51FA\u6587\u4EF6\uFF0C\u4E0D\u662F\u63A7\u5236\u5668\u5F53\u524D\u72B6\u6001\u3002",
  literal: "\u5E38\u91CF",
  askInstruction: "\u8BE2\u95EE Arya \u6B64\u6307\u4EE4",
  copyOperand: "\u590D\u5236\u64CD\u4F5C\u6570",
  copyInstruction: "\u590D\u5236\u6307\u4EE4",
  copyRung: "\u590D\u5236\u68AF\u7EA7\u6E90\u4EE3\u7801",
  openCalledRoutine: "\u6253\u5F00\u8C03\u7528\u7684\u4F8B\u7A0B",
  copyAllRungs: "\u590D\u5236\u5168\u90E8\u68AF\u7EA7\u4E3A\u4E2D\u6027\u6587\u672C",
  askRung: "\u8BE2\u95EE Arya \u6B64\u68AF\u7EA7",
  watchRung: "\u76D1\u89C6\u6B64\u68AF\u7EA7\u4E0A\u7684\u6240\u6709\u6807\u7B7E",
  editRungComment: "\u8BF7 Arya \u4FEE\u6539\u68AF\u7EA7\u6CE8\u91CA",
  showNeutralText: "\u663E\u793A\u4E2D\u6027\u6587\u672C",
  hideNeutralText: "\u9690\u85CF\u4E2D\u6027\u6587\u672C",
  openRoutine: "\u6253\u5F00\u6B64\u4F8B\u7A0B",
  askProgram: "\u8BE2\u95EE Arya \u6B64\u7A0B\u5E8F",
  askModule: "\u8BE2\u95EE Arya \u6B64\u6A21\u5757",
  "operand.expression": "\u8868\u8FBE\u5F0F",
  controllerFault: "\u63A7\u5236\u5668\u6545\u969C\u5904\u7406\u7A0B\u5E8F",
  powerUp: "\u4E0A\u7535\u5904\u7406\u7A0B\u5E8F",
  motionGroups: "\u8FD0\u52A8\u7EC4",
  alarmManager: "\u62A5\u8B66\u7BA1\u7406\u5668",
  assets: "\u8D44\u4EA7",
  logicalModel: "\u903B\u8F91\u6A21\u578B",
  notExported: "\u6B64 L5X \u5BFC\u51FA\u4E2D\u672A\u5305\u542B",
  none: "\u65E0"
};

// packages/viewer/src/client/index.ts
var ID = "@deepseek-ai/dsh-client-ui-logix-project-viewer";
var CHUNK = 1024 * 1024;
var LIMIT = 64 * 1024 * 1024;
var inject = ["slots", "locale", "documentPreviews", "remote", "remote.workspaceFiles"];
function hostFileOf(address) {
  const parsed = parseFileAddress(address);
  if (parsed?.scope !== "session") throw new Error(`ui-logix-project-viewer: not a session file address "${address}"`);
  return { sessionId: parsed.sessionId, path: parsed.path };
}
function apply(ctx) {
  let draft = () => false;
  ctx.inject(["sessions", "conversation"], (scope) => {
    draft = (address, context) => {
      const file = hostFileOf(address);
      const session = scope.sessions.scope(file.sessionId);
      if (session === void 0) return false;
      const input = scope.conversation.input.for(session);
      const existing = input.state.getSnapshot().draft;
      const prompt = `Review this offline Studio 5000 project at ${file.path}. ${context}`;
      input.setDraft(existing === "" ? prompt : `${existing}
${prompt}`);
      input.focus();
      return true;
    };
    scope.effect(() => () => {
      draft = () => false;
    });
  });
  ctx.effect(() => ctx.locale.register("sidebarL5x", { en, zh }));
  const t = ctx.locale.bind("sidebarL5x");
  const read = async (address, signal) => {
    const file = hostFileOf(address);
    const chunks = [];
    let offset = 0;
    let version;
    let total = 0;
    while (true) {
      signal.throwIfAborted();
      const result = await ctx.remote.workspaceFiles.readBytes(file.sessionId, file.path, { range: { offset, length: CHUNK } }, signal);
      if (!result.ok) throw new Error(result.error.message);
      const page = result.value;
      if (version !== void 0 && version !== page.version) throw new Error(t("changed"));
      version = page.version;
      total += page.data.length;
      if (total > LIMIT || page.bytes !== void 0 && page.bytes > LIMIT) throw new Error(t("tooLarge"));
      chunks.push(page.data);
      offset += page.data.length;
      if (page.eof) break;
      if (page.data.length === 0) throw new Error(t("invalid"));
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let xml = "";
    for (const chunk of chunks) xml += decoder.decode(chunk, { stream: true });
    xml += decoder.decode();
    return { xml, version };
  };
  const ask = (address, context) => draft(address, context);
  function WorkspaceLogixBody({ scope, path }) {
    const [revision, setRevision] = (0, import_react2.useState)(0);
    return (0, import_react2.createElement)(L5xBody, {
      resourceAddress: fileAddressFor(scope.sessionId, scope.cwd, path),
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
      read,
      ask
    });
  }
  ctx.inject(["betterSidebar"], (scope) => {
    scope.effect(() => scope.betterSidebar.registerFileViewer({
      id: `${ID}:workspace-file`,
      title: () => t("title"),
      exts: ["l5x", "acd"],
      priority: 20,
      fetchStrategy: "none",
      component: WorkspaceLogixBody
    }), "ui-logix-project-viewer: workspace files");
  });
  ctx.effect(() => ctx.documentPreviews.register({
    id: ID,
    extensions: ["l5x", "acd"],
    binaryExtensions: ["acd"],
    priority: "extension",
    title: () => t("title"),
    loading: "renderer",
    wrap: false
  }));
  ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
    name: "sidebar.right.tab.document",
    key: ID,
    locale: "sidebarL5x",
    inject: () => ({ read, ask })
  }, L5xBody)));
}

    return module.exports
  },
})
