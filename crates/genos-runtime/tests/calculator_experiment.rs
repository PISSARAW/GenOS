use genos_core::{AgentId, BranchId};
use genos_runtime::{run_code_experiment, CodeBranchPlan, WorkspaceEdit};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

fn write(path: &Path, contents: &str) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent)?; }
    fs::write(path, contents)?;
    Ok(())
}

fn edit(path: &str, contents: &str) -> WorkspaceEdit {
    WorkspaceEdit { relative_path: path.to_string(), contents: contents.to_string() }
}

#[tokio::test]
async fn calculator_branches_edit_test_diff_and_score_independently() -> anyhow::Result<()> {
    let temp = tempdir()?;
    let seed = temp.path().join("calculator");
    write(&seed.join("Cargo.toml"), "[package]\nname='calculator'\nversion='0.1.0'\nedition='2021'\n")?;
    write(&seed.join(".cargo/config.toml"), "[build]\ntarget-dir='../shared-target'\n")?;
    write(&seed.join("src/lib.rs"), "pub fn divide(a: i32, b: i32) -> i32 { a / b }\n")?;
    write(&seed.join("tests/divide.rs"), "use calculator::divide;\n#[test] fn divides() { assert_eq!(divide(8,2),4); }\n")?;

    let provider = DirectoryWorldProvider::new(temp.path().join("genos"), Some(seed))?;
    let base = provider.create(AgentId::new(), BranchId::new()).await?;
    let snapshot = provider.snapshot(base.clone()).await?;
    let plans = vec![
        CodeBranchPlan {
            branch_id: BranchId("A".to_string()), label: "A".to_string(), hypothesis: "exception".to_string(), score_on_success: 0.6,
            test_command: "cargo test --quiet".to_string(),
            edits: vec![
                edit("src/lib.rs", "pub fn divide(a:i32,b:i32)->i32 { if b==0 { panic!(\"division by zero\") } a/b }\n"),
                edit("tests/divide.rs", "use calculator::divide;\n#[test] #[should_panic(expected=\"division by zero\")] fn zero(){divide(1,0);}\n"),
            ],
        },
        CodeBranchPlan {
            branch_id: BranchId("B".to_string()), label: "B".to_string(), hypothesis: "result_type".to_string(), score_on_success: 0.9,
            test_command: "cargo test --quiet".to_string(),
            edits: vec![
                edit("src/lib.rs", "#[derive(Debug,PartialEq)] pub enum DivideError{DivisionByZero}\npub fn divide(a:i32,b:i32)->Result<i32,DivideError>{if b==0{Err(DivideError::DivisionByZero)}else{Ok(a/b)}}\n"),
                edit("tests/divide.rs", "use calculator::{divide,DivideError};\n#[test] fn zero(){assert_eq!(divide(1,0),Err(DivideError::DivisionByZero));}\n"),
            ],
        },
        CodeBranchPlan {
            branch_id: BranchId("C".to_string()), label: "C".to_string(), hypothesis: "input_validation".to_string(), score_on_success: 0.8,
            test_command: "cargo test --quiet".to_string(),
            edits: vec![
                edit("src/lib.rs", "pub fn divide(a:i32,b:i32)->Option<i32>{(b!=0).then(||a/b)}\n"),
                edit("tests/divide.rs", "use calculator::divide;\n#[test] fn zero(){assert_eq!(divide(1,0),None);}\n"),
            ],
        },
    ];

    let outcomes = run_code_experiment(&provider, &base, &snapshot, plans).await?;
    for outcome in &outcomes {
        println!(
            "{} hypothesis={} tests={} diff={} score={:.1}",
            outcome.label,
            outcome.hypothesis,
            if outcome.tests_passed { "passed" } else { "failed" },
            outcome.diff_summary,
            outcome.score,
        );
    }
    assert_eq!(outcomes.len(), 3);
    assert!(outcomes.iter().all(|outcome| outcome.tests_passed));
    assert!(outcomes.iter().all(|outcome| outcome.files_changed >= 2));
    assert_eq!(outcomes.iter().map(|outcome| outcome.score).collect::<Vec<_>>(), vec![0.6, 0.9, 0.8]);
    Ok(())
}
