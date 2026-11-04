//! Byte-in/byte-out DWG↔DXF converter for `@aryacode/dsh-engineering-ecad`.
//!
//! The crate wraps [`acadrust`] 0.6.8 (MPL-2.0) behind a raw C ABI and nothing
//! else: no filesystem, no paths, no environment. Callers own the bytes.
//!
//! Two artefacts are built from this one source:
//!
//! * **`cdylib` for `wasm32-unknown-unknown`** — the shipping transport,
//!   loaded by `packages/ecad/src/dwg/wasm.ts` with a hand-written
//!   `WebAssembly.instantiate` (no wasm-bindgen, no glue file);
//! * **the `dsh-ecad-dwg` native binary** (`src/bin/sidecar.rs`) — the fallback
//!   transport for a host where the wasm asset is missing, driven by
//!   `packages/ecad/src/dwg/sidecar.ts`.
//!
//! # ABI
//!
//! Every call returns an `i32` status; the result of the last call lives in one
//! slot until the next call or [`ecad_result_release`]. That is safe because a
//! wasm module is single-threaded and the sidecar process converts one drawing
//! per invocation.
//!
//! | Status | Meaning | TS error code |
//! |---|---|---|
//! | 0 | ok | — |
//! | 1 | caller passed a bad buffer, length or version string | `DWG_UNSUPPORTED` |
//! | 2 | the source bytes could not be read | `DWG_READ_FAILED` |
//! | 3 | the document could not be written | `DWG_WRITE_FAILED` |
//! | 4 | input or output exceeds `max_bytes` | `DWG_TOO_LARGE` |
//! | 5 | version is unknown or not an `AC10xx` code the writer supports | `DWG_UNSUPPORTED` |

use std::io::Cursor;
use std::sync::Mutex;

use acadrust::{CadDocument, DwgReader, DwgWriter, DxfReader, DxfWriter, DxfVersion};

/// Bumped when the exported function set or a status meaning changes.
pub const ABI_VERSION: u32 = 1;
/// The converter engine version, reported by `converterInfo()`.
pub const ACADRUST_VERSION: &str = "0.6.8";
/// Version codes both directions read and write (`acadrust::DxfVersion`).
pub const SUPPORTED_VERSIONS: &[&str] = &[
    "AC1009", "AC1012", "AC1014", "AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032",
];

pub const STATUS_OK: i32 = 0;
pub const STATUS_BAD_INPUT: i32 = 1;
pub const STATUS_READ_FAILED: i32 = 2;
pub const STATUS_WRITE_FAILED: i32 = 3;
pub const STATUS_TOO_LARGE: i32 = 4;
pub const STATUS_UNSUPPORTED_VERSION: i32 = 5;

/// Most reader warnings carried to the caller before the rest are counted.
const MAX_WARNING_LINES: usize = 24;

/// The result of the most recent conversion.
struct Slot {
    data: Vec<u8>,
    version: Vec<u8>,
    warnings: Vec<u8>,
    message: Vec<u8>,
}

static SLOT: Mutex<Option<Slot>> = Mutex::new(None);

fn set_slot(
    status: i32,
    data: Vec<u8>,
    version: String,
    warnings: Vec<String>,
    message: String,
) -> i32 {
    let slot = Slot {
        data,
        version: version.into_bytes(),
        warnings: warnings.join("\n").into_bytes(),
        message: message.into_bytes(),
    };
    *SLOT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(slot);
    status
}

fn clear_slot() {
    *SLOT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
}

/// Reader diagnostics as one line each, capped at [`MAX_WARNING_LINES`].
fn diagnostics_of(outcome: &acadrust::ReadOutcome) -> Vec<String> {
    let stats = &outcome.stats;
    let mut lines: Vec<String> = Vec::new();
    if !stats.stream_completed {
        lines.push("read stopped before the end of the source stream".to_string());
    }
    if stats.skipped_source_records > 0 {
        lines.push(format!(
            "read skipped {} source record(s) it could not decode",
            stats.skipped_source_records
        ));
    }
    if stats.recovered_errors > 0 {
        lines.push(format!(
            "read recovered from {} error(s)",
            stats.recovered_errors
        ));
    }
    for diagnostic in &stats.diagnostics {
        if lines.len() >= MAX_WARNING_LINES {
            lines.push(format!(
                "… {} more reader diagnostic(s) omitted",
                stats.diagnostics.len()
            ));
            break;
        }
        let section = diagnostic
            .section
            .as_deref()
            .map(|value| format!("[{value}] "))
            .unwrap_or_default();
        lines.push(format!(
            "{} {}{section}{}",
            diagnostic.code, diagnostic.stage, diagnostic.message
        ));
    }
    lines
}

