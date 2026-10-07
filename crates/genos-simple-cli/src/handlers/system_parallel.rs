use crate::{cargo_program, exit_on_command_failure};
use std::process::Command;

fn run_genos_cli(extra: &[&str], args: &[String]) {
    let mut cmd = Command::new(cargo_program());
    cmd.args(["run", "-q", "-p", "genos-cli", "--"]);
    cmd.args(extra);
    match args.is_empty() {
        true => {},
        false => {
            cmd.args(args);
        }
    }
    exit_on_command_failure(cmd.status());
}

struct AutoRun<'a> {
    mode: AutoMode<'a>,
    args: &'a [String],
    notice: &'a str,
}

enum AutoMode<'a> {
    WithExtra { extra: &'a [&'a str], auto: &'a [&'a str] },
    Bare { extra: &'a [&'a str] },
}

fn run_with_auto(job: &AutoRun) {
    let mut cmd = Command::new(cargo_program());
    match job.args.is_empty() {
        true => {
            println!("{}", job.notice);
            cmd.args(["run", "-q", "-p", "genos-cli", "--"]);
            match &job.mode {
                AutoMode::WithExtra { auto, .. } => { cmd.args(*auto); }
                AutoMode::Bare { extra } => { cmd.args(*extra); }
            }
        }
        false => {
            cmd.args(["run", "-q", "-p", "genos-cli", "--"]);
            match &job.mode {
                AutoMode::WithExtra { extra, .. } => { cmd.args(*extra); }
                AutoMode::Bare { extra } => { cmd.args(*extra); }
            }
            cmd.args(job.args);
        }
    }
    exit_on_command_failure(cmd.status());
}

pub fn two_parallel(args: &[String]) {
    println!("Double exécution parallèle (Trinity Deploy / Duo)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["trinity", "deploy"],
            auto: &["trinity", "deploy", "--mission-id", "duo-mission", "--strategies", "duo-strategy"],
        },
        args,
        notice: "(Mode auto : déploiement en duo)",
    };
    run_with_auto(&job);
}

pub fn tri_parallel(args: &[String]) {
    println!("Triple exécution parallèle (Trinity Deploy)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["trinity", "deploy"],
            auto: &["trinity", "deploy", "--mission-id", "trio-mission", "--strategies", "trio-strategy"],
        },
        args,
        notice: "(Mode auto : déploiement en trio)",
    };
    run_with_auto(&job);
}

pub fn multi_parallel(args: &[String]) {
    println!("Exécution massivement parallèle (Swarm / World Run)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["world", "run"],
            auto: &["world", "run", "--provider", "local", "--root", "./", "--world-id", "multi-parallel-world", "--command", "start", "--sandbox-backend", "native"],
        },
        args,
        notice: "(Mode auto : lancement du monde multi-parallèle)",
    };
    run_with_auto(&job);
}

pub fn ruins(args: &[String]) {
    println!("Exploration des ruines (Fossil List Extinct)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["fossil", "list"],
            auto: &["fossil", "list"],
        },
        args,
        notice: "(Mode auto : listage des anciens fossiles éteints)",
    };
    run_with_auto(&job);
}

pub fn identify(args: &[String]) {
    println!("Identification (Audit de l'ID)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["audit"],
            auto: &["audit", "default-id"],
        },
        args,
        notice: "(Mode auto : audit de l'identifiant par défaut)",
    };
    run_with_auto(&job);
}

pub fn mind(args: &[String]) {
    println!("Analyse de l'esprit (Synaptic Path Evaluate)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["synaptic", "path-evaluate"],
            auto: &["synaptic", "path-evaluate", "--agent-id", "default-mind", "--pre-node", "0", "--post-node", "1"],
        },
        args,
        notice: "(Mode auto : évaluation du cheminement mental)",
    };
    run_with_auto(&job);
}

pub fn run_bare(extra: &[&str]) {
    run_genos_cli(extra, &[]);
}
