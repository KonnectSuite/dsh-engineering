import assert from "node:assert/strict";
import test from "node:test";
import { DIALOG_KINDS, DialogError, dialogPlan } from "../packages/optix/lib/dialogs.js";

const base = {
	name: "ConfirmDelete",
	kind: "confirm",
	title: "Delete recipe?",
	message: "The recipe is removed from this machine.",
	confirmLabel: "Delete",
	cancelLabel: "Keep"
};

test("dialogPlan opens through UICommands.OpenDialog and closes through the dialog's own Close", () => {
	const plan = dialogPlan({ ...base, project: "LineHMI" });
	assert.deepEqual(plan.phases.map((phase) => phase.name), ["folder", "type", "content", "wire"]);
	assert.deepEqual(plan.phases[0].ops, [{ op: "create_folder", parent: "UI", name: "Dialogs" }]);
	assert.ok(plan.phases[1].ops.some((op) => op.op === "create_type" && op.parent === "UI/Dialogs" && op.name === "ConfirmDelete" && op.base_type === "Dialog"));
	assert.equal(plan.phases[1].ops.some((op) => op.op === "create_widget"), false);
	// Modal, so an operator cannot click the screen behind the question.
	assert.ok(plan.phases[1].ops.some((op) => op.path === "UI/Dialogs/ConfirmDelete" && op.name === "Modal" && op.value === "1"));
	// The two buttons close the dialog through the UI command, with no NetLogic in between.
	const wires = plan.phases[3].ops;
	assert.equal(wires.length, 2);
	for (const wire of wires) {
		assert.equal(wire.op, "wire_event");
		assert.equal(wire.event_type, "MouseClickEvent");
		assert.equal(wire.method_path, "UI/Dialogs/ConfirmDelete/Close");
		assert.match(wire.path, /Dlg(Cancel|Confirm)$/u);
	}
	assert.deepEqual(plan.buttons.map((button) => button.label), ["Keep", "Delete"]);
	assert.equal(plan.counts.ops, plan.phases.reduce((total, phase) => total + phase.ops.length, 0));
});

test("dialogPlan places the buttons inside the dialog, cancel before confirm", () => {
	const plan = dialogPlan({ ...base, width: 500, height: 300 });
	const boxes = (name) => {
		const ops = plan.phases[2].ops.filter((op) => op.path === `UI/Dialogs/ConfirmDelete/${name}` && op.op === "set_property");
		const read = (property) => Number(ops.find((op) => op.name === property)?.value);
		return { left: read("LeftMargin"), top: read("TopMargin"), width: read("Width"), height: read("Height") };
	};
	const cancel = boxes("DlgCancel");
	const confirm = boxes("DlgConfirm");
	assert.ok(cancel.left > 0 && confirm.left > cancel.left);
	assert.equal(cancel.top, confirm.top);
	assert.equal(cancel.width, confirm.width);
	// The last button ends one padding unit from the right edge, and both sit above the bottom edge.
	assert.equal(confirm.left + confirm.width, 500 - 20);
	assert.equal(confirm.top + confirm.height, 300 - 20);
});

test("dialogPlan writes a message dialog with a single closing button", () => {
	const plan = dialogPlan({ name: "MachineFaulted", kind: "message", title: "Machine faulted", message: "Call maintenance." });
	assert.deepEqual(plan.buttons.map((button) => button.name), ["DlgClose"]);
	assert.deepEqual(plan.buttons.map((button) => button.label), ["Close"]);
	assert.deepEqual(plan.phases.map((phase) => phase.name), ["folder", "type", "content", "wire"]);
});

