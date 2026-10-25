/** Native FactoryTalk Optix discovery and live authoring tools. @module dsh-tool-ft-optix */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { OcrConfig } from './ocr.ts';
/** Cordis plugin name. */
export declare const name = "tool-ft-optix";
/** Tools are dispatched through the harness policy and session pipeline. */
export declare const inject: string[];
/** Deployment-specific connection, authoring, and acquisition settings. */
export interface Config {
    /** Exact loopback origins to probe for Studio projects. */
    bridgeUrls?: string[];
    /** Optional bearer token configured on the Studio bridge. */
    bridgeToken?: string;
    /** Enable live authoring; dry-run validation remains available when false. */
    allowWrites?: boolean;
    /** Enable deletion, moves, reordering, retyping, replacement, and conversion. */
    allowDestructive?: boolean;
    /** Enable exported method invocation on session-safe bridge builds. */
    allowInvoke?: boolean;
    /** Per-request deadline in milliseconds. */
    requestTimeoutMs?: number;
    /** Maximum acquired UTF-8 bytes per response, request body, or query. */
    maxResponseBytes?: number;
    /** Maximum operations admitted in one batch. */
    maxBatchOps?: number;
    /** Maximum nodes requested in a project map. */
    maxMapNodes?: number;
    /** Maximum project-map traversal depth. */
    maxMapDepth?: number;
    /** Register direct CDP preview and screenshot tools. */
    preview?: boolean;
    /** Existing Chromium CDP endpoint, used only when preview is enabled. */
    cdpUrl?: string;
    /** Already-open emulator browser tab, selected by exact origin, pathname, and query. */
    previewUrl?: string;
    /** Enable pointer and keyboard input into the selected emulator preview. */
    allowPreviewInput?: boolean;
    /** Maximum viewport pixel count admitted for a screenshot. */
    maxPreviewPixels?: number;
    /** Optional host Tesseract installation for recognizing canvas text in preview screenshots. */
    ocr?: OcrConfig | null;
}
/** Runtime configuration; no connection is opened during plugin registration. */
export declare const Config: z<Config>;
/**
 * Register native tools and abort transport work on plugin disposal.
 * @param ctx - Cordis context with the harness tool runtime.
 * @param config - Connection and authoring settings.
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map