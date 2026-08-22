use clap::{Args, Subcommand};

#[derive(Args, Debug)]
pub struct HallucinationCommand {
    #[command(subcommand)]
    pub command: HallucinationSubcommands,
}

#[derive(Subcommand, Debug)]
pub enum HallucinationSubcommands {
    Detect(DetectArgs),
    Inject(InjectArgs),
    Test(TestArgs),
    Extract(ExtractArgs),
    Analyze(AnalyzeArgs),
    Correct(CorrectArgs),
    Simulate(SimulateArgs),
}

#[derive(Args, Debug)]
pub struct DetectArgs {
    // Add args later
}

#[derive(Args, Debug)]
pub struct InjectArgs {}

#[derive(Args, Debug)]
pub struct TestArgs {}

#[derive(Args, Debug)]
pub struct ExtractArgs {}

#[derive(Args, Debug)]
pub struct AnalyzeArgs {}

#[derive(Args, Debug)]
pub struct CorrectArgs {}

#[derive(Args, Debug)]
pub struct SimulateArgs {}
