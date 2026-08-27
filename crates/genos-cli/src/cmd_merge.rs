use clap::Parser;

#[derive(Parser, Debug)]
pub struct MergeArgs {
    pub branch_id: String,
    #[arg(long)]
    pub conditions: String,
}

pub async fn run(args: MergeArgs) -> anyhow::Result<()> {
    println!(
        "Merging branch {} with conditions {}",
        args.branch_id, args.conditions
    );
    Ok(())
}
