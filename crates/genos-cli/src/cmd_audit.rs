use clap::Parser;

#[derive(Parser, Debug)]
pub struct AuditArgs {
    pub snapshot_id: String,
    #[arg(long)]
    pub output: String,
}

pub async fn run(args: AuditArgs) -> anyhow::Result<()> {
    println!("Exporting audit bundle for snapshot {} to {}", args.snapshot_id, args.output);
    Ok(())
}
