use std::collections::BTreeMap;
use std::fmt;

use genos_genome::{ChromatinState, Gene, Plasmid};
use serde::de::{self, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;

use crate::model::{Crossover, Decoy, Meta, Mutation, Phenotype, Provenance, Selection};

#[derive(Clone, Debug, Default)]
pub struct Bytes(pub Vec<u8>);

impl Serialize for Bytes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(&self.0)
    }
}

impl<'de> Deserialize<'de> for Bytes {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct BytesVisitor;
        impl<'de> Visitor<'de> for BytesVisitor {
            type Value = Bytes;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a byte buffer")
            }
            fn visit_bytes<E: de::Error>(self, value: &[u8]) -> Result<Bytes, E> {
                Ok(Bytes(value.to_vec()))
            }
            fn visit_byte_buf<E: de::Error>(self, value: Vec<u8>) -> Result<Bytes, E> {
                Ok(Bytes(value))
            }
            fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Bytes, A::Error> {
                let mut out = Vec::new();
                while let Some(byte) = seq.next_element::<u8>()? {
                    out.push(byte);
                }
                Ok(Bytes(out))
            }
        }
        deserializer.deserialize_byte_buf(BytesVisitor)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct UuidBytes(pub Uuid);

impl Serialize for UuidBytes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(self.0.as_bytes())
    }
}

