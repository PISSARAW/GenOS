//! Profils versionnés, confinés au workspace et enregistrés en snapshots.
use crate::physical_learning::{valid_mission_key, MissionPhysicsProfile};
use crate::physical_measurements::WorkspacePhysicsConfig;
use genos_store::{SnapshotManifest, SnapshotStore};
use std::collections::BTreeMap;
use std::path::Path;

pub struct PhysicalProfileStore {
    store: SnapshotStore,
    pub diagnostics: Vec<String>,
}
impl PhysicalProfileStore {
    pub fn open(config: &WorkspacePhysicsConfig) -> Result<Self, String> {
        let root = config
            .root
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let directory = root.join(".genos").join("physical-profiles");
        check_directory(&root, &directory)?;
        if directory.exists() {
            validate_entries(&directory)?;
        }
        let store = SnapshotStore::try_with_dir(directory).map_err(|error| error.to_string())?;
        let diagnostics = if store.load_errors() > 0 {
            vec![format!(
                "{} snapshots illisibles ignores",
                store.load_errors()
            )]
        } else {
            Vec::new()
        };
        Ok(Self { store, diagnostics })
    }
    pub fn load(&mut self) -> BTreeMap<String, MissionPhysicsProfile> {
        let mut profiles = BTreeMap::new();
        for key in [
            "secure-perimeter",
            "recover-agent",
            "repair-module",
            "explore",
            "conserve",
        ] {
            let agent = format!("physics/{key}");
            let mut snapshots = self.store.list_by_agent(&agent);
            snapshots.sort_by(|a, b| b.1.created_at.cmp(&a.1.created_at));
            for (_, snapshot) in snapshots {
                let decoded = snapshot.payload.as_ref().and_then(|payload| {
                    if payload.get("schema")?.as_str()? != "genos.physical-profile/v2" {
                        return None;
                    }
                    if payload.get("mission")?.as_str()? != key {
                        return None;
                    }
                    serde_json::from_value::<MissionPhysicsProfile>(payload.get("profile")?.clone())
                        .ok()
                });
                if let Some(profile) = decoded.filter(MissionPhysicsProfile::valid) {
                    profiles.insert(key.to_string(), profile);
                    break;
                }
                self.diagnostics
                    .push(format!("profil invalide ignore: {}", snapshot.snapshot_id));
            }
        }
        profiles
    }
    pub fn save(&mut self, key: &str, profile: &MissionPhysicsProfile) -> Result<(), String> {
        if !valid_mission_key(key) || !profile.valid() {
            return Err("profil physique invalide".into());
        }
        let payload = serde_json::json!({
            "schema": "genos.physical-profile/v2", "mission": key, "profile": profile
        });
        self.store.save(SnapshotManifest::new(
            &format!("physics/{key}"),
            "calibration",
            payload,
        ))?;
        Ok(())
    }
}
fn check_directory(root: &Path, directory: &Path) -> Result<(), String> {
    for path in [root.join(".genos"), directory.to_path_buf()] {
        if path.exists() {
            let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
            if metadata.file_type().is_symlink()
                || !path
                    .canonicalize()
                    .map_err(|error| error.to_string())?
                    .starts_with(root)
            {
                return Err("repertoire de profils hors workspace".into());
            }
        }
    }
    Ok(())
}

fn validate_entries(directory: &Path) -> Result<(), String> {
    let entries = std::fs::read_dir(directory).map_err(|error| error.to_string())?;
    for (index, entry) in entries.enumerate() {
        if index >= 10_000 {
            return Err("trop de snapshots physiques".into());
        }
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata =
            std::fs::symlink_metadata(entry.path()).map_err(|error| error.to_string())?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 2_000_000 {
            return Err("snapshot non regulier ou trop volumineux".into());
        }
    }
    Ok(())
}
