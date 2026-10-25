/** Local Tesseract canvas recognition without an MCP server. @module dsh-tool-ft-optix/ocr */
/** Explicit host OCR installation and language selection. */
export interface OcrConfig {
    /** Absolute executable path or executable name resolved by the host PATH. */
    executable: string;
    /** Installed Tesseract language names, joined with + for multiple languages. */
    language: string;
    /** Directory containing traineddata files; empty uses Tesseract's installation default. */
    tessdataDirectory: string;
}
/** A recognized word in screenshot pixels; confidence is a fraction between zero and one. */
export interface OcrWord {
    text: string;
    confidence: number;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Page, block, paragraph, and line identifiers joined with colons. */
    line: string;
}
/** Recognized frame text and word-level evidence; empty frames have null mean confidence. */
export interface OcrResult {
    text: string;
    words: OcrWord[];
    confidence: number | null;
}
/**
 * Parse Tesseract TSV output, rejecting malformed rows rather than trusting their coordinates.
 * @param tsv - Bounded external OCR output.
 * @returns Recognized words with normalized confidence and screenshot coordinates.
 */
export declare function parseOcr(tsv: string): OcrWord[];
/**
 * Recognize screenshot bytes through a configured host Tesseract installation.
 * Cancellation and deadlines kill the owned process; completion awaits process close before removing its private image.
 * @param config - Explicit OCR installation.
 * @param image - Bounded viewport PNG bytes.
 * @param psm - Tesseract page segmentation mode.
 * @param timeoutMs - Process deadline.
 * @param maxBytes - Maximum collected stdout and stderr bytes.
 * @param signal - Caller and plugin cancellation.
 * @returns Text, words, and mean word confidence; an empty frame has null confidence.
 */
export declare function recognize(config: OcrConfig, image: Uint8Array, psm: number, timeoutMs: number, maxBytes: number, signal: AbortSignal): Promise<OcrResult>;
//# sourceMappingURL=ocr.d.ts.map