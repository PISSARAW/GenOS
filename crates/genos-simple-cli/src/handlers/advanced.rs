use std::process::Command;
use crate::{cargo_program, command_error, exit_on_command_failure};
use crate::commands::advanced::AdvancedCommands;

pub fn handle_advanced(cmd: &AdvancedCommands, _yes: bool) {
    match cmd {
        AdvancedCommands::Destroy { args } => {
            println!("Destruction / Prune...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : destruction / extinction de l'agent par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "record", "--lineage-id", "default-lineage", "--reason", "destroyed_by_user"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "record"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Close { args } => {
            println!("Fermeture (World Run Stop)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : fermeture du monde par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "default", "--command", "stop", "--sandbox-backend", "native"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Order { args } => {
            println!("Ordre / Conformité (Compliance Generate)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : génération de conformité standard ISO)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "compliance", "generate", "--standard", "iso-genos-1"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "compliance", "generate"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Auto { args } => {
            println!("Mode Automatique (Trinity Deploy / Auto-start)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : déploiement autonome Trinity)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "auto-mission", "--strategies", "autonomous"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Fast { args } => {
            println!("Mode Rapide (Strategy Adapt / Time Constraint)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : adaptation de la stratégie pour une vitesse maximale)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "0.1"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Copy { args } => {
            println!("Copie / Sauvegarde (Snapshot Create)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : création d'un snapshot de l'agent par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "create", "--agent", "default-agent", "--out", "snapshot_copy.json"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "create"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Hub { args } => {
            println!("Hub / Création de monde (World Create)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : création d'un hub local)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "create", "--provider", "local", "--root", "./hub", "--world-id", "hub-01"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "create"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Wisdom { args } => {
            println!("Sagesse / Base de connaissances (Platform Search)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : recherche de la sagesse universelle dans l'index)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", "wisdom"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Synapse { args } => {
            println!("Synapse / Réseau Neuronal (Synaptic)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : évaluation du réseau synaptique par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "0", "--post-node", "1"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Wipe { args } => {
            println!("Nettoyage / Effacement (Agent Prune Maximum)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : élagage radical de l'agent)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune", "--agent-id", "default-agent", "--threshold", "0.99"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Operate { args } => {
            println!("Opération (World Run)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : lancement des opérations sur le hub par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "hub-01", "--command", "operate", "--sandbox-backend", "native"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Dissect { args } => {
            println!("Dissection / Extraction (Hallucination Extract)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : dissection du dernier snapshot)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "extract", "--snapshot", "latest-snapshot"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "extract"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Unveil { args } => {
            println!("Dévoilement (Hallucination Detect)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : détection des hallucinations cachées)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "detect", "--snapshot", "latest-snapshot"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "detect"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Root { args } => {
            println!("Ancrage Racine (Causality Fork)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : fork depuis la racine causale)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "causality", "fork", "--boundary-id", "root-boundary", "--new-boundary-id", "new-branch"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "causality", "fork"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Keep { args } => {
            println!("Conservation (Capsule Merge)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : conservation et fusion de la branche)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge", "current-branch"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Quantum { args } => {
            println!("Mode Quantique (World Run - Sandbox Quantum)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : exécution du monde en backend quantique)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "quantum-world", "--command", "start", "--sandbox-backend", "quantum"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Store { args } => {
            println!("Stockage (Snapshot List)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : listage des instantanés stockés)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "list"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "list"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Piece { args } => {
            println!("Ajustement d'un fragment (Synaptic Prune Scale)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : ajustement précis du réseau)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "prune-scale", "--agent-id", "default-agent", "--scale", "0.8"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "prune-scale"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Daemon { args } => {
            println!("Lancement du Démon (Serve)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : lancement du daemon sur le port par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "serve"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "serve"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Preagi { args } => {
            println!("Création de l'entité Pre-AGI (Agent Create)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : création de l'agent pre-agi-core)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "create", "--name", "pre-agi-core", "--out", "preagi-snapshot.json"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "create"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Civilization { args } => {
            println!("Simulation de civilisation (World Run)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : lancement du monde civilization-alpha)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "civilization-alpha", "--command", "start", "--sandbox-backend", "native"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Explore { args } => {
            println!("Exploration des strates (Fossil List)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : listage profond des fossiles)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Research { args } => {
            println!("Recherche approfondie (Experiment Bug Investigation)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : recherche sur une anomalie générique)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation", "anomaly.json"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        AdvancedCommands::Search { args } => {
            println!("Recherche globale (Platform Search)...");
            let mut cmd = Command::new("cargo");
            if args.is_empty() { println!("(Mode auto : recherche vide)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", ""]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
    }
}
