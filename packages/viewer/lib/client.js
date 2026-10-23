window.__ModuleLoader__.load({
	id: "dsh-engineering-l5x-viewer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region ../../util/workspace-path/lib/index.js
		/**
		* The `dsh-resource://file/…` address grammar: how a file is named across the
		* Sidebar and the resource model, built and parsed without touching a
		* filesystem.
		* @module
		*/
		/** The scheme and type every file address opens with. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Component-encode one id or path segment, keeping `:` literal for drive letters. */
		function encodeSegment(segment) {
			return encodeURIComponent(segment).replace(/%3A/gi, ":");
		}
		/** Encode a `/`-separated path segment by segment. */
		function encodePath(path) {
			return path.split("/").map(encodeSegment).join("/");
		}
		/** Whether a decoded first path segment is a Windows drive (`C:`). */
		function isDriveSegment(segment) {
			return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
		}
		/**
		* Build the address of a file read through one Session.
		* @param sessionId - the Session whose Host workspace resolves the path.
		* @param path - absolute or workspace-relative path; backslashes are normalized to `/`, and leading `./` prefixes are dropped.
		* @returns the `dsh-resource://file/session/<sessionId>/<path>` address.
		*/
		function sessionFileAddress(sessionId, path) {
			const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
			return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
		}
		/**
		* Read a file address back into its parts without resolving `.` or `..`.
		* Query and fragment suffixes are ignored; encoded path segments are decoded.
		* @param address - a candidate address.
		* @returns the parts, or `undefined` when the string is not a `dsh-resource://file/` URI in a known scope with a path, or a segment is not validly encoded.
		*/
		function parseFileAddress(address) {
			try {
				if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
				const end = address.search(/[?#]/);
				const [scope, ...rest] = address.slice(20, end === -1 ? void 0 : end).split("/");
				if (scope === "session") {
					const [id, ...segments] = rest;
					if (id === void 0 || id === "" || segments.length === 0) return void 0;
					return {
						scope,
						sessionId: decodeURIComponent(id),
						path: segments.map(decodeURIComponent).join("/")
					};
				}
				if (scope === "absolute") {
					const unc = rest[0] === "" && rest.length > 1;
					const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
					if (segments.length === 0 || segments[0] === "") return void 0;
					if (unc) return {
						scope,
						path: `//${segments.join("/")}`
					};
					return {
						scope,
						path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}`
					};
				}
				return;
			} catch {
				return;
			}
		}
		/**
		* Browser-safe Workspace path and display helpers.
		* @module @deepseek-ai/dsh-util-workspace-path
		*/
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Whether a path is absolute in either spelling the Host accepts: POSIX (`/a/b`) or Windows drive or UNC.
		* @param path - the path to classify.
		* @returns `true` for an absolute path; `false` for a Workspace-relative one.
		*/
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || isWindowsStylePath(path);
		}
		/**
		* The address for a path as a caller holds it: a relative path, or an absolute
		* path inside the Session's workspace, becomes a `session`-scoped address; an
		* absolute path outside it, or one whose workspace root is unknown, keeps its
		* absolute path in that Session's address.
		* @param sessionId - the Session the path is read in.
		* @param cwd - that Session's workspace root, when known.
		* @param path - absolute or workspace-relative path, in either separator spelling.
		* @returns the `dsh-resource://file/…` address.
		*/
		function fileAddressFor(sessionId, cwd, path) {
			const normalized = path.replace(/\\/g, "/");
			if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
			const root = cwd === void 0 ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
			if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
			if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
			return sessionFileAddress(sessionId, normalized);
		}
		//#endregion
		//#region lib/types/client/model.js
		const children = (parent, name) => parent === null ? [] : Array.from(parent.children).filter((child) => child.tagName === name);
		const child = (parent, name) => children(parent, name)[0] ?? null;
		const attr = (element, name) => element?.getAttribute(name) ?? "";
		const content = (element) => element?.textContent.trim() ?? "";
		const description = (element) => content(child(element, "Description")) || attr(element, "Description");
		const dataKey = (scope, symbol) => `${scope.toLowerCase()}::${symbol.toLowerCase()}`;
		/**
		* Resolve only values actually present in the saved export; no entry implies no value evidence.
		* @param project - Saved controller export projection.
		* @param scope - Controller or program scope containing the symbol.
		* @param symbol - Tag name to look up.
		* @returns The saved value, or undefined when the export contains no matching value.
		*/
		function exportedDatum(project, scope, symbol) {
			return project.exportedData.get(dataKey(scope, symbol)) ?? (scope === "controller" ? void 0 : project.exportedData.get(dataKey("controller", symbol)));
		}
		/**
		* Parse a controller export without retaining XML nodes or customer source text.
		* @param xml - L5X XML text to parse.
		* @returns Parsed read-only controller export.
		*/
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
					alias: attr(tag, "AliasFor")
				};
			});
			const programs = children(child(controller, "Programs"), "Program").map((program) => {
				const name = attr(program, "Name");
				const routines = children(child(program, "Routines"), "Routine").map((routine) => ({
					name: attr(routine, "Name"),
					type: attr(routine, "Type"),
					description: description(routine),
					rungs: children(child(routine, "RLLContent"), "Rung").map((rung) => ({
						number: attr(rung, "Number"),
						comment: content(child(rung, "Comment")) || attr(rung, "Comment"),
						text: content(child(rung, "Text"))
					})),
					code: children(child(routine, "STContent"), "Line").map((line) => line.textContent).join("\n")
				}));
				return {
					name,
					main: attr(program, "MainRoutineName"),
					description: description(program),
					routines,
					tags: tagsOf(program, name)
				};
			});
			const tasks = children(child(controller, "Tasks"), "Task").map((task) => ({
				name: attr(task, "Name"),
				type: attr(task, "Type"),
				rate: attr(task, "Rate"),
				priority: attr(task, "Priority"),
				watchdog: attr(task, "Watchdog"),
				programs: children(child(task, "ScheduledPrograms"), "ScheduledProgram").map((program) => attr(program, "Name"))
			}));
			const modules = children(child(controller, "Modules"), "Module").map((module) => ({
				name: attr(module, "Name"),
				catalog: attr(module, "CatalogNumber"),
				parent: attr(module, "ParentModule"),
				description: description(module),
				slot: attr(child(module, "Ports"), "Address") || attr(child(child(module, "Ports"), "Port"), "Address")
			}));
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
				aois: children(child(controller, "AddOnInstructionDefinitions"), "AddOnInstructionDefinition").map((aoi) => attr(aoi, "Name")),
				types: children(child(controller, "DataTypes"), "DataType").map((type) => attr(type, "Name"))
			};
		}
		/**
		* Find literal evidence in ladder and Structured Text without claiming execution semantics.
		* @param project - Saved controller export projection.
		* @param query - Symbol text to search for in routines.
		* @returns Matching routine locations.
		*/
		function findReferences(project, query) {
			const needle = query.trim().toLocaleLowerCase();
			if (needle === "") return [];
			const hits = [];
			for (const program of project.programs) for (const routine of program.routines) {
				if (routine.type === "RLL") {
					for (const rung of routine.rungs) if (rung.text.toLocaleLowerCase().includes(needle)) hits.push({
						program: program.name,
						routine: routine.name,
						location: `Rung ${rung.number}`,
						text: rung.text
					});
				}
				if (routine.type === "ST") routine.code.split("\n").forEach((line, index) => {
					if (line.toLocaleLowerCase().includes(needle)) hits.push({
						program: program.name,
						routine: routine.name,
						location: `Line ${index + 1}`,
						text: line
					});
				});
			}
			return hits;
		}
		/**
		* Decode NeutralText structure for a read-only ladder diagram. Unknown syntax keeps source text visible.
		* @param text - Text to inspect or parse.
		* @returns Parsed ladder segments, or null for unsupported text.
		*/
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
					segments.push({
						mnemonic,
						operands: source.slice(start, cursor - 1)
					});
				}
				return nested === null ? segments : null;
			};
			const result = sequence(null);
			return result !== null && result.length > 0 ? result : null;
		}
		//#endregion
		//#region lib/types/client/inspection.js
		/**
		* Source-backed review hints. These are not Studio 5000 build diagnostics.
		* @param project - Saved controller export projection.
		* @returns Static findings without changing the controller export.
		*/
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
					evidence: `${task.name} → ${name}`
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
				if (program.main !== "" && !program.routines.some((routine) => routine.name.toLowerCase() === program.main.toLowerCase())) findings.push({
					severity: "warning",
					code: "missing-main-routine",
					location,
					message: `Main routine ${program.main} is absent from this export.`,
					evidence: program.main
				});
				const routineNames = new Set(program.routines.map((routine) => routine.name.toLowerCase()));
				for (const routine of program.routines) {
					const routineLocation = `${program.name}/${routine.name}`;
					if (routine.type !== "RLL" && routine.type !== "ST") findings.push({
						severity: "info",
						code: "unsupported-diagram",
						location: routineLocation,
						message: `${routine.type} is listed but is not diagrammed.`,
						evidence: routine.type
					});
					if (routine.type !== "RLL") continue;
					for (const rung of routine.rungs) for (const match of rung.text.matchAll(/\bJSR\s*\(\s*([^,()\s]+)/giu)) {
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
			return findings;
		}
		//#endregion
		//#region \0dsh-css:C:\Users\KNPhu\.arya\github\KonnectSuite\AryaAI\packages\client\ui-logix-project-viewer\src\client\L5xBody.module.css.mjs
		const css = "._0tcyLG_root{width:100%;min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);flex-direction:column;font-size:12px;display:flex}._0tcyLG_toolbar{border-bottom:.5px solid var(--dsw-alias-border-l2);white-space:nowrap;align-items:center;gap:10px;padding:8px 12px;display:flex;overflow:hidden}._0tcyLG_toolbar strong{text-overflow:ellipsis;overflow:hidden}._0tcyLG_toolbar span{color:var(--dsw-alias-label-secondary)}._0tcyLG_toolbar button{border:.5px solid var(--dsw-alias-border-l2);color:inherit;cursor:pointer;background:0 0;border-radius:4px;padding:4px 8px}._0tcyLG_offline{margin-left:auto}._0tcyLG_notice{border-bottom:.5px solid var(--dsw-alias-border-l2);padding:8px 12px}._0tcyLG_layout{flex:1;grid-template-columns:minmax(190px,23%) minmax(300px,1fr) minmax(200px,22%);min-height:0;display:grid}._0tcyLG_tree,._0tcyLG_inspector{border-right:.5px solid var(--dsw-alias-border-l2);min-width:0;padding:8px;overflow:auto}._0tcyLG_inspector{border-right:0;border-left:.5px solid var(--dsw-alias-border-l2)}._0tcyLG_treeHeading,._0tcyLG_inspectorHeading{padding:6px 5px;font-weight:600}._0tcyLG_tree details{margin:3px 0}._0tcyLG_tree summary{cursor:pointer;white-space:nowrap;text-overflow:ellipsis;padding:4px;overflow:hidden}._0tcyLG_nested{margin-left:12px!important}._0tcyLG_leaf,._0tcyLG_leafButton,._0tcyLG_selected{box-sizing:border-box;text-align:left;width:100%;color:inherit;white-space:nowrap;text-overflow:ellipsis;padding:5px 5px 5px 20px;display:block;overflow:hidden}._0tcyLG_leafButton,._0tcyLG_selected{cursor:pointer;background:0 0;border:0}._0tcyLG_selected,._0tcyLG_leafButton:hover,._0tcyLG_reference:hover{background:var(--dsw-alias-interactive-bg-hover)}._0tcyLG_leafButton small,._0tcyLG_selected small{color:var(--dsw-alias-label-secondary);margin-left:5px}._0tcyLG_main{min-width:0;min-height:0;padding:0 12px 24px;overflow:auto}._0tcyLG_routineHeader{background:var(--dsw-alias-bg-document-preview);z-index:1;border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:10px;padding:12px 0;display:flex;position:sticky;top:0}._0tcyLG_routineHeader span,._0tcyLG_description{color:var(--dsw-alias-label-secondary)}._0tcyLG_description{margin:12px 4px}._0tcyLG_rung{border-bottom:.5px solid var(--dsw-alias-border-l2);grid-template-columns:32px minmax(0,1fr);min-height:110px;display:grid}._0tcyLG_rungBody{border-left:2px solid var(--dsw-alias-label-primary);border-right:2px solid var(--dsw-alias-label-primary);min-width:0;padding:12px}._0tcyLG_comment{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;margin-bottom:10px}._0tcyLG_rail{align-items:center;gap:0;padding:8px 0;display:flex;overflow:auto}._0tcyLG_path{align-items:center;min-width:max-content;display:flex}._0tcyLG_branch{border-left:1px solid var(--dsw-alias-label-primary);border-right:1px solid var(--dsw-alias-label-primary);flex-direction:column;display:flex}._0tcyLG_branchPath{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;min-height:54px;display:flex}._0tcyLG_branchPath:last-child{border-bottom:0}._0tcyLG_instruction{cursor:context-menu;flex-direction:column;align-items:center;min-width:100px;padding:0 7px;display:flex;position:relative}._0tcyLG_instruction:before{content:\"\";background:var(--dsw-alias-label-primary);height:1px;position:absolute;top:15px;left:0;right:0}._0tcyLG_glyph{z-index:1;background:var(--dsw-alias-bg-document-preview);height:25px;font-family:monospace;font-size:17px}._0tcyLG_instruction strong{font-size:10px}._0tcyLG_instruction code{white-space:nowrap;font-size:11px}._0tcyLG_source{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font-size:10px;display:block}._0tcyLG_neutral,._0tcyLG_structured{white-space:pre-wrap;overflow-wrap:anywhere;font-family:monospace}._0tcyLG_structured{padding:15px}._0tcyLG_status{color:var(--dsw-alias-label-secondary);padding:20px}._0tcyLG_status button{margin-left:8px}._0tcyLG_searchLabel{flex-direction:column;gap:5px;font-weight:600;display:flex}._0tcyLG_searchLabel input{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);width:100%;color:inherit;background:0 0;border-radius:4px;padding:6px}._0tcyLG_reference{text-align:left;width:100%;color:inherit;border:0;border-bottom:.5px solid var(--dsw-alias-border-l2);cursor:pointer;background:0 0;flex-direction:column;gap:3px;padding:8px 5px;display:flex}._0tcyLG_reference span,._0tcyLG_reference code,._0tcyLG_empty{color:var(--dsw-alias-label-secondary)}._0tcyLG_reference code{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._0tcyLG_menu{z-index:1000;flex-direction:column;min-width:150px;padding:5px;display:flex;position:fixed}._0tcyLG_menuItem{color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;padding:7px 10px}._0tcyLG_menuItem:hover{background:var(--dsw-alias-interactive-bg-hover)}._0tcyLG_root{background:var(--dsw-alias-bg-document-preview);container-type:inline-size}._0tcyLG_toolbar{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);min-height:43px}._0tcyLG_productMark{letter-spacing:.1em;border-right:.5px solid var(--dsw-alias-border-l2);padding-right:10px;font-size:10px;font-weight:800;color:var(--dsw-alias-label-primary)!important}._0tcyLG_productMark b{color:#3983c9}._0tcyLG_offline{text-transform:uppercase;background:#eaf4fc;border:1px solid #83a9c8;border-radius:3px;padding:3px 7px;font-size:10px;font-weight:700;color:#225e87!important}._0tcyLG_sourceBar{border-bottom:.5px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 85%,#a4bed4);min-height:27px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none;align-items:center;gap:16px;padding:0 12px;font-size:10px;display:flex;overflow:hidden}._0tcyLG_sourceBar span:last-child{margin-left:auto}._0tcyLG_layout{grid-template-columns:minmax(190px,22%) minmax(320px,1fr) minmax(190px,19%)}._0tcyLG_tree{background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 94%,#b6cbe0);flex-direction:column;padding:0;display:flex;overflow:hidden}._0tcyLG_treeHeading{text-transform:uppercase;letter-spacing:.07em;flex-direction:column;gap:2px;padding:11px 12px 7px;font-size:10px;display:flex}._0tcyLG_treeHeading span{text-transform:none;letter-spacing:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;font-size:11px;font-weight:400;overflow:hidden}._0tcyLG_organizerSearch{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-document-preview);width:calc(100% - 20px);color:inherit;border-radius:4px;margin:0 10px 8px;padding:6px 8px}._0tcyLG_treeScroll{flex:1;min-height:0;padding:0 6px 16px;overflow:auto}._0tcyLG_tree summary{font-weight:600}._0tcyLG_tree summary:hover{background:var(--dsw-alias-interactive-bg-hover)}._0tcyLG_controllerRoot>summary{margin:2px 0 6px;font-weight:700}._0tcyLG_controllerRoot>._0tcyLG_nested{margin-left:11px!important}._0tcyLG_unexportedLeaf{color:var(--dsw-alias-label-secondary);opacity:.65;white-space:nowrap;text-overflow:ellipsis;cursor:help;padding:5px 5px 5px 24px;font-size:11px;overflow:hidden}._0tcyLG_unexportedLeaf:before{content:\"◇\";margin-right:6px}._0tcyLG_tree summary small{float:right;color:var(--dsw-alias-label-secondary);padding-left:5px;font-size:10px;font-weight:400}._0tcyLG_leaf,._0tcyLG_leafButton,._0tcyLG_selected{font-size:11px}._0tcyLG_selected{border-left:2px solid #3b88d1;font-weight:700}._0tcyLG_routineIcon{color:#3a75a4;min-width:20px;font-family:monospace;display:inline-block}._0tcyLG_editor{flex-direction:column;min-width:0;min-height:0;display:flex}._0tcyLG_tabStrip{border-bottom:.5px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 88%,#bac9d8);flex:none;height:33px;display:flex;overflow:auto hidden}._0tcyLG_tab,._0tcyLG_activeTab{border-right:.5px solid var(--dsw-alias-border-l2);flex:none;align-items:center;max-width:220px;display:flex}._0tcyLG_activeTab{background:var(--dsw-alias-bg-document-preview);border-top:2px solid #3b88d1}._0tcyLG_tab button,._0tcyLG_activeTab button{color:inherit;cursor:pointer;white-space:nowrap;text-overflow:ellipsis;background:0 0;border:0;padding:7px 9px;font-size:11px;overflow:hidden}._0tcyLG_tab ._0tcyLG_closeTab,._0tcyLG_activeTab ._0tcyLG_closeTab{color:var(--dsw-alias-label-secondary);padding:6px;font-size:16px}._0tcyLG_editorTools{border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none;align-items:center;gap:9px;min-height:34px;padding:2px 10px;display:flex}._0tcyLG_editorTools strong{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}._0tcyLG_editorTools span{color:var(--dsw-alias-label-secondary)}._0tcyLG_toolSpacer{flex:1}._0tcyLG_editorTools button{border:.5px solid var(--dsw-alias-border-l2);color:inherit;cursor:pointer;background:0 0;border-radius:4px;padding:3px 7px;font-size:11px}._0tcyLG_main{flex:1;padding:0 13px 24px}._0tcyLG_rung{grid-template-columns:34px minmax(0,1fr);min-height:100px}._0tcyLG_rungNumber{text-align:right;padding:14px 4px 0 0}._0tcyLG_rungBody{padding:12px 15px}._0tcyLG_comment{text-align:center;font-size:11px}._0tcyLG_rail{min-height:70px}._0tcyLG_branch{border-left-width:2px;border-right-width:2px}._0tcyLG_branchPath{min-height:68px}._0tcyLG_instruction{text-align:center;min-width:132px}._0tcyLG_instruction:before{height:2px;top:31px}._0tcyLG_instructionDescription{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;max-width:160px;min-height:24px;font-size:10px;line-height:1.15;overflow:hidden}._0tcyLG_glyph{min-width:54px;height:28px;font-size:20px;line-height:28px}._0tcyLG_functionBlock ._0tcyLG_glyph{border:1px solid var(--dsw-alias-label-primary);min-width:70px;font-size:12px;font-weight:700}._0tcyLG_instruction code{text-overflow:ellipsis;max-width:170px;overflow:hidden}._0tcyLG_path{width:max-content;min-width:100%}._0tcyLG_outputInstruction{margin-left:auto}._0tcyLG_blockCard{z-index:1;border:1px solid var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-document-preview);text-align:left;min-width:128px;max-width:220px;box-shadow:0 1px 2px #0002}._0tcyLG_blockCard>strong{background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 75%,#8399ad);border-bottom:.5px solid var(--dsw-alias-border-l2);padding:3px 6px;font-size:11px;display:block}._0tcyLG_blockCard>div{border-bottom:.5px solid var(--dsw-alias-border-l2);grid-template-columns:45px minmax(65px,1fr);gap:4px;padding:2px 5px;display:grid}._0tcyLG_blockCard>div:last-child{border:0}._0tcyLG_blockCard code{font-size:10px}._0tcyLG_glyph{background:var(--dsw-alias-bg-document-preview);justify-content:center;align-items:center;min-width:66px;display:flex}._0tcyLG_wireLead{background:var(--dsw-alias-label-primary);width:16px;height:2px;display:block}._0tcyLG_contact{border-left:2px solid var(--dsw-alias-label-primary);border-right:2px solid var(--dsw-alias-label-primary);width:16px;height:25px;display:block;position:relative}._0tcyLG_contact._0tcyLG_negated:after{content:\"\";background:var(--dsw-alias-label-primary);width:25px;height:2px;position:absolute;top:11px;left:-4px;transform:rotate(-50deg)}._0tcyLG_coil{border-left:2px solid var(--dsw-alias-label-primary);border-right:2px solid var(--dsw-alias-label-primary);corner-shape:round;border-radius:50%;justify-content:center;align-items:center;width:23px;height:26px;font:700 10px monospace;display:flex}._0tcyLG_source{border:.5px solid var(--dsw-alias-border-l2);border-radius:3px;padding:6px}._0tcyLG_loadMore{border:.5px solid var(--dsw-alias-border-l2);color:inherit;cursor:pointer;background:0 0;border-radius:4px;margin:14px auto;padding:7px 14px;display:block}._0tcyLG_tagTableView{min-width:0}._0tcyLG_tagTableToolbar{z-index:2;background:var(--dsw-alias-bg-document-preview);border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:14px;padding:8px 4px;display:flex;position:sticky;top:0}._0tcyLG_tagTableToolbar input{width:min(220px,30vw);color:inherit;border:.5px solid var(--dsw-alias-border-l2);background:0 0;border-radius:3px;margin-left:5px;padding:4px 6px}._0tcyLG_tagTableToolbar span{color:var(--dsw-alias-label-secondary)}._0tcyLG_tagTable{border-collapse:collapse;table-layout:fixed;width:100%;min-width:720px;font-size:11px}._0tcyLG_tagTable th,._0tcyLG_tagTable td{text-align:left;border:.5px solid var(--dsw-alias-border-l2);white-space:nowrap;text-overflow:ellipsis;padding:6px 8px;overflow:hidden}._0tcyLG_tagTable thead{z-index:1;background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 70%,#a4bed4);position:sticky;top:42px}._0tcyLG_tagTable tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}._0tcyLG_tagTable th:first-child{width:22%}._0tcyLG_tagTable td:nth-child(2),._0tcyLG_tagTable td:nth-child(3){width:12%}._0tcyLG_tagTable td:nth-child(4){width:14%}._0tcyLG_tagTable td:nth-child(5){width:25%}._0tcyLG_tagTable ._0tcyLG_noValue{color:var(--dsw-alias-label-secondary);font-style:italic}._0tcyLG_tagActions{gap:5px;display:flex}._0tcyLG_tagActions button{border:.5px solid var(--dsw-alias-border-l2);color:inherit;cursor:pointer;background:0 0;border-radius:3px;padding:2px 4px;font-size:10px}._0tcyLG_inspector{background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 94%,#b6cbe0);flex-direction:column;gap:4px;min-height:0;padding:7px 9px;display:flex;overflow:auto}._0tcyLG_inspectorHeading{text-transform:uppercase;letter-spacing:.05em;border-bottom:.5px solid var(--dsw-alias-border-l2);padding:7px 4px 5px;font-size:10px}._0tcyLG_propertyList{overflow-wrap:anywhere;flex-direction:column;gap:8px;padding:8px 4px 14px;display:flex}._0tcyLG_propertyList span,._0tcyLG_propertyList p{color:var(--dsw-alias-label-secondary);margin:0}._0tcyLG_actionButton{text-align:left;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-document-preview);width:100%;color:inherit;cursor:pointer;border-radius:4px;padding:7px 8px}._0tcyLG_actionButton:hover,._0tcyLG_loadMore:hover{background:var(--dsw-alias-interactive-bg-hover)}._0tcyLG_inspectorHelp{color:var(--dsw-alias-label-secondary);margin:7px 4px;font-size:11px;line-height:1.35}._0tcyLG_bottomPanel{border-top:2px solid #314c67;flex-direction:column;flex:none;height:190px;min-height:100px;display:flex}._0tcyLG_bottomTabs{background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 55%,#314c67);border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none;display:flex;overflow-x:auto}._0tcyLG_bottomTabs button{color:inherit;border:0;border-right:.5px solid var(--dsw-alias-border-l2);cursor:pointer;white-space:nowrap;background:0 0;padding:8px 13px;font-size:11px}._0tcyLG_bottomTabs ._0tcyLG_bottomActive{background:var(--dsw-alias-bg-document-preview);font-weight:700;box-shadow:inset 0 2px #3b88d1}._0tcyLG_bottomContent{min-height:0;padding:6px 13px 12px;overflow:auto}._0tcyLG_panelNote,._0tcyLG_empty{color:var(--dsw-alias-label-secondary);margin:4px 0 8px;font-size:11px}._0tcyLG_finding{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:baseline;gap:10px;padding:5px 1px;font-size:11px;display:flex}._0tcyLG_finding strong{flex:none;min-width:160px}._0tcyLG_finding code{text-overflow:ellipsis;white-space:nowrap;max-width:30%;color:var(--dsw-alias-label-secondary);margin-left:auto;overflow:hidden}._0tcyLG_warning,._0tcyLG_info{text-transform:uppercase;font-size:9px;font-weight:800}._0tcyLG_warning{color:#bb7426}._0tcyLG_info{color:#3983c9}._0tcyLG_searchLabel{flex-direction:row;align-items:center}._0tcyLG_searchLabel input{width:min(410px,100%)}._0tcyLG_reference{flex-direction:row;align-items:baseline;gap:12px}._0tcyLG_reference strong{min-width:160px}._0tcyLG_reference span{min-width:65px}._0tcyLG_watchRow{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:5px 2px;display:flex}._0tcyLG_watchRow code{min-width:160px}._0tcyLG_watchRow span{color:var(--dsw-alias-label-secondary)}._0tcyLG_watchRow button{color:inherit;cursor:pointer;background:0 0;border:0;margin-left:auto}._0tcyLG_watchTable{border-collapse:collapse;width:100%;min-width:670px;font-size:11px}._0tcyLG_watchTable th,._0tcyLG_watchTable td{text-align:left;border:.5px solid var(--dsw-alias-border-l2);padding:5px 7px}._0tcyLG_watchTable thead{background:color-mix(in srgb,var(--dsw-alias-bg-document-preview) 70%,#a4bed4)}._0tcyLG_watchTable ._0tcyLG_noValue{color:var(--dsw-alias-label-secondary);font-style:italic}._0tcyLG_main{color:#1d2730;background:#fff}._0tcyLG_rung{border-bottom:1px solid #d0d5da;min-height:88px}._0tcyLG_rungNumber{color:#89939c;padding-top:13px}._0tcyLG_rungBody{border-left:1px solid #89939c;border-right:1px solid #89939c;padding:8px 14px}._0tcyLG_comment{color:#697681;margin:0 0 6px;font-size:10px}._0tcyLG_rail{min-height:47px;padding:5px 0;position:relative;overflow:auto hidden}._0tcyLG_rail:before{content:\"\";background:#89939c;height:1px;position:absolute;top:37px;left:0;right:0}._0tcyLG_instruction{min-width:115px;padding:0 6px}._0tcyLG_instruction:before{background:#89939c;height:1px;top:32px}._0tcyLG_instructionDescription{color:#7e8994;min-height:25px;max-height:25px;font-size:9px}._0tcyLG_glyph{background:#fff;height:25px}._0tcyLG_wireLead{background:#3d4852;height:1px}._0tcyLG_contact{border-color:#3d4852;height:22px}._0tcyLG_contact._0tcyLG_negated:after{background:#3d4852}._0tcyLG_coil{border-color:#3d4852;height:23px}._0tcyLG_functionBlock{min-width:150px}._0tcyLG_functionBlock ._0tcyLG_instructionDescription{min-height:25px}._0tcyLG_blockCard{min-width:145px;max-width:190px;box-shadow:none;background:#fff;border:1px solid #a4abb1}._0tcyLG_blockCard>strong{background:#e1e2e3;border-bottom:1px solid #a4abb1;padding:2px 5px;font-size:10px}._0tcyLG_blockCard>div{grid-template-columns:68px minmax(50px,1fr);gap:3px;padding:1px 4px}._0tcyLG_blockCard small{color:#77828b;font-size:9px}._0tcyLG_blockCard code{color:#1d2730;font-size:10px}._0tcyLG_instruction code{font-size:10px}@container (width<=900px){._0tcyLG_layout{grid-template-columns:180px minmax(0,1fr)}._0tcyLG_inspector,._0tcyLG_toolbar span:not(._0tcyLG_productMark):not(._0tcyLG_offline),._0tcyLG_sourceBar span:last-child{display:none}}@container (width<=650px){._0tcyLG_layout{grid-template-columns:170px minmax(0,1fr)}._0tcyLG_toolbar{gap:5px;padding:5px 7px}._0tcyLG_toolbar button{padding:3px 5px;font-size:10px}._0tcyLG_sourceBar{gap:8px;padding:0 7px}._0tcyLG_sourceBar span:nth-child(2){display:none}._0tcyLG_treeHeading{padding:8px 6px 5px}._0tcyLG_organizerSearch{width:calc(100% - 12px);margin:0 6px 6px}._0tcyLG_treeScroll{padding:0 2px 10px}._0tcyLG_main{padding:0 7px 18px}._0tcyLG_rungBody{padding:7px}._0tcyLG_editorTools{gap:4px;padding:2px 5px}._0tcyLG_editorTools button{padding:3px 5px}._0tcyLG_bottomPanel{height:155px}._0tcyLG_bottomTabs button{padding:6px 7px}._0tcyLG_bottomContent{padding:4px 7px}}@container (width<=500px){._0tcyLG_productMark,._0tcyLG_toolbar ._0tcyLG_offline,._0tcyLG_sourceBar{display:none}._0tcyLG_layout{grid-template-columns:145px minmax(0,1fr)}._0tcyLG_editorTools button:last-child{display:none}}@media (width<=1000px){._0tcyLG_layout{grid-template-columns:minmax(170px,25%) minmax(0,1fr)}._0tcyLG_inspector,._0tcyLG_sourceBar span:last-child{display:none}}@media (height<=600px){._0tcyLG_bottomPanel{height:125px}._0tcyLG_toolbar{min-height:34px}._0tcyLG_sourceBar{display:none}}._0tcyLG_tree ._0tcyLG_leafButton small{float:right}._0tcyLG_instruction{box-sizing:border-box;color:inherit;font:inherit;cursor:pointer;background:0 0;border:0;border-radius:2px}._0tcyLG_instruction:hover{z-index:4;background:var(--dsw-alias-interactive-bg-hover)}._0tcyLG_instruction:focus-visible,._0tcyLG_focusedInstruction{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary);outline-offset:1px;z-index:5}._0tcyLG_focusedInstruction{background:var(--dsw-alias-interactive-bg-hover)}._0tcyLG_focusedRung ._0tcyLG_rungNumber{color:var(--dsw-alias-state-business-primary);font-weight:700}._0tcyLG_rungNumber{cursor:pointer;font:inherit;background:0 0;border:0}._0tcyLG_rungNumber:hover,._0tcyLG_rungNumber:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary);outline-offset:-2px}._0tcyLG_rail{overflow:visible}._0tcyLG_instructionTooltip{z-index:20;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);width:max-content;min-width:190px;max-width:300px;box-shadow:0 5px 18px color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent);background:var(--dsw-alias-bg-document-preview);color:var(--dsw-alias-label-primary);text-align:left;white-space:normal;pointer-events:none;padding:8px 10px;font-size:11px;line-height:1.35;display:none;position:absolute;top:calc(100% + 5px);left:50%;transform:translate(-50%)}._0tcyLG_instructionTooltip strong,._0tcyLG_instructionTooltip span{overflow-wrap:anywhere;display:block}._0tcyLG_instructionTooltip span{color:var(--dsw-alias-label-secondary);margin-top:3px}._0tcyLG_instruction:hover ._0tcyLG_instructionTooltip{display:block}._0tcyLG_focusBar{border-bottom:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);flex-wrap:wrap;align-items:center;gap:5px 10px;min-height:35px;padding:5px 10px;font-size:11px;display:flex}._0tcyLG_focusBar code{text-overflow:ellipsis;white-space:nowrap;max-width:32%;overflow:hidden}._0tcyLG_focusBar button{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-document-preview);color:inherit;cursor:pointer;border-radius:3px;padding:3px 6px;font-size:10px}._0tcyLG_focusBar button:disabled{opacity:.5;cursor:default}._0tcyLG_focusBadge{text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-state-business-primary);font-size:9px;font-weight:800}._0tcyLG_focusValue{margin-left:auto;font-weight:600}._0tcyLG_inspectorCaution{font-size:10px;line-height:1.4}._0tcyLG_operandDetails{flex-direction:column;gap:7px;display:flex}._0tcyLG_operandDetails>div{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-document-preview);grid-template-columns:minmax(0,1fr) auto;gap:3px 7px;padding:6px;display:grid}._0tcyLG_operandDetails code{overflow-wrap:anywhere}._0tcyLG_operandDetails strong{text-align:right}._0tcyLG_operandDetails span,._0tcyLG_operandDetails p{color:var(--dsw-alias-label-secondary);grid-column:1/-1;margin:0;font-size:10px}._0tcyLG_menuHeading{border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);padding:5px 9px;font-size:10px;font-weight:700}._0tcyLG_blockCard>span{border-bottom:.5px solid var(--dsw-alias-border-l2);grid-template-columns:65px minmax(52px,1fr) auto;align-items:baseline;gap:3px;padding:2px 5px;display:grid}._0tcyLG_blockCard>span:last-child{border-bottom:0}._0tcyLG_blockCard>span small{color:var(--dsw-alias-label-secondary);font-size:9px}._0tcyLG_blockCard>span code{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._0tcyLG_blockCard>span b{font-size:10px;font-weight:700}._0tcyLG_exportedChip{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-document-preview);max-width:180px;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;border-radius:2px;margin-top:2px;padding:1px 4px;font-size:9px;overflow:hidden}._0tcyLG_nestedPath{width:max-content;min-width:max-content}._0tcyLG_outputInstruction ._0tcyLG_instructionTooltip{left:auto;right:0;transform:none}";
		const tagId = "@deepseek-ai/dsh-client-ui-logix-project-viewer/L5xBody.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-logix-project-viewer";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var L5xBody_module_css_default = {
			"actionButton": "_0tcyLG_actionButton",
			"activeTab": "_0tcyLG_activeTab",
			"blockCard": "_0tcyLG_blockCard",
			"bottomActive": "_0tcyLG_bottomActive",
			"bottomContent": "_0tcyLG_bottomContent",
			"bottomPanel": "_0tcyLG_bottomPanel",
			"bottomTabs": "_0tcyLG_bottomTabs",
			"branch": "_0tcyLG_branch",
			"branchPath": "_0tcyLG_branchPath",
			"closeTab": "_0tcyLG_closeTab",
			"coil": "_0tcyLG_coil",
			"comment": "_0tcyLG_comment",
			"contact": "_0tcyLG_contact",
			"controllerRoot": "_0tcyLG_controllerRoot",
			"description": "_0tcyLG_description",
			"editor": "_0tcyLG_editor",
			"editorTools": "_0tcyLG_editorTools",
			"empty": "_0tcyLG_empty",
			"exportedChip": "_0tcyLG_exportedChip",
			"finding": "_0tcyLG_finding",
			"focusBadge": "_0tcyLG_focusBadge",
			"focusBar": "_0tcyLG_focusBar",
			"focusValue": "_0tcyLG_focusValue",
			"focusedInstruction": "_0tcyLG_focusedInstruction",
			"focusedRung": "_0tcyLG_focusedRung",
			"functionBlock": "_0tcyLG_functionBlock",
			"glyph": "_0tcyLG_glyph",
			"info": "_0tcyLG_info",
			"inspector": "_0tcyLG_inspector",
			"inspectorCaution": "_0tcyLG_inspectorCaution",
			"inspectorHeading": "_0tcyLG_inspectorHeading",
			"inspectorHelp": "_0tcyLG_inspectorHelp",
			"instruction": "_0tcyLG_instruction",
			"instructionDescription": "_0tcyLG_instructionDescription",
			"instructionTooltip": "_0tcyLG_instructionTooltip",
			"layout": "_0tcyLG_layout",
			"leaf": "_0tcyLG_leaf",
			"leafButton": "_0tcyLG_leafButton",
			"loadMore": "_0tcyLG_loadMore",
			"main": "_0tcyLG_main",
			"menu": "_0tcyLG_menu",
			"menuHeading": "_0tcyLG_menuHeading",
			"menuItem": "_0tcyLG_menuItem",
			"negated": "_0tcyLG_negated",
			"nested": "_0tcyLG_nested",
			"nestedPath": "_0tcyLG_nestedPath",
			"neutral": "_0tcyLG_neutral",
			"noValue": "_0tcyLG_noValue",
			"notice": "_0tcyLG_notice",
			"offline": "_0tcyLG_offline",
			"operandDetails": "_0tcyLG_operandDetails",
			"organizerSearch": "_0tcyLG_organizerSearch",
			"outputInstruction": "_0tcyLG_outputInstruction",
			"panelNote": "_0tcyLG_panelNote",
			"path": "_0tcyLG_path",
			"productMark": "_0tcyLG_productMark",
			"propertyList": "_0tcyLG_propertyList",
			"rail": "_0tcyLG_rail",
			"reference": "_0tcyLG_reference",
			"root": "_0tcyLG_root",
			"routineHeader": "_0tcyLG_routineHeader",
			"routineIcon": "_0tcyLG_routineIcon",
			"rung": "_0tcyLG_rung",
			"rungBody": "_0tcyLG_rungBody",
			"rungNumber": "_0tcyLG_rungNumber",
			"searchLabel": "_0tcyLG_searchLabel",
			"selected": "_0tcyLG_selected",
			"source": "_0tcyLG_source",
			"sourceBar": "_0tcyLG_sourceBar",
			"status": "_0tcyLG_status",
			"structured": "_0tcyLG_structured",
			"tab": "_0tcyLG_tab",
			"tabStrip": "_0tcyLG_tabStrip",
			"tagActions": "_0tcyLG_tagActions",
			"tagTable": "_0tcyLG_tagTable",
			"tagTableToolbar": "_0tcyLG_tagTableToolbar",
			"tagTableView": "_0tcyLG_tagTableView",
			"toolSpacer": "_0tcyLG_toolSpacer",
			"toolbar": "_0tcyLG_toolbar",
			"tree": "_0tcyLG_tree",
			"treeHeading": "_0tcyLG_treeHeading",
			"treeScroll": "_0tcyLG_treeScroll",
			"unexportedLeaf": "_0tcyLG_unexportedLeaf",
			"warning": "_0tcyLG_warning",
			"watchRow": "_0tcyLG_watchRow",
			"watchTable": "_0tcyLG_watchTable",
			"wireLead": "_0tcyLG_wireLead"
		};
		//#endregion
		//#region lib/types/client/L5xBody.js
		/** Offline Logix project browser: navigation, rung evidence, and context actions. */
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
		const operandKeys = {
			MOV: ["operand.source", "operand.destination"],
			MOVE: ["operand.source", "operand.destination"],
			COP: [
				"operand.source",
				"operand.destination",
				"operand.length"
			],
			CPS: [
				"operand.source",
				"operand.destination",
				"operand.length"
			],
			TON: ["operand.timer"],
			TOF: ["operand.timer"],
			RTO: ["operand.timer"],
			RES: ["operand.timer"],
			ADD: [
				"operand.a",
				"operand.b",
				"operand.destination"
			],
			SUB: [
				"operand.a",
				"operand.b",
				"operand.destination"
			],
			MUL: [
				"operand.a",
				"operand.b",
				"operand.destination"
			],
			DIV: [
				"operand.a",
				"operand.b",
				"operand.destination"
			],
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
			JSR: ["operand.routine", "operand.parameter"]
		};
		const terminalInstructions = new Set([
			"OTE",
			"OTL",
			"OTU",
			"JSR",
			"MOV",
			"MOVE",
			"COP",
			"CPS",
			"CLR",
			"FLL",
			"RES",
			"MSG",
			"GSV",
			"SSV",
			"TON",
			"TOF",
			"RTO",
			"ADD",
			"SUB",
			"MUL",
			"DIV"
		]);
		function operandDetail(project, tags, expression) {
			const text = expression.trim();
			const root = /^[A-Za-z_][\w:]*/u.exec(text)?.[0]?.toLowerCase();
			const tag = root === void 0 ? void 0 : tags.program.get(root) ?? tags.controller.get(root);
			const datum = tag === void 0 ? void 0 : exportedDatum(project, tag.scope, text) ?? (tag.alias !== "" ? exportedDatum(project, tag.scope, tag.alias + text.slice(tag.name.length)) : void 0);
			return {
				text,
				...tag === void 0 ? {} : { tag },
				...datum === void 0 ? {} : { datum }
			};
		}
		function instructionSymbols(mnemonic, operands) {
			if (mnemonic.toUpperCase() === "JSR") return [];
			return operandParts(operands).filter((part) => /^[A-Za-z_][\w:]*/u.test(part));
		}
		function L5xBody(props) {
			const { resourceAddress, content, t, read, ask, scrollportRef } = props;
			const request = content.kind === "renderer" ? content : void 0;
			const [loaded, setLoaded] = (0, react.useState)();
			const [failure, setFailure] = (0, react.useState)();
			const [choice, setChoice] = (0, react.useState)();
			const [query, setQuery] = (0, react.useState)("");
			const [showReferences, setShowReferences] = (0, react.useState)(false);
			const [context, setContext] = (0, react.useState)();
			const [chatUnavailable, setChatUnavailable] = (0, react.useState)(false);
			const [organizerQuery, setOrganizerQuery] = (0, react.useState)("");
			const [tabs, setTabs] = (0, react.useState)([]);
			const [inspector, setInspector] = (0, react.useState)();
			const [bottomPane, setBottomPane] = (0, react.useState)("search");
			const [watch, setWatch] = (0, react.useState)([]);
			const [rungLimit, setRungLimit] = (0, react.useState)(80);
			const [showSource, setShowSource] = (0, react.useState)(false);
			const [tagView, setTagView] = (0, react.useState)();
			const [tagFilter, setTagFilter] = (0, react.useState)("");
			const [targetRung, setTargetRung] = (0, react.useState)();
			const [focused, setFocused] = (0, react.useState)();
			const [focusedRung, setFocusedRung] = (0, react.useState)();
			const isAcd = resourceAddress.toLocaleLowerCase().endsWith(".acd");
			(0, react.useEffect)(() => {
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
				read(resourceAddress, controller.signal).then(({ xml, version }) => {
					if (controller.signal.aborted) return;
					const project = parseProject(xml);
					setLoaded({
						revision: request.revision,
						project,
						version
					});
					request.loaded(version);
				}).catch((error) => {
					if (controller.signal.aborted) return;
					setFailure(error instanceof Error ? error.message : t("invalid"));
					request.failed();
				});
				return () => {
					controller.abort();
				};
			}, [
				request?.revision,
				resourceAddress,
				read,
				isAcd
			]);
			(0, react.useEffect)(() => {
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
			const firstRoutine = firstProgram?.routines.find((routine) => routine.name === firstProgram.main) ?? firstProgram?.routines[0];
			const current = choice === null ? void 0 : choice ?? (firstProgram !== void 0 && firstRoutine !== void 0 ? {
				program: firstProgram.name,
				routine: firstRoutine.name
			} : void 0);
			const selected = project?.programs.find((program) => program.name === current?.program)?.routines.find((routine) => routine.name === current?.routine);
			const selectedProgram = project?.programs.find((program) => program.name === current?.program);
			const tagIndex = (0, react.useMemo)(() => ({
				controller: new Map(project?.tags.map((tag) => [tag.name.toLowerCase(), tag]) ?? []),
				program: new Map(selectedProgram?.tags.map((tag) => [tag.name.toLowerCase(), tag]) ?? [])
			}), [project, selectedProgram]);
			(0, react.useEffect)(() => {
				if (targetRung === void 0) return;
				const frame = requestAnimationFrame(() => {
					Array.from(document.querySelectorAll("[data-l5x-project-view] [data-rung]")).find((element) => element.dataset.rung === targetRung)?.scrollIntoView({ block: "center" });
					setTargetRung(void 0);
				});
				return () => {
					cancelAnimationFrame(frame);
				};
			}, [
				targetRung,
				current?.program,
				current?.routine,
				rungLimit
			]);
			const detailFor = (value) => project === void 0 ? void 0 : operandDetail(project, tagIndex, value);
			const describeOperand = (value) => detailFor(value)?.tag?.description ?? "";
			const focusedOperands = focused === void 0 ? [] : displayOperands(focused.mnemonic, focused.operands).map((operand) => detailFor(operand)).filter((item) => item !== void 0);
			const references = (0, react.useMemo)(() => project === void 0 ? [] : findReferences(project, query), [project, query]);
			const findings = (0, react.useMemo)(() => project === void 0 ? [] : inspectProject(project), [project]);
			const scheduled = (0, react.useMemo)(() => new Set(project?.tasks.flatMap((task) => task.programs.map((name) => name.toLowerCase())) ?? []), [project]);
			const visibleTabs = tabs.length > 0 ? tabs : current === void 0 ? [] : [current];
			const select = (program, routine) => {
				const next = {
					program: program.name,
					routine: routine.name
				};
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
				const routine = program?.routines.find((item) => item.name === routineName);
				if (program !== void 0 && routine !== void 0) {
					select(program, routine);
					const rungNumber = /^Rung (.+)$/u.exec(location)?.[1];
					if (rungNumber !== void 0) {
						const index = routine.rungs.findIndex((rung) => rung.number === rungNumber);
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
			const contextFor = (event, text, symbol, instruction) => {
				event.preventDefault();
				if (instruction !== void 0) setFocused(instruction);
				setContext({
					x: event.clientX,
					y: event.clientY,
					text,
					...symbol === void 0 ? {} : { symbol },
					...instruction === void 0 ? {} : { instruction }
				});
			};
			if (request === void 0) return null;
			if (isAcd) return (0, react_jsx_runtime.jsxs)("div", {
				className: L5xBody_module_css_default.status,
				role: "status",
				children: [
					t("acd"),
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setChatUnavailable(!ask(resourceAddress, "Check whether the Logix Designer SDK is installed. If available, prepare a new offline L5X export from this ACD for review. Do not overwrite the ACD, connect online, download, or modify controller state."));
						},
						children: t("exportAcd")
					}),
					chatUnavailable && (0, react_jsx_runtime.jsx)("p", { children: t("chatUnavailable") })
				]
			});
			if (failure !== void 0) return (0, react_jsx_runtime.jsxs)("div", {
				className: L5xBody_module_css_default.status,
				role: "alert",
				children: [
					failure,
					" ",
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: request.reload,
						children: t("retry")
					})
				]
			});
			if (project === void 0) return (0, react_jsx_runtime.jsx)("div", {
				className: L5xBody_module_css_default.status,
				role: "status",
				children: t("loading")
			});
			const filter = organizerQuery.trim().toLowerCase();
			const matches = (name) => filter === "" || name.toLowerCase().includes(filter);
			const programMatches = (program) => matches(program.name) || program.routines.some((routine) => matches(routine.name)) || program.tags.some((tag) => matches(tag.name));
			const orderedRoutines = (program) => [...program.routines].sort((left, right) => left.name === program.main ? -1 : right.name === program.main ? 1 : left.name.localeCompare(right.name));
			const treeProgram = (program) => (0, react_jsx_runtime.jsxs)("details", {
				className: L5xBody_module_css_default.nested,
				open: filter !== "" || program.name === current?.program,
				children: [
					(0, react_jsx_runtime.jsxs)("summary", {
						title: program.description,
						children: [program.name, (0, react_jsx_runtime.jsx)("small", { children: program.routines.length })]
					}),
					(filter === "" || program.tags.some((tag) => matches(tag.name))) && (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: L5xBody_module_css_default.leafButton,
						onClick: () => {
							setChoice({
								program: program.name,
								routine: program.main || program.routines[0]?.name || ""
							});
							openTags("program", filter);
						},
						children: [
							t("programTags"),
							" ",
							(0, react_jsx_runtime.jsx)("small", { children: program.tags.length })
						]
					}),
					orderedRoutines(program).filter((routine) => matches(program.name) || matches(routine.name)).map((routine) => (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: current?.program === program.name && current.routine === routine.name ? L5xBody_module_css_default.selected : L5xBody_module_css_default.leafButton,
						onClick: () => {
							select(program, routine);
						},
						onContextMenu: (event) => {
							contextFor(event, `${program.name}/${routine.name}`);
						},
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: L5xBody_module_css_default.routineIcon,
								children: routine.type === "RLL" ? "≡" : routine.type === "ST" ? "{ }" : "◇"
							}),
							routine.name,
							" ",
							(0, react_jsx_runtime.jsx)("small", { children: routine.type })
						]
					}, routine.name)),
					program.routines.length === 0 && (0, react_jsx_runtime.jsx)("span", {
						className: L5xBody_module_css_default.leaf,
						children: t("noRoutines")
					})
				]
			}, program.name);
			const unscheduled = project.programs.filter((program) => !scheduled.has(program.name.toLowerCase()));
			const moduleNames = new Set(project.modules.map((module) => module.name.toLowerCase()));
			const treeModule = (module, ancestors = []) => {
				const shown = project.modules.filter((childModule) => childModule.parent.toLowerCase() === module.name.toLowerCase() && !ancestors.includes(childModule.name.toLowerCase()) && childModule.name !== module.name).filter((childModule) => matches(childModule.name) || matches(childModule.catalog) || filter === "");
				if (shown.length === 0) return (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: L5xBody_module_css_default.leafButton,
					onClick: () => {
						setInspector({
							kind: "module",
							module
						});
					},
					title: module.catalog,
					children: [
						module.name,
						" ",
						(0, react_jsx_runtime.jsx)("small", { children: module.catalog })
					]
				}, module.name);
				return (0, react_jsx_runtime.jsxs)("details", {
					className: L5xBody_module_css_default.nested,
					open: filter !== "" ? true : void 0,
					children: [
						(0, react_jsx_runtime.jsxs)("summary", {
							title: module.catalog,
							children: [module.name, (0, react_jsx_runtime.jsx)("small", { children: module.catalog })]
						}),
						(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: L5xBody_module_css_default.leafButton,
							onClick: () => {
								setInspector({
									kind: "module",
									module
								});
							},
							children: t("inspect")
						}),
						shown.map((childModule) => treeModule(childModule, [...ancestors, module.name.toLowerCase()]))
					]
				}, module.name);
			};
			const rootModules = project.modules.filter((module) => module.parent === "" || !moduleNames.has(module.parent.toLowerCase()) || module.parent === module.name);
			const selectedRung = selected?.rungs.find((rung) => rung.number === focusedRung);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: L5xBody_module_css_default.root,
				"data-l5x-project-view": true,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: L5xBody_module_css_default.toolbar,
						children: [
							(0, react_jsx_runtime.jsxs)("span", {
								className: L5xBody_module_css_default.productMark,
								children: [
									t("productMark"),
									" ",
									(0, react_jsx_runtime.jsx)("b", { children: t("workspaceMark") })
								]
							}),
							(0, react_jsx_runtime.jsx)("strong", { children: project.name }),
							(0, react_jsx_runtime.jsxs)("span", { children: [
								project.processor,
								" · ",
								t("revision", { revision: project.revision })
							] }),
							(0, react_jsx_runtime.jsx)("span", {
								className: L5xBody_module_css_default.offline,
								children: t("offline")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									setChatUnavailable(!ask(resourceAddress, `Review the offline L5X export for ${project.name}. Start with the current routine ${current?.program ?? ""}/${current?.routine ?? ""}. Use the L5X engineering plugin tools and cite the export identity and source locations.`));
								},
								children: t("ask")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: request.reload,
								children: t("reloadFile")
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: L5xBody_module_css_default.sourceBar,
						children: [
							(0, react_jsx_runtime.jsx)("span", { children: t("offlineSource") }),
							(0, react_jsx_runtime.jsxs)("span", {
								title: loaded?.version,
								children: [
									t("sourceVersion"),
									": ",
									loaded?.version.slice(0, 12) ?? "—",
									"…"
								]
							}),
							(0, react_jsx_runtime.jsxs)("span", { children: [
								t("exportRevision"),
								": ",
								project.exportRevision || "—"
							] }),
							(0, react_jsx_runtime.jsx)("span", { children: t("manualImport") })
						]
					}),
					chatUnavailable && (0, react_jsx_runtime.jsx)("div", {
						className: L5xBody_module_css_default.notice,
						role: "status",
						children: t("chatUnavailable")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: L5xBody_module_css_default.layout,
						children: [
							(0, react_jsx_runtime.jsxs)("aside", {
								className: L5xBody_module_css_default.tree,
								"aria-label": t("controller"),
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.treeHeading,
										children: [t("organizer"), (0, react_jsx_runtime.jsx)("span", { children: project.name })]
									}),
									(0, react_jsx_runtime.jsx)("input", {
										className: L5xBody_module_css_default.organizerSearch,
										value: organizerQuery,
										onChange: (event) => {
											setOrganizerQuery(event.target.value);
										},
										placeholder: t("organizerSearch"),
										"aria-label": t("organizerSearch")
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: L5xBody_module_css_default.treeScroll,
										children: (0, react_jsx_runtime.jsxs)("details", {
											open: true,
											className: L5xBody_module_css_default.controllerRoot,
											children: [
												(0, react_jsx_runtime.jsxs)("summary", { children: [
													t("controller"),
													" ",
													project.name
												] }),
												(filter === "" || project.tags.some((tag) => matches(tag.name))) && (0, react_jsx_runtime.jsxs)("button", {
													type: "button",
													className: L5xBody_module_css_default.leafButton,
													onClick: () => {
														openTags("controller", filter);
													},
													children: [
														t("tags"),
														" ",
														(0, react_jsx_runtime.jsx)("small", { children: project.tags.length })
													]
												}),
												filter === "" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
													className: L5xBody_module_css_default.unexportedLeaf,
													title: t("notExported"),
													children: t("controllerFault")
												}), (0, react_jsx_runtime.jsx)("div", {
													className: L5xBody_module_css_default.unexportedLeaf,
													title: t("notExported"),
													children: t("powerUp")
												})] }),
												(0, react_jsx_runtime.jsxs)("details", {
													open: true,
													className: L5xBody_module_css_default.nested,
													children: [
														(0, react_jsx_runtime.jsx)("summary", { children: t("tasks") }),
														project.tasks.filter((task) => matches(task.name) || task.programs.some((name) => {
															const program = project.programs.find((item) => item.name === name);
															return program !== void 0 && programMatches(program);
														})).map((task) => (0, react_jsx_runtime.jsxs)("details", {
															className: L5xBody_module_css_default.nested,
															open: filter !== "" || task.programs.includes(current?.program ?? ""),
															children: [(0, react_jsx_runtime.jsxs)("summary", {
																title: `${task.type} · ${task.rate}`,
																children: [task.name, (0, react_jsx_runtime.jsx)("small", { children: task.rate ? `${task.rate} ${t("milliseconds")}` : task.type })]
															}), task.programs.map((name) => project.programs.find((program) => program.name === name)).filter((program) => program !== void 0 && programMatches(program)).map(treeProgram)]
														}, task.name)),
														(filter === "" || unscheduled.some(programMatches)) && (0, react_jsx_runtime.jsxs)("details", {
															className: L5xBody_module_css_default.nested,
															open: filter !== "" ? true : void 0,
															children: [
																(0, react_jsx_runtime.jsx)("summary", { children: t("unscheduled") }),
																unscheduled.filter(programMatches).map(treeProgram),
																unscheduled.length === 0 && (0, react_jsx_runtime.jsx)("span", {
																	className: L5xBody_module_css_default.leaf,
																	children: t("none")
																})
															]
														})
													]
												}),
												filter === "" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
													(0, react_jsx_runtime.jsx)("div", {
														className: L5xBody_module_css_default.unexportedLeaf,
														title: t("notExported"),
														children: t("motionGroups")
													}),
													(0, react_jsx_runtime.jsx)("div", {
														className: L5xBody_module_css_default.unexportedLeaf,
														title: t("notExported"),
														children: t("alarmManager")
													}),
													(0, react_jsx_runtime.jsx)("div", {
														className: L5xBody_module_css_default.unexportedLeaf,
														title: t("notExported"),
														children: t("assets")
													}),
													(0, react_jsx_runtime.jsx)("div", {
														className: L5xBody_module_css_default.unexportedLeaf,
														title: t("notExported"),
														children: t("logicalModel")
													})
												] }),
												(0, react_jsx_runtime.jsxs)("details", {
													className: L5xBody_module_css_default.nested,
													open: filter !== "" ? true : void 0,
													children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
														t("modules"),
														" (",
														project.modules.length,
														")"
													] }), rootModules.filter((module) => filter === "" || matches(module.name) || matches(module.catalog) || project.modules.some((childModule) => childModule.parent === module.name && (matches(childModule.name) || matches(childModule.catalog)))).map((module) => treeModule(module))]
												}),
												(0, react_jsx_runtime.jsxs)("details", {
													className: L5xBody_module_css_default.nested,
													open: filter !== "" ? true : void 0,
													children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
														t("aois"),
														" (",
														project.aois.length,
														")"
													] }), project.aois.filter(matches).map((name) => (0, react_jsx_runtime.jsx)("div", {
														className: L5xBody_module_css_default.leaf,
														children: name
													}, name))]
												}),
												(0, react_jsx_runtime.jsxs)("details", {
													className: L5xBody_module_css_default.nested,
													open: filter !== "" ? true : void 0,
													children: [(0, react_jsx_runtime.jsxs)("summary", { children: [
														t("types"),
														" (",
														project.types.length,
														")"
													] }), project.types.filter(matches).map((name) => (0, react_jsx_runtime.jsx)("div", {
														className: L5xBody_module_css_default.leaf,
														children: name
													}, name))]
												})
											]
										})
									}, filter)
								]
							}),
							(0, react_jsx_runtime.jsxs)("section", {
								className: L5xBody_module_css_default.editor,
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.tabStrip,
										children: [tagView !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
											className: L5xBody_module_css_default.activeTab,
											children: [(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												children: tagView === "controller" ? t("tags") : `${current?.program} / ${t("programTags")}`
											}), (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: L5xBody_module_css_default.closeTab,
												onClick: () => {
													setTagView(void 0);
												},
												"aria-label": t("closeTab"),
												children: "×"
											})]
										}), visibleTabs.map((tab) => (0, react_jsx_runtime.jsxs)("div", {
											className: tagView === void 0 && tab.program === current?.program && tab.routine === current.routine ? L5xBody_module_css_default.activeTab : L5xBody_module_css_default.tab,
											children: [(0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												onClick: () => {
													setTagView(void 0);
													setChoice(tab);
													setInspector(void 0);
													setFocused(void 0);
													setFocusedRung(void 0);
													setRungLimit(80);
												},
												children: [
													tab.program,
													" / ",
													tab.routine
												]
											}), (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: L5xBody_module_css_default.closeTab,
												onClick: () => {
													closeTab(tab);
												},
												"aria-label": `${t("closeTab")} ${tab.routine}`,
												children: "×"
											})]
										}, `${tab.program}/${tab.routine}`))]
									}),
									(0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.editorTools,
										children: [
											(0, react_jsx_runtime.jsx)("strong", { children: tagView === void 0 ? `${current?.program} / ${selected?.name ?? t("noSelection")}` : tagView === "controller" ? t("tags") : `${current?.program} / ${t("programTags")}` }),
											(0, react_jsx_runtime.jsx)("span", { children: tagView === void 0 ? selected?.type ?? "—" : t("offlineValues") }),
											(0, react_jsx_runtime.jsx)("span", { className: L5xBody_module_css_default.toolSpacer }),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													setShowSource((value) => !value);
												},
												"aria-pressed": showSource,
												children: t("source")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													setChatUnavailable(!ask(resourceAddress, `Explain and review the offline routine ${current?.program}/${current?.routine} in the current L5X export. Use the L5X engineering plugin tools for references and checks. Do not change a controller.`));
												},
												children: t("askRoutine")
											})
										]
									}),
									tagView === void 0 && focused !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.focusBar,
										role: "status",
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: L5xBody_module_css_default.focusBadge,
												children: t("focusedInstruction")
											}),
											(0, react_jsx_runtime.jsx)("strong", { children: focused.mnemonic }),
											(0, react_jsx_runtime.jsx)("code", { children: focused.operands }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("rung"),
												" ",
												focused.rung
											] }),
											(0, react_jsx_runtime.jsxs)("span", {
												className: L5xBody_module_css_default.focusValue,
												children: [
													focused.symbol !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("code", { children: focused.symbol }), " · "] }),
													t("exportedValue"),
													": ",
													focused.symbol === void 0 ? t("noExportedValue") : detailFor(focused.symbol)?.datum?.value ?? t("noExportedValue")
												]
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: focused.symbol === void 0,
												onClick: () => {
													if (focused.symbol !== void 0) find(focused.symbol);
												},
												children: t("references")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: focused.symbol === void 0,
												onClick: () => {
													if (focused.symbol !== void 0) addWatch(focused.symbol);
												},
												children: t("addWatch")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													setFocused(void 0);
													setFocusedRung(void 0);
												},
												"aria-label": t("clearFocus"),
												children: "×"
											})
										]
									}),
									tagView === void 0 && focused === void 0 && focusedRung !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.focusBar,
										role: "status",
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: L5xBody_module_css_default.focusBadge,
												children: t("focusedRung")
											}),
											(0, react_jsx_runtime.jsxs)("strong", { children: [
												t("rung"),
												" ",
												focusedRung
											] }),
											(0, react_jsx_runtime.jsx)("code", { children: selectedRung?.comment || selectedRung?.text }),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													navigator.clipboard.writeText(selectedRung?.text ?? "");
												},
												children: t("copyRung")
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													setFocusedRung(void 0);
												},
												"aria-label": t("clearFocus"),
												children: "×"
											})
										]
									}),
									(0, react_jsx_runtime.jsx)("main", {
										className: L5xBody_module_css_default.main,
										ref: scrollportRef,
										children: tagView !== void 0 ? (0, react_jsx_runtime.jsx)(TagTable, {
											tags: tagView === "controller" ? project.tags : selectedProgram?.tags ?? [],
											filter: tagFilter,
											setFilter: setTagFilter,
											onContext: contextFor,
											onWatch: addWatch,
											onFind: find,
											getDatum: (tag) => exportedDatum(project, tag.scope, tag.name),
											t
										}) : selected === void 0 ? (0, react_jsx_runtime.jsx)("div", {
											className: L5xBody_module_css_default.status,
											children: t("noSelection")
										}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											selected.description !== "" && (0, react_jsx_runtime.jsx)("p", {
												className: L5xBody_module_css_default.description,
												children: selected.description
											}),
											selected.type === "RLL" && (selected.rungs.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
												className: L5xBody_module_css_default.status,
												children: t("noRungs")
											}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [selected.rungs.slice(0, rungLimit).map((rung) => (0, react_jsx_runtime.jsx)(RungView, {
												rung,
												showSource,
												describeOperand,
												detailFor,
												focused,
												focusedRung,
												onFocusRung: focusRung,
												onFocusInstruction: focusInstruction,
												onContext: contextFor,
												t
											}, rung.number)), selected.rungs.length > rungLimit && (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: L5xBody_module_css_default.loadMore,
												onClick: () => {
													setRungLimit((limit) => limit + 80);
												},
												children: [
													t("loadMore"),
													" (",
													selected.rungs.length - rungLimit,
													")"
												]
											})] })),
											selected.type === "ST" && (0, react_jsx_runtime.jsx)("pre", {
												className: L5xBody_module_css_default.structured,
												onContextMenu: (event) => {
													contextFor(event, selected.code);
												},
												children: selected.code
											}),
											selected.type !== "RLL" && selected.type !== "ST" && (0, react_jsx_runtime.jsxs)("div", {
												className: L5xBody_module_css_default.status,
												children: [
													t("unsupported"),
													" (",
													selected.type,
													")"
												]
											})
										] })
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("aside", {
								className: L5xBody_module_css_default.inspector,
								"aria-label": t("inspect"),
								children: [
									(0, react_jsx_runtime.jsx)("div", {
										className: L5xBody_module_css_default.inspectorHeading,
										children: t("inspect")
									}),
									focused !== void 0 && tagView === void 0 ? (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.propertyList,
										children: [
											(0, react_jsx_runtime.jsxs)("strong", { children: [
												focused.mnemonic,
												"(",
												focused.operands,
												")"
											] }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												current?.program,
												" / ",
												current?.routine,
												" · ",
												t("rung"),
												" ",
												focused.rung
											] }),
											(0, react_jsx_runtime.jsx)("span", {
												className: L5xBody_module_css_default.inspectorCaution,
												children: t("exportedValueScope")
											}),
											(0, react_jsx_runtime.jsx)("div", {
												className: L5xBody_module_css_default.operandDetails,
												children: focusedOperands.map((operand, index) => (0, react_jsx_runtime.jsxs)("div", { children: [
													(0, react_jsx_runtime.jsx)("code", { children: operand.text }),
													(0, react_jsx_runtime.jsx)("strong", { children: operand.datum?.value ?? (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u.test(operand.text) ? operand.text : t("noExportedValue")) }),
													(0, react_jsx_runtime.jsxs)("span", { children: [
														operand.datum?.type ?? operand.tag?.type ?? t("literal"),
														" · ",
														operand.tag?.scope ?? "—"
													] }),
													operand.tag?.description && (0, react_jsx_runtime.jsx)("p", { children: operand.tag.description })
												] }, index))
											}),
											(0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: L5xBody_module_css_default.actionButton,
												onClick: () => {
													setChatUnavailable(!ask(resourceAddress, `Explain ${focused.mnemonic}(${focused.operands}) at ${current?.program}/${current?.routine} rung ${focused.rung} in this offline L5X. Identify operand scope, cross references, and evidence. Do not assume exported values are live.`));
												},
												children: t("askInstruction")
											}),
											focused.symbol !== void 0 && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: L5xBody_module_css_default.actionButton,
												onClick: () => {
													setChatUnavailable(!ask(resourceAddress, `Read the current value of ${focused.symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report the observed timestamp and limitations. Do not write data, force, download, or change controller mode.`));
												},
												children: t("askLiveRead")
											})
										]
									}) : focusedRung !== void 0 && tagView === void 0 ? (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.propertyList,
										children: [
											(0, react_jsx_runtime.jsxs)("strong", { children: [
												t("rung"),
												" ",
												focusedRung
											] }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												current?.program,
												" / ",
												current?.routine
											] }),
											(0, react_jsx_runtime.jsx)("p", { children: selectedRung?.comment || t("noDescription") }),
											(0, react_jsx_runtime.jsx)("code", { children: selectedRung?.text })
										]
									}) : inspector?.kind === "tag" ? (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.propertyList,
										children: [
											(0, react_jsx_runtime.jsx)("strong", { children: inspector.tag.name }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("type"),
												": ",
												inspector.tag.type
											] }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("scope"),
												": ",
												inspector.tag.scope
											] }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("exportedValue"),
												": ",
												exportedDatum(project, inspector.tag.scope, inspector.tag.name)?.value ?? t("noExportedValue")
											] }),
											inspector.tag.alias !== "" && (0, react_jsx_runtime.jsxs)("span", { children: [
												t("alias"),
												": ",
												inspector.tag.alias
											] }),
											(0, react_jsx_runtime.jsx)("p", { children: inspector.tag.description || t("noDescription") })
										]
									}) : inspector?.kind === "module" ? (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.propertyList,
										children: [
											(0, react_jsx_runtime.jsx)("strong", { children: inspector.module.name }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("type"),
												": ",
												inspector.module.catalog
											] }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("parent"),
												": ",
												inspector.module.parent || "—"
											] }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("slot"),
												": ",
												inspector.module.slot || "—"
											] }),
											(0, react_jsx_runtime.jsx)("p", { children: inspector.module.description || t("noDescription") })
										]
									}) : (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.propertyList,
										children: [
											(0, react_jsx_runtime.jsx)("strong", { children: selected?.name ?? project.name }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("type"),
												": ",
												selected?.type ?? project.processor
											] }),
											(0, react_jsx_runtime.jsxs)("span", { children: [
												t("programs"),
												": ",
												selectedProgram?.name ?? "—"
											] }),
											selected?.type === "RLL" && (0, react_jsx_runtime.jsxs)("span", { children: [
												t("rungCount"),
												": ",
												selected.rungs.length
											] }),
											selectedProgram !== void 0 && (0, react_jsx_runtime.jsxs)("span", { children: [
												t("mainRoutine"),
												": ",
												selectedProgram.main || "—"
											] }),
											(0, react_jsx_runtime.jsx)("p", { children: selected?.description || selectedProgram?.description || t("noDescription") })
										]
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: L5xBody_module_css_default.inspectorHeading,
										children: t("aryaActions")
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: L5xBody_module_css_default.actionButton,
										onClick: () => {
											setChatUnavailable(!ask(resourceAddress, `Review ${current?.program}/${current?.routine} in the offline L5X using the engineering plugin. Explain the logic and cite source rungs.`));
										},
										children: t("explainRoutine")
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: L5xBody_module_css_default.actionButton,
										onClick: () => {
											setChatUnavailable(!ask(resourceAddress, `Propose an offline edit to ${current?.program}/${current?.routine} in this L5X. Show the before/after and validation evidence. Do not connect online or download.`));
										},
										children: t("askChange")
									}),
									(0, react_jsx_runtime.jsx)("p", {
										className: L5xBody_module_css_default.inspectorHelp,
										children: t("agentEdits")
									})
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: L5xBody_module_css_default.bottomPanel,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: L5xBody_module_css_default.bottomTabs,
							children: [
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: bottomPane === "search" ? L5xBody_module_css_default.bottomActive : "",
									onClick: () => {
										setBottomPane("search");
									},
									children: [
										t("references"),
										" ",
										query !== "" && `(${references.length})`
									]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: bottomPane === "watch" ? L5xBody_module_css_default.bottomActive : "",
									onClick: () => {
										setBottomPane("watch");
									},
									children: [
										t("offlineWatch"),
										" (",
										watch.length,
										")"
									]
								}),
								(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: bottomPane === "diagnostics" ? L5xBody_module_css_default.bottomActive : "",
									onClick: () => {
										setBottomPane("diagnostics");
									},
									children: [
										t("reviewHints"),
										" (",
										findings.length,
										")"
									]
								})
							]
						}), (0, react_jsx_runtime.jsxs)("div", {
							className: L5xBody_module_css_default.bottomContent,
							children: [
								bottomPane === "diagnostics" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsx)("p", {
										className: L5xBody_module_css_default.panelNote,
										children: t("reviewHintScope")
									}),
									findings.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
										className: L5xBody_module_css_default.empty,
										children: t("noFindings")
									}) : findings.slice(0, 100).map((finding, index) => (0, react_jsx_runtime.jsxs)("div", {
										className: L5xBody_module_css_default.finding,
										children: [
											(0, react_jsx_runtime.jsx)("span", {
												className: finding.severity === "warning" ? L5xBody_module_css_default.warning : L5xBody_module_css_default.info,
												children: finding.severity
											}),
											(0, react_jsx_runtime.jsx)("strong", { children: finding.location }),
											(0, react_jsx_runtime.jsx)("span", { children: finding.message }),
											(0, react_jsx_runtime.jsx)("code", { children: finding.evidence })
										]
									}, `${finding.code}/${finding.location}/${index}`)),
									findings.length > 100 && (0, react_jsx_runtime.jsxs)("p", {
										className: L5xBody_module_css_default.empty,
										children: [
											t("moreFindings"),
											" (",
											findings.length - 100,
											")"
										]
									})
								] }),
								bottomPane === "search" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsxs)("label", {
										className: L5xBody_module_css_default.searchLabel,
										children: [t("find"), (0, react_jsx_runtime.jsx)("input", {
											value: query,
											onChange: (event) => {
												setQuery(event.target.value);
												setShowReferences(true);
											},
											placeholder: t("findPlaceholder")
										})]
									}),
									showReferences && query !== "" && (0, react_jsx_runtime.jsx)("p", {
										className: L5xBody_module_css_default.panelNote,
										children: t("referenceScope")
									}),
									showReferences && query !== "" && (references.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
										className: L5xBody_module_css_default.empty,
										children: t("noResults")
									}) : references.slice(0, 200).map((reference, index) => (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: L5xBody_module_css_default.reference,
										onClick: () => {
											selectReference(reference.program, reference.routine, reference.location);
										},
										onContextMenu: (event) => {
											contextFor(event, reference.text, query);
										},
										children: [
											(0, react_jsx_runtime.jsxs)("strong", { children: [
												reference.program,
												" / ",
												reference.routine
											] }),
											(0, react_jsx_runtime.jsx)("span", { children: reference.location }),
											(0, react_jsx_runtime.jsx)("code", { children: reference.text })
										]
									}, `${reference.program}/${reference.routine}/${reference.location}/${index}`))),
									references.length > 200 && (0, react_jsx_runtime.jsxs)("p", {
										className: L5xBody_module_css_default.empty,
										children: [
											t("moreResults"),
											" (",
											references.length - 200,
											")"
										]
									})
								] }),
								bottomPane === "watch" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("p", {
									className: L5xBody_module_css_default.panelNote,
									children: t("watchScope")
								}), watch.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
									className: L5xBody_module_css_default.empty,
									children: t("watchEmpty")
								}) : (0, react_jsx_runtime.jsxs)("table", {
									className: L5xBody_module_css_default.watchTable,
									children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
										(0, react_jsx_runtime.jsx)("th", { children: t("name") }),
										(0, react_jsx_runtime.jsx)("th", { children: t("scope") }),
										(0, react_jsx_runtime.jsx)("th", { children: t("type") }),
										(0, react_jsx_runtime.jsx)("th", { children: t("exportedValue") }),
										(0, react_jsx_runtime.jsx)("th", { children: t("context") })
									] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: watch.map((symbol) => {
										const detail = detailFor(symbol);
										return (0, react_jsx_runtime.jsxs)("tr", { children: [
											(0, react_jsx_runtime.jsx)("th", { children: symbol }),
											(0, react_jsx_runtime.jsx)("td", { children: detail?.tag?.scope ?? "—" }),
											(0, react_jsx_runtime.jsx)("td", { children: detail?.datum?.type ?? detail?.tag?.type ?? "—" }),
											(0, react_jsx_runtime.jsx)("td", {
												className: L5xBody_module_css_default.noValue,
												children: detail?.datum?.value ?? t("noExportedValue")
											}),
											(0, react_jsx_runtime.jsxs)("td", {
												className: L5xBody_module_css_default.tagActions,
												children: [
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														onClick: () => {
															find(symbol);
														},
														children: t("references")
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														onClick: () => {
															setChatUnavailable(!ask(resourceAddress, `Read the current value of ${symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report the observed timestamp and limitations. Do not write data, force, download, or change controller mode.`));
														},
														children: t("askLiveRead")
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														onClick: () => {
															setWatch((previous) => previous.filter((item) => item !== symbol));
														},
														"aria-label": `${t("removeWatch")} ${symbol}`,
														children: "×"
													})
												]
											})
										] }, symbol);
									}) })]
								})] })
							]
						})]
					}),
					context !== void 0 && (0, react_dom.createPortal)((0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
						className: L5xBody_module_css_default.menu,
						role: "menu",
						style: {
							left: context.x,
							top: context.y
						},
						onPointerDown: (event) => {
							event.stopPropagation();
						},
						children: [
							context.instruction !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
								className: L5xBody_module_css_default.menuHeading,
								children: [
									context.instruction.mnemonic,
									" · ",
									t("rung"),
									" ",
									context.instruction.rung
								]
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									setChatUnavailable(!ask(resourceAddress, context.instruction === void 0 ? `Context: ${context.text}` : `Explain ${context.text} at ${current?.program}/${current?.routine} rung ${context.instruction.rung} using the offline L5X engineering tools. Identify symbols, scope, and evidence. Do not assume exported values are live.`));
									setContext(void 0);
								},
								children: context.instruction === void 0 ? t("ask") : t("askInstruction")
							}),
							context.instruction?.mnemonic.toUpperCase() === "JSR" && selectedProgram?.routines.some((routine) => routine.name === displayOperands("JSR", context.instruction?.operands ?? "")[0]) && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									const called = selectedProgram.routines.find((routine) => routine.name === displayOperands("JSR", context.instruction?.operands ?? "")[0]);
									if (called !== void 0) select(selectedProgram, called);
									setContext(void 0);
								},
								children: t("openCalledRoutine")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									find(context.symbol ?? context.text);
								},
								children: t("references")
							}),
							context.symbol !== void 0 && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									addWatch(context.symbol ?? "");
								},
								children: t("addWatch")
							}),
							context.symbol !== void 0 && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									setChatUnavailable(!ask(resourceAddress, `Read the current value of ${context.symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report timestamp and limitations; do not write, force, download, or change controller mode.`));
									setContext(void 0);
								},
								children: t("askLiveRead")
							}),
							context.symbol !== void 0 && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									navigator.clipboard.writeText(context.symbol ?? "");
									setContext(void 0);
								},
								children: t("copyOperand")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									navigator.clipboard.writeText(context.text);
									setContext(void 0);
								},
								children: context.instruction === void 0 ? t("copy") : t("copyInstruction")
							}),
							context.instruction !== void 0 && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									navigator.clipboard.writeText(selected?.rungs.find((rung) => rung.number === context.instruction?.rung)?.text ?? context.text);
									setContext(void 0);
								},
								children: t("copyRung")
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								className: L5xBody_module_css_default.menuItem,
								onClick: () => {
									setChatUnavailable(!ask(resourceAddress, `Propose an offline change for ${context.text}${context.instruction === void 0 ? "" : ` at ${current?.program}/${current?.routine} rung ${context.instruction.rung}`} in this L5X export. Show the exact before/after and validation evidence. Do not connect online or download.`));
									setContext(void 0);
								},
								children: t("askChange")
							})
						]
					}), document.body)
				]
			});
		}
		function TagTable({ tags, filter, setFilter, onContext, onWatch, onFind, getDatum, t }) {
			const needle = filter.trim().toLowerCase();
			const visible = tags.filter((tag) => needle === "" || tag.name.toLowerCase().includes(needle) || tag.type.toLowerCase().includes(needle)).slice(0, 250);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: L5xBody_module_css_default.tagTableView,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: L5xBody_module_css_default.tagTableToolbar,
						children: [
							(0, react_jsx_runtime.jsxs)("label", { children: [
								t("find"),
								" ",
								(0, react_jsx_runtime.jsx)("input", {
									value: filter,
									onChange: (event) => {
										setFilter(event.target.value);
									},
									placeholder: t("findTag")
								})
							] }),
							(0, react_jsx_runtime.jsxs)("span", { children: [
								visible.length,
								" / ",
								tags.length
							] }),
							(0, react_jsx_runtime.jsx)("span", { children: t("exportedValueScope") })
						]
					}),
					(0, react_jsx_runtime.jsxs)("table", {
						className: L5xBody_module_css_default.tagTable,
						children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
							(0, react_jsx_runtime.jsx)("th", { children: t("name") }),
							(0, react_jsx_runtime.jsx)("th", { children: t("exportedValue") }),
							(0, react_jsx_runtime.jsx)("th", { children: t("type") }),
							(0, react_jsx_runtime.jsx)("th", { children: t("alias") }),
							(0, react_jsx_runtime.jsx)("th", { children: t("description") }),
							(0, react_jsx_runtime.jsx)("th", { children: t("context") })
						] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: visible.map((tag) => (0, react_jsx_runtime.jsxs)("tr", {
							onContextMenu: (event) => {
								onContext(event, tag.name, tag.name);
							},
							children: [
								(0, react_jsx_runtime.jsx)("th", {
									title: tag.scope,
									children: tag.name
								}),
								(0, react_jsx_runtime.jsx)("td", {
									className: L5xBody_module_css_default.noValue,
									children: getDatum(tag)?.value ?? t("noExportedValue")
								}),
								(0, react_jsx_runtime.jsx)("td", { children: tag.type }),
								(0, react_jsx_runtime.jsx)("td", { children: tag.alias }),
								(0, react_jsx_runtime.jsx)("td", {
									title: tag.description,
									children: tag.description
								}),
								(0, react_jsx_runtime.jsxs)("td", {
									className: L5xBody_module_css_default.tagActions,
									children: [(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											onWatch(tag.name);
										},
										children: t("addWatch")
									}), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											onFind(tag.name);
										},
										children: t("references")
									})]
								})
							]
						}, `${tag.scope}/${tag.name}`)) })]
					}),
					tags.length > 250 && (0, react_jsx_runtime.jsx)("p", {
						className: L5xBody_module_css_default.panelNote,
						children: t("filterMore")
					})
				]
			});
		}
		function RungView({ rung, showSource, describeOperand, detailFor, focused, focusedRung, onFocusRung, onFocusInstruction, onContext, t }) {
			const segments = ladderSegments(rung.text);
			return (0, react_jsx_runtime.jsxs)("section", {
				className: `${L5xBody_module_css_default.rung} ${focusedRung === rung.number ? L5xBody_module_css_default.focusedRung : ""}`,
				"data-rung": rung.number,
				onContextMenu: (event) => {
					onContext(event, rung.text);
				},
				children: [(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: L5xBody_module_css_default.rungNumber,
					"aria-pressed": focusedRung === rung.number && focused === void 0,
					"aria-label": `${t("focusRung")} ${rung.number}`,
					onClick: () => {
						onFocusRung(rung.number);
					},
					onContextMenu: (event) => {
						event.stopPropagation();
						onFocusRung(rung.number);
						onContext(event, rung.text);
					},
					children: rung.number
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: L5xBody_module_css_default.rungBody,
					children: [
						rung.comment !== "" && (0, react_jsx_runtime.jsx)("div", {
							className: L5xBody_module_css_default.comment,
							children: rung.comment
						}),
						segments === null ? (0, react_jsx_runtime.jsx)("code", {
							className: L5xBody_module_css_default.neutral,
							children: rung.text
						}) : (0, react_jsx_runtime.jsx)("div", {
							className: L5xBody_module_css_default.rail,
							children: (0, react_jsx_runtime.jsx)(LadderPath, {
								segments,
								path: rung.number,
								rung: rung.number,
								depth: 0,
								describeOperand,
								detailFor,
								focused,
								onFocusInstruction,
								onContext,
								t
							})
						}),
						showSource && (0, react_jsx_runtime.jsx)("code", {
							className: L5xBody_module_css_default.source,
							children: rung.text
						})
					]
				})]
			});
		}
		function LadderPath({ segments, path, rung, depth, describeOperand, detailFor, focused, onFocusInstruction, onContext, t }) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: `${L5xBody_module_css_default.path} ${depth > 0 ? L5xBody_module_css_default.nestedPath : ""}`,
				children: segments.map((segment, index) => "paths" in segment ? (0, react_jsx_runtime.jsx)("div", {
					className: L5xBody_module_css_default.branch,
					children: segment.paths.map((branchSegments, pathIndex) => (0, react_jsx_runtime.jsx)("div", {
						className: L5xBody_module_css_default.branchPath,
						children: (0, react_jsx_runtime.jsx)(LadderPath, {
							segments: branchSegments,
							path: `${path}/${index}/${pathIndex}`,
							rung,
							depth: depth + 1,
							describeOperand,
							detailFor,
							focused,
							onFocusInstruction,
							onContext,
							t
						})
					}, pathIndex))
				}, index) : (() => {
					const id = `${path}/${index}`;
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
					return (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						"data-l5x-instruction": true,
						"data-instruction-id": id,
						"aria-pressed": selected,
						"aria-label": `${segment.mnemonic} ${segment.operands}`,
						className: `${L5xBody_module_css_default.instruction} ${[
							"XIC",
							"XIO",
							"OTE",
							"OTL",
							"OTU"
						].includes(segment.mnemonic.toUpperCase()) ? "" : L5xBody_module_css_default.functionBlock} ${index === segments.length - 1 && terminalInstructions.has(segment.mnemonic.toUpperCase()) ? L5xBody_module_css_default.outputInstruction : ""} ${selected ? L5xBody_module_css_default.focusedInstruction : ""}`,
						onFocus: () => {
							onFocusInstruction(instruction);
						},
						onClick: () => {
							onFocusInstruction(instruction);
						},
						onKeyDown: (event) => {
							if (![
								"ArrowLeft",
								"ArrowRight",
								"ArrowUp",
								"ArrowDown",
								"Home",
								"End"
							].includes(event.key)) return;
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
							(0, react_jsx_runtime.jsx)("span", {
								className: L5xBody_module_css_default.instructionDescription,
								title: describeOperand(segment.operands),
								children: describeOperand(segment.operands)
							}),
							[
								"XIC",
								"XIO",
								"OTE",
								"OTL",
								"OTU"
							].includes(segment.mnemonic.toUpperCase()) ? (0, react_jsx_runtime.jsxs)("span", {
								className: L5xBody_module_css_default.glyph,
								"aria-hidden": "true",
								children: [
									(0, react_jsx_runtime.jsx)("i", { className: L5xBody_module_css_default.wireLead }),
									segment.mnemonic.toUpperCase().startsWith("X") ? (0, react_jsx_runtime.jsx)("i", { className: `${L5xBody_module_css_default.contact} ${segment.mnemonic.toUpperCase() === "XIO" ? L5xBody_module_css_default.negated : ""}` }) : (0, react_jsx_runtime.jsx)("i", {
										className: L5xBody_module_css_default.coil,
										children: segment.mnemonic.toUpperCase() === "OTL" ? t("latchGlyph") : segment.mnemonic.toUpperCase() === "OTU" ? t("unlatchGlyph") : ""
									}),
									(0, react_jsx_runtime.jsx)("i", { className: L5xBody_module_css_default.wireLead })
								]
							}) : (0, react_jsx_runtime.jsxs)("span", {
								className: L5xBody_module_css_default.blockCard,
								children: [(0, react_jsx_runtime.jsx)("strong", { children: segment.mnemonic }), displayOperands(segment.mnemonic, segment.operands).map((operand, operandIndex) => {
									const operandKey = operandKeys[segment.mnemonic.toUpperCase()]?.[operandIndex];
									const datum = detailFor(operand)?.datum;
									const value = datum?.value ?? (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u.test(operand) ? operand : "");
									const operandSymbol = /^[A-Za-z_][\w:]*/u.test(operand) ? operand : void 0;
									const operandInstruction = {
										id,
										rung,
										mnemonic: segment.mnemonic,
										operands: segment.operands,
										...operandSymbol === void 0 ? {} : { symbol: operandSymbol }
									};
									return (0, react_jsx_runtime.jsxs)("span", { children: [
										(0, react_jsx_runtime.jsx)("small", { children: operandKey === void 0 ? `${operandIndex + 1}` : t(operandKey) }),
										(0, react_jsx_runtime.jsx)("code", {
											title: datum === void 0 ? operand : `${operand} · ${t("exportedValue")}: ${datum.value}\n${t("exportedValueScope")}`,
											onClick: (event) => {
												event.stopPropagation();
												event.currentTarget.closest("button")?.focus();
												onFocusInstruction(operandInstruction);
											},
											onContextMenu: (event) => {
												event.stopPropagation();
												event.currentTarget.closest("button")?.focus();
												onContext(event, `${segment.mnemonic}(${segment.operands})`, operandSymbol, operandInstruction);
											},
											children: operand
										}),
										value !== "" && (0, react_jsx_runtime.jsx)("b", {
											title: datum === void 0 ? operand : t("exportedValueScope"),
											children: value
										})
									] }, operandIndex);
								})]
							}),
							[
								"XIC",
								"XIO",
								"OTE",
								"OTL",
								"OTU"
							].includes(segment.mnemonic.toUpperCase()) && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(0, react_jsx_runtime.jsx)("strong", { children: segment.mnemonic }),
								(0, react_jsx_runtime.jsx)("code", {
									title: segment.operands,
									children: segment.operands
								}),
								detail?.datum !== void 0 && (0, react_jsx_runtime.jsxs)("span", {
									className: L5xBody_module_css_default.exportedChip,
									title: t("exportedValueScope"),
									children: [
										t("exportedValue"),
										": ",
										detail.datum.value
									]
								})
							] }),
							(0, react_jsx_runtime.jsxs)("span", {
								className: L5xBody_module_css_default.instructionTooltip,
								role: "tooltip",
								children: [
									(0, react_jsx_runtime.jsxs)("strong", { children: [
										segment.mnemonic,
										"(",
										segment.operands,
										")"
									] }),
									(0, react_jsx_runtime.jsxs)("span", { children: [
										t("rung"),
										" ",
										rung
									] }),
									detail?.tag !== void 0 && (0, react_jsx_runtime.jsxs)("span", { children: [
										t("scope"),
										": ",
										detail.tag.scope,
										" · ",
										t("type"),
										": ",
										detail.datum?.type ?? detail.tag.type
									] }),
									(0, react_jsx_runtime.jsxs)("span", { children: [
										t("exportedValue"),
										": ",
										detail?.datum?.value ?? t("noExportedValue")
									] }),
									detail?.tag?.description && (0, react_jsx_runtime.jsx)("span", { children: detail.tag.description })
								]
							})
						]
					}, id);
				})())
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** English product strings. */
		const en = {
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
			"productMark": "LOGIX",
			"workspaceMark": "WORKSPACE",
			"milliseconds": "ms",
			"latchGlyph": "L",
			"unlatchGlyph": "U",
			title: "Logix project",
			loading: "Reading Logix project…",
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
			offlineSource: "OFFLINE · exported source",
			sourceVersion: "File version",
			exportRevision: "Studio export",
			manualImport: "Review and import in Studio 5000",
			organizer: "Controller Organizer",
			organizerSearch: "Find task, routine, tag, or module",
			unscheduled: "Unscheduled Programs",
			filterMore: "Search to show additional tags",
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
			offlineValues: "Offline · saved export",
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
			controllerFault: "Controller Fault Handler",
			powerUp: "Power-Up Handler",
			motionGroups: "Motion Groups",
			alarmManager: "Alarm Manager",
			assets: "Assets",
			logicalModel: "Logical Model",
			notExported: "Not included in this L5X export",
			none: "None"
		};
		/** Chinese product strings. */
		const zh = {
			"operand.source": "源",
			"operand.destination": "目标",
			"operand.length": "长度",
			"operand.timer": "定时器",
			"operand.a": "A",
			"operand.b": "B",
			"operand.sourceA": "源 A",
			"operand.sourceB": "源 B",
			"operand.routine": "例程名称",
			"operand.parameter": "参数",
			"productMark": "LOGIX",
			"workspaceMark": "工作区",
			"milliseconds": "ms",
			"latchGlyph": "L",
			"unlatchGlyph": "U",
			title: "Logix 项目",
			loading: "正在读取 Logix 项目…",
			invalid: "无法读取此 L5X 导出文件。",
			retry: "重试",
			acd: "ACD 是 Studio 5000 二进制项目。请在 Studio 5000 中导出 L5X 后在此浏览。",
			exportAcd: "请 Arya 准备 L5X",
			chatUnavailable: "此会话中无法使用 Arya 聊天。",
			controller: "控制器",
			tasks: "任务",
			programs: "程序",
			tags: "控制器标签",
			programTags: "参数和本地标签",
			modules: "I/O 配置",
			aois: "附加指令",
			types: "数据类型",
			noRoutines: "此程序没有例程。",
			noRungs: "此例程没有梯级。",
			unsupported: "此例程语言尚未在此视图中绘制。",
			find: "查找全部",
			findPlaceholder: "查找符号或文本",
			references: "交叉引用",
			noResults: "梯形图和结构化文本中没有找到引用。",
			ask: "询问 Arya",
			copy: "复制源代码",
			referenceScope: "梯形图和结构化文本中的文本匹配；请在工程工具中确认作用域。",
			monitor: "监视",
			monitorUnavailable: "此离线导出文件未连接实时监视。",
			source: "源代码",
			inspect: "检查",
			offline: "离线导出",
			changed: "读取期间文件发生变化。请重新加载此视图。",
			tooLarge: "此导出文件对于项目查看器过大。",
			routine: "例程",
			rung: "梯级",
			context: "操作",
			noSelection: "在项目树中选择一个例程。",
			revision: "版本 {revision}",
			reloadFile: "重新加载导出",
			offlineSource: "离线 · 导出源码",
			sourceVersion: "文件版本",
			exportRevision: "Studio 导出版本",
			manualImport: "在 Studio 5000 中审核并导入",
			organizer: "控制器组织器",
			organizerSearch: "查找任务、例程、标签或模块",
			unscheduled: "未调度程序",
			filterMore: "搜索以显示其他标签",
			closeTab: "关闭",
			askRoutine: "询问 Arya 此例程",
			loadMore: "加载更多梯级",
			type: "类型",
			scope: "作用域",
			alias: "别名指向",
			parent: "父模块",
			slot: "地址",
			rungCount: "梯级数",
			mainRoutine: "主例程",
			noDescription: "没有导出的说明。",
			aryaActions: "与 Arya 协作",
			explainRoutine: "解释此例程",
			askChange: "请 Arya 修改离线文件",
			agentEdits: "Arya 修改工作区中的 L5X。请重新加载导出并检查保存结果，然后在 Studio 5000 中导入。",
			reviewHints: "源文件检查",
			reviewHintScope: "仅依据此导出提供提示。请使用工程插件和 Studio 5000 验证修改。",
			noFindings: "当前展示的结构没有源文件检查提示。",
			moreFindings: "其他提示",
			moreResults: "其他匹配",
			offlineWatch: "离线监视列表",
			watchScope: "此处显示的数值来自已保存的导出文件；当前控制器数值在此视图中不可用。",
			watchEmpty: "右键单击操作数或标签以添加。",
			notLive: "无实时数值",
			removeWatch: "移除",
			addWatch: "添加到离线监视列表",
			openTagTable: "打开标签表",
			offlineValues: "离线 · 已保存的导出文件",
			findTag: "查找标签或数据类型",
			name: "名称",
			value: "数值",
			description: "说明",
			askLiveRead: "请 Arya 读取",
			focusedInstruction: "选中的指令",
			focusedRung: "选中的梯级",
			focusRung: "选择梯级",
			clearFocus: "清除选择",
			exportedValue: "导出时的数值",
			noExportedValue: "导出文件中未包含",
			exportedValueScope: "此值来自已保存的导出文件，不是控制器当前状态。",
			literal: "常量",
			askInstruction: "询问 Arya 此指令",
			copyOperand: "复制操作数",
			copyInstruction: "复制指令",
			copyRung: "复制梯级源代码",
			openCalledRoutine: "打开调用的例程",
			controllerFault: "控制器故障处理程序",
			powerUp: "上电处理程序",
			motionGroups: "运动组",
			alarmManager: "报警管理器",
			assets: "资产",
			logicalModel: "逻辑模型",
			notExported: "此 L5X 导出中未包含",
			none: "无"
		};
		//#endregion
		//#region lib/types/client/index.js
		const ID = "@deepseek-ai/dsh-client-ui-logix-project-viewer";
		const CHUNK = 1024 * 1024;
		const LIMIT = 64 * 1024 * 1024;
		const inject = [
			"slots",
			"locale",
			"documentPreviews",
			"remote",
			"remote.workspaceFiles"
		];
		function hostFileOf(address) {
			const parsed = parseFileAddress(address);
			if (parsed?.scope !== "session") throw new Error(`ui-logix-project-viewer: not a session file address "${address}"`);
			return {
				sessionId: parsed.sessionId,
				path: parsed.path
			};
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
					input.setDraft(existing === "" ? prompt : `${existing}\n${prompt}`);
					input.focus();
					return true;
				};
				scope.effect(() => () => {
					draft = () => false;
				});
			});
			ctx.effect(() => ctx.locale.register("sidebarL5x", {
				en,
				zh
			}));
			const t = ctx.locale.bind("sidebarL5x");
			const read = async (address, signal) => {
				const file = hostFileOf(address);
				const chunks = [];
				let offset = 0;
				let version;
				let total = 0;
				while (true) {
					signal.throwIfAborted();
					const result = await ctx.remote.workspaceFiles.readBytes(file.sessionId, file.path, { range: {
						offset,
						length: CHUNK
					} }, signal);
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
				return {
					xml,
					version
				};
			};
			const ask = (address, context) => draft(address, context);
			function WorkspaceLogixBody({ scope, path }) {
				const [revision, setRevision] = (0, react.useState)(0);
				return (0, react.createElement)(L5xBody, {
					resourceAddress: fileAddressFor(scope.sessionId, scope.cwd, path),
					content: {
						kind: "renderer",
						revision,
						loaded: () => {},
						failed: () => {},
						reload: () => {
							setRevision((value) => value + 1);
						}
					},
					scrollportRef: () => {},
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
				inject: () => ({
					read,
					ask
				})
			}, L5xBody)));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map