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
        #[arg(long, default_value = "trail")]
        pheromone_type: String,
        #[arg(long, default_value_t = 1.0)]
        amount: f64,
        #[arg(long, default_value_t = false)]
        is_repellent: bool,
    },
    StigmergyRead {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        target_file: String,
    },
    StigmergyEvaporate {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        dt_seconds: Option<f64>,
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
        #[arg(long, default_value_t = false)]
        pioneer_factor: bool,
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
        #[arg(long, alias = "parent-id")]
        agent_id: String,
        #[arg(long, default_value_t = false)]
        force_telomerase: bool,
    },
    Apoptosis {
        #[arg(long)]
        agent_id: String,
    },
    Cryptobiosis {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        action: Option<String>,
        #[arg(long)]
        state: Option<String>,
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
    NetworkQuorum {
        #[arg(long)]
        agent_id: String,
        #[arg(long)]
        threshold: f64,
        #[arg(long)]
        action_id: String,
    },
    Vomeronasal {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value = "global")]
        locus: String,
        #[arg(long, default_value = "alarm")]
        pheromone_type: String,
        #[arg(long, default_value_t = 0.8)]
        concentration: f64,
        #[arg(long, default_value_t = 0.15)]
        sensitivity: f64,
    },
    Electrosensory {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value = "discharge_and_analyze")]
        action: String,
        #[arg(long, default_value_t = 800.0)]
        frequency_hz: f64,
        #[arg(long, default_value_t = 0.05)]
        sensitivity: f64,
        #[arg(long, default_value_t = 0.12)]
        distortion_threshold: f64,
        #[arg(long, default_value = "100.0,102.0,98.0,105.0,99.0")]
        samples: String,
    },
    ClusterN {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value = "align")]
        action: String,
        #[arg(long, default_value_t = 0.02)]
        sensitivity: f64,
        #[arg(long, default_value_t = 15.0)]
        tolerance_deg: f64,
        #[arg(long, default_value = "1.0,0.0,0.0")]
        goal_vector: String,
        #[arg(long, default_value = "0.96,0.15,0.0")]
        current_vector: String,
    },
    TectumThermal {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value = "fuse_modalities")]
        action: String,
        #[arg(long, default_value_t = 3.0)]
        sensitivity_mk: f64,
        #[arg(long, default_value_t = 0.65)]
        fusion_weight: f64,
        #[arg(long, default_value_t = 0.70)]
        threshold: f64,
        #[arg(long, default_value = "src/auth.rs:0.8,src/db.rs:0.4,src/api.rs:0.3")]
        visual_nodes: String,
        #[arg(long, default_value = "src/auth.rs:0.95,src/db.rs:0.2,src/api.rs:0.1")]
        thermal_readings: String,
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
        #[arg(long, alias = "agent-id")]
        agent_id: Option<String>,
        #[arg(long, alias = "source")]
        source_agent_id: Option<String>,
        #[arg(long, alias = "plasmid-id")]
        plasmid_name: Option<String>,
        #[arg(long)]
        plasmid_code: Option<String>,
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
        #[arg(long)]
        speciation_threshold: Option<f64>,
        #[arg(long)]
        genes_a: Option<String>,
        #[arg(long)]
        genes_b: Option<String>,
        #[arg(long)]
        seed: Option<String>,
    },
    Division {
        #[arg(long)]
        agent_id: String,
        #[arg(long, default_value = "mitosis")]
        mode: String,
        #[arg(long, default_value_t = 0.0)]
        mutation_rate: f64,
        #[arg(long, default_value_t = 0.25)]
        daughter_volume: f64,
        #[arg(long, default_value_t = 4)]
        merozoite_count: usize,
        #[arg(long)]
        hayflick_limit: Option<u32>,
        #[arg(long)]
        genes: Option<String>,
        #[arg(long)]
        seed: Option<String>,
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
