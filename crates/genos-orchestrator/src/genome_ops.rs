//! Opérations fines sur le génome (clonage, édition, empreinte, hash).

use genos_genome::genome::GenomeFingerprint;
use genos_genome::{DnaStrand, Gene, Genome};

pub fn derive_child(genome: &Genome) -> Genome {
    genome.derive_child()
}

pub fn derive_reproductive_child(genome: &Genome) -> Genome {
    genome.derive_reproductive_child()
}

pub fn insert_gene(genome: &mut Genome, gene: Gene) {
    genome.insert_gene(gene);
}

pub fn validate(genome: &Genome) -> Result<(), String> {
    genome.validate()
}

pub fn fingerprint(genome: &Genome) -> Result<GenomeFingerprint, String> {
    genome.fingerprint()
}

pub fn verify_fingerprint(genome: &Genome, fingerprint: &GenomeFingerprint) -> bool {
    genome.verify_fingerprint(fingerprint)
}

pub fn content_hash(genome: &Genome) -> String {
    genome.content_hash()
}

pub fn hash_library(genome: &Genome) -> String {
    genome.hash_library()
}

pub fn knockout(genome: &mut Genome, locus: &str) -> bool {
    genome.crispr_cas9_knockout(locus)
}

pub fn pseudogenize(genome: &mut Genome, locus: &str) -> bool {
    genome.pseudogenize(locus)
}

pub fn duplicate_gene(genome: &mut Genome, locus: &str) -> Result<String, String> {
    genome.duplicate_gene(locus)
}

pub fn to_dna_strand(genome: &Genome) -> DnaStrand {
    genome.to_nucleotide_strand()
}

pub fn from_dna_strand(strand: &DnaStrand) -> Result<Genome, String> {
    Genome::from_nucleotide_strand(strand)
}
