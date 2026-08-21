use std::path::PathBuf;

pub struct DpoTrajectory {
    pub prompt: String,
    pub chosen_trajectory: String,
    pub rejected_trajectory: String,
}

pub trait TrajectoryExporter {
    fn export_dpo(&self, trajectory: &DpoTrajectory) -> Result<(), std::io::Error>;
}

pub struct LocalDpoExporter {
    pub export_path: PathBuf,
}

impl TrajectoryExporter for LocalDpoExporter {
    fn export_dpo(&self, _trajectory: &DpoTrajectory) -> Result<(), std::io::Error> {
        // Logique d'export vers JSONL
        Ok(())
    }
}
