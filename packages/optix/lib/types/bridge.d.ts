/** Bounded direct HTTP transport to the in-Studio Optix bridge. @module dsh-tool-ft-optix/bridge */
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
/** Transport and acquisition limits resolved at plugin load. */
export interface BridgeConfig {
    /** Explicit loopback bridge endpoints; discovery does not scan other ports. */
    bridgeUrls: string[];
    /** Optional bridge bearer token; never included in tool values or errors. */
    bridgeToken: string;
    /** Per-request deadline in milliseconds. */
    requestTimeoutMs: number;
    /** Maximum UTF-8 bytes acquired for each response or request. */
    maxResponseBytes: number;
}
/** A failure after dispatch may leave a mutation's outcome uncertain. */
export declare class BridgeError extends Error {
    /** Whether an authoring request may have reached Studio. */
    readonly mayHaveApplied: boolean;
    /**
     * Describe a transport or bridge refusal.
     * @param message - Credential-free diagnostic.
     * @param mayHaveApplied - Whether inspecting the live model is required before retrying.
     */
    constructor(message: string, mayHaveApplied: boolean);
}
/**
 * Validate a local endpoint and normalize its trailing slash.
 * @param input - Configured URL.
 * @returns The normalized loopback origin.
 */
export declare function bridgeOrigin(input: string): string;
/**
 * Check for a JSON object in an external response.
 * @param value - Parsed bridge JSON.
 * @returns Whether the value is a non-null object rather than an array.
 */
export declare function jsonObject(value: JsonValue): value is Record<string, JsonValue>;
/** Direct bridge transport; writes are never automatically retried or redirected. */
export declare class OptixBridgeGateway {
    private readonly config;
    private readonly disposed;
    private readonly pending;
    /**
     * Bind validated limits and the plugin-disposal signal.
     * @param config - Resolved transport configuration.
     * @param disposed - Aborts all transport work when the plugin unloads.
     */
    constructor(config: BridgeConfig, disposed: AbortSignal);
    /**
     * Acquire one bounded JSON response without exposing query values in errors.
     * @param origin - Validated configured origin.
     * @param route - Plugin-owned bridge route.
     * @param signal - Caller cancellation.
     * @param query - Operation parameters.
     * @param method - HTTP verb.
     * @param body - Validation batch, when present.
     * @returns Validated lossless JSON; HTTP and bridge errors throw.
     */
    request(origin: string, route: string, signal: AbortSignal, query?: Record<string, string>, method?: 'GET' | 'POST', body?: JsonValue): Promise<Record<string, JsonValue>>;
    /**
     * Wait for aborted requests to release response readers.
     * @returns Completion after every current transport request settles.
     */
    drain(): Promise<void>;
    /** Acquire and release one response reader within the configured byte and time limits. */
    private acquire;
    /**
     * Select exactly one loaded Studio project by its bridge-reported BrowseName.
     * @param project - Exact name returned by health discovery.
     * @param signal - Caller cancellation.
     * @returns The serving origin and its health facts.
     */
    select(project: string, signal: AbortSignal): Promise<{
        origin: string;
        health: Record<string, JsonValue>;
    }>;
}
//# sourceMappingURL=bridge.d.ts.map