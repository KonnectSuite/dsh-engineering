//! Native fallback transport: one conversion per process, paths on the command
//! line, result written to a file.
//!
//! Only used when `packages/ecad/src/dwg/wasm.ts` cannot load the wasm asset,
//! i.e. on a host that cannot instantiate a wasm module. The TypeScript side
//! (`packages/ecad/src/dwg/sidecar.ts`) owns the temporary directory and the
//! cleanup; this binary never picks a path of its own.
//!
//! Protocol — stdout, one record per line, so the parent never has to guess
//! what happened:
//!
//! ```text
//! ok
//! version=AC1032
//! warning=<one line per reader warning>
//! ```
//!
//! On failure it prints `error=<status>` and `message=<text>` and exits with the
//! status code. `0` is success; `1..=5` match `STATUS_*` in `lib.rs`.

use std::fs;
use std::process::ExitCode;

use dsh_ecad_dwg::{dxf_to_dwg, dwg_to_dxf, ACADRUST_VERSION, SUPPORTED_VERSIONS};

fn usage() -> ExitCode {
    eprintln!(
        "dsh-ecad-dwg {ACADRUST_VERSION} ({} versions)\n\
         usage:\n  \
         dsh-ecad-dwg dwg-to-dxf <input.dwg> <output.dxf> [maxBytes]\n  \
         dsh-ecad-dwg dxf-to-dwg <input.dxf> <output.dwg> [maxBytes] [targetVersion]\n  \
         dsh-ecad-dwg info",
        SUPPORTED_VERSIONS.len()
    );
    ExitCode::from(1)
}

fn emit(outcome: Result<(Vec<u8>, String, Vec<String>), (i32, String)>, output: &str, max_bytes: usize) -> ExitCode {
    match outcome {
        Ok((bytes, version, warnings)) => {
            if max_bytes > 0 && bytes.len() > max_bytes {
                println!("error=4");
                println!("message=output is {} bytes, over the {max_bytes}-byte limit", bytes.len());
                return ExitCode::from(4);
            }
            if let Err(error) = fs::write(output, &bytes) {
                println!("error=3");
                println!("message=could not write the output file: {error}");
                return ExitCode::from(3);
            }
            println!("ok");
            println!("version={version}");
            for warning in warnings {
                println!("warning={warning}");
            }
            ExitCode::SUCCESS
        }
        Err((status, message)) => {
            println!("error={status}");
            println!("message={message}");
            ExitCode::from(status as u8)
        }
    }
}

fn max_bytes_arg(value: Option<&String>) -> usize {
    value
        .and_then(|text| text.trim().parse::<usize>().ok())
        .unwrap_or(0)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("info") => {
            println!("abi=1");
            println!("acadrust={ACADRUST_VERSION}");
            println!("versions={}", SUPPORTED_VERSIONS.join(","));
            ExitCode::SUCCESS
        }
        Some("dwg-to-dxf") => {
            let (Some(input), Some(output)) = (args.get(2), args.get(3)) else {
                return usage();
            };
            let limit = max_bytes_arg(args.get(4));
            let bytes = match fs::read(input) {
                Ok(bytes) => bytes,
                Err(error) => {
                    println!("error=1");
                    println!("message=could not read the input file: {error}");
                    return ExitCode::from(1);
                }
            };
            emit(dwg_to_dxf(&bytes), output, limit)
        }
        Some("dxf-to-dwg") => {
            let (Some(input), Some(output)) = (args.get(2), args.get(3)) else {
                return usage();
            };
            let limit = max_bytes_arg(args.get(4));
            let target = args.get(5).map(String::as_str);
            let bytes = match fs::read(input) {
                Ok(bytes) => bytes,
                Err(error) => {
                    println!("error=1");
                    println!("message=could not read the input file: {error}");
                    return ExitCode::from(1);
                }
            };
            emit(dxf_to_dwg(&bytes, target), output, limit)
        }
        _ => usage(),
    }
}
