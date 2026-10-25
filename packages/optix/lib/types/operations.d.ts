/** Closed authoring requests and their Optix bridge routes. @module dsh-tool-ft-optix/operations */
import type { ParameterSchemaSpec, ValueSchemaSpec } from '@deepseek-ai/dsh-tools';
/** One allowlisted mutation; fields use the upstream batch spelling. */
export interface Operation {
    /** Closed operation name validated at the model JSON boundary. */
    op: string;
    /** JSON fields interpreted only by the selected operation. */
    [key: string]: string | number | boolean;
}
/** Authoring schema, HTTP query aliases, and destructive classification. */
interface OperationSpec {
    route: string;
    fields: ParameterSchemaSpec;
    aliases?: Record<string, string>;
    destructive?: boolean;
}
/** Bridge-supported batch operations; unknown fields are rejected before validation or writes. */
export declare const operations: Record<string, OperationSpec>;
/** Exact-one operation schema for the native tool registry. */
export declare const operationSchema: ValueSchemaSpec;
/**
 * Check cross-field rules not expressible by the schema DSL.
 * @param ops - Schema-validated batch operations.
 */
export declare function checkOperations(ops: readonly Operation[]): void;
/**
 * Resolve a batch operation into a bridge route and query parameters.
 * @param op - Validated operation.
 * @returns The closed route and encoded field values.
 */
export declare function operationRequest(op: Operation): {
    route: string;
    query: Record<string, string>;
};
/**
 * Determine whether a batch needs destructive-operation enablement.
 * @param ops - Validated batch.
 * @returns Whether any operation deletes, replaces, moves, reorders, or retypes existing model state.
 */
export declare function isDestructive(ops: readonly Operation[]): boolean;
export {};
//# sourceMappingURL=operations.d.ts.map