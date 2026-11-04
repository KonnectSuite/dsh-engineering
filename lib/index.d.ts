/** Host half of the engineering bundle: provides the `ecad` Remote service named by the package's `./typert` invocations. */
export declare const ECAD_SERVICE: 'ecad'
/** Every Remote endpoint the `./typert` artifact registers for that service. */
export declare const ECAD_ENDPOINTS: readonly string[]
/** Register the Remote service. */
export declare function apply(ctx: unknown): void
