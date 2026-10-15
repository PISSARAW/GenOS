use std::io::Read;
use std::path::Path;
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub(crate) fn read_bounded_input(path: &Path, limit: u64, label: &str) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path)
        .map_err(|error| format!("cannot read {label} input: {error}"))?;
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes)
        .map_err(|error| format!("cannot read {label} input: {error}"))?;
    if bytes.len() as u64 > limit {
        return Err(format!("{label} input exceeds the {limit} byte limit"));
    }
    Ok(bytes)
}

pub(crate) fn validate_replay_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() || key.len() > 256 {
        return Err("replay_key must contain between 1 and 256 bytes".into());
    }
    Ok(())
}

pub(crate) fn stable_event_id(mission_id: Uuid, replay_key: &str) -> Uuid {
    let material = format!("genos.synthetic-sensory/v1:{mission_id}:{replay_key}");
    let digest = Sha256::digest(material.as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use super::read_bounded_input;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn sensory_input_reader_rejects_oversized_files() {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("genos-sensory-oversized-{nonce}.json"));
        std::fs::write(&path, vec![b'x'; 17]).unwrap();
        assert!(read_bounded_input(&path, 16, "sensory").unwrap_err().contains("16 byte limit"));
        let _ = std::fs::remove_file(path);
    }
}
