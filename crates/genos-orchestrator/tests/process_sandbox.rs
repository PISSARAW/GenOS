use genos_orchestrator::{Action, Environment, ProcessSandbox};

#[cfg(windows)]
#[test]
fn process_sandbox_execute_un_binaire_allowliste() {
    let root = std::env::temp_dir().join(format!("genos-process-{}", std::process::id()));
    let mut env = ProcessSandbox::new(&root, vec!["cmd.exe".to_string()]).unwrap();
    let feedback = env.act(Action::Run {
        program: "cmd.exe".to_string(),
        args: vec!["/C".to_string(), "echo material".to_string()],
    });
    assert!(feedback.success);
    assert!(feedback.percept.unwrap().content.contains("material"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn process_sandbox_refuse_un_binaire_non_allowliste() {
    let root = std::env::temp_dir().join(format!("genos-process-deny-{}", std::process::id()));
    let mut env = ProcessSandbox::new(&root, Vec::new()).unwrap();
    let feedback = env.act(Action::Run {
        program: "definitely-not-allowed".to_string(),
        args: Vec::new(),
    });
    assert!(!feedback.success);
    assert!(feedback.message.contains("non autorise"));
    let _ = std::fs::remove_dir_all(root);
}
