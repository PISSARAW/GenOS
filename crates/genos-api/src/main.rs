use anyhow::Result;
use genos_api::router_with_config;
use genos_model::factory::ModelFactory;
use std::{collections::HashMap, env, net::SocketAddr, sync::Arc};

#[tokio::main]
async fn main() -> Result<()> {
    let uri = env::var("GENOS_MODEL_URI").unwrap_or_else(|_| "fake://api".into());
    let provider = ModelFactory::create(&uri, env::var("GENOS_MODEL_API_KEY").ok())?;
    let bind = env::var("GENOS_API_BIND").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let tenants = env::var("GENOS_TENANT_TOKENS")
        .unwrap_or_default()
        .split(',')
        .filter_map(|entry| {
            entry
                .split_once('=')
                .map(|(tenant, token)| (tenant.to_string(), token.to_string()))
        })
        .collect::<HashMap<_, _>>();
    let listener = tokio::net::TcpListener::bind(bind.parse::<SocketAddr>()?).await?;
    axum::serve(listener, router_with_config(Arc::from(provider), tenants)).await?;
    Ok(())
}
