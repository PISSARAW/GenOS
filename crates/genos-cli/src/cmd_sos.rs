use anyhow::Result;
pub async fn cmd_sos_mutate(args: &crate::args::SosMutateArgs) -> Result<()> {
    println!("SOS mutate called for genome {}", args.genome_id);
    Ok(())
}

