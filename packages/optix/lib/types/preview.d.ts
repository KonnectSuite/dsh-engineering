/** Direct Chromium CDP preview without an MCP transport. @module dsh-tool-ft-optix/preview */
import type { Context } from '@deepseek-ai/cordis';
import type { OcrConfig } from './ocr.ts';
/** Validated browser target and preview acquisition limits. */
export interface PreviewConfig {
    /** Existing Chromium CDP loopback endpoint. */
    cdpUrl: string;
    /** Exact preview origin, pathname, and query identifying an already-open tab. */
    previewUrl: string;
    /** Enable pointer and keyboard input into the explicitly configured preview. */
    allowPreviewInput: boolean;
    /** Connection and browser-operation timeout in milliseconds. */
    requestTimeoutMs: number;
    /** Maximum screenshot encoded bytes or returned text UTF-8 bytes. */
    maxResponseBytes: number;
    /** Maximum screenshot viewport pixel count. */
    maxPreviewPixels: number;
    /** Optional configured host Tesseract installation; null leaves OCR unregistered. */
    ocr: OcrConfig | null;
}
/**
 * Resolve a preview URL without permitting remote or credential-bearing targets.
 * @param input - Configured preview URL.
 * @returns The normalized loopback URL.
 */
export declare function previewTarget(input: string): string;
/**
 * Register optional direct-CDP preview tools; disposal disconnects owned clients and awaits their completion.
 * @param ctx - Tool context with durable attachments for screenshots.
 * @param config - Explicit browser target and limits.
 */
export declare function applyPreview(ctx: Context, config: PreviewConfig): void;
//# sourceMappingURL=preview.d.ts.map