//! Biomimicry extensions: biological mechanisms not yet covered elsewhere.
//!
//! Each submodule models one biological mechanism and maps it onto GenOS
//! primitives (capsules, genomes, worlds, events) while preserving the
//! fundamental invariants from `spec/GENOME_SPEC.md`.

pub mod bet_hedging;
pub mod chaperone;
pub mod cycle_checkpoints;
pub mod embryogenesis;
pub mod hox_genes;
pub mod canalization;
pub mod metamorphosis;
pub mod regeneration;
pub mod endocrine;
pub mod reflex_arc;
pub mod neuromodulation;
pub mod hippocampal_replay;
pub mod circadian_rhythms;
pub mod allostasis;
pub mod cross_modal_plasticity;
pub mod inflammation;
pub mod autoimmunity;
pub mod punctuated_equilibria;
pub mod ecological_succession;
pub mod social_learning;
pub mod play_behavior;
pub mod thanatosis;
pub mod mimicry;
pub mod interferon;
pub mod morphogenesis;
pub mod neoteny;
pub mod proceduralization;
pub mod reciprocity;
pub mod sar;
pub mod senescence;
pub mod speciation;
pub mod telomere;
pub mod vaccination;

pub use bet_hedging::*;
pub use chaperone::*;
pub use cycle_checkpoints::*;
pub use embryogenesis::*;
pub use hox_genes::*;
pub use canalization::*;
pub use metamorphosis::*;
pub use regeneration::*;
pub use endocrine::*;
pub use reflex_arc::*;
pub use neuromodulation::*;
pub use hippocampal_replay::*;
pub use circadian_rhythms::*;
pub use allostasis::*;
pub use cross_modal_plasticity::*;
pub use inflammation::*;
pub use autoimmunity::*;
pub use punctuated_equilibria::*;
pub use ecological_succession::*;
pub use social_learning::*;
pub use play_behavior::*;
pub use thanatosis::*;
pub use mimicry::*;
pub use interferon::*;
pub use morphogenesis::*;
pub use neoteny::*;
pub use proceduralization::*;
pub use reciprocity::*;
pub use sar::*;
pub use senescence::*;
pub use speciation::*;
pub use telomere::*;
pub use vaccination::*;













