use anyhow::Result;
pub async fn cmd_noise_filter(args: &crate::args::NoiseFilterArgs) -> Result<()> {
    println!("Noise filter called");
    Ok(())
}

