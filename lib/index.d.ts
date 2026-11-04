/** Host half of the engineering bundle: provides the `ecad` Remote service named by the package's `./typert` artifact. */
export declare const ECAD_SERVICE: 'ecad'
/** Remote endpoint the `./typert` artifact registers for that service. */
export declare const ECAD_ENDPOINT: 'ecad/ping'
/** Register the Remote service. */
export declare function apply(ctx: unknown): void