fn read_dwg(bytes: &[u8]) -> Result<(CadDocument, Vec<String>), (i32, String)> {
    let mut reader = DwgReader::from_stream(Cursor::new(bytes.to_vec()));
    match reader.read_with_stats() {
        Ok(outcome) => {
            let warnings = diagnostics_of(&outcome);
            Ok((outcome.document, warnings))
        }
        Err(error) => Err((
            STATUS_READ_FAILED,
            format!("DWG reader refused the bytes: {error}"),
        )),
    }
}

fn read_dxf(bytes: &[u8]) -> Result<(CadDocument, Vec<String>), (i32, String)> {
    let reader = match DxfReader::from_reader(Cursor::new(bytes.to_vec())) {
        Ok(reader) => reader,
        Err(error) => {
            return Err((
                STATUS_READ_FAILED,
                format!("DXF reader refused the bytes: {error}"),
            ))
        }
    };
    match reader.read_with_stats() {
        Ok(outcome) => {
            let mut warnings = diagnostics_of(&outcome);
            let mut document = outcome.document;
            let repaired = attach_dxf_attributes(&mut document);
            if repaired > 0 {
                warnings.push(format!(
                    "attached {repaired} block-reference attribute entity list(s) that the DXF reader left as loose entities"
                ));
            }
            Ok((document, warnings))
        }
        Err(error) => Err((
            STATUS_READ_FAILED,
            format!("DXF reader refused the bytes: {error}"),
        )),
    }
}

/// Re-attach DXF block-reference attributes to their block reference.
///
/// acadrust 0.6.8's DXF reader adds each `ATTRIB` after an `INSERT` as a
/// standalone document entity instead of pushing it into `Insert::attributes`,
/// while its DWG writer only writes `Insert::attributes`. A plain DXF→DWG
/// conversion therefore drops every block-reference attribute value (measured:
/// the `ACME-007` attribute of the test fixture's `TB` insert disappeared from
/// the written DWG bytes). DXF defines the association positionally — the
/// attributes follow their `INSERT` and end at `SEQEND` — so that is exactly how
/// they are restored here, and the caller is told how many lists were repaired.
fn attach_dxf_attributes(document: &mut CadDocument) -> usize {
    use acadrust::Handle;

    // 1. Pair each INSERT with the ATTRIB entities that follow it, positionally.
    let mut groups: Vec<(Handle, Vec<Handle>)> = Vec::new();
    let mut open: Option<usize> = None;
    for entity in document.entities() {
        match entity {
            acadrust::EntityType::Insert(_) => {
                groups.push((entity.common().handle, Vec::new()));
                open = Some(groups.len() - 1);
            }
            acadrust::EntityType::AttributeEntity(_) => match open {
                Some(index) => groups[index].1.push(entity.common().handle),
                None => {}
            },
            _ => open = None,
        }
    }

    // 2. Move those entities into their block reference.
    let mut repaired = 0;
    for (insert_handle, attribute_handles) in groups {
        if attribute_handles.is_empty() {
            continue;
        }
        let mut attributes = Vec::with_capacity(attribute_handles.len());
        for handle in attribute_handles {
            if let Some(acadrust::EntityType::AttributeEntity(attribute)) =
                document.remove_entity(handle)
            {
                attributes.push(attribute);
            }
        }
        if attributes.is_empty() {
            continue;
        }
        if let Some(acadrust::EntityType::Insert(insert)) = document.get_entity_mut(insert_handle) {
            insert.attributes = attributes;
            repaired += 1;
        }
    }
    repaired
}

fn document_version(document: &CadDocument) -> Result<String, (i32, String)> {
    if document.version == DxfVersion::Unknown {
        return Err((
            STATUS_UNSUPPORTED_VERSION,
            "the drawing does not declare a known AC10xx version".to_string(),
        ));
    }
    Ok(document.version.as_str().to_string())
}

