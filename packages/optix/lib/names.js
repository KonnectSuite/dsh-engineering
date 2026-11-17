/**
 * The names a project must not give one of its own types.
 * @module dsh-tool-ft-optix/names
 *
 * Studio generates one **global-namespace** C# class per project UI type into
 * `ProjectFiles/NetSolution/Private/UITypeDefinitions.cs`: every Screen, Panel, Window, Dialog and Popup
 * in the project becomes `public class <BrowseName> : FTOptix.UI.<Kind>` with a `[MapType]` attribute.
 * Those generated classes sit in the global namespace, so a project type whose BrowseName equals a
 * built-in type name **shadows that built-in for every NetLogic in the project**.
 *
 * Measured 2026-11-17 on AryaSMTLineDemo (Studio 1.8.1.27): a screen drafted as `UI/Screens/Trend`
 * generated `public class Trend : FTOptix.UI.Screen`. The shipped `Widgets/AdvancedTrend` brought its own
 * `TrendPensLogic.cs`, which declares `private Trend myTrend;` unqualified under `using FTOptix.UI;`, so
 * the field bound to the generated Screen subclass and the solution failed with
 * `error CS0029: Cannot implicitly convert type 'FTOptix.UI.Trend' to 'Trend'` plus four
 * `error CS1061: 'Trend' does not contain a definition for 'Pens'`. Nothing in the project compiled -
 * including the project's own NetLogic - and neither `optix_library import` nor the screen emitters
 * checked the name. Renaming the screen to `TrendView` cleared all five errors and Studio's own build
 * produced the assembly again.
 *
 * Two halves, deliberately:
 * - `typeBearingCreateRefusal` stops an authoring batch before it writes the colliding type.
 * - `parseGeneratedTypes` + `typeCollisions` read what is already on disk, which is the complete net:
 *   a collision can arrive from a template-library import or from Studio's own generation, not only from
 *   an op this plugin sent.
 */
import { typeInfo, typeNames } from "./schema.js";

/**
 * The `create_widget` kinds that produce a project **type** rather than an instance of a built-in type,
 * which are the kinds Studio generates a class for. Measured: `create_widget {screen:"UI/Screens",
 * name:"TrendView", widget_type:"Screen"}` reports `kind "objecttype"`, `node_class ObjectType`, while
 * `widget_type:"ScaleLayout"` under that screen reports `node_class Object` and generates no class.
 */
export const TYPE_BEARING_WIDGETS = new Set([
	"Screen", "ScreenType",
	"Panel", "PanelType",
	"Window", "WindowType",
	"Dialog", "DialogType",
	"Popup", "PopupType"
]);

/**
 * Why an authoring operation would name a project type after a built-in type, or undefined when it would not.
 *
 * Only type-creating operations are refused: an *instance* named `Trend` generates no class and shadows
 * nothing, and refusing it would block a perfectly ordinary node name.
 * @param op - One operation from an `optix_edit` batch.
 * @param known - Type names to collide against; defaults to the shipped catalog.
 * @returns A refusal sentence, or undefined.
 */
export function typeBearingCreateRefusal(op, known = typeNames()) {
	if (op === null || typeof op !== "object") return undefined;
	const name = typeof op.name === "string" ? op.name.trim() : "";
	if (name === "") return undefined;
	const createsType = op.op === "create_type"
		|| (op.op === "create_widget" && TYPE_BEARING_WIDGETS.has(String(op.widget_type ?? "")));
	if (!createsType) return undefined;
	const clash = known.find((entry) => entry === name);
	if (clash === undefined) return undefined;
	const clr = typeClr(name);
	return `create ${op.op} names the project type "${name}", which is a ${op.op === "create_type" ? "type" : "UI container"} Studio generates a global-namespace class for: it would shadow ${clr ?? `the built-in type ${name}`} in every NetLogic in the project (measured: a screen named Trend broke the shipped AdvancedTrend's own logic with CS0029 and four CS1061). Give the project type a name that is not a built-in type name - TrendView, LineTrend - and keep the built-in name free.`;
}

/** The CLR spelling of a catalog type, when the catalog knows it. */
function typeClr(name) {
	const entry = typeInfo(name);
	return entry?.clr ?? entry?.clrType;
}

/**
 * The classes a generated `Private/UITypeDefinitions.cs` declares.
 * @param text - The file's contents.
 * @returns Rows of `{ name, base_type }`, in file order.
 */
export function parseGeneratedTypes(text) {
	return [...String(text).matchAll(/public class (\w+) : ([^\r\n{]+)/gu)].map((match) => ({
		name: match[1],
		base_type: match[2].trim()
	}));
}

/**
 * Which generated project types shadow a built-in type, and which names Studio generated twice.
 *
 * A duplicate is the other half of the same hazard: importing a template library whose panel is named
 * like a screen the project already has asks the compiler for two classes with one name.
 * @param generated - Rows from `parseGeneratedTypes`.
 * @param known - Type names to collide against; defaults to the shipped catalog.
 * @returns `{ generated, collisions, duplicates }`.
 */
export function typeCollisions(generated, known = typeNames()) {
	const knownSet = new Set(known);
	const collisions = generated
		.filter((entry) => knownSet.has(entry.name))
		.map((entry) => ({
			name: entry.name,
			generated_as: entry.base_type,
			shadows: typeClr(entry.name) ?? entry.name
		}));
	const seen = new Map();
	for (const entry of generated) seen.set(entry.name, (seen.get(entry.name) ?? 0) + 1);
	const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count }));
	return { generated: generated.length, collisions, duplicates };
}
