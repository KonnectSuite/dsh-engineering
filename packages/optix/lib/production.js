/**
 * Production readiness checks over a whole Optix project.
 *
 * `design.js` answers "does this screen hold up on its own". This module answers
 * the questions a commissioning engineer asks before a project is released, and
 * every rule here comes from a failure that was measured on the live bridge
 * rather than from taste:
 *
 * - `OPTIX-PROD-01` an event handler whose `ObjectPointer` still holds an
 *   ABSOLUTE design-time NodeId. The runtime instantiates UI objects per session
 *   (`Root/Objects/<project>/UI/<engine>/Sessions/<id>/UIRoot/...`), so the call
 *   resolves against the design-time object and the runtime answers
 *   "No behaviour or observer found that handles the method ...". Measured on
 *   Studio 1.8.1, bridge 1.0.9 (2026-11-14): the click is delivered and the
 *   navigation does nothing.
 * - `OPTIX-PROD-02` a handler that points nowhere: a navigation target that is
 *   not a screen in this project, or a method-mode pointer with neither an
 *   absolute reference nor a dynamic link.
 * - `OPTIX-PROD-03` a screen the operator cannot reach from the panel the
 *   `PanelLoader` starts on. Dead screens are shipped screens.
 * - `OPTIX-PROD-04` presentation engines that are still on engineering defaults:
 *   an anonymous starting user, or the stock style sheet while the project
 *   carries an application style sheet.
 * - `OPTIX-PROD-05` a screen that lives outside the project's screen folder, so
 *   the navigation graph and the documentation cannot find it.
 *
 * Every finding carries the node path and a `fix` sentence, so a reviewer can act
 * without re-deriving the cause. `verdict` is the release gate: `not_ready` when a
 * critical rule fires, `review` when a warning does, otherwise `ready`.
 *
 * @module dsh-tool-ft-optix/production
 */

/** The project tree prefix every absolute design-time reference carries. */
const ABSOLUTE_PREFIX = /^Root\/Objects\//u;

/** Builtin singletons live under the same root but resolve in every session. */
const BUILTIN_PREFIX = /^Root\/Objects\/Commands\//u;

/** An engine that still starts the anonymous user. */
const ANONYMOUS_USER = /\/Anonymous$/u;

/** The style sheet Studio writes into a new project. */
const DEFAULT_STYLE_SHEET = /\/DefaultStyleSheet$/u;

/**
 * Walk a bridge `map` tree, calling back with every node and its path.
 *
 * The bridge nests children under `children` and reports a type as `type` or, for
 * a collection, as `coll`. Properties are UAVariable children; they are skipped
 * as nodes because they describe their parent.
 *
 * @param root - The `map` node the bridge returned.
 * @param rootPath - The path of that node.
 * @param visit - `(node, path)` called for the root and for every widget below it.
 */
export function walkTree(root, rootPath, visit) {
	const step = (entry, path) => {
		visit(entry, path);
		for (const child of entry.children ?? []) {
			if ((child.type ?? "") === "UAVariable") continue;
			step(child, `${path}/${child.name}`);
		}
	};
	step(root, rootPath);
}

/** The `ObjectPointer` child of a handler container, if the tree carries one. */
function objectPointerOf(handler) {
	const containers = (handler.children ?? []).find((child) => child.name === "MethodsToCall");
	const container = (containers?.children ?? []).find((child) => child.name === "MethodContainer1");
	return (container?.children ?? []).find((child) => child.name === "ObjectPointer");
}

/**
 * Read the pointer facts out of a handler node as the bridge tree reports them.
 *
 * @param handler - The `EventHandler` node from the map tree.
 * @returns `{ ref, link, hasKind }` plus the flags the rules need.
 */
export function pointerFacts(handler) {
	const pointer = objectPointerOf(handler);
	if (pointer === void 0) return { present: false, absolute: false, linked: false, ref: undefined };
	const ref = typeof pointer.ref === "string" ? pointer.ref : undefined;
	const names = (pointer.children ?? []).map((child) => child.name);
	return {
		present: true,
		ref,
		// A relative path survives the session boundary; an absolute design-tree id does not.
		absolute: ref !== undefined && ABSOLUTE_PREFIX.test(ref) && !BUILTIN_PREFIX.test(ref),
		builtin: ref !== undefined && BUILTIN_PREFIX.test(ref),
		linked: names.includes("DynamicLink"),
		hasKind: names.includes("Kind")
	};
}

/**
 * Reachable screen paths from one start target, following navigation edges.
 *
 * `shared` carries the shell bar's targets: the bar sits in the start window beside the
 * loader, so it is on screen whatever panel is showing and every reachable screen inherits
 * those edges. Without it a shell-navigated application reports each screen as dead weight.
 */