fn write_dxf(document: &CadDocument) -> Result<Vec<u8>, (i32, String)> {
    let writer = DxfWriter::new(document);
    // A document that merely *carries* AC1009 is written as R13 by default;
    // `with_version` is what produces a genuine R12 file.
    let writer = if document.version == DxfVersion::AC1009 {
        writer.with_version(DxfVersion::AC1009)
    } else {
        writer
    };
    writer
        .write_to_vec()
        .map_err(|error| (STATUS_WRITE_FAILED, format!("DXF writer failed: {error}")))
}

fn write_dwg(document: &CadDocument) -> Result<Vec<u8>, (i32, String)> {
    DwgWriter::write_to_vec(document)
        .map_err(|error| (STATUS_WRITE_FAILED, format!("DWG writer failed: {error}")))
}

/// Read DWG bytes and write the document back as DXF bytes.
pub fn dwg_to_dxf(bytes: &[u8]) -> Result<(Vec<u8>, String, Vec<String>), (i32, String)> {
    let (document, mut warnings) = read_dwg(bytes)?;
    let version = document_version(&document)?;
    let dxf = write_dxf(&document)?;
    if document.header.code_page.is_empty() {
        warnings.push(
            "source drawing declares no code page; DXF text encoding was assumed".to_string(),
        );
    }
    Ok((dxf, version, warnings))
}

/// Read DXF bytes and write the document back as DWG bytes, optionally
/// re-versioned.
pub fn dxf_to_dwg(
    bytes: &[u8],
    target_version: Option<&str>,
) -> Result<(Vec<u8>, String, Vec<String>), (i32, String)> {
    let (mut document, warnings) = read_dxf(bytes)?;
    if let Some(name) = target_version {
        match DxfVersion::parse(name) {
            Some(version) => document.version = version,
            None => {
                return Err((
                    STATUS_UNSUPPORTED_VERSION,
                    format!(
                        "target version {name:?} is not one of {}",
                        SUPPORTED_VERSIONS.join(", ")
                    ),
                ))
            }
        }
    }
    let version = document_version(&document)?;
    let dwg = write_dwg(&document)?;
    Ok((dwg, version, warnings))
}

// ---------------------------------------------------------------------------
// C ABI. Every `unsafe` block below is the boundary between caller-owned bytes
// and Rust slices; validity is checked before use.
// ---------------------------------------------------------------------------

fn copy_in(ptr: *const u8, len: usize) -> Result<Vec<u8>, i32> {
    if len == 0 || ptr.is_null() {
        return Err(STATUS_BAD_INPUT);
    }
    // SAFETY: the caller allocated `len` readable bytes at `ptr` and keeps them
    // alive for the duration of the call.
    Ok(unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec())
}

fn version_in(ptr: *const u8, len: usize) -> Result<Option<String>, i32> {
    if len == 0 {
        return Ok(None);
    }
    if ptr.is_null() {
        return Err(STATUS_BAD_INPUT);
    }
    // SAFETY: as in `copy_in`; the loader only ever passes ASCII.
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    match std::str::from_utf8(bytes) {
        Ok(text) if text.is_ascii() => Ok(Some(text.to_string())),
        _ => Err(STATUS_BAD_INPUT),
    }
}

fn finish(outcome: Result<(Vec<u8>, String, Vec<String>), (i32, String)>, max_bytes: usize) -> i32 {
    match outcome {
        Ok((data, version, warnings)) => {
            if max_bytes > 0 && data.len() > max_bytes {
                let message = format!(
                    "converted output is {} bytes, over the {max_bytes}-byte limit",
                    data.len()
                );
                return set_slot(STATUS_TOO_LARGE, Vec::new(), version, warnings, message);
            }
            set_slot(STATUS_OK, data, version, warnings, String::new())
        }
        Err((status, message)) => set_slot(status, Vec::new(), String::new(), Vec::new(), message),
    }
}

/// ABI version. The loader refuses a module whose value it does not know.
#[no_mangle]
pub extern "C" fn ecad_abi_version() -> u32 {
    ABI_VERSION
}

