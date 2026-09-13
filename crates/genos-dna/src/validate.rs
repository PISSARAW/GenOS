use genos_genome::Gene;

use crate::codec;
use crate::model::{AgentDna, Meta};

pub const MAX_GENES: usize = 4096;
pub const MAX_STRAND_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_LOCUS_LEN: usize = 64;

pub fn validate(dna: &AgentDna) -> Result<(), String> {
    validate_meta(&dna.meta)?;
    validate_chromosomes(dna)?;
    validate_genes(dna)?;
    dna.to_genome()?.validate()
}

pub fn validate_bytes(bytes: &[u8]) -> Result<AgentDna, String> {
    let dna = codec::decode(bytes)?;
    validate(&dna)?;
    codec::verify_signature(bytes)?;
    Ok(dna)
}

fn validate_meta(meta: &Meta) -> Result<(), String> {
    if meta.name.trim().is_empty() {
        return Err("genome name must not be empty".to_string());
    }
    if meta.ploidy.trim().is_empty() {
        return Err("ploidy must not be empty".to_string());
    }
    if meta.genome_id.is_nil() || meta.lineage_id.is_nil() {
        return Err("genome_id and lineage_id must not be nil".to_string());
    }
    Ok(())
}

fn validate_chromosomes(dna: &AgentDna) -> Result<(), String> {
    if dna.maternal.is_empty() || dna.paternal.is_empty() {
        return Err("chromosomes must not be empty".to_string());
    }
    if dna.maternal.len() > MAX_STRAND_BYTES || dna.paternal.len() > MAX_STRAND_BYTES {
        return Err("chromosome exceeds the strand size limit".to_string());
    }
    Ok(())
}

fn validate_genes(dna: &AgentDna) -> Result<(), String> {
    if dna.genes.len() > MAX_GENES {
        return Err(format!("gene count {} exceeds the {MAX_GENES} limit", dna.genes.len()));
    }
    for (locus, gene) in &dna.genes {
        validate_locus(locus)?;
        validate_gene(locus, gene)?;
    }
    Ok(())
}

fn validate_gene(locus: &str, gene: &Gene) -> Result<(), String> {
    if locus != gene.locus {
        return Err(format!("gene map key '{locus}' does not match locus '{}'", gene.locus));
    }
    if gene.dna.is_empty() {
        return Err(format!("gene '{locus}' has empty DNA"));
    }
    if gene.dna.len() > MAX_STRAND_BYTES {
        return Err(format!("gene '{locus}' exceeds the strand size limit"));
    }
    for (start, end) in &gene.default_exons {
        if start >= end || *end > gene.dna.len() {
            return Err(format!("gene '{locus}' has an invalid exon range"));
        }
    }
    Ok(())
}

fn validate_locus(locus: &str) -> Result<(), String> {
    if locus.is_empty() || locus.len() > MAX_LOCUS_LEN {
        return Err(format!("invalid locus length: '{locus}'"));
    }
    let valid = locus
        .chars()
        .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_');
    if !valid {
        return Err(format!("invalid locus characters: '{locus}'"));
    }
    Ok(())
}
