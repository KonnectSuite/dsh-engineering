/** Immutable user-supplied Optix starters and NetLogic acquisition. @module dsh-tool-ft-optix/templates */
import type { Context } from '@deepseek-ai/cordis';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
/**
 * Parse the shipped manifest before exposing project file access.
 * @param text - Manifest JSON acquired from the package assets.
 * @returns JSON object containing the file list; rejects invalid manifests.
 */
export declare function parseTemplateManifest(text: string): Record<string, JsonValue> & {
    files: JsonValue[];
};
/**
 * Register access to packaged starters without modifying an existing project.
 * @param ctx - Harness tool runtime context.
 * @param maxBytes - Maximum bytes returned by a file acquisition.
 */
export declare function applyTemplates(ctx: Context, maxBytes: number): void;
//# sourceMappingURL=templates.d.ts.map