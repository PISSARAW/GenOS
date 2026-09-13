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
    let signer = read_provenance(&signed)?
        .signer
        .ok_or("signed AgentDNA is missing provenance.signer")?;
    crate::sign::verify_flux(&signer, &flux, &signature)?;
    Ok(Some(signer))
}

fn canonical_flux(sections: &[Section]) -> Vec<u8> {
    let mut flux = Vec::new();
    for section in sections {
        flux.extend_from_slice(&section.tag.as_bytes());
        flux.extend_from_slice(&(section.payload.len() as u32).to_le_bytes());
        flux.extend_from_slice(&section.payload);
    }
    flux
}

fn decode_sections(bytes: &[u8]) -> Result<Vec<Section>, String> {
    let header = Header::decode(bytes)?;
    let (sections, payload_crc) = read_sections(bytes, &header)?;
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

pub fn decode(bytes: &[u8]) -> Result<AgentDna, String> {
    let header = Header::decode(bytes)?;
    let (sections, payload_crc) = read_sections(bytes, &header)?;
    if payload_crc != header.payload_crc32 {
        return Err("AgentDNA payload CRC mismatch".to_string());
    }
    build_model(&sections)
}

fn read_sections(bytes: &[u8], header: &Header) -> Result<(Vec<Section>, u32), String> {
    let count = header.section_count as usize;
    let table_end = HEADER_LEN + count * SECTION_ENTRY_LEN;
    if bytes.len() < table_end {
        return Err("AgentDNA section table is truncated".to_string());
    }
    if header.total_length as usize != bytes.len() {
        return Err("AgentDNA total_length does not match file size".to_string());
    }
    let mut sections = Vec::with_capacity(count);
    let mut payload = Vec::new();
    for index in 0..count {
        let base = HEADER_LEN + index * SECTION_ENTRY_LEN;
        let entry = read_entry(bytes, base)?;
        let section = read_section(bytes, &entry, table_end)?;
        payload.extend_from_slice(&section.payload);
        sections.push(section);
    }
    Ok((sections, header::crc32(&payload)))
}

fn read_section(bytes: &[u8], entry: &SectionEntry, table_end: usize) -> Result<Section, String> {
    let start = entry.offset as usize;
    let end = start
        .checked_add(entry.length as usize)
        .ok_or("section length overflow")?;
    if start < table_end || end > bytes.len() {
        return Err(format!("section {:?} bounds are invalid", entry.tag));
    }
    let slice = &bytes[start..end];
    if header::crc32(slice) != entry.crc32 {
        return Err(format!("section {:?} CRC mismatch", entry.tag));
    }
    Ok(Section::new(entry.tag, slice.to_vec()))
}

fn read_entry(bytes: &[u8], base: usize) -> Result<SectionEntry, String> {
    let tag_bytes = [bytes[base], bytes[base + 1], bytes[base + 2], bytes[base + 3]];
    let tag = SectionTag::from_bytes(tag_bytes).ok_or_else(|| format!("unknown section tag {:?}", tag_bytes))?;
    Ok(SectionEntry {
        tag,
        offset: read_u32(bytes, base + 4),
        length: read_u32(bytes, base + 8),
        crc32: read_u32(bytes, base + 12),
    })
}

fn read_u32(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

fn require<'a>(sections: &'a [Section], tag: SectionTag) -> Result<&'a [u8], String> {
    sections
        .iter()
        .find(|section| section.tag == tag)
        .map(|section| section.payload.as_slice())
        .ok_or_else(|| format!("missing required section {:?}", tag))
}

fn optional<'a>(sections: &'a [Section], tag: SectionTag) -> Option<&'a [u8]> {
    sections.iter().find(|section| section.tag == tag).map(|section| section.payload.as_slice())
}

struct DnaParts {
    plasmids: Vec<Plasmid>,
    enhancers: Vec<String>,
    extra_chromosomes: Vec<DnaStrand>,
    scars: Vec<uuid::Uuid>,
    phenotype: Option<Phenotype>,
}

