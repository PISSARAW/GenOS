//! Biomimicry extensions: biological mechanisms not yet covered elsewhere.
//!
//! Each submodule models one biological mechanism and maps it onto GenOS
//! primitives (capsules, genomes, worlds, events) while preserving the
//! fundamental invariants from `spec/GENOME_SPEC.md`.

pub mod chaperone;
pub mod cycle_checkpoints;
pub mod interferon;
pub mod morphogenesis;
pub mod proceduralization;
pub mod reciprocity;
pub mod sar;
pub mod telomere;
pub mod vaccination;

pub use chaperone::*;
pub use cycle_checkpoints::*;
pub use interferon::*;
pub use morphogenesis::*;
pub use proceduralization::*;
pub use reciprocity::*;
pub use sar::*;
pub use telomere::*;
pub use vaccination::*;
