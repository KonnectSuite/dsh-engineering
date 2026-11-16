import { mount } from "./optix-live-scope.mjs";
const h = await mount();
const run = async (tool, args) => h.run(tool, args);
const BRIDGE = process.env.OPTIX_BRIDGE_URL || "http://127.0.0.1:8768";
const PROJECT = process.env.OPTIX_PROJECT || "AryaOptixTemplate";
const stage = process.argv[2] || "all";
const set = (path, name, value) => ({ op: "set_property", path, name, value });
const box = (path, l, t, w, hh) => [set(path, "LeftMargin", String(l)), set(path, "TopMargin", String(t)), set(path, "Width", String(w)), set(path, "Height", String(hh))];
const widget = (screen, name, type) => ({ op: "create_widget", screen, name, widget_type: type });
const C = { ink: "#1F2933", mute: "#5B6B7A", line: "#D7DDE5", teal: "#0B3E5C", white: "#FFFFFF", bad: "#E5484D", page: "#F2F4F7" };
async function edit(ops, what) {
  for (let i = 0; i < ops.length; i += 35) {
    const r = await run("optix_edit", { project: PROJECT, dry_run: false, ops: ops.slice(i, i + 35) });
    if (r.status !== "applied" && r.status !== "completed") throw new Error(what + ": " + JSON.stringify(r.errors ?? r).slice(0, 400));
  }
  console.log(what + ": " + ops.length);
}
async function netlogic(parent, name) {
  const r = await fetch(BRIDGE + "/bridge/model/netlogic?parent=" + encodeURIComponent(parent) + "&name=" + encodeURIComponent(name), { method: "POST" });
  console.log("netlogic " + parent + "/" + name + " -> " + (await r.text()).slice(0, 120));
}
async function wire(path, event_type, method_path) {
  const r = await run("optix_edit", { project: PROJECT, dry_run: false, ops: [{ op: "wire_event", path, event_type, method_path }] });
  if (r.status !== "applied" && r.status !== "completed") throw new Error("wire " + path + ": " + JSON.stringify(r.errors ?? r).slice(0, 300));
  console.log("wire " + path + " -> " + method_path);
}
async function wireOpen(path, dialog, parentItem = "") { return wire2(path, "OpenDialog", `Dialog=${dialog};AliasNode=;ParentItem=${parentItem}`); }
async function wire2(path, command, args) {
  const r = await run("optix_edit", { project: PROJECT, dry_run: false, ops: [{ op: "wire_event", path, event_type: "MouseClickEvent", command, args }] });
  if (r.status !== "applied" && r.status !== "completed") throw new Error("wire " + path + ": " + JSON.stringify(r.errors ?? r).slice(0, 300));
  console.log("wire " + path + " -> " + command);
}
const surface = (screen, name, l, t, w, hh) => [widget(screen, name, "Rectangle"), ...box(screen + "/" + name, l, t, w, hh), set(screen + "/" + name, "FillColor", C.white), set(screen + "/" + name, "BorderColor", C.line), set(screen + "/" + name, "BorderThickness", "1")];
const label = (screen, name, l, t, w, hh, text, size, colour, weight = "") => {
  const ops = [widget(screen, name, "Label"), ...box(screen + "/" + name, l, t, w, hh), set(screen + "/" + name, "Text", text), set(screen + "/" + name, "FontSize", String(size)), set(screen + "/" + name, "TextColor", colour)];
  if (weight) ops.push(set(screen + "/" + name, "FontWeight", weight));
  return ops;
};
const button = (screen, name, l, t, w, hh, text, fill) => [widget(screen, name, "Button"), ...box(screen + "/" + name, l, t, w, hh), set(screen + "/" + name, "Text", text), set(screen + "/" + name, "BackgroundColor", fill), set(screen + "/" + name, "TextColor", C.white), set(screen + "/" + name, "FontSize", "13")];

async function logic() {
  await netlogic("UI/MainWindow", "SmtLineLogic");
  for (const s of ["Line", "Alarms", "Programs", "Diagnostics"]) await netlogic("UI/Screens/" + s, "SmtCommands");
}