impl<'de> Deserialize<'de> for UuidBytes {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct UuidVisitor;
        impl<'de> Visitor<'de> for UuidVisitor {
            type Value = UuidBytes;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("16 uuid bytes")
            }
            fn visit_bytes<E: de::Error>(self, value: &[u8]) -> Result<UuidBytes, E> {
                Uuid::from_slice(value).map(UuidBytes).map_err(E::custom)
            }
            fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<UuidBytes, A::Error> {
                let mut raw = [0u8; 16];
                for slot in raw.iter_mut() {
                    *slot = seq.next_element::<u8>()?.ok_or_else(|| de::Error::custom("uuid bytes truncated"))?;
                }
                Uuid::from_slice(&raw).map(UuidBytes).map_err(de::Error::custom)
            }
        }
        deserializer.deserialize_bytes(UuidVisitor)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireMeta {
    pub name: String,
    pub generation: u32,
    pub ploidy: String,
    pub hayflick_limit: u32,
    pub genome_id: UuidBytes,
    pub lineage_id: UuidBytes,
    #[serde(default)]
    pub parent_ids: Vec<UuidBytes>,
    #[serde(default)]
    pub ts: i64,
    #[serde(default)]
    pub labels: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireGene {
    pub locus: String,
    pub seq: Bytes,
    pub blen: u32,
    pub chr: u8,
    pub met: bool,
    pub vol: f64,
    pub lock: bool,
    pub act: Option<String>,
    pub rep: Option<String>,
    #[serde(default)]
    pub exons: Vec<(u32, u32)>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WirePlasmid {
    pub id: UuidBytes,
    pub ins: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WirePhenotype {
    pub role: String,
    pub strategy: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub temp: f64,
    pub top_p: f64,
    pub prompt: String,
    #[serde(default)]
    pub expr_tfs: Vec<String>,
    #[serde(default)]
    pub expr_mirnas: Vec<String>,
    #[serde(default)]
    pub silenced: Vec<String>,
    #[serde(default)]
    pub expressed: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireMutation {
    pub gene: Option<String>,
    pub kind: String,
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireSelection {
    pub fitness: f64,
    pub status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireCrossover {
    pub strategy: String,
    pub seed: String,
    pub point: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireDecoy {
    pub marker: Bytes,
    pub target_selector: String,
    pub detectability: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WireProvenance {
    pub source_manifest: Option<String>,
    pub source_doc: Option<String>,
    #[serde(default)]
    pub parents: Vec<UuidBytes>,
    pub crossover: Option<WireCrossover>,
    #[serde(default)]
    pub mutations: Vec<WireMutation>,
    pub selection: Option<WireSelection>,
    pub decoy: Option<WireDecoy>,
    pub signer: Option<String>,
}

pub fn chromatin_code(state: &ChromatinState) -> u8 {
    match state {
        ChromatinState::Euchromatin => 0,
        ChromatinState::HeterochromatinConstitutive => 1,
        ChromatinState::HeterochromatinFacultative => 2,
    }
}

pub fn chromatin_from(code: u8) -> ChromatinState {
    match code {
        1 => ChromatinState::HeterochromatinConstitutive,
        2 => ChromatinState::HeterochromatinFacultative,
        _ => ChromatinState::Euchromatin,
    }
}

pub fn gene_to_wire(gene: &Gene) -> Result<WireGene, String> {
    let (base_count, packed) = crate::packing::pack_strand(&gene.dna);
    Ok(WireGene {
        locus: gene.locus.clone(),
        seq: Bytes(packed),
        blen: base_count,
        chr: chromatin_code(&gene.chromatin_state),
        met: gene.is_methylated,
        vol: gene.expression_volume,
        lock: gene.developmentally_locked,
        act: gene.required_activator.clone(),
        rep: gene.bound_repressor.clone(),
        exons: gene.default_exons.iter().map(|(start, end)| (*start as u32, *end as u32)).collect(),
    })
}

pub fn wire_to_gene(wire: WireGene) -> Result<Gene, String> {
    let exon_err = |_| "gene exon range exceeds strand length".to_string();
    let dna = crate::packing::unpack_strand(wire.blen, &wire.seq.0)?;
    let exons = wire
        .exons
        .iter()
        .map(|(start, end)| (*start as usize, *end as usize))
        .collect::<Vec<_>>();
    if exons.iter().any(|(start, end)| start >= end || *end > dna.len()) {
        return Err(exon_err(()));
    }
    Ok(Gene {
        locus: wire.locus,
        dna,
        is_methylated: wire.met,
        expression_volume: wire.vol,
        chromatin_state: chromatin_from(wire.chr),
        developmentally_locked: wire.lock,
        required_activator: wire.act,
        bound_repressor: wire.rep,
        default_exons: exons,
    })
}

pub fn meta_to_wire(meta: &Meta) -> WireMeta {
    WireMeta {
        name: meta.name.clone(),
        generation: meta.generation,
        ploidy: meta.ploidy.clone(),
        hayflick_limit: meta.hayflick_limit,
        genome_id: UuidBytes(meta.genome_id),
        lineage_id: UuidBytes(meta.lineage_id),
        parent_ids: meta.parent_ids.iter().map(|id| UuidBytes(*id)).collect(),
        ts: meta.ts,
        labels: meta.labels.clone(),
    }
}

pub fn wire_to_meta(wire: WireMeta) -> Meta {
    Meta {
        name: wire.name,
        generation: wire.generation,
        ploidy: wire.ploidy,
        hayflick_limit: wire.hayflick_limit,
        genome_id: wire.genome_id.0,
        lineage_id: wire.lineage_id.0,
        parent_ids: wire.parent_ids.into_iter().map(|id| id.0).collect(),
        ts: wire.ts,
        labels: wire.labels,
    }
}

pub fn plasmid_to_wire(plasmid: &Plasmid) -> WirePlasmid {
    WirePlasmid { id: UuidBytes(plasmid.id), ins: plasmid.instruction.clone() }
}

pub fn wire_to_plasmid(wire: WirePlasmid) -> Plasmid {
    Plasmid { id: wire.id.0, instruction: wire.ins }
}

pub fn phenotype_to_wire(pheno: &Phenotype) -> WirePhenotype {
    WirePhenotype {
        role: pheno.role.clone(),
        strategy: pheno.strategy.clone(),
        tools: pheno.tools.clone(),
        capabilities: pheno.capabilities.clone(),
        temp: pheno.temp,
        top_p: pheno.top_p,
        prompt: pheno.prompt.clone(),
        expr_tfs: pheno.expr_tfs.clone(),
        expr_mirnas: pheno.expr_mirnas.clone(),
        silenced: pheno.silenced.clone(),
        expressed: pheno.expressed,
    }
}

pub fn wire_to_phenotype(wire: WirePhenotype) -> Phenotype {
    Phenotype {
        role: wire.role,
        strategy: wire.strategy,
        tools: wire.tools,
        capabilities: wire.capabilities,
        temp: wire.temp,
        top_p: wire.top_p,
        prompt: wire.prompt,
        expr_tfs: wire.expr_tfs,
        expr_mirnas: wire.expr_mirnas,
        silenced: wire.silenced,
        expressed: wire.expressed,
    }
}

pub fn provenance_to_wire(prov: &Provenance) -> WireProvenance {
    WireProvenance {
        source_manifest: prov.source_manifest.clone(),
        source_doc: prov.source_doc.clone(),
        parents: prov.parents.iter().map(|id| UuidBytes(*id)).collect(),
        crossover: prov.crossover.as_ref().map(|c| WireCrossover {
            strategy: c.strategy.clone(),
            seed: c.seed.clone(),
            point: c.point,
        }),
        mutations: prov
            .mutations
            .iter()
            .map(|m| WireMutation { gene: m.gene.clone(), kind: m.kind.clone(), from: m.from.clone(), to: m.to.clone() })
            .collect(),
        selection: prov.selection.as_ref().map(|s| WireSelection { fitness: s.fitness, status: s.status.clone() }),
        decoy: prov.decoy.as_ref().map(|d| WireDecoy {
            marker: Bytes(d.marker.clone()),
            target_selector: d.target_selector.clone(),
            detectability: d.detectability,
        }),
        signer: prov.signer.clone(),
    }
}

pub fn wire_to_provenance(wire: WireProvenance) -> Provenance {
    Provenance {
        source_manifest: wire.source_manifest,
        source_doc: wire.source_doc,
        parents: wire.parents.into_iter().map(|id| id.0).collect(),
        crossover: wire.crossover.map(|c| Crossover { strategy: c.strategy, seed: c.seed, point: c.point }),
        mutations: wire
            .mutations
            .into_iter()
            .map(|m| Mutation { gene: m.gene, kind: m.kind, from: m.from, to: m.to })
            .collect(),
        selection: wire.selection.map(|s| Selection { fitness: s.fitness, status: s.status }),
        decoy: wire.decoy.map(|d| Decoy { marker: d.marker.0, target_selector: d.target_selector, detectability: d.detectability }),
        signer: wire.signer,
    }
}
