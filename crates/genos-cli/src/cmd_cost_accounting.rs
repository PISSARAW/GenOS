use clap::Parser;

#[derive(Parser, Debug)]
pub struct CostAccountingArgs {
    pub agent_id: String,
    #[arg(long, default_value = "7d")]
    pub timeframe: String,
}

pub async fn run(args: CostAccountingArgs) -> anyhow::Result<()> {
    println!(
        "Cost accounting report for agent {} over timeframe: {}",
        args.agent_id, args.timeframe
    );
    Ok(())
}
