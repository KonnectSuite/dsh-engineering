//! In-repo stand-in for the `web-time` crate, used by `acadrust` through
//! `[patch.crates-io]`.
//!
//! Upstream `web-time` replaces `std::time` on `wasm32-unknown-unknown` by
//! calling into JavaScript through `wasm-bindgen`/`js-sys`. That would make the
//! compiled module import wasm-bindgen placeholders, so it could only be
//! instantiated with generated wasm-bindgen glue. The ECAD DWG converter is
//! loaded by a hand-written `WebAssembly.instantiate` call
//! (`packages/ecad/src/dwg/wasm.ts`), so this crate provides the same API using
//! one plain `env` import the loader supplies in four lines.
//!
//! What acadrust actually uses the clock for (measured against 0.6.8):
//!
//! * `Instant::now()` + `.elapsed().as_secs_f64()` for stage timings on
//!   diagnostic lines only — no control flow depends on them;
//! * `SystemTime::now().duration_since(UNIX_EPOCH)` as one word of hash input
//!   when minting a sheet-set GUID (`sheet_set::new_id`).
//!
//! Nothing here is on a correctness path, which is why a host clock import is
//! enough and no wasm-bindgen runtime is required.

pub use std::time::Duration;

#[cfg(not(target_arch = "wasm32"))]
pub use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_arch = "wasm32")]
mod wasm {
    use std::time::Duration;

    #[link(wasm_import_module = "env")]
    extern "C" {
        /// Host clock in milliseconds since the Unix epoch. The loader answers
        /// with `Date.now()`.
        fn ecad_host_now_millis() -> u64;
    }

    fn now_millis() -> u64 {
        // SAFETY: the module is only ever instantiated by the loader in
        // `src/dwg/wasm.ts`, which provides this import. The host is not
        // required to be Unix-epoch aligned; only differences are used.
        unsafe { ecad_host_now_millis() }
    }

    /// Instant backed by the host clock; differences are what matters.
    #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct Instant(u64);

    impl Instant {
        pub fn now() -> Self {
            Instant(now_millis())
        }

        /// Time elapsed since this instant; saturates at zero.
        pub fn elapsed(&self) -> Duration {
            Duration::from_millis(now_millis().saturating_sub(self.0))
        }

        pub fn duration_since(&self, earlier: Instant) -> Duration {
            Duration::from_millis(self.0.saturating_sub(earlier.0))
        }

        pub fn checked_duration_since(&self, earlier: Instant) -> Option<Duration> {
            if self.0 >= earlier.0 {
                Some(self.duration_since(earlier))
            } else {
                None
            }
        }

        pub fn saturating_duration_since(&self, earlier: Instant) -> Duration {
            self.duration_since(earlier)
        }

        pub fn checked_add(&self, duration: Duration) -> Option<Instant> {
            Some(Instant(self.0.checked_add(duration.as_millis() as u64)?))
        }

        pub fn checked_sub(&self, duration: Duration) -> Option<Instant> {
            Some(Instant(self.0.checked_sub(duration.as_millis() as u64)?))
        }
    }

    /// Wall clock backed by the host clock.
    #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct SystemTime(u64);

    /// The Unix epoch.
    pub const UNIX_EPOCH: SystemTime = SystemTime(0);

    impl SystemTime {
        pub fn now() -> Self {
            SystemTime(now_millis())
        }

        /// `std::time::SystemTimeError` has no public constructor, and the one
        /// caller (`sheet_set::new_id`) already treats an error as zero, so a
        /// clock that reads before `earlier` reports a zero interval instead.
        pub fn duration_since(
            &self,
            earlier: SystemTime,
        ) -> Result<Duration, std::time::SystemTimeError> {
            Ok(Duration::from_millis(self.0.saturating_sub(earlier.0)))
        }

        pub fn elapsed(&self) -> Result<Duration, std::time::SystemTimeError> {
            Ok(Duration::from_millis(now_millis().saturating_sub(self.0)))
        }
    }
}

#[cfg(target_arch = "wasm32")]
pub use wasm::{Instant, SystemTime, UNIX_EPOCH};