fn build_model(sections: &[Section]) -> Result<AgentDna, String> {
    let parts = read_optional(sections)?;
    Ok(AgentDna {
        meta: read_meta(sections)?,
        maternal: read_strand(sections, SectionTag::Chrm)?,
        paternal: read_strand(sections, SectionTag::Chrp)?,
        genes: read_genes(sections)?,
        plasmids: parts.plasmids,
        enhancers: parts.enhancers,
        extra_chromosomes: parts.extra_chromosomes,
        scars: parts.scars,
        phenotype: parts.phenotype,
        provenance: read_provenance(sections)?,
    })
}

fn read_optional(sections: &[Section]) -> Result<DnaParts, String> {
    Ok(DnaParts {
        plasmids: read_plasmids(sections)?,
        enhancers: read_enhancers(sections)?,
        extra_chromosomes: read_extra(sections)?,
        scars: read_scars(sections)?,
        phenotype: read_phenotype(sections)?,
    })
}

fn read_meta(sections: &[Section]) -> Result<Meta, String> {
    let wire: WireMeta = unpack(require(sections, SectionTag::Meta)?)?;
    Ok(wire::wire_to_meta(wire))
}

fn read_strand(sections: &[Section], tag: SectionTag) -> Result<DnaStrand, String> {
    decode_strand(require(sections, tag)?)
}

fn read_genes(sections: &[Section]) -> Result<BTreeMap<String, genos_genome::Gene>, String> {
    let wire: BTreeMap<String, WireGene> = unpack(require(sections, SectionTag::Gene)?)?;
    genes_to_domain(wire)
}

fn read_provenance(sections: &[Section]) -> Result<Provenance, String> {
    let wire: WireProvenance = unpack(require(sections, SectionTag::Prov)?)?;
    Ok(wire::wire_to_provenance(wire))
}

fn genes_to_domain(genes: BTreeMap<String, WireGene>) -> Result<BTreeMap<String, genos_genome::Gene>, String> {
    let mut out = BTreeMap::new();
    for (locus, gene) in genes {
        out.insert(locus, wire::wire_to_gene(gene)?);
    }
    Ok(out)
}

fn read_plasmids(sections: &[Section]) -> Result<Vec<genos_genome::Plasmid>, String> {
    match optional(sections, SectionTag::Plas) {
        Some(payload) => {
            let list: Vec<WirePlasmid> = unpack(payload)?;
            Ok(list.into_iter().map(wire::wire_to_plasmid).collect())
        }
        None => Ok(Vec::new()),
    }
}

fn read_enhancers(sections: &[Section]) -> Result<Vec<String>, String> {
    match optional(sections, SectionTag::Enha) {
        Some(payload) => unpack(payload),
        None => Ok(Vec::new()),
    }
}

fn read_extra(sections: &[Section]) -> Result<Vec<DnaStrand>, String> {
    match optional(sections, SectionTag::Xchr) {
        Some(payload) => {
            let list: Vec<Bytes> = unpack(payload)?;
            list.iter().map(|bytes| decode_strand(&bytes.0)).collect()
        }
        None => Ok(Vec::new()),
    }
}

fn read_scars(sections: &[Section]) -> Result<Vec<uuid::Uuid>, String> {
    match optional(sections, SectionTag::Scar) {
        Some(payload) => {
            let list: Vec<UuidBytes> = unpack(payload)?;
            Ok(list.into_iter().map(|id| id.0).collect())
        }
        None => Ok(Vec::new()),
    }
}

fn read_phenotype(sections: &[Section]) -> Result<Option<crate::model::Phenotype>, String> {
    match optional(sections, SectionTag::Phen) {
        Some(payload) => {
            let wire: WirePhenotype = unpack(payload)?;
            Ok(Some(wire::wire_to_phenotype(wire)))
        }
        None => Ok(None),
    }
}

fn pack<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, String> {
    rmp_serde::to_vec(value).map_err(|error| format!("AgentDNA encode failed: {error}"))
}

fn unpack<T: serde::de::DeserializeOwned>(payload: &[u8]) -> Result<T, String> {
    rmp_serde::from_slice(payload).map_err(|error| format!("AgentDNA decode failed: {error}"))
}
