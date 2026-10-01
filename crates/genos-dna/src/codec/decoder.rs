use super::*;

pub fn decode(bytes: &[u8]) -> Result<AgentDna, String> {
    let header = Header::decode(bytes)?;
    let (sections, payload_crc) = read_sections(bytes, &header)?;
    if payload_crc != header.payload_crc32 {
        return Err("AgentDNA payload CRC mismatch".to_string());
    }
    build_model(&sections)
}

pub(super) fn read_sections(bytes: &[u8], header: &Header) -> Result<(Vec<Section>, u32), String> {
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
    let tag = SectionTag::from_bytes_lossy(tag_bytes);
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
    epigenome: crate::model::EpigenomeState,
    grn: crate::model::GrnState,
    development: crate::model::DevelopmentState,
    unknowns: Vec<crate::model::UnknownSection>,
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
        epigenome: parts.epigenome,
        grn: parts.grn,
        development: parts.development,
        unknown_sections: parts.unknowns,
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
        epigenome: read_epigenome(sections)?,
        grn: read_grn(sections)?,
        development: read_development(sections)?,
        unknowns: read_unknowns(sections),
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

pub(super) fn read_provenance(sections: &[Section]) -> Result<Provenance, String> {
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

fn read_epigenome(sections: &[Section]) -> Result<crate::model::EpigenomeState, String> {
    match optional(sections, SectionTag::Epigenome) {
        Some(payload) => {
            let wire: wire::WireEpigenome = unpack(payload)?;
            Ok(wire::wire_to_epigenome(wire))
        }
        None => Ok(crate::model::EpigenomeState::new()),
    }
}

fn read_grn(sections: &[Section]) -> Result<crate::model::GrnState, String> {
    match optional(sections, SectionTag::Grn) {
        Some(payload) => {
            let wire: wire::WireGrn = unpack(payload)?;
            Ok(wire::wire_to_grn(wire))
        }
        None => Ok(crate::model::GrnState::new()),
    }
}

fn read_development(sections: &[Section]) -> Result<crate::model::DevelopmentState, String> {
    match optional(sections, SectionTag::Development) {
        Some(payload) => {
            let wire: wire::WireDevelopment = unpack(payload)?;
            Ok(wire::wire_to_development(wire))
        }
        None => Ok(crate::model::DevelopmentState::new()),
    }
}

fn read_unknowns(sections: &[Section]) -> Vec<crate::model::UnknownSection> {
    sections
        .iter()
        .filter(|section| section.tag.is_unknown())
        .map(|section| crate::model::UnknownSection { tag: section.tag.as_bytes(), payload: section.payload.clone() })
        .collect()
}

fn unpack<T: serde::de::DeserializeOwned>(payload: &[u8]) -> Result<T, String> {
    rmp_serde::from_slice(payload).map_err(|error| format!("AgentDNA decode failed: {error}"))
}