static ACADRUST_VERSION_BYTES: &[u8] = ACADRUST_VERSION.as_bytes();
static SUPPORTED_VERSIONS_BYTES: &[u8] =
    b"AC1009,AC1012,AC1014,AC1015,AC1018,AC1021,AC1024,AC1027,AC1032";

/// `acadrust` version, ASCII, static for the module's lifetime.
#[no_mangle]
pub extern "C" fn ecad_version_ptr() -> *const u8 {
    ACADRUST_VERSION_BYTES.as_ptr()
}

/// Length of [`ecad_version_ptr`].
#[no_mangle]
pub extern "C" fn ecad_version_len() -> usize {
    ACADRUST_VERSION_BYTES.len()
}

/// Comma-separated supported version codes, ASCII, static.
#[no_mangle]
pub extern "C" fn ecad_supported_versions_ptr() -> *const u8 {
    SUPPORTED_VERSIONS_BYTES.as_ptr()
}

/// Length of [`ecad_supported_versions_ptr`].
#[no_mangle]
pub extern "C" fn ecad_supported_versions_len() -> usize {
    SUPPORTED_VERSIONS_BYTES.len()
}

/// Allocate `len` bytes for the caller to fill and pass to a convert call.
#[no_mangle]
pub extern "C" fn ecad_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::null_mut();
    }
    match std::alloc::Layout::from_size_align(len, 1) {
        // SAFETY: `len` is non-zero, so the layout is non-empty.
        Ok(layout) => unsafe { std::alloc::alloc(layout) },
        Err(_) => std::ptr::null_mut(),
    }
}

/// Free a buffer returned by [`ecad_alloc`] (and only such a buffer).
#[no_mangle]
pub extern "C" fn ecad_dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    if let Ok(layout) = std::alloc::Layout::from_size_align(len, 1) {
        // SAFETY: the pointer came from `ecad_alloc(len)` and is freed once.
        unsafe { std::alloc::dealloc(ptr, layout) }
    }
}

/// Convert DWG bytes to DXF bytes. Returns a status code; read the result with
/// the `ecad_result_*` accessors.
#[no_mangle]
pub extern "C" fn ecad_convert_dwg_to_dxf(
    in_ptr: *const u8,
    in_len: usize,
    max_bytes: usize,
) -> i32 {
    clear_slot();
    let bytes = match copy_in(in_ptr, in_len) {
        Ok(bytes) => bytes,
        Err(status) => {
            return set_slot(
                status,
                Vec::new(),
                String::new(),
                Vec::new(),
                "empty or null DWG input buffer".to_string(),
            )
        }
    };
    if max_bytes > 0 && bytes.len() > max_bytes {
        let message = format!(
            "input is {} bytes, over the {max_bytes}-byte limit",
            bytes.len()
        );
        return set_slot(STATUS_TOO_LARGE, Vec::new(), String::new(), Vec::new(), message);
    }
    finish(dwg_to_dxf(&bytes), max_bytes)
}

/// Convert DXF bytes to DWG bytes. `ver_ptr`/`ver_len` may be zero-length to
/// keep the DXF document's own `$ACADVER`.
#[no_mangle]
pub extern "C" fn ecad_convert_dxf_to_dwg(
    in_ptr: *const u8,
    in_len: usize,
    ver_ptr: *const u8,
    ver_len: usize,
    max_bytes: usize,
) -> i32 {
    clear_slot();
    let bytes = match copy_in(in_ptr, in_len) {
        Ok(bytes) => bytes,
        Err(status) => {
            return set_slot(
                status,
                Vec::new(),
                String::new(),
                Vec::new(),
                "empty or null DXF input buffer".to_string(),
            )
        }
    };
    if max_bytes > 0 && bytes.len() > max_bytes {
        let message = format!(
            "input is {} bytes, over the {max_bytes}-byte limit",
            bytes.len()
        );
        return set_slot(STATUS_TOO_LARGE, Vec::new(), String::new(), Vec::new(), message);
    }
    let target = match version_in(ver_ptr, ver_len) {
        Ok(target) => target,
        Err(status) => {
            return set_slot(
                status,
                Vec::new(),
                String::new(),
                Vec::new(),
                "target version string is not ASCII".to_string(),
            )
        }
    };
    finish(dxf_to_dwg(&bytes, target.as_deref()), max_bytes)
}