export function reachableScreens(start, edges, shared = []) {
	const reached = new Set();
	if (start === void 0 || start === "") return reached;
	const queue = [start];
	while (queue.length > 0) {
		const current = queue.shift();
		if (reached.has(current)) continue;
		reached.add(current);
		for (const next of [...edges.get(current) ?? [], ...shared]) {
			if (!reached.has(next)) queue.push(next);
		}
	}
	return reached;
}

/** Strip the `Root/Objects/<project>/` prefix the bridge reports for a model node. */
function projectPath(ref) {
	if (ref === undefined) return undefined;
	// Three shapes reach the rules: the bridge's `Root/Objects/<project>/UI/...`, the projected
	// `/Objects/<project>/UI/...` a saved `NewPanel` argument carries, and a plain project path
	// such as `UI/Screens/LineOverview` (what the tree walk yields). All three compare by the
	// project-relative tail.
	const match = /^(?:Root\/Objects|\/Objects|Objects)\/([^/]+)\/(.+)$/u.exec(ref);
	if (match !== null) return match[2];
	return ref.replace(/^\//u, "");
}

/**
 * Run the production checks.
 *
 * @param input - Everything the tool read from the bridge:
 *   `projectName` (the live project's browse name), `screensFolder`,
 *   `screens` (paths and names), `handlers` (`{ path, owner, screen, pointer,
 *   method, target }` where `pointer` comes from {@link pointerFacts}),
 *   `engines` (`{ path, styleSheet, startingUser }`), `startTarget` (the path the
 *   window's mounter shows at start — a `PanelLoader`'s `Panel` or the first item of a
 *   `NavigationPanel`), `mountedPanels` (project-relative screen paths the shell mounts
 *   through NodePointers rather than handlers) and `hasApplicationStyleSheet`.
 * @returns `{ verdict, counts, findings, coverage }`.
 */
export function productionFindings(input) {
	const findings = [];
	const coverage = [];
	const screensFolder = input.screensFolder ?? "UI/Screens";
	const screens = new Map((input.screens ?? []).map((screen) => [screen.path, screen]));

	// OPTIX-PROD-01: a handler that still names a design-time object.
	for (const handler of input.handlers ?? []) {
		if (handler.pointer?.absolute !== true) continue;
		findings.push({
			rule: "OPTIX-PROD-01",
			severity: "critical",
			message: `${handler.owner} calls ${handler.method ?? "a method"} through the absolute design-time pointer ${handler.pointer.ref}; the runtime instantiates UI objects per session, so the click is delivered and nothing switches.`,
			fix: "Re-wire the handler with a path relative to the button (optix_edit wire_event with object_raw) and clear the pointer's absolute value; optix_production_check with repair:true does both for every handler it reports.",
			evidence: {
				path: handler.path,
				owner: handler.path.replace(/\/EH_[^/]+$/u, ""),
				pointer: handler.pointer.ref,
				method: handler.method
			}
		});
	}

	// OPTIX-PROD-02: a handler that points nowhere.
	//
	// The bridge does not expose the `Method` value of a handler, so navigation is recognised
	// from the argument that names a panel: a `NewPanel` whose value is a screen path. That is
	// what both `ChangePanel` and a generated shell bar carry, and it needs no method name.
	const isScreenPath = (path) => path !== undefined && path.startsWith(`${screensFolder}/`);
	const navigationEdges = new Map();
	for (const handler of input.handlers ?? []) {
		const target = handler.target === void 0 ? undefined : projectPath(handler.target);
		if (handler.pointer?.present === true && handler.pointer.ref === undefined && handler.pointer.linked !== true) findings.push({
			rule: "OPTIX-PROD-02",
			severity: "critical",
			message: `${handler.owner} carries a handler with neither an object reference nor a dynamic link, so the call cannot resolve at all.`,
			fix: "Delete the handler and wire it again with optix_edit wire_event, passing object_raw for a relative target.",
			evidence: {
				path: handler.path,
				method: handler.method
			}
		});
		if (!isScreenPath(target)) continue;
		if (!screens.has(target)) findings.push({
			rule: "OPTIX-PROD-02",
			severity: "critical",
			message: `${handler.owner} switches to ${target}, which is not a screen in this project; the button is dead at runtime.`,
			fix: "Create the missing screen or point the handler at an existing one.",
			evidence: {
				path: handler.path,
				target
			}
		});
		else {
			const owners = navigationEdges.get(handler.screen) ?? new Set();
			owners.add(target);
			navigationEdges.set(handler.screen, owners);
		}
	}

	// OPTIX-PROD-03: a screen the operator cannot reach.
	const start = projectPath(input.startTarget);
	if (start === undefined) coverage.push("the start window reports no start panel, so reachability was not checked");
	else {
		const edges = new Map();
		for (const [from, to] of navigationEdges) edges.set(from, [...to]);
		const shellPrefix = input.shellPath === void 0 ? void 0 : `${input.shellPath}/`;
		// Two shapes carry a shell's navigation and both count. Buttons wired by an event handler are read
		// from the handler list. A native NavigationPanel wires its items with a `Panel` NodePointer and no
		// handler at all, so the tool hands those targets in as `mountedPanels`; without them an application
		// navigated by a NavigationPanel reported every screen its rail opens as dead weight (measured
		// 2026-11-17 on the rebuilt SMT demo, whose rail mounts three screens and has no PanelLoader).
		const fromHandlers = shellPrefix === void 0 ? [] : (input.handlers ?? [])
			.filter((handler) => handler.owner.startsWith(shellPrefix) && isScreenPath(projectPath(handler.target)))
			.map((handler) => projectPath(handler.target));
		const shared = [...new Set([...fromHandlers, ...(input.mountedPanels ?? [])])]
			.filter((path) => path !== undefined && screens.has(path));
		const reached = reachableScreens(start, edges, shared);
		if (shared.length > 0) coverage.push(`the shell in ${input.shellPath ?? "the start window"} offers ${shared.length} screen(s) on every panel`);
		for (const screen of screens.values()) {
			if (reached.has(screen.path)) continue;
			findings.push({
				rule: "OPTIX-PROD-03",
				severity: "warning",
				message: `${screen.name} cannot be reached from ${start}; a shipped screen the operator cannot open is dead weight.`,
				fix: "Add it to the shell navigation bar, or delete the screen if it is not part of the application.",
				evidence: {
					path: screen.path,
					start
				}
			});
		}
		coverage.push(`reachability walked ${reached.size} screen(s) from ${start}`);
	}

	// OPTIX-PROD-04: engines still on engineering defaults.
	for (const engine of input.engines ?? []) {
		const startingUser = engine.startingUser ?? "";
		// A project user reports as a project path; the stock engine reports a built-in node id
		// (`2/46` on Studio 1.8.1, surfaced as `#2/46` when the tree cannot resolve it), which is
		// the anonymous user a commissioning engineer has to accept or replace deliberately.
		const outsideProject = ANONYMOUS_USER.test(startingUser) || startingUser === "" || startingUser.startsWith("#") || /^\d+\/\d+$/u.test(startingUser);
		if (outsideProject) findings.push({
			rule: "OPTIX-PROD-04",
			severity: "warning",
			message: `${engine.path} starts ${startingUser === "" ? "no starting user" : `the built-in user ${startingUser}`}; nothing ties that to a project account, so every web client shares it.`,
			fix: "Set StartingUser to a project user, or record why anonymous access is the intended production policy.",
			evidence: {
				path: engine.path,
				starting_user: startingUser
			}
		});
		if (input.hasApplicationStyleSheet === true && DEFAULT_STYLE_SHEET.test(engine.styleSheet ?? "")) findings.push({
			rule: "OPTIX-PROD-04",
			severity: "info",
			message: `${engine.path} still uses ${engine.styleSheet} while the project carries its own style sheet.`,
			fix: "Point the engine's StyleSheet at the application style sheet so both presentation engines agree.",
			evidence: {
				path: engine.path,
				style_sheet: engine.styleSheet
			}
		});
	}

	// OPTIX-PROD-05: a screen that lives outside the screen folder.
	for (const screen of screens.values()) {
		if (screen.path.startsWith(`${screensFolder}/`)) continue;
		findings.push({
			rule: "OPTIX-PROD-05",
			severity: "info",
			message: `${screen.name} lives at ${screen.path}, outside ${screensFolder}, so neither the navigation graph nor the documentation index finds it by convention.`,
			fix: `Recreate the screen under ${screensFolder}.`,
			evidence: {
				path: screen.path,
				folder: screensFolder
			}
		});
	}

	const critical = findings.filter((finding) => finding.severity === "critical").length;
	const warning = findings.filter((finding) => finding.severity === "warning").length;
	const info = findings.filter((finding) => finding.severity === "info").length;
	return {
		verdict: critical > 0 ? "not_ready" : warning > 0 ? "review" : "ready",
		counts: {
			critical,
			warning,
			info,
			screens: screens.size,
			handlers: (input.handlers ?? []).length
		},
		findings,
		coverage
	};
}
