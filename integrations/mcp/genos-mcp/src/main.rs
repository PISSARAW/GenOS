use clap::{Parser, Subcommand};
use genos_mcp::{http_router, serve_stdio, GenosCliExecutor, McpServer};
use std::{net::SocketAddr, sync::Arc};

#[derive(Debug, Parser)]
#[command(
    name = "genos-mcp",
    about = "Expose GenOS lifecycle operations over MCP"
)]
struct Cli {
    #[command(subcommand)]
    transport: Option<Transport>,
}

#[derive(Debug, Subcommand)]
enum Transport {
    /// Serve newline-delimited MCP JSON-RPC over stdin/stdout (default).
    Stdio,
    /// Serve stateless MCP JSON-RPC over Streamable HTTP.
    Http {
        #[arg(long, default_value = "127.0.0.1:8799")]
        bind: SocketAddr,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let server = McpServer::new(Arc::new(GenosCliExecutor::discover()?));
    match cli.transport.unwrap_or(Transport::Stdio) {
        Transport::Stdio => serve_stdio(tokio::io::stdin(), tokio::io::stdout(), server).await,
        Transport::Http { bind } => {
            let listener = tokio::net::TcpListener::bind(bind).await?;
            eprintln!("genos-mcp listening on http://{bind}/mcp");
            axum::serve(listener, http_router(server)).await?;
            Ok(())
        }
    }
}
