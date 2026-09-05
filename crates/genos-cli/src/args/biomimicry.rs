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
}
