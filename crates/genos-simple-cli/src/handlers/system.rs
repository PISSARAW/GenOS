use std::net::ToSocketAddrs;
use crate::commands::system::SystemCommands;

use crate::handlers::system_parallel;
use crate::handlers::system_generate::handle_generate;
use crate::handlers::system_interactive::{handle_ask, handle_chat};

fn server_is_reachable(addr: &str) -> bool {
    let parsed = match addr.to_socket_addrs() {
        Ok(valid) => valid,
        Err(_) => return false,
    };
    for sock in parsed {
        if std::net::TcpStream::connect_timeout(&sock, std::time::Duration::from_secs(5)).is_ok() {
            return true;
        }
    }
    false
}

pub fn handle_system(cmd: &SystemCommands, yes: bool) {
    tokio::runtime::Runtime::new().unwrap().block_on(handle_system_async(cmd, yes));
}

async fn handle_system_async(cmd: &SystemCommands, _yes: bool) {
    match cmd {
        SystemCommands::TwoParallel { args } => system_parallel::two_parallel(args),
        SystemCommands::TriParallel { args } => system_parallel::tri_parallel(args),
        SystemCommands::MultiParallel { args } => system_parallel::multi_parallel(args),
        SystemCommands::Ruins { args } => system_parallel::ruins(args),
        SystemCommands::Id { args } => system_parallel::identify(args),
        SystemCommands::Mind { args } => system_parallel::mind(args),
        SystemCommands::Generate { args } => handle_generate(args).await,
        SystemCommands::Ask { args } => handle_ask(args, server_is_reachable).await,
        SystemCommands::Chat => handle_chat(server_is_reachable).await,
    }
}

#[cfg(test)]
mod reachable_tests {
    use super::server_is_reachable;

    #[test]
    fn closed_loopback_port_is_unreachable() {
        assert!(!server_is_reachable("127.0.0.1:1"));
    }

    #[test]
    fn garbage_address_is_unreachable() {
        assert!(!server_is_reachable("not-a-host:9999"));
    }
}