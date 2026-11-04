# ECAD DWG converter — Rust wrapper crate

`acadrust` 0.6.8 (MPL-2.0) behind a raw C ABI, built once into
`packages/ecad/assets/acadrust.wasm` and loaded by
`packages/ecad/src/dwg/wasm.ts`. Byte in, byte out: no filesystem, no paths, no
environment. The TypeScript API the rest of the bundle imports is
`packages/ecad/src/dwg/index.ts`.

| | |
|---|---|
| Engine | `acadrust` 0.6.8, `default-features = false` (no Rayon) |
| Licence | MPL-2.0 (acadrust) + MIT (this wrapper, ACadSharp port notice) — see [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) |
| Shipping artefact | `../assets/acadrust.wasm` — 6,408,006 bytes, sha256 `5229f9ae7bff0d47aa4acb5c51927b020cd112d1920e9ee113099460ea9a798d` |
| Target | `wasm32-unknown-unknown` (`cdylib`) + a native fallback binary |
| wasm imports | exactly one: `env.ecad_host_now_millis` (clock for acadrust's timing diagnostics) |
| Toolchain used | `rustc 1.99.1 (58cf8f9c3 2026-10-13)` / `cargo 1.99.1 (5f94df478 2026-08-27)` |

## Why wasm, and why no wasm-bindgen

The shipping transport is a wasm module because it needs no install, no child
process, no temp files and no native toolchain at runtime — and because it keeps
DWG support inside the same in-process path the DXF engine already uses.

The module is a plain `cdylib` with a C ABI, not a wasm-bindgen crate. The only
acadrust dependency that would have forced wasm-bindgen is upstream `web-time`,
which reaches the clock through `js-sys` on wasm. `vendor/web-time` is a
30-line stand-in (see its module doc) that reads one host import instead, so the
loader is `new WebAssembly.Instance(...)` plus an alloc/copy/free dance. No
wasm-bindgen CLI, no generated glue file, no extra build step.

## Layout

```
rust/
  Cargo.toml            # pins acadrust =0.6.8, patches web-time, release profile
  Cargo.lock            # committed: the exact dependency set the asset was built from
  src/lib.rs            # conversion core + the C ABI (alloc/dealloc/convert/result)
  src/bin/sidecar.rs    # native fallback transport (one conversion per process)
  vendor/web-time/      # in-repo clock stand-in, see the module doc for why
  build.ps1             # builds the wasm asset (and optionally the native binary)
  evidence.mjs          # the measured evidence runs, reproducible on this machine
  .gitignore            # target/ is build output
```

## Build

Prerequisites: `rustup` with the stable toolchain and
`rustup target add wasm32-unknown-unknown`. The wasm build needs **no** MSVC
toolchain and **no** linker beyond the bundled `rust-lld`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages/ecad/rust/build.ps1
```

The script builds the crate, copies the artefact to
`packages/ecad/assets/acadrust.wasm`, and prints the size, SHA-256, build time and
toolchain versions. Measured on the owner's machine (Windows 11, Rust 1.99.1):

| Build | Time |
|---|---|
| First full build (all dependencies + LTO link) | 107.5 s |
| Rebuild after a code change (deps cached) | 3.2 s |

The native fallback binary is **not** committed — the wasm asset is the
transport and a second platform-specific 6.5 MB binary in the package buys
nothing. It builds on demand and is picked up automatically by the loader when
the wasm asset is absent:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packages/ecad/rust/build.ps1 -Sidecar
```

That path needs Visual Studio's MSVC toolchain (the script runs `cargo` inside
`VsDevCmd.bat`). Measured: 172.8 s, 6,846,976 bytes at `packages/ecad/bin/dsh-ecad-dwg.exe`.

## ABI (v1)

Every call returns an `i32` status; the result of the last call lives in one slot
until the next call or `ecad_result_release()`, which is safe because a wasm
instance is single-threaded and the sidecar converts one drawing per process.
The TypeScript loader copies the result out immediately, with no `await` between
the call and the reads.

| Export | Purpose |
|---|---|
| `ecad_abi_version() -> u32` | 1; the loader refuses a module it does not know |
| `ecad_version_ptr() / _len()` | acadrust version as ASCII (`0.6.8`) |
| `ecad_supported_versions_ptr() / _len()` | `AC1009,…,AC1032` |
| `ecad_alloc(len) -> *mut u8` / `ecad_dealloc(ptr, len)` | caller-owned input buffers |
| `ecad_convert_dwg_to_dxf(ptr, len, maxBytes) -> i32` | DWG → DXF |
| `ecad_convert_dxf_to_dwg(ptr, len, verPtr, verLen, maxBytes) -> i32` | DXF → DWG, optional target version |
| `ecad_result_data_ptr() / _len()` | converted bytes |
| `ecad_result_version_ptr() / _len()` | output `AC10xx` version |
| `ecad_result_warnings_ptr() / _len()` | reader warnings, one per line |
| `ecad_result_message_ptr() / _len()` | failure detail |
| `ecad_result_release()` | drop the slot |

