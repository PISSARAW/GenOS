use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct BiomimicryCmd {
    #[command(subcommand)]
    pub subcommand: BiomimicrySubcommands,
}

#[derive(Subcommand, Debug)]
pub enum BiomimicrySubcommands {
    CellularEndosymbiosis {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        target_process: String,
        #[arg(long)]
        organelle_name: String,
    },
    CellularBbb {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        filter_level: String,
    },
    StigmergyDeposit {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        target_file: String,
        #[arg(long)]
        pheromone_type: String,
    },
    TheoryAutopoiesis {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        target_gene: String,
        #[arg(long)]
        new_value: f64,
    },
    HypothalamusHomeostasis {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        nervous_state: String,
    },
    CerebellumCoprocessor {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value_t = 0.0)]
        target_value: f64,
        #[arg(long, default_value_t = 0.0)]
        expected_latency: f64,
        #[arg(long, default_value_t = 0.0)]
        current_value: f64,
        #[arg(long, default_value_t = 0.0)]
        actual_latency: f64,
    },
    EntericDelegate {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        data_source: String,
        #[arg(long)]
        digestion_mode: Option<String>,
    },
    GlialCleanup {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        intensity: Option<String>,
    },
    GeneRegulatoryNetwork {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        condition: String,
        #[arg(long)]
        action_script: String,
    },
    EpigeneticChromatin {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        locus: String,
        #[arg(long)]
        state: String,
    },
    SpeciationCheck {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        threshold: Option<f64>,
    },
    BioFeature {
        #[arg(long)]
        feature: String,
        #[arg(long)]
        action: String,
        #[arg(long)]
        param: Vec<String>,
    },
    TelomereFork {
        #[arg(long)]
        parent_id: String,
    },
    Apoptosis {
        #[arg(long)]
        agent_id: String,
    },
    Cryptobiosis {
        #[arg(long)]
        agent_id: String,
    },
    Hypermutation {
        #[arg(long)]
        agent_id: String,
    },
    Spore {
        #[arg(long)]
        action: String,
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        spore_type: Option<String>,
        #[arg(long)]
        warm_and_wet: Option<bool>,
        #[arg(long)]
        nutrients: Option<bool>,
    },
    Bioluminescence {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value = "green")]
        color: String,
        #[arg(long, default_value = "mitochondria")]
        organelle: String,
        #[arg(long, default_value = "TELEMETRY")]
        event_type: String,
        #[arg(long, default_value = "")]
        details: String,
    },
    AntiCollusion {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value_t = 600)]
        consumed_tokens: u32,
        #[arg(long, default_value_t = false)]
        physical_test_passed: bool,
    },
    Redundancy {
        #[arg(long)]
        expected_tool: String,
        #[arg(long)]
        mutated_tool: String,
        #[arg(long, default_value_t = false)]
        fallback: bool,
    },
    Tissue {
        #[arg(long)]
        action: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        role: Option<String>,
        #[arg(long)]
        stem_id: Option<String>,
        #[arg(long)]
        worker_id: Option<String>,
        #[arg(long)]
        task: Option<String>,
    },
    Embryology {
        #[arg(long)]
        action: Option<String>,
        #[arg(long, default_value_t = 2)]
        divisions: u32,
        #[arg(long, default_value_t = 1.0)]
        gradient: f64,
    },
    Therapy {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        therapy_type: String,
    },
    Phenotype {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value_t = 0.5)]
        uv_exposure: f64,
        #[arg(long, default_value_t = 37.0)]
        temperature: f64,
    },
}

#[derive(Args, Debug)]
pub struct EvolutionCmd {
    #[command(subcommand)]
    pub subcommand: EvolutionSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum EvolutionSubcommands {
    AssimilatePlasmid {
        #[arg(long)]
        agent_id: Option<String>,
        #[arg(long)]
        source_agent_id: Option<String>,
        #[arg(long)]
        plasmid_name: Option<String>,
    },
    Crossover {
        #[arg(long)]
        parent_a: String,
        #[arg(long)]
        parent_b: String,
        #[arg(long, default_value_t = 0.5)]
        swap_prob: f64,
        #[arg(long)]
        crossover_point: Option<usize>,
    },
    Division {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value = "mitosis")]
        mode: String,
        #[arg(long, default_value_t = 0.0)]
        mutation_rate: f64,
        #[arg(long, default_value_t = 0.5)]
        daughter_volume: f64,
        #[arg(long, default_value_t = 2)]
        merozoite_count: usize,
    },
    Phylogeny {
        #[arg(long, default_value = "divergence")]
        action: String,
        #[arg(long)]
        genome_a: String,
        #[arg(long)]
        genome_b: Option<String>,
        #[arg(long, default_value_t = 0.01)]
        mutation_rate: f64,
        #[arg(long, default_value_t = false)]
        is_plant: bool,
    },
}
