/** Read the template libraries FactoryTalk Optix ships, from disk, with no Studio session. @module dsh-tool-ft-optix/library */
/** Where a Studio install keeps the libraries the engineer drags from. */
export interface StudioLibraries {
	/** The Studio install folder. */
	studio: string;
	/** The version folder name, a `Studio <version>` folder such as the newest one installed. */
	version: string;
	/** The `Files/Libraries` folder holding the library folders. */
	libraries: string;
}
/** One importable entry in a library's `Items.yaml`. */
export interface CatalogItem {
	/** Browse name; the bridge accepts it as `item`. */
	name: string;
	guid: string;
	version: number;
	/** The `TextId` its DisplayName points at, empty when the library states none. */
	display_key: string;
	description_key: string;
	/** How many types the item owns, so an import is understood as a type bundle. */
	owned_types: number;
	/** Component or group files the item references. */
	components: string[];
	/** English display name, when the shipped dictionary resolves the key. */
	display?: string;
	display_zh?: string;
	/** The usage text the library ships, capped at 400 characters. */
	description?: string;
}
/** Importable items and the group folders the catalog references but does not name. */
export interface ParsedItems {
	items: CatalogItem[];
	groups: string[];
}
/** One library folder as read from disk. */
export interface LibraryCatalog {
	library: string;
	item_count: number;
	groups: string[];
	items: CatalogItem[];
}
/** A library and one of its items, resolved by browse or display name. */
export interface CatalogMatch {
	library: LibraryCatalog;
	item: CatalogItem;
}
/**
 * Locate the template libraries a Studio install ships.
 * @returns Every `Files/Libraries` folder this machine holds, newest version last.
 */
export declare function libraryRoots(): Promise<StudioLibraries[]>;
/**
 * Split a library's Items.yaml into importable items and the group folders holding the rest.
 * @param text - The library's `Nodes/Items/Items.yaml`.
 * @returns Importable items, and the group names the catalog references.
 */
export declare function parseItems(text: string): ParsedItems;
/**
 * Read a library's localization dictionary.
 * @param text - The library's `Nodes/Translations/Translations.yaml`.
 * @returns `TextId` to localized text; English always, Chinese when the column exists.
 */
export declare function parseDictionary(text: string): Map<string, {
	en: string;
	zh?: string;
}>;
/**
 * Read every shipped library's catalog, with the names and descriptions the library ships.
 * @param libraries - A `Files/Libraries` folder from `libraryRoots`.
 * @param signal - Caller cancellation.
 * @returns One descriptor per library folder, in folder-name order.
 */
export declare function readCatalog(libraries: string, signal?: AbortSignal): Promise<LibraryCatalog[]>;
/**
 * Closest catalog names for a library or item the caller misspelled.
 * @param input - What was asked for.
 * @param names - Catalog names to match against.
 * @param limit - How many suggestions to return.
 * @returns Best matches first; empty when nothing is close.
 */
export declare function suggestNames(input: string, names: string[], limit?: number): string[];
/**
 * Find one catalog entry by library and item, case-insensitive, accepting browse or display name.
 * @param catalog - Catalog from `readCatalog`.
 * @param library - Library folder name.
 * @param item - Item browse name or display name.
 * @returns The library descriptor and the item, or null when either is absent.
 */
export declare function findEntry(catalog: LibraryCatalog[], library: string, item: string): CatalogMatch | null;
/**
 * The library names this install ships.
 * @param catalog - Catalog from `readCatalog`.
 * @returns Library folder names.
 */
export declare function libraryNames(catalog: LibraryCatalog[]): string[];
/**
 * The importable names one library holds, browse and display forms together.
 * @param entry - One library descriptor.
 * @returns Names the caller may pass as `item`.
 */
export declare function itemNames(entry: LibraryCatalog): string[];
/**
 * Whether a Studio install with a catalog was found, phrased for a tool error.
 * @returns A refusal naming the folders that were searched.
 */
export declare function noStudioInstall(): {
	status: "failed";
	error: string;
	next: string;
};
//# sourceMappingURL=library.d.ts.map
