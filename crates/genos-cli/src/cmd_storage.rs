use anyhow::Result;
use clap::Args;
use genos_store::{PostgresStore, SqliteStore};

/// Manage and expose GenOS storage adapters
#[derive(Args, Debug)]
pub struct StorageArgs {
    /// The storage adapter to use (e.g. sqlite, postgres)
    #[arg(long, default_value = "sqlite")]
    pub adapter: String,

    /// The database connection URL
    #[arg(long, default_value = "sqlite::memory:")]
    pub url: String,
}

pub async fn run(args: StorageArgs) -> Result<()> {
    match args.adapter.as_str() {
        "sqlite" => {
            let _store = SqliteStore::new(&args.url).await?;
            println!(
                "Storage adapter '{}' initialized successfully via CLI.",
                args.adapter
            );
        }
        "postgres" => {
            let _store = PostgresStore::new(&args.url).await?;
            println!(
                "Storage adapter '{}' initialized successfully via CLI.",
                args.adapter
            );
        }
        _ => anyhow::bail!("Unknown storage adapter: {}", args.adapter),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_storage_args() {
        let args = StorageArgs {
            adapter: "sqlite".into(),
            url: "sqlite::memory:".into(),
        };
        assert_eq!(args.adapter, "sqlite");
    }
}
