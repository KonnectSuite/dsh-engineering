/**
 * Minimal `WebAssembly` typings.
 *
 * The package's `tsconfig.json` compiles with `"lib": ["ES2024"]` and
 * `"types": ["node"]`, and neither declares the `WebAssembly` global (the DOM
 * and WebWorker libraries do, and this package compiles for Node, not a
 * browser). Only the two members the DWG loader uses are declared, so the
 * loader stays fully typed without widening the package's `lib`.
 *
 * This file has no top-level import or export on purpose: that keeps it a
 * global script, so its declarations merge into the program's global scope.
 *
 * @module dsh-engineering-ecad/dwg/webassembly
 */

/** The subset of the WebAssembly API the converter module uses. */
declare const WebAssembly: {
  /** Compile bytes into a module. */
  compile(bytes: Uint8Array): Promise<WebAssembly.Module>
  /** The synchronous constructor: an already-compiled module instantiates now. */
  readonly Instance: new (
    module: WebAssembly.Module,
    imports?: WebAssembly.Imports
  ) => WebAssembly.Instance
}

declare namespace WebAssembly {
  /** Import object handed to `new Instance`. */
  type Imports = Record<string, Record<string, unknown>>

  /** A memory exported by an instance. */
  interface Memory {
    readonly buffer: ArrayBuffer
  }

  /** An instance's exported functions and memory. */
  interface Instance {
    readonly exports: Record<string, unknown>
  }

  /** A compiled module: what `compile` returns. */
  interface Module {
    /** Marker so the type is not structurally empty. */
    readonly __module?: never
  }
}
