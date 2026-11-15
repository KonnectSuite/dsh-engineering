/**
 * Dialogs: the popups an operator answers, wired through the commands Studio already ships.
 *
 * A destructive command with no confirmation is a defect, and a message that replaces the whole screen
 * is a worse one. Optix has both patterns natively: a `Dialog` object type is a screen-shaped node the
 * runtime can open over the current screen, and `/Objects/Commands/UICommands` carries `OpenDialog`
 * (arguments `Dialog`, `AliasNode`, `ParentItem`) and `CloseDialog` (no argument). The bridge already
 * serves those two commands through `wire_event`, so a dialog needs no NetLogic to open and close.
 *
 * Three shapes cover the requests an HMI actually gets:
 *
 * - `confirm` - a question with a confirm and a cancel button, used before a destructive command;
 * - `message` - a titled explanation with one closing button;
 * - `faceplate` - a wider popup that carries the controls of one equipment item.
 *
 * The plan is **phased** for the same measured reasons as the theme and the shell: a `Dialog` object
 * does not exist while its children are validated, and a `NodeId` value is accepted only in the
 * project-relative spelling with the write going on the pointer's `Value` child.
 *
 * @module
 */

/** The dialog shapes this module knows. */
export const DIALOG_KINDS = Object.freeze(["confirm", "message", "faceplate"]);

/** Where dialogs live by default. */
export const DIALOG_FOLDER = "UI/Dialogs";

/** Padding inside a dialog, in pixels. */
const PAD = 20;

/** Title band height, in pixels. */
const TITLE_HEIGHT = 36;

/** Button height, in pixels. */
const BUTTON_HEIGHT = 40;

/** Button width, in pixels. */
const BUTTON_WIDTH = 120;

/** The narrowest dialog that still fits a message and two buttons. */
export const DIALOG_MIN_WIDTH = 360;

/**
 * A dialog problem the caller can explain to the engineer.
 */
export class DialogError extends Error {
	/**
	 * @param code - A stable machine-readable code.
	 * @param message - A sentence naming the fix.
	 */
	constructor(code, message) {
		super(message);
		this.name = "DialogError";
		this.code = code;
	}
}

/**
 * The `LocalizedText` JSON Studio writes for a label.
 *
 * @param value - The text.
 * @returns The JSON string Studio persists.
 */
function textOf(value) {
	return JSON.stringify({ LocaleId: "en-US", Text: String(value ?? "") });
}

/**
 * A `Size` value as Studio writes it.
 *
 * @param value - The number.
 * @returns The decimal string.
 */
function size(value) {
	return `${Number(value).toFixed(1)}`;
}

/**
 * One box property set.
 *
 * @param path - The node path.
 * @param slot - `{left, top, width, height}`.
 * @returns The four `set_property` operations.
 */
function box(path, slot) {
	return [
		{ op: "set_property", path, name: "LeftMargin", value: size(slot.left) },
		{ op: "set_property", path, name: "TopMargin", value: size(slot.top) },
		{ op: "set_property", path, name: "Width", value: size(slot.width) },
		{ op: "set_property", path, name: "Height", value: size(slot.height) }
	];
}

/**
 * Plan one dialog.
 *
 * @param options - `{name, kind, parent, title, message, confirmLabel, cancelLabel, destructive,
 *   triggerScreen, triggerName, project, width, height, language, folderExists, typeExists,
 *   triggerExists}`. `triggerScreen`/`triggerName` add a button on that screen which opens the dialog,
 *   and `project` is the project name the `OpenDialog` argument names.
 * @returns `{name, kind, parent, path, width, height, title, message, buttons, phases, ops, counts,
 *   exists}`.
 * @throws {DialogError} when the name, kind or geometry cannot make a dialog.
 */
