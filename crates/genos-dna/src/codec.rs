use std::collections::BTreeMap;

use genos_genome::{DnaStrand, Plasmid};
use sha2::{Digest, Sha256};

use crate::header::{self, Header, FLAG_DECOY, FLAG_HAS_EXTRA_CHROMOSOMES, FLAG_HAS_PLASMIDS, FLAG_HAS_RETROVIRUSES, FLAG_PHENOTYPE_CACHED, FLAG_SCALARS_LE, FLAG_SIGNED, HEADER_LEN, SECTION_ENTRY_LEN};
use crate::model::{AgentDna, Meta, Phenotype, Provenance};
use crate::packing::{decode_strand, encode_strand};
use crate::section::{Section, SectionEntry, SectionTag};
use crate::wire::{self, Bytes, UuidBytes, WireGene, WireMeta, WirePhenotype, WirePlasmid, WireProvenance};

pub fn encode(dna: &AgentDna) -> Result<Vec<u8>, String> {
    let sections = build_sections(dna)?;
    assemble(&sections, compute_flags(dna))
}

pub fn content_hash(dna: &AgentDna) -> Result<String, String> {
    let sections = build_sections(dna)?;
    let mut hasher = Sha256::new();
    hasher.update(canonical_flux(&sections));
    Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn encode_signed(dna: &mut AgentDna, secret: &[u8]) -> Result<Vec<u8>, String> {
    let signing = crate::sign::signing_key_from_secret(secret)?;
    dna.provenance.signer = Some(crate::sign::public_key_hex(&signing));
    let mut sections = build_sections(dna)?;
    let signature = crate::sign::sign_flux(&signing, &canonical_flux(&sections));
    sections.push(Section::new(SectionTag::Sign, signature));
    sections.sort_by(|left, right| left.tag.cmp(&right.tag));
    assemble(&sections, compute_flags(dna) | FLAG_SIGNED)
}

pub fn verify_signature(bytes: &[u8]) -> Result<Option<String>, String> {
    let sections = decode_sections(bytes)?;
    let signature = match sections.iter().find(|section| section.tag == SectionTag::Sign) {
        Some(section) => section.payload.clone(),
        None => return Ok(None),
    };
    let signed: Vec<Section> = sections.into_iter().filter(|section| section.tag != SectionTag::Sign).collect();
    let flux = canonical_flux(&signed);
    let signer = decoder::read_provenance(&signed)?
        .signer
        .ok_or("signed AgentDNA is missing provenance.signer")?;
    crate::sign::verify_flux(&signer, &flux, &signature)?;
    Ok(Some(signer))
}

fn canonical_flux(sections: &[Section]) -> Vec<u8> {
    let mut ordered: Vec<&Section> = sections.iter().filter(|section| section.tag != SectionTag::Sign).collect();
    ordered.sort_by(|left, right| left.tag.as_bytes().cmp(&right.tag.as_bytes()));
    let mut flux = Vec::new();
    for section in ordered {
        flux.extend_from_slice(&section.tag.as_bytes());
        flux.extend_from_slice(&(section.payload.len() as u32).to_le_bytes());
        flux.extend_from_slice(&section.payload);
    }
    flux
}

fn decode_sections(bytes: &[u8]) -> Result<Vec<Section>, String> {
    let header = Header::decode(bytes)?;
    let (sections, payload_crc) = decoder::read_sections(bytes, &header)?;
    if payload_crc != header.payload_crc32 {
        return Err("AgentDNA payload CRC mismatch".to_string());
    }
    Ok(sections)
}

pub fn build_sections(dna: &AgentDna) -> Result<Vec<Section>, String> {
    let mut sections = Vec::new();
    let meta = wire::meta_to_wire(&dna.meta);
    sections.push(Section::new(SectionTag::Meta, pack(&meta)?));
    sections.push(Section::new(SectionTag::Chrm, encode_strand(&dna.maternal)));
    sections.push(Section::new(SectionTag::Chrp, encode_strand(&dna.paternal)));
    let genes = genes_to_wire(&dna.genes)?;
    sections.push(Section::new(SectionTag::Gene, pack(&genes)?));
    push_plasmids(&mut sections, dna);
    push_enhancers(&mut sections, dna);
    push_extra_chromosomes(&mut sections, dna);
    push_scars(&mut sections, dna);
    push_epigenome(&mut sections, dna)?;
    push_grn(&mut sections, dna)?;
    push_development(&mut sections, dna)?;
    push_unknowns(&mut sections, dna);
    if let Some(phenotype) = &dna.phenotype {
        sections.push(Section::new(SectionTag::Phen, pack(&wire::phenotype_to_wire(phenotype))?));
    }
    sections.push(Section::new(SectionTag::Prov, pack(&wire::provenance_to_wire(&dna.provenance))?));
    sections.sort_by(|left, right| left.tag.cmp(&right.tag));
    Ok(sections)
}

fn genes_to_wire(genes: &BTreeMap<String, genos_genome::Gene>) -> Result<BTreeMap<String, WireGene>, String> {
    let mut out = BTreeMap::new();
    for (locus, gene) in genes {
        out.insert(locus.clone(), wire::gene_to_wire(gene)?);
    }
    Ok(out)
}

fn push_plasmids(sections: &mut Vec<Section>, dna: &AgentDna) {
    if dna.plasmids.is_empty() {
        return;
    }
    let list: Vec<WirePlasmid> = dna.plasmids.iter().map(wire::plasmid_to_wire).collect();
    if let Ok(payload) = pack(&list) {
        sections.push(Section::new(SectionTag::Plas, payload));
    }
}

fn push_enhancers(sections: &mut Vec<Section>, dna: &AgentDna) {
    if dna.enhancers.is_empty() {
        return;
    }
    if let Ok(payload) = pack(&dna.enhancers) {
        sections.push(Section::new(SectionTag::Enha, payload));
    }
}

fn push_extra_chromosomes(sections: &mut Vec<Section>, dna: &AgentDna) {
    if dna.extra_chromosomes.is_empty() {
        return;
    }
    let list: Vec<Bytes> = dna.extra_chromosomes.iter().map(|strand| Bytes(encode_strand(strand))).collect();
    if let Ok(payload) = pack(&list) {
        sections.push(Section::new(SectionTag::Xchr, payload));
    }
}

fn push_scars(sections: &mut Vec<Section>, dna: &AgentDna) {
    if dna.scars.is_empty() {
        return;
    }
    let list: Vec<UuidBytes> = dna.scars.iter().map(|id| UuidBytes(*id)).collect();
    if let Ok(payload) = pack(&list) {
        sections.push(Section::new(SectionTag::Scar, payload));
    }
}

fn push_epigenome(sections: &mut Vec<Section>, dna: &AgentDna) -> Result<(), String> {
    if dna.epigenome.marks.is_empty() && dna.epigenome.stress_memory.is_empty() {
        return Ok(());
    }
    sections.push(Section::new(SectionTag::Epigenome, pack(&wire::epigenome_to_wire(&dna.epigenome))?));
    Ok(())
}

fn push_grn(sections: &mut Vec<Section>, dna: &AgentDna) -> Result<(), String> {
    if dna.grn.nodes.is_empty() && dna.grn.edges.is_empty() {
        return Ok(());
    }
    sections.push(Section::new(SectionTag::Grn, pack(&wire::grn_to_wire(&dna.grn))?));
    Ok(())
}

fn push_development(sections: &mut Vec<Section>, dna: &AgentDna) -> Result<(), String> {
    if dna.development.stage == "Zygote"
        && dna.development.lineage_commitment.is_none()
        && dna.development.morphogens.is_empty()
        && dna.development.differentiation_signal.is_none()
    {
        return Ok(());
    }
    sections.push(Section::new(SectionTag::Development, pack(&wire::development_to_wire(&dna.development))?));
    Ok(())
}

fn push_unknowns(sections: &mut Vec<Section>, dna: &AgentDna) {
    for unknown in &dna.unknown_sections {
        sections.push(Section::new(SectionTag::Unknown(unknown.tag), unknown.payload.clone()));
    }
}

fn compute_flags(dna: &AgentDna) -> u16 {
    let mut flags = FLAG_SCALARS_LE;
    if dna.phenotype.is_some() {
        flags |= FLAG_PHENOTYPE_CACHED;
    }
    if !dna.plasmids.is_empty() {
        flags |= FLAG_HAS_PLASMIDS;
    }
    if !dna.extra_chromosomes.is_empty() {
        flags |= FLAG_HAS_EXTRA_CHROMOSOMES;
    }
    if dna.genes.keys().any(|locus| locus.starts_with("RETRO_")) {
        flags |= FLAG_HAS_RETROVIRUSES;
    }
    if dna.provenance.decoy.is_some() {
        flags |= FLAG_DECOY;
    }
    flags
}

fn assemble(sections: &[Section], flags: u16) -> Result<Vec<u8>, String> {
    let table_len = sections.len() * SECTION_ENTRY_LEN;
    let mut offset = HEADER_LEN + table_len;
    let mut payload = Vec::new();
    let mut entries = Vec::with_capacity(sections.len());
    for section in sections {
        entries.push(SectionEntry {
            tag: section.tag,
            offset: offset as u32,
            length: section.payload.len() as u32,
            crc32: header::crc32(&section.payload),
        });
        payload.extend_from_slice(&section.payload);
        offset += section.payload.len();
    }
    let header = Header {
        flags,
        section_count: sections.len() as u16,
        total_length: offset as u32,
        payload_crc32: header::crc32(&payload),
    };
    let mut out = Vec::with_capacity(offset);
    out.extend_from_slice(&header.encode());
    for entry in &entries {
        out.extend_from_slice(&entry.tag.as_bytes());
        out.extend_from_slice(&entry.offset.to_le_bytes());
        out.extend_from_slice(&entry.length.to_le_bytes());
        out.extend_from_slice(&entry.crc32.to_le_bytes());
    }
    out.extend_from_slice(&payload);
    Ok(out)
}

fn pack<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, String> {
    rmp_serde::to_vec(value).map_err(|error| format!("AgentDNA encode failed: {error}"))
}

mod decoder;
pub use decoder::decode;
