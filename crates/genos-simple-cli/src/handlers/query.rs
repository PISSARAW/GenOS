use std::process::Command;
use crate::{cargo_program, exit_on_command_failure};
use crate::commands::query::QueryCommands;

pub fn handle_query(cmd: &QueryCommands, _yes: bool) {
    match cmd {
        QueryCommands::Replay { args } => {
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : lancement du replay sur le snapshot par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic", "--snapshot", "latest-snapshot"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Diff { args } => {
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : comparaison entre origin et latest)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "diff", "origin", "latest"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "diff"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Blame { args } => {
            println!("Analyse de la source de l'hallucination / Blame...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : analyse de l'hallucination sur latest-snapshot)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "analyze", "--snapshot", "latest-snapshot"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "analyze"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Trace { args } => {
            println!("Traçage de la causalité / Trace...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : traçage causal sur incident par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay", "default-trace.log"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Clone { args } => {
            println!("Clonage de l'agent...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : clonage de l'agent parent par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "fork", "--parent-id", "default-parent"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "fork"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Mutate { args } => {
            println!("Mutation de l'agent...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : mutation du trait créativité)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "mutate", "--agent-id", "default-agent", "--trait", "creativity"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "mutate"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Elevate { args } => {
            println!("Élévation de l'agent / Adapt...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : élévation de l'agent)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "1.0"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Rest { args } => {
            println!("Mise en repos de l'agent (Cryptobiosis)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : cryptobiose de default-agent)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "resilience", "cryptobiosis", "--agent-id", "default-agent"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "resilience", "cryptobiosis"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Check { args } => {
            println!("Vérification / Audit...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : audit du latest-snapshot)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit", "latest-snapshot"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Compare { args } => {
            println!("Comparaison des phénotypes...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : comparaison phénotypique sur default-trait)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "phenotype", "measure-divergence", "--trait-name", "default-trait", "--expected", "1.0", "--observed", "0.9", "--tolerance", "0.2"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "phenotype", "measure-divergence"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Retrace { args } => {
            println!("Retraçage / Incident...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : analyse de l'incident par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "incident", "default-manifest.json"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "incident"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Restore { args } => {
            println!("Restauration depuis un snapshot (Capsule Create)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : création de capsule depuis latest-snapshot)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "capsule", "create", "--snapshot", "latest-snapshot"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "capsule", "create"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Recover { args } => {
            println!("Récupération (Causal Replay)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : récupération causale par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay", "default-recovery.log"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Retrieve { args } => {
            println!("Recherche RAG / Retrieve...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : recherche de 'default query')"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", "default query"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Filter { args } => {
            println!("Filtrage des impasses (Loop Detection)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : détection de boucle sur history.log)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "loop-detection", "--history-file", "history.log"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "loop-detection"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Merge { args } => {
            println!("Fusion de branches (Capsule Merge)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : fusion de la branche courante)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge", "default-branch"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Parent { args } => {
            println!("Analyse de la généalogie (Swarm Allele)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : analyse des allèles du swarm par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer", "--swarm-id", "default-swarm"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Lineage { args } => {
            println!("Historique des fossiles (Lineage)...");
            let mut cmd = Command::new(cargo_program());
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            if !args.is_empty() { cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Squeeze { args } => {
            println!("Condensation de l'agent (Prune)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : pruning de default-agent à 0.5)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune", "--agent-id", "default-agent", "--threshold", "0.5"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Think { args } => {
            println!("Évaluation du chemin neuronal (Think)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : évaluation neuronale de default-agent)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "input", "--post-node", "output"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Trio { args } => {
            println!("Déploiement en trio (Trinity)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : déploiement trinity sur mission alpha)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "mission-alpha", "--strategies", "trio-default"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Multi { args } => {
            println!("Exécution multi-agents (World Run)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() {
                println!("(Mode auto : application des paramètres par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./multi-world", "--world-id", "default-multi", "--command", "auto-start", "--sandbox-backend", "native"]);
            } else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Broad { args } => {
            println!("Expansion des connaissances (Platform Ingest)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() {
                println!("Veuillez spécifier le chemin d'un fichier. Exemple : .\\g broad ./README.md");
                println!("(Ou ingestion par défaut du README.md...)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "ingest", "./README.md"]);
            } else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "ingest"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Swarm { args } => {
            println!("Gestion de l'essaim (Swarm)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : lancement de l'analyseur par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer", "--swarm-id", "alpha-swarm"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        QueryCommands::Debug { args } => {
            println!("Débogage (Bug Investigation)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : investigation du manifeste par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation", "default-manifest.json"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
    }
}
