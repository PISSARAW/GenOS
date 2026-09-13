use std::collections::BTreeMap;

use genos_genome::{DnaStrand, Gene, Genome, Plasmid};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct Meta {
    pub name: String,
    pub generation: u32,
    pub ploidy: String,
    pub hayflick_limit: u32,
    pub genome_id: Uuid,
    pub lineage_id: Uuid,
    pub parent_ids: Vec<Uuid>,
    pub ts: i64,
    pub labels: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Default)]
pub struct Phenotype {
    pub role: String,
    pub strategy: String,
    pub tools: Vec<String>,
    pub capabilities: Vec<String>,
    pub temp: f64,
    pub top_p: f64,
    pub prompt: String,
    pub expr_tfs: Vec<String>,
    pub expr_mirnas: Vec<String>,
    pub silenced: Vec<String>,
    pub expressed: u32,
}

#[derive(Clone, Debug, Default)]
pub struct Mutation {
    pub gene: Option<String>,
    pub kind: String,
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Default)]
pub struct Selection {
    pub fitness: f64,
    pub status: String,
}

#[derive(Clone, Debug, Default)]
pub struct Decoy {
    pub marker: Vec<u8>,
    pub target_selector: String,
    pub detectability: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Crossover {
    pub strategy: String,
    pub seed: String,
    pub point: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct Provenance {
    pub source_manifest: Option<String>,
    pub source_doc: Option<String>,
    pub parents: Vec<Uuid>,
    pub crossover: Option<Crossover>,
    pub mutations: Vec<Mutation>,
    pub selection: Option<Selection>,
    pub decoy: Option<Decoy>,
    pub signer: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AgentDna {
    pub meta: Meta,
    pub maternal: DnaStrand,
    pub paternal: DnaStrand,
    pub genes: BTreeMap<String, Gene>,
    pub plasmids: Vec<Plasmid>,
    pub enhancers: Vec<String>,
    pub extra_chromosomes: Vec<DnaStrand>,
    pub scars: Vec<Uuid>,
    pub phenotype: Option<Phenotype>,
    pub provenance: Provenance,
}

impl AgentDna {
    pub fn from_genome(genome: &Genome, name: &str, provenance: Provenance) -> Self {
        AgentDna {
            meta: Meta {
                name: name.to_string(),
                generation: genome.generation,
                ploidy: genome.ploidy.clone(),
                hayflick_limit: genome.hayflick_limit,
                genome_id: genome.genome_id(),
                lineage_id: genome.lineage_id(),
                parent_ids: genome.parent_ids.clone(),
                ts: epoch_seconds(),
                labels: BTreeMap::new(),
            },
            maternal: genome.chromosome_maternal.clone(),
            paternal: genome.chromosome_paternal.clone(),
            genes: genome.genes.clone(),
            plasmids: genome.plasmids.clone(),
            enhancers: genome.regulatory_enhancers.clone(),
            extra_chromosomes: genome.extra_chromosomes.clone(),
            scars: genome.bud_scars.clone(),
            phenotype: None,
            provenance,
        }
    }

    pub fn to_genome(&self) -> Result<Genome, String> {
        let mut genome = Genome::new(&self.meta.name);
        genome.set_identity(self.meta.genome_id);
        genome.set_lineage(self.meta.lineage_id);
        genome.chromosome_maternal = self.maternal.clone();
        genome.chromosome_paternal = self.paternal.clone();
        genome.genes = self.genes.clone();
        genome.plasmids = self.plasmids.clone();
        genome.regulatory_enhancers = self.enhancers.clone();
        genome.extra_chromosomes = self.extra_chromosomes.clone();
        genome.bud_scars = self.scars.clone();
        genome.parent_ids = self.meta.parent_ids.clone();
        genome.generation = self.meta.generation;
        genome.ploidy = self.meta.ploidy.clone();
        genome.hayflick_limit = self.meta.hayflick_limit;
        Ok(genome)
    }
}

fn epoch_seconds() -> i64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs() as i64,
        Err(_) => 0,
    }
}