export function dialogPlan({ name, kind = "confirm", parent = DIALOG_FOLDER, title = "", message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false, triggerScreen = "", triggerName = "", project = "", width = 460, height = 240, language = "modern", folderExists = false, typeExists = false, triggerExists = false } = {}) {
	const identifier = String(name ?? "").trim();
	if (identifier === "") throw new DialogError("dialog_no_name", 'a dialog needs a name: the object type an operator opens, such as "ConfirmDelete"');
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) throw new DialogError("dialog_bad_name", `"${identifier}" is not a Logix identifier: letters, digits and underscores, starting with a letter`);
	if (!DIALOG_KINDS.includes(kind)) throw new DialogError("dialog_unknown_kind", `"${kind}" is not a dialog shape: use ${DIALOG_KINDS.join(", ")}`);
	const folder = String(parent ?? "").trim().replace(/\/+$/u, "");
	if (folder === "") throw new DialogError("dialog_no_parent", "a dialog needs a parent folder, such as UI/Dialogs");
	const dialogWidth = Number(width);
	const dialogHeight = Number(height);
	if (!Number.isFinite(dialogWidth) || dialogWidth < DIALOG_MIN_WIDTH) throw new DialogError("dialog_too_narrow", `a dialog needs at least ${DIALOG_MIN_WIDTH} px of width; ${String(width)} was asked for`);
	if (!Number.isFinite(dialogHeight) || dialogHeight < 160) throw new DialogError("dialog_too_short", `a dialog needs at least 160 px of height; ${String(height)} was asked for`);
	const dialogTitle = String(title ?? "").trim() === "" ? identifier.replace(/([a-z0-9])([A-Z])/gu, "$1 $2") : String(title).trim();
	const dialogMessage = String(message ?? "").trim();
	const path = `${folder}/${identifier}`;
	const folderName = folder.split("/").at(-1) ?? folder;
	const folderParent = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "";

	const folderOps = [];
	if (!folderExists) {
		if (folderParent === "") throw new DialogError("dialog_no_parent", `"${folder}" is a top-level folder; name the folder the dialogs live in, such as UI/Dialogs`);
		folderOps.push({ op: "create_folder", parent: folderParent, name: folderName });
	}
	const typeOps = [];
	if (!typeExists) typeOps.push({ op: "create_type", parent: folder, name: identifier, base_type: "Dialog" });
	typeOps.push({ op: "set_property", path, name: "Width", value: size(dialogWidth) });
	typeOps.push({ op: "set_property", path, name: "Height", value: size(dialogHeight) });
	typeOps.push({ op: "set_property", path, name: "Modal", value: "1" });

	const buttons = [];
	const content = [];
	const wire = [];
	// A second apply must not create what the first one made: `create_widget` on an existing name is refused
	// as `already_exists`, so an existing dialog is restated (text, boxes, geometry) and left unwired.
	const createChildren = !typeExists;
	const titlePath = `${path}/DlgTitle`;
	if (createChildren) content.push({ op: "create_widget", screen: path, name: "DlgTitle", widget_type: "Label" });
	content.push({ op: "set_property", path: titlePath, name: "Text", value: textOf(dialogTitle) });
	content.push(...box(titlePath, { left: PAD, top: PAD, width: dialogWidth - 2 * PAD, height: TITLE_HEIGHT }));

	const messagePath = `${path}/DlgMessage`;
	if (dialogMessage !== "") {
		if (createChildren) content.push({ op: "create_widget", screen: path, name: "DlgMessage", widget_type: "Label" });
		content.push({ op: "set_property", path: messagePath, name: "Text", value: textOf(dialogMessage) });
		content.push({ op: "set_property", path: messagePath, name: "WordWrap", value: "1" });
		content.push(...box(messagePath, { left: PAD, top: PAD + TITLE_HEIGHT + 8, width: dialogWidth - 2 * PAD, height: dialogHeight - PAD * 2 - TITLE_HEIGHT - BUTTON_HEIGHT - 24 }));
	}

	const buttonTop = dialogHeight - PAD - BUTTON_HEIGHT;
	const labels = kind === "message" ? [{ key: "DlgClose", label: confirmLabel === "Confirm" ? "Close" : confirmLabel }] : [{ key: "DlgCancel", label: cancelLabel }, { key: "DlgConfirm", label: confirmLabel }];
	labels.forEach((entry, index) => {
		const left = dialogWidth - PAD - BUTTON_WIDTH * (labels.length - index);
		buttons.push({ name: entry.key, label: entry.label, path: `${path}/${entry.key}`, confirm: entry.key === "DlgConfirm" });
		if (createChildren) content.push({ op: "create_widget", screen: path, name: entry.key, widget_type: "Button" });
		content.push({ op: "set_property", path: `${path}/${entry.key}`, name: "Text", value: textOf(entry.label) });
		content.push(...box(`${path}/${entry.key}`, { left, top: buttonTop, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }));
		// Studio's own UI command closes a dialog; no NetLogic and no absolute pointer is involved.
		if (createChildren) wire.push({ op: "wire_event", path: `${path}/${entry.key}`, event_type: "MouseClickEvent", command: "CloseDialog" });
	});

	const triggerOps = [];
	if (String(triggerScreen ?? "").trim() !== "" || String(triggerName ?? "").trim() !== "") {
		const screen = String(triggerScreen ?? "").trim();
		const trigger = String(triggerName ?? "").trim();
		if (screen === "" || trigger === "") throw new DialogError("dialog_incomplete_trigger", "a trigger needs both trigger_screen (where the button sits) and trigger_name (what the button is called)");
		const projectName = String(project ?? "").trim();
		if (projectName === "") throw new DialogError("dialog_no_project", "a trigger needs the project name: the OpenDialog argument names the dialog by its /Objects/<Project>/… path");
		if (!triggerExists) {
			triggerOps.push({ op: "create_widget", screen, name: trigger, widget_type: "Button" });
			triggerOps.push({ op: "set_property", path: `${screen}/${trigger}`, name: "Text", value: textOf(dialogTitle) });
			triggerOps.push({ op: "wire_event", path: `${screen}/${trigger}`, event_type: "MouseClickEvent", command: "OpenDialog", args: `Dialog=/Objects/${projectName}/${path};AliasNode=` });
		}
	}

	const phases = [
		{ name: "folder", ops: folderOps },
		{ name: "type", ops: typeOps, after_folder: true },
		{ name: "content", ops: content, after_type: true },
		{ name: "wire", ops: wire, after_content: true }
	];
	if (triggerOps.length > 0) phases.push({ name: "trigger", ops: triggerOps, after_wire: true });
	return {
		name: identifier,
		kind,
		parent: folder,
		path,
		width: dialogWidth,
		height: dialogHeight,
		title: dialogTitle,
		message: dialogMessage,
		destructive: Boolean(destructive),
		language,
		buttons,
		exists: { folder: folderExists, type: typeExists, trigger: triggerExists },
		phases,
		ops: phases.flatMap((phase) => phase.ops),
		counts: {
			ops: phases.reduce((total, phase) => total + phase.ops.length, 0),
			...Object.fromEntries(phases.map((phase) => [phase.name, phase.ops.length]))
		}
	};
}
