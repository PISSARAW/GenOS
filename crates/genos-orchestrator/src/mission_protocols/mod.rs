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
pub mod synapse;
pub mod evidence;
pub mod allostasis;
pub mod omega;
mod omega_store;
pub mod gqwf;
mod gqwf_store;
mod gqwf_commit;
pub mod source;
pub mod engine;
#[cfg(feature="native-llm")]
pub mod llm_contract;
#[cfg(feature="native-llm")]
pub mod llm_spec;
#[cfg(feature="native-llm")]
pub mod llm_source;
#[cfg(feature="native-llm")]
pub mod llm_roles;
#[cfg(feature="native-llm")]
pub mod llm_synapse;
#[cfg(feature="native-llm")]
pub mod llm_allostasis;
#[cfg(feature="native-llm")]
pub mod llm_omega;
#[cfg(feature="native-llm")]
pub mod llm_evidence;
#[cfg(feature="native-llm")]
pub mod llm_gqwf;
#[cfg(feature="native-llm")]
pub mod llm_engine;
#[cfg(feature="native-llm")]
pub mod agentic_spec;
#[cfg(feature="native-llm")]
pub mod agentic_source;
#[cfg(feature="native-llm")]
pub mod agentic_admission;
#[cfg(feature="native-llm")]
pub mod agentic_ledger;
#[cfg(feature="native-llm")]
pub mod agentic_context;
#[cfg(feature="native-llm")]
pub mod agentic_tools;
#[cfg(feature="native-llm")]
pub mod agentic_evidence;
#[cfg(feature="native-llm")]
pub mod agentic_exchange;
#[cfg(feature="native-llm")]
pub mod agentic_engine;
#[cfg(feature="native-llm")]
pub mod agentic_parallel_journal;
#[cfg(feature="native-llm")]
pub mod agentic_delegation;
#[cfg(feature="native-llm")]
pub mod agentic_delegation_exchange;

#[cfg(test)]
mod store_contention_tests;

mod write_gate;