fn slot_field_ptr_len(select: impl Fn(&Slot) -> &Vec<u8>) -> (*const u8, usize) {
    let guard = SLOT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match guard.as_ref() {
        Some(slot) => {
            let buffer = select(slot);
            (buffer.as_ptr(), buffer.len())
        }
        None => (std::ptr::null(), 0),
    }
}

/// Converted bytes of the last call. Valid until the next call or release.
#[no_mangle]
pub extern "C" fn ecad_result_data_ptr() -> *const u8 {
    slot_field_ptr_len(|slot| &slot.data).0
}

/// Length of [`ecad_result_data_ptr`].
#[no_mangle]
pub extern "C" fn ecad_result_data_len() -> usize {
    slot_field_ptr_len(|slot| &slot.data).1
}

/// Version code of the output (and, for DWG, the written format).
#[no_mangle]
pub extern "C" fn ecad_result_version_ptr() -> *const u8 {
    slot_field_ptr_len(|slot| &slot.version).0
}

/// Length of [`ecad_result_version_ptr`].
#[no_mangle]
pub extern "C" fn ecad_result_version_len() -> usize {
    slot_field_ptr_len(|slot| &slot.version).1
}

/// Reader warnings, one per line, UTF-8.
#[no_mangle]
pub extern "C" fn ecad_result_warnings_ptr() -> *const u8 {
    slot_field_ptr_len(|slot| &slot.warnings).0
}

/// Length of [`ecad_result_warnings_ptr`].
#[no_mangle]
pub extern "C" fn ecad_result_warnings_len() -> usize {
    slot_field_ptr_len(|slot| &slot.warnings).1
}

/// Failure detail for a non-zero status, UTF-8. Empty when the call succeeded.
#[no_mangle]
pub extern "C" fn ecad_result_message_ptr() -> *const u8 {
    slot_field_ptr_len(|slot| &slot.message).0
}

/// Length of [`ecad_result_message_ptr`].
#[no_mangle]
pub extern "C" fn ecad_result_message_len() -> usize {
    slot_field_ptr_len(|slot| &slot.message).1
}

/// Drop the last result. The instance stays usable for another conversion.
#[no_mangle]
pub extern "C" fn ecad_result_release() {
    clear_slot();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The engine's synthetic fixture: a few primitives, two block references
    /// and eleven attribute values. Committed, so the test needs no corpus.
    const TINY_DXF: &[u8] = include_bytes!("../../test/fixtures/tiny.dxf");

    #[test]
    fn status_codes_are_stable() {
        assert_eq!(STATUS_OK, 0);
        assert_eq!(STATUS_BAD_INPUT, 1);
        assert_eq!(STATUS_READ_FAILED, 2);
        assert_eq!(STATUS_WRITE_FAILED, 3);
        assert_eq!(STATUS_TOO_LARGE, 4);
        assert_eq!(STATUS_UNSUPPORTED_VERSION, 5);
    }

    #[test]
    fn rejects_garbage_without_panicking() {
        assert!(dwg_to_dxf(b"not a dwg").is_err());
        assert!(dxf_to_dwg(b"not a dxf", None).is_err());
    }

    #[test]
    fn rejects_unknown_target_version() {
        let error = dxf_to_dwg(TINY_DXF, Some("AC9999")).unwrap_err();
        assert_eq!(error.0, STATUS_UNSUPPORTED_VERSION);
    }

    #[test]
    fn attaches_the_attributes_the_dxf_reader_leaves_loose() {
        let (document, warnings) = read_dxf(TINY_DXF).expect("the fixture reads");
        assert!(
            warnings.iter().any(|line| line.contains("attribute")),
            "the repair is reported: {warnings:?}"
        );
        assert!(document.entities().any(|entity| matches!(
            entity,
            acadrust::EntityType::Insert(insert) if !insert.attributes.is_empty()
        )));
    }

    #[test]
    fn the_fixture_round_trips() {
        let (dwg, written, _) = dxf_to_dwg(TINY_DXF, None).expect("DXF to DWG");
        let (dxf, read_back, _) = dwg_to_dxf(&dwg).expect("DWG to DXF");
        assert_eq!(written, read_back);
        assert_eq!(&written, "AC1032");
        assert!(dxf.starts_with(b"  0\r\nSECTION"), "the DXF output is ASCII DXF");
    }
}
