use std::fs::{self, OpenOptions};
use std::path::PathBuf;

pub(super) struct MissionLock(PathBuf);

impl MissionLock {
    pub(super) fn acquire(path: PathBuf) -> Result<Self, String> {
        let file = OpenOptions::new().write(true).create_new(true).open(&path)
            .map_err(|error| format!("mission is busy or its lock requires operator recovery: {error}"))?;
        file.sync_all().map_err(|error| error.to_string())?;
        Ok(Self(path))
    }
}

impl Drop for MissionLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