test("dialogPlan accepts a faceplate and refuses what cannot be one", () => {
	const plan = dialogPlan({ name: "OvenFaceplate", kind: "faceplate", width: 720, height: 480 });
	assert.equal(plan.kind, "faceplate");
	assert.deepEqual(DIALOG_KINDS, ["confirm", "message", "faceplate"]);
	const refused = [
		[{ name: "" }, "dialog_no_name"],
		[{ name: "2 bad name" }, "dialog_bad_name"],
		[{ name: "X", kind: "popup" }, "dialog_unknown_kind"],
		[{ name: "X", parent: "" }, "dialog_no_parent"],
		[{ name: "X", width: 300 }, "dialog_too_narrow"],
		[{ name: "X", height: 120 }, "dialog_too_short"]
	];
	for (const [options, code] of refused) {
		assert.throws(() => dialogPlan(options), (error) => error instanceof DialogError && error.code === code);
	}
});

test("dialogPlan derives a readable title from the type name", () => {
	const plan = dialogPlan({ name: "ConfirmDeleteRecipe" });
	assert.equal(plan.title, "Confirm Delete Recipe");
});

test("dialogPlan adds the trigger phase when a screen button opens the dialog", () => {
	const plan = dialogPlan({ ...base, project: "LineHMI", triggerScreen: "UI/Screens/Recipes", triggerName: "BtnDelete" });
	assert.deepEqual(plan.phases.map((phase) => phase.name), ["folder", "type", "content", "wire", "trigger"]);
	const trigger = plan.phases[4].ops;
	assert.deepEqual(trigger[0], { op: "create_widget", screen: "UI/Screens/Recipes", name: "BtnDelete", widget_type: "Button" });
	const wire = trigger.at(-1);
	assert.equal(wire.op, "wire_event");
	assert.equal(wire.command, "OpenDialog");
	assert.equal(wire.args, "Dialog=UI/Dialogs/ConfirmDelete;AliasNode=;ParentItem=");
});

test("dialogPlan restates what an earlier apply left behind", () => {
	const plan = dialogPlan({ ...base, project: "LineHMI", folderExists: true, typeExists: true, existingChildren: ["DlgSurface", "DlgTitle", "DlgMessage", "DlgCancel", "DlgConfirm"], triggerScreen: "UI/Screens/Home", triggerName: "BtnOpen", triggerExists: true });
	assert.deepEqual(plan.phases[0].ops, []);
	assert.deepEqual(plan.phases[1].ops.filter((op) => op.op === "create_type"), []);
	// A second apply restates text and geometry only: creating what the first apply made is `already_exists`.
	assert.deepEqual(plan.phases[2].ops.filter((op) => op.op === "create_widget"), []);
	assert.deepEqual(plan.phases[3].ops, []);
	// Restating also pushes the surface behind the text it belongs to, so a reorder is expected.
	assert.ok(plan.phases[2].ops.every((op) => op.op === "set_property" || op.op === "reorder"));
	assert.ok(plan.phases[2].ops.some((op) => op.name === "Text" && op.value.includes("Delete recipe?")));
	// An existing trigger is neither created nor rewired a second time, so its phase is absent.
	assert.equal(plan.phases.find((phase) => phase.name === "trigger"), void 0);
});

test("dialogPlan completes a dialog whose children are missing", () => {
	// A type kept from an earlier session can have lost its children: the plan creates only the missing ones.
	const plan = dialogPlan({ ...base, folderExists: true, typeExists: true, existingChildren: ["DlgTitle", "DlgCancel"] });
	const creates = plan.phases[2].ops.filter((op) => op.op === "create_widget").map((op) => op.name);
	assert.deepEqual(creates, ["DlgSurface", "DlgMessage", "DlgConfirm"]);
	assert.deepEqual(plan.phases[3].ops.filter((op) => op.op === "wire_event").map((op) => op.path), ["UI/Dialogs/ConfirmDelete/DlgConfirm"]);
});

test("dialogPlan refuses a trigger it cannot address", () => {
	assert.throws(
		() => dialogPlan({ ...base, triggerScreen: "UI/Screens/Recipes" }),
		(error) => error instanceof DialogError && error.code === "dialog_incomplete_trigger"
	);
	assert.throws(
		() => dialogPlan({ ...base, triggerScreen: "UI/Screens/Recipes", triggerName: "BtnDelete" }),
		(error) => error instanceof DialogError && error.code === "dialog_no_project"
	);
});
