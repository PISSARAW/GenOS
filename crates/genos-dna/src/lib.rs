pub mod header;
pub mod section;
pub mod packing;
pub mod model;
pub mod wire;
pub mod codec;
pub mod manifest;
pub mod compile;
pub mod express;
pub mod validate;
pub mod operations;
pub mod sign;

pub use header::{Header, HEADER_LEN, SECTION_ENTRY_LEN, FORMAT_VERSION, MAGIC};
pub use section::{Section, SectionTag};
pub use model::{AgentDna, Decoy, Meta, Mutation, Phenotype, Provenance, Selection};
pub use operations::{
    clone_dna, cross, decoy, graft, inject, mutate, speciate, CloneOptions, CrossOptions,
    DecoyOptions, GraftSpec, InjectedPhenotype, MutateOptions, SpeciateOptions,
};

#[cfg(test)]
mod tests;
