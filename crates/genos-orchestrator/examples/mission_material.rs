//! Mission d'embodiment système : une action réelle, sans shell implicite.

use genos_orchestrator::{Action, Environment, ProcessSandbox};

fn main() {
    let root = std::env::temp_dir().join(format!("genos-material-{}", std::process::id()));
    #[cfg(windows)]
    let (program, args, allowed) = (
        "cmd.exe",
        vec!["/C".to_string(), "echo genos-material".to_string()],
        vec!["cmd.exe".to_string()],
    );
    #[cfg(not(windows))]
    let (program, args, allowed) = (
        "printf",
        vec!["genos-material\\n".to_string()],
        vec!["printf".to_string()],
    );

    let mut env = ProcessSandbox::new(&root, allowed).expect("sandbox système");
    let feedback = env.act(Action::Run {
        program: program.to_string(),
        args,
    });
    println!(
        "[MATERIAL] succes={} sortie={:?}",
        feedback.success, feedback.percept
    );
    assert!(feedback.success);
    let _ = std::fs::remove_dir_all(root);
}
