use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct GenomeCmd {
    #[command(subcommand)]
    pub subcommand: GenomeSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum GenomeSubcommands {
    /// Compile a portable AgentGenome manifest into a binary AgentDNA genome
    Compile {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Validate a binary AgentDNA genome
    Validate {
        #[arg(long)]
        file: String,
        #[arg(long)]
        pubkey: Option<String>,
    },
    /// Generate an ed25519 keypair (writes the 32-byte secret as hex)
    Keygen {
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Sign an AgentDNA genome with an ed25519 secret key
    Sign {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long)]
        key: String,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Inspect a binary AgentDNA genome
    Inspect {
        #[arg(long)]
        file: String,
    },
    /// Meiotic crossover between two AgentDNA genomes
    Cross {
        #[arg(long)]
        parent_a: String,
        #[arg(long)]
        parent_b: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long, default_value_t = 0.5)]
        swap_prob: f64,
        #[arg(long)]
        point: Option<usize>,
        #[arg(long)]
        seed: Option<String>,
        #[arg(long)]
        speciation_threshold: Option<f64>,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Mutate an AgentDNA genome (stochastic, hypermutation or targeted locus)
    Mutate {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long, default_value_t = 0.05)]
        rate: f64,
        #[arg(long, default_value_t = false)]
        hyper: bool,
        #[arg(long)]
        locus: Option<String>,
        #[arg(long)]
        seed: Option<String>,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Clone an AgentDNA genome (mitosis, binary fission or budding)
    Clone {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long, default_value = "mitosis")]
        mode: String,
        #[arg(long, default_value_t = 0.25)]
        daughter_volume: f64,
        #[arg(long, default_value_t = 0.0)]
        mutation_rate: f64,
        #[arg(long)]
        seed: Option<String>,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Produce a marked decoy genome with a plausible phenotype
    Decoy {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long, default_value = "unspecified")]
        selector: String,
        #[arg(long, default_value_t = 0.5)]
        detectability: f64,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Graft an acquired concept (gene or plasmid) onto a genome
    Graft {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long)]
        locus: String,
        #[arg(long)]
        instruction: String,
        #[arg(long, default_value_t = false)]
        plasmid: bool,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
    /// Distill acquired concepts into a new derived genome (adaptive radiation)
    Speciate {
        #[arg(long, alias = "in")]
        input: String,
        #[arg(long, alias = "out")]
        output: String,
        #[arg(long)]
        name: String,
        #[arg(long)]
        concept: Option<String>,
        #[arg(long = "graft", value_name = "LOCUS=INSTRUCTION")]
        grafts: Vec<String>,
        #[arg(long, default_value_t = false)]
        force: bool,
        #[arg(long, default_value_t = false)]
        parents: bool,
    },
}