| Status | Meaning | TS error code |
|---|---|---|
| 0 | ok | — |
| 1 | bad buffer, length or version string | `DWG_UNSUPPORTED` |
| 2 | the source bytes could not be read | `DWG_READ_FAILED` |
| 3 | the document could not be written | `DWG_WRITE_FAILED` |
| 4 | input or output over `maxBytes` | `DWG_TOO_LARGE` |
| 5 | version unknown or unsupported | `DWG_UNSUPPORTED` |

Both directions read and write `AC1009` (R12), `AC1012`, `AC1014`, `AC1015`,
`AC1018`, `AC1021`, `AC1024`, `AC1027` and `AC1032`. The output version is the
document's own version, which the reader sets from the source file: a DWG keeps
its version through DWG→DXF→DWG, and a DXF keeps its `$ACADVER` unless the caller
asks for a different one.

## Workaround: DXF block-reference attributes

acadrust 0.6.8's DXF reader adds each `ATTRIB` after an `INSERT` as a loose
document entity, while its DWG writer only writes `Insert::attributes`, so a
plain DXF→DWG conversion **dropped every block-reference attribute value**
(measured: the `ACME-007` attribute of the test fixture's `TB` insert was absent
from the written DWG bytes). DXF defines the association positionally, so
`read_dxf` re-attaches the entities that follow an insert, up to the next
non-attribute entity, and reports how many lists it repaired as a reader warning.
With that repair, all three committed fixtures and both measured corpus sheets
round-trip with a zero model diff.

This is the only behavioural change the wrapper makes to acadrust's output, and it
is disclosed in every affected call's `warnings`.

## Evidence

`evidence.mjs` measures the converter on the owner's read-only print set. It
needs the engine built first (`node node_modules/typescript/bin/tsc -p packages/ecad/tsconfig.json`)
and reads the corpus from `ECAD_CORPUS`, defaulting to the local path; every
corpus mode prints a skip line and exits 0 when the directory is absent.

```sh
node packages/ecad/rust/evidence.mjs versions     # DWG version markers
node packages/ecad/rust/evidence.mjs corpus       # all 33 DWGs → DXF
node packages/ecad/rust/evidence.mjs equivalence  # DWG→DXF model vs the shipped DXF
node packages/ecad/rust/evidence.mjs write        # shipped DXF → DWG → DXF
node packages/ecad/rust/evidence.mjs roundtrip    # real DWG → DXF → DWG → DXF
```

Measured results (33 real DWGs, 15,556,754 bytes, 2026-11-04):

| Measurement | Result |
|---|---|
| DWG version distribution | AC1027 ×16, AC1032 ×17 |
| DWG → DXF | 33/33 converted, 0 reader warnings, 15,556,754 → 80,640,792 bytes, 1,165.7 ms total (5.1–145.5 ms per sheet) |
| Write path (DXF → DWG → DXF) | smallest sheet clean, largest (6.5 MB) clean; one sheet differs only by anonymous block renumbering (`*X26` → `*X7`), geometry identical |
| Real-DWG round trip (DWG→DXF→DWG→DXF) | 3/3 clean (76 KB, 190 KB, 2.3 MB sheets) |
| DWG→DXF vs the shipped DXF of the same sheet | 0/33 entity-identical — the two corpora are different title-block issues (DXF dated 9/20/2026 FrommConnect, DWG dated 06/17–10/17 Dominion); mean geometry shared 89.8% overall and 92.2% outside the title block |

## Limits, measured not assumed

- **Attributes across a DWG write** are preserved only by the wrapper's repair
  described above; without it acadrust loses them. The repair is disclosed in
  `warnings`.
- **Anonymous block names** can be renumbered by the DWG writer (`*X26` → `*X7`).
  The geometry is identical, but a byte-for-byte or handle-for-handle comparison
  after a write is not meaningful.
- **DWG→DXF output is larger** than the equivalent shipped DXF (about 5×,
  because the shipped DXF is an exploded, block-purged export).
- **Unreferenced block definitions** present in a DWG are written into the DXF
  (the shipped DXF of the same sheet has none). Visible geometry is unaffected.
- **Paper-space layout** representation differs between the two writers; a
  Layout1 viewport in one can be one viewport in the other.
- **Proxy/custom objects, ACIS bodies and xrefs** were not present in the corpus,
  so their behaviour is unmeasured here — the reader reports what it cannot
  decode through `ReadDiagnostic` lines, which the wrapper surfaces as warnings.
- **A panic is a wasm trap.** acadrust returns `Result` values rather than
  panicking, but if one aborts, the loader drops the instance and re-instantiates
  on the next call, and the call fails with a typed `DWG_READ_FAILED` /
  `DWG_WRITE_FAILED`.

## Tests

```sh
# Rust: status codes, garbage refusal, attribute repair, fixture round trip
cd packages/ecad/rust && cargo test --release

# TypeScript: the converter API, the fixtures, and the corpus when present
node --import tsx --test packages/ecad/test/dwg.spec.mjs
```
