use anyhow::Result;
use clap::Args;
// Expose the Redis network transport
use genos_runtime::redis_queue::RedisTaskQueue;

/// Manage and expose GenOS network transports
#[derive(Args, Debug)]
pub struct TransportArgs {
    /// The network transport to use (e.g. redis)
    #[arg(long, default_value = "redis")]
    pub transport: String,

    /// The transport connection URL
    #[arg(long, default_value = "redis://127.0.0.1/")]
    pub url: String,
}

pub async fn run(args: TransportArgs) -> Result<()> {
    match args.transport.as_str() {
        "redis" => {
            let _queue = RedisTaskQueue::new(&args.url, "genos")?;
            println!(
                "Network transport '{}' initialized successfully via CLI.",
                args.transport
            );
        }
        _ => anyhow::bail!("Unknown network transport: {}", args.transport),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transport_args() {
        let args = TransportArgs {
            transport: "redis".into(),
            url: "redis://127.0.0.1".into(),
        };
        assert_eq!(args.transport, "redis");
    }
}
