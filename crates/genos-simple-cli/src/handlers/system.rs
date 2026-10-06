use crate::{api_base_url, command_error, cargo_program, ensure_cargo_on_path, apply_api_auth};
use std::net::ToSocketAddrs;
use std::process::Command;
use crate::commands::system::SystemCommands;
use crate::exit_on_command_failure;

mod system_parallel;
mod system_generate;
mod system_interactive;

use system_parallel::{handle_two_parallel, handle_tri_parallel, handle_multi_parallel};
use system_generate::handle_generate;
use system_interactive::{handle_ask, handle_chat};

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

type SystemHandler = fn(&[String]) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>;

fn get_handler(cmd: &SystemCommands) -> Option<(&str, SystemHandler)> {
    match cmd {
        SystemCommands::TwoParallel { args } => Some(("two_parallel", |a| Box::pin(handle_two_parallel(a)))),
        SystemCommands::TriParallel { args } => Some(("tri_parallel", |a| Box::pin(handle_tri_parallel(a)))),
        SystemCommands::MultiParallel { args } => Some(("multi_parallel", |a| Box::pin(handle_multi_parallel(a)))),
        SystemCommands::Ruins { args } => Some(("ruins", |a| Box::pin(handle_ruins(a)))),
        SystemCommands::Id { args } => Some(("id", |a| Box::pin(handle_id(a)))),
        SystemCommands::Mind { args } => Some(("mind", |a| Box::pin(handle_mind(a)))),
        SystemCommands::Generate { args } => Some(("generate", |a| Box::pin(handle_generate(a)))),
        SystemCommands::Ask { args } => Some(("ask", |a| Box::pin(handle_ask(a)))),
        SystemCommands::Chat => Some(("chat", |_| Box::pin(handle_chat()))),
    }
}

pub fn handle_system(cmd: &SystemCommands, yes: bool) {
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        handle_system_async(cmd, yes).await
    });
}

async fn handle_system_async(cmd: &SystemCommands, _yes: bool) {
    if let Some((_name, handler)) = get_handler(cmd) {
        let args = match cmd {
            SystemCommands::TwoParallel { args } => args,
            SystemCommands::TriParallel { args } => args,
            SystemCommands::MultiParallel { args } => args,
            SystemCommands::Ruins { args } => args,
            SystemCommands::Id { args } => args,
            SystemCommands::Mind { args } => args,
            SystemCommands::Generate { args } => args,
            SystemCommands::Ask { args } => args,
            SystemCommands::Chat => &[],
        };
        handler(args).await;
    }
}

async fn handle_ruins(args: &[String]) {
    println!("Exploration des ruines (Fossil List Extinct)...");
    let mut cmd = Command::new(cargo_program());
    if args.is_empty() {
        println!("(Mode auto : listage des anciens fossiles éteints)");
        cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
    } else {
        cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
        cmd.args(args);
    }
    exit_on_command_failure(cmd.status());
}

async fn handle_id(args: &[String]) {
    println!("Identification (Audit de l'ID)...");
    let mut cmd = Command::new(cargo_program());
    if args.is_empty() {
        println!("(Mode auto : audit de l'identifiant par défaut)");
        cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit", "default-id"]);
    } else {
        cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]);
        cmd.args(args);
    }
    exit_on_command_failure(cmd.status());
}

async fn handle_mind(args: &[String]) {
    println!("Analyse de l'esprit (Synaptic Path Evaluate)...");
    let mut cmd = Command::new(cargo_program());
    if args.is_empty() {
        println!("(Mode auto : évaluation du cheminement mental)");
        cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-mind", "--pre-node", "0", "--post-node", "1"]);
    } else {
        cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]);
        cmd.args(args);
    }
    exit_on_command_failure(cmd.status());
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