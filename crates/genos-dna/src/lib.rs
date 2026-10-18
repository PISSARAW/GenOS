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
pub mod point_mutation;
pub mod sign;

pub use header::{Header, HEADER_LEN, SECTION_ENTRY_LEN, FORMAT_VERSION, MAGIC};
pub use section::{Section, SectionTag};
pub use model::{AgentDna, Decoy, DevelopmentState, DnaStatus, EpigenomeState, EpiMark, GrnEdge, GrnNode, GrnState, Meta, Mutation, Phenotype, Provenance, Selection, UnknownSection};
pub use operations::{
    clone_dna, clone_dna_pair, cross, decoy, graft, inject, mutate, seal, speciate, CloneOptions, ClonePair, CrossOptions,
    DecoyOptions, GraftSpec, InjectedPhenotype, MutateOptions, SealOptions, SpeciateOptions,
};

#[cfg(test)]
mod tests;

#[cfg(test)]
mod seal_tests;
