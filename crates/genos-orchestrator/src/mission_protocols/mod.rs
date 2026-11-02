//! Exécution native bornée, distincte des simulations biologiques et du pont Node.
mod schema;
mod store;
mod types;
pub mod process;
pub mod integer;
pub use store::{Store, context_digest, digest, now_ms, raw_hash};
pub use types::{Binding, Computation, ContextCommitment, Event, RunSpec, WorkerJob, WorkerReply, WorkerRole};
pub mod continuity;
pub mod continuity_checkpoint;
pub mod continuity_effect;
pub mod morph;
pub mod morph_types;