async function dialog(name, title, message, confirmText, confirmMethod, cancelText) {
  const D = "UI/Dialogs/" + name;
  await edit([{ op: "create_type", parent: "UI/Dialogs", name, base_type: "Dialog" }], name + " type").catch(async () => helm(name));
  async function helm() {}
  const ops = [];
  ops.push(...surface(D, "DlgSurface", 0, 0, 460, 240));
  ops.push(...label(D, "DlgTitle", 24, 24, 400, 30, title, 18, C.ink, "Bold"));
  ops.push(...label(D, "DlgMessage", 24, 64, 400, 70, message, 12, C.mute));
  ops.push(...button(D, "DlgCancel", 120, 176, 150, 44, cancelText, "#6B7280"));
  ops.push(...button(D, "DlgConfirm", 286, 176, 150, 44, confirmText, confirmText.includes("STOP") ? C.bad : C.teal));
  ops.push({ op: "reorder", path: D + "/DlgSurface", position: "back" });
  await edit(ops, name + " content");
  await netlogic(D, "SmtDialogCommands");
  const rel = (m) => D + "/SmtDialogCommands/" + m;
  await wire(D + "/DlgConfirm", "MouseClickEvent", rel(confirmMethod));
  await wire(D + "/DlgCancel", "MouseClickEvent", D + "/Close");
  console.log(name + " wired");
}

async function dialogs() {
  if (!(await exists("UI", "Dialogs"))) await edit([{ op: "create_folder", parent: "UI", name: "Dialogs" }], "dialogs folder");
  await dialog("ResetCounters", "Reset the shift counters?", "Good and rejected counts return to zero. The line keeps its program.", "RESET COUNTERS", "ConfirmResetCounters", "KEEP RUNNING");
  await dialog("EmergencyStop", "Trip the emergency stop?", "The line stops immediately and the E-STOP alarm latches until acknowledged.", "TRIP E-STOP", "ConfirmEmergencyStop", "CANCEL");
}

async function exists(parent, name) {
  const j = await (await fetch(BRIDGE + "/bridge/nodes?path=" + encodeURIComponent(parent))).json();
  return (j.children ?? []).some((c) => c.browse_name === name);
}

async function triggers() {
  const add = [];
  add.push({ op: "create_widget", screen: "UI/Screens/Line", name: "BtnTriggerReset", widget_type: "Button" });
  add.push(...box("UI/Screens/Line/BtnTriggerReset", 800, 620, 220, 44));
  add.push(set("UI/Screens/Line/BtnTriggerReset", "Text", "RESET COUNTERS"));
  await edit(add, "line trigger");
  await wireOpen("UI/Screens/Line/BtnTriggerReset", "UI/Dialogs/ResetCounters");
}

async function wiring() {
  await wire("UI/Screens/Line/BtnStart", "MouseClickEvent", "UI/Screens/Line/SmtCommands/StartLine");
  await wire("UI/Screens/Line/BtnStop", "MouseClickEvent", "UI/Screens/Line/SmtCommands/StopLine");
  await wire("UI/Screens/Line/BtnAck", "MouseClickEvent", "UI/Screens/Line/SmtCommands/AckAlarms");
  await wire("UI/Screens/Line/BtnSimFault", "MouseClickEvent", "UI/Screens/Line/SmtCommands/SimulateFault");
  await wire("UI/Screens/Alarms/BtnAckAll", "MouseClickEvent", "UI/Screens/Alarms/SmtCommands/AckAlarms");
  await wire("UI/Screens/Alarms/BtnFault", "MouseClickEvent", "UI/Screens/Alarms/SmtCommands/SimulateFault");
  await wire("UI/Screens/Programs/Prog1Btn", "MouseClickEvent", "UI/Screens/Programs/SmtCommands/SelectProgram1");
  await wire("UI/Screens/Programs/Prog2Btn", "MouseClickEvent", "UI/Screens/Programs/SmtCommands/SelectProgram2");
  await wire("UI/Screens/Programs/Prog3Btn", "MouseClickEvent", "UI/Screens/Programs/SmtCommands/SelectProgram3");
  await wire("UI/Screens/Diagnostics/BtnInjFault", "MouseClickEvent", "UI/Screens/Diagnostics/SmtCommands/SimulateFault");
  await wire("UI/Screens/Diagnostics/BtnInjAck", "MouseClickEvent", "UI/Screens/Diagnostics/SmtCommands/AckAlarms");
  await wireOpen("UI/Screens/Line/BtnEStop", "UI/Dialogs/EmergencyStop");
  await wireOpen("UI/Screens/Line/BtnReset", "UI/Dialogs/ResetCounters");
  await wireOpen("UI/Screens/Alarms/BtnEStop2", "UI/Dialogs/EmergencyStop");
  await wireOpen("UI/Screens/Diagnostics/BtnInjEStop", "UI/Dialogs/EmergencyStop");
  await wireOpen("UI/Screens/Diagnostics/BtnInjReset", "UI/Dialogs/ResetCounters");
}

const stages = { logic, dialogs, wiring, triggers };
for (const s of (stage === "all" ? Object.keys(stages) : stage.split(","))) await stages[s]();
console.log("done");