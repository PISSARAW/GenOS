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
pub struct EpiMark {
    pub kind: String,
    pub level: f64,
}

#[derive(Clone, Debug, Default)]
pub struct EpigenomeState {
    pub marks: BTreeMap<String, EpiMark>,
    pub stage: String,
    pub stress_memory: Vec<String>,
    pub generation: u64,
}

impl EpigenomeState {
    pub fn new() -> Self {
        Self { marks: BTreeMap::new(), stage: "Zygote".to_string(), stress_memory: Vec::new(), generation: 0 }
    }
}

#[derive(Clone, Debug, Default)]
pub struct GrnNode {
    pub is_tf: bool,
    pub basal_expression: f64,
}

#[derive(Clone, Debug, Default)]
pub struct GrnEdge {
    pub from: String,
    pub to: String,
    pub weight: f64,
}

#[derive(Clone, Debug, Default)]
pub struct GrnState {
    pub nodes: BTreeMap<String, GrnNode>,
    pub edges: Vec<GrnEdge>,
}

impl GrnState {
    pub fn new() -> Self {
        Self { nodes: BTreeMap::new(), edges: Vec::new() }
    }
}

#[derive(Clone, Debug, Default)]
pub struct DevelopmentState {
    pub stage: String,
    pub lineage_commitment: Option<String>,
    pub morphogens: Vec<String>,
    pub differentiation_signal: Option<String>,
}

impl DevelopmentState {
    pub fn new() -> Self {
        Self { stage: "Zygote".to_string(), lineage_commitment: None, morphogens: Vec::new(), differentiation_signal: None }
    }
}

#[derive(Clone, Debug, Default)]
pub struct UnknownSection {
    pub tag: [u8; 4],
    pub payload: Vec<u8>,
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
    pub epigenome: EpigenomeState,
    pub grn: GrnState,
    pub development: DevelopmentState,
    pub unknown_sections: Vec<UnknownSection>,
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
            epigenome: Self::convert_from_genome_epigenome(&genome.epigenome),
            grn: default_grn(genome),
            development: DevelopmentState::new(),
            unknown_sections: Vec::new(),
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
        genome.epigenome = Self::convert_epigenome_state(&self.epigenome, self.meta.generation);
        Ok(genome)
    }

    fn convert_epigenome_state(epi: &EpigenomeState, generation: u32) -> genos_genome::Epigenome {
        use genos_genome::{DevelopmentalStage, EpigeneticMark};
        let stage = match epi.stage.as_str() {
            "Zygote" => DevelopmentalStage::Zygote,
            "Pluripotent" => DevelopmentalStage::Pluripotent,
            "LineageCommitted" => DevelopmentalStage::LineageCommitted,
            "Differentiated" => DevelopmentalStage::Differentiated,
            "Mature" => DevelopmentalStage::Mature,
            "Senescent" => DevelopmentalStage::Senescent,
            _ => DevelopmentalStage::Zygote,
        };
        let mut marks = std::collections::HashMap::new();
        for (locus, mark) in &epi.marks {
            let kind = match mark.kind.as_str() {
                "Methylation" => EpigeneticMark::Methylation,
                "Acetylation" => EpigeneticMark::Acetylation,
                "Phosphorylation" => EpigeneticMark::Phosphorylation,
                _ => EpigeneticMark::Methylation,
            };
            marks.insert(locus.clone(), genos_genome::Mark { kind, level: mark.level });
        }
        let stress_memory = epi.stress_memory.iter().map(|s| genos_genome::StressRecord {
            signal: s.clone(),
            intensity: 1.0,
            acquired_at: u64::from(generation),
        }).collect();
        let mut epigenome = genos_genome::Epigenome::new();
        epigenome.marks = marks;
        epigenome.stage = stage;
        epigenome.stress_memory = stress_memory;
        epigenome.generation = u64::from(generation);
        epigenome
    }

    fn convert_from_genome_epigenome(epi: &genos_genome::Epigenome) -> EpigenomeState {
        let stage = match epi.stage {
            genos_genome::DevelopmentalStage::Zygote => "Zygote".to_string(),
            genos_genome::DevelopmentalStage::Pluripotent => "Pluripotent".to_string(),
            genos_genome::DevelopmentalStage::LineageCommitted => "LineageCommitted".to_string(),
            genos_genome::DevelopmentalStage::Differentiated => "Differentiated".to_string(),
            genos_genome::DevelopmentalStage::Mature => "Mature".to_string(),
            genos_genome::DevelopmentalStage::Senescent => "Senescent".to_string(),
        };
        let mut marks = BTreeMap::new();
        for (locus, mark) in &epi.marks {
            let kind = match mark.kind {
                genos_genome::EpigeneticMark::Methylation => "Methylation".to_string(),
                genos_genome::EpigeneticMark::Acetylation => "Acetylation".to_string(),
                genos_genome::EpigeneticMark::Phosphorylation => "Phosphorylation".to_string(),
            };
            marks.insert(locus.clone(), EpiMark { kind, level: mark.level });
        }
        let stress_memory = epi.stress_memory.iter().map(|r| r.signal.clone()).collect();
        EpigenomeState { marks, stage, stress_memory, generation: epi.generation }
    }
}

fn epoch_seconds() -> i64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_secs() as i64,
        Err(_) => 0,
    }
}



fn default_grn(genome: &Genome) -> GrnState {
    let mut nodes = BTreeMap::new();
    for (locus, gene) in &genome.genes {
        let is_tf = locus.starts_with("TF_")
            || locus.starts_with("PIONEER_")
            || gene.required_activator.is_some();
        nodes.insert(locus.clone(), GrnNode { is_tf, basal_expression: gene.expression_volume.clamp(0.0, 1.0) });
    }
    GrnState { nodes, edges: Vec::new() }
}
