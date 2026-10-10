use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Error, ErrorKind, Result};
use std::path::Path;

#[derive(Deserialize, Serialize)]
struct Head {
    name: String,
    #[serde(default)]
    rewound: bool,
}

fn load(directory: &Path) -> Result<Option<Head>> {
    let path = directory.join("orchestration.head.json");
    let stat = match fs::symlink_metadata(&path) {
        Ok(stat) => stat,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if !stat.file_type().is_file() || stat.len() > 4096 {
        return Err(Error::new(ErrorKind::InvalidData, "checkpoint head must be a regular file"));
    }
    let head: Head = serde_json::from_slice(&fs::read(path)?)?;
    if !valid_name(&head.name) {
        return Err(Error::new(ErrorKind::InvalidData, "invalid checkpoint head name"));
    }
    Ok(Some(head))
}

pub(crate) fn read(directory: &Path) -> Result<Option<String>> {
    Ok(load(directory)?.map(|head| head.name))
}

pub(crate) fn rewound(directory: &Path) -> Result<bool> {
    Ok(load(directory)?.is_some_and(|head| head.rewound))
}

pub(crate) fn write(directory: &Path, name: &str) -> Result<()> {
    if !valid_name(name) {
        return Err(Error::new(ErrorKind::InvalidInput, "invalid checkpoint head name"));
    }
    let path = directory.join("orchestration.head.json");
    let temporary = directory.join(format!(".head-{}.tmp", uuid::Uuid::new_v4()));
    let bytes = serde_json::to_vec(&Head { name: name.to_string(), rewound: rewound(directory)? })?;
    let mut file = fs::File::create(&temporary)?;
    use std::io::Write;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    if let Err(error) = fs::rename(&temporary, &path) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(())
}

fn valid_name(name: &str) -> bool {
    Path::new(name).file_name().is_some_and(|file| file == name)
        && name.starts_with("checkpoint-") && name.ends_with(".json")
}
