//! Lossless, explicitly requested migration of legacy instruction encodings.
use genos_genome::DnaStrand;
use uuid::Uuid;

use crate::{AgentDna, DnaStatus, Mutation, codec, express, validate};

pub fn requires_hachimoji(dna: &AgentDna) -> bool {
    dna.maternal.bits_per_base() != 3
        || dna.paternal.bits_per_base() != 3
        || dna.genes.values().any(|gene| gene.dna.bits_per_base() != 3)
        || dna.extra_chromosomes.iter().any(|strand| strand.bits_per_base() != 3)
}

/// Produce a new draft with identical instructions and regulatory state.
/// Signed/sealed inputs require their owner's separate signing workflow.
pub fn to_hachimoji(source: &AgentDna) -> Result<AgentDna, String> {
    validate::validate(source)?;
    if source.provenance.signer.is_some() || source.meta.status == DnaStatus::Sealed {
        return Err("signed or sealed genome requires an authorized re-signing workflow".into());
    }
    if !requires_hachimoji(source) { return Ok(source.clone()); }
    let source_hash = codec::content_hash(source)?;
    let mut migrated = source.clone();
    migrated.original_encoding = None;
    transcode_strands(&mut migrated, source)?;
    bind_lineage(&mut migrated, source, source_hash)?;
    finish(&mut migrated, source)?;
    Ok(migrated)
}

fn transcode_strands(migrated: &mut AgentDna, source: &AgentDna) -> Result<(), String> {
    migrated.maternal = transcode(&source.maternal)?;
    migrated.paternal = transcode(&source.paternal)?;
    for gene in migrated.genes.values_mut() {
        if gene.dna.bits_per_base() == 3 { continue; }
        if !gene.default_exons.is_empty() {
            return Err(format!("gene '{}' has nucleotide-indexed exons; explicit remapping required", gene.locus));
        }
        gene.dna = transcode(&gene.dna)?;
    }
    migrated.extra_chromosomes = source.extra_chromosomes.iter()
        .map(transcode).collect::<Result<_, _>>()?;
    Ok(())
}

fn finish(migrated: &mut AgentDna, source: &AgentDna) -> Result<(), String> {
    let phenotype = express::express(migrated);
    if phenotype != express::express(source) {
        return Err("Hachimoji migration changed the expressed phenotype".into());
    }
    migrated.phenotype = Some(phenotype);
    validate::validate(migrated)
}

fn transcode(source: &DnaStrand) -> Result<DnaStrand, String> {
    if source.bits_per_base() == 3 { return Ok(source.clone()); }
    let instruction = source.decode_instruction();
    if DnaStrand::synthesize_legacy(&instruction) != *source {
        return Err("legacy strand is not lossless UTF-8; explicit migration required".into());
    }
    Ok(DnaStrand::synthesize(&instruction))
}

fn bind_lineage(target: &mut AgentDna, source: &AgentDna, source_hash: String) -> Result<(), String> {
    target.meta.genome_id = Uuid::new_v4();
    target.meta.parent_ids = vec![source.meta.genome_id];
    target.meta.generation = source.meta.generation.checked_add(1)
        .ok_or("genome generation overflow")?;
    target.meta.status = DnaStatus::Draft;
    target.provenance.parents = target.meta.parent_ids.clone();
    target.provenance.selection = None;
    target.provenance.mutations.push(Mutation {
        gene: None, kind: "encoding:hachimoji".into(), from: source_hash,
        to: "AgentDNA/v2:ACGTPZBS".into(),
    });
    Ok(())
}
