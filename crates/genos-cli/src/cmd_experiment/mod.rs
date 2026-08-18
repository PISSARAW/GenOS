pub mod genetic;
pub mod manifest;
pub mod runs;

pub use genetic::*;
pub use runs::*;

#[cfg(test)]
mod tests {
    use super::manifest::*;
    use crate::args::{OutputFormat, WorkspaceExperimentArgs};
    use std::path::Path;

    #[test]
    fn direct_workspace_mode_rejects_partial_and_mixed_inputs() {
        let partial = WorkspaceExperimentArgs {
            manifest: None,
            repo: Some(Path::new("repo").to_path_buf()),
            plan: None,
            root: Path::new(".genos/experiments").to_path_buf(),
            format: OutputFormat::Json,
        };
        assert!(workspace_manifest(&partial)
            .unwrap_err()
            .to_string()
            .contains("both --repo PATH and --plan PATH"));

        let mixed = WorkspaceExperimentArgs {
            manifest: Some(Path::new("manifest.yaml").to_path_buf()),
            repo: Some(Path::new("repo").to_path_buf()),
            plan: None,
            root: Path::new(".genos/experiments").to_path_buf(),
            format: OutputFormat::Json,
        };
        assert!(workspace_manifest(&mixed)
            .unwrap_err()
            .to_string()
            .contains("cannot be combined"));
    }

    #[test]
    fn text_dataset_ignores_blank_lines() {
        let path = std::env::temp_dir().join(format!(
            "genos-dataset-{}-{}.txt",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::write(&path, "alpha\n\n beta \n").unwrap();
        let records = read_dataset(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(records, vec!["alpha", "beta"]);
    }
}
