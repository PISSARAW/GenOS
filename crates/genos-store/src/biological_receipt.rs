//! Append-only persistence for biological execution receipts.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

const GENESIS_HASH: &str = "genesis";

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ReceiptBatch {
    sequence: u64,
    previous_hash: String,
    receipts: Vec<Value>,
    hash: String,
}

#[derive(Serialize)]
struct BatchMaterial<'a> {
    sequence: u64,
    previous_hash: &'a str,
    receipts: &'a [Value],
}

/// Durable journal. Each line is one checksummed tick batch.
pub struct BiologicalReceiptStore {
    path: PathBuf,
}

impl BiologicalReceiptStore {
    pub fn open(path: impl AsRef<Path>) -> Self {
        Self { path: path.as_ref().to_path_buf() }
    }

    /// Append all receipts from a tick as one durable record.
    pub fn append_receipts(&self, receipts: &[Value]) -> Result<(), String> {
        if receipts.is_empty() {
            return Ok(());
        }
        let (sequence, previous_hash) = self.last_position()?;
        let batch = ReceiptBatch::new(
            sequence + 1,
            previous_hash,
            receipts.to_vec(),
        )?;
        self.append_batch(&batch)
    }

    /// Read and validate the complete journal; corruption fails closed.
    pub fn read_all(&self) -> Result<Vec<Value>, String> {
        let batches = self.read_batches()?;
        Ok(batches.into_iter().flat_map(|batch| batch.receipts).collect())
    }

    /// Durable acknowledgement is appended only after backend acceptance.
    pub fn acknowledge(&self, receipt_id: &Value) -> Result<(), String> {
        self.append_receipts(&[serde_json::json!({
            "schema": "genos.receipt-ack/v1", "receipt_id": receipt_id
        })])
    }

    pub fn pending_execution_receipts(&self) -> Result<Vec<Value>, String> {
        let receipts = self.read_all()?;
        let acknowledged: std::collections::HashSet<_> = receipts.iter()
            .filter(|item| item["schema"] == "genos.receipt-ack/v1")
            .map(|item| item["receipt_id"].to_string()).collect();
        Ok(receipts.into_iter().filter(|item| item["schema"] == "genos.biological-execution-receipt/v1"
            && !acknowledged.contains(&item["receipt_id"].to_string())).collect())
    }

    fn last_position(&self) -> Result<(u64, String), String> {
        let batches = self.read_batches()?;
        match batches.last() {
            Some(batch) => Ok((batch.sequence, batch.hash.clone())),
            None => Ok((0, GENESIS_HASH.to_string())),
        }
    }

    fn read_batches(&self) -> Result<Vec<ReceiptBatch>, String> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }
        let file = File::open(&self.path).map_err(|error| error.to_string())?;
        let mut previous = GENESIS_HASH.to_string();
        let mut batches = Vec::new();
        for (index, line) in BufReader::new(file).lines().enumerate() {
            let line = line.map_err(|error| error.to_string())?;
            let batch: ReceiptBatch = serde_json::from_str(&line)
                .map_err(|error| format!("Invalid receipt batch {}: {error}", index + 1))?;
            batch.verify((index + 1) as u64, &previous)?;
            previous = batch.hash.clone();
            batches.push(batch);
        }
        Ok(batches)
    }

    fn append_batch(&self, batch: &ReceiptBatch) -> Result<(), String> {
        let mut file = OpenOptions::new().create(true).append(true).open(&self.path)
            .map_err(|error| error.to_string())?;
        serde_json::to_writer(&mut file, batch).map_err(|error| error.to_string())?;
        file.write_all(b"\n").map_err(|error| error.to_string())?;
        file.sync_data().map_err(|error| error.to_string())
    }
}

impl ReceiptBatch {
    fn new(sequence: u64, previous_hash: String, receipts: Vec<Value>) -> Result<Self, String> {
        let hash = Self::calculate_hash(sequence, &previous_hash, &receipts)?;
        Ok(Self { sequence, previous_hash, receipts, hash })
    }

    fn verify(&self, sequence: u64, previous_hash: &str) -> Result<(), String> {
        let expected = Self::calculate_hash(self.sequence, &self.previous_hash, &self.receipts)?;
        if self.sequence != sequence || self.previous_hash != previous_hash || self.hash != expected {
            return Err(format!("Biological receipt journal integrity failure at batch {sequence}"));
        }
        Ok(())
    }

    fn calculate_hash(sequence: u64, previous_hash: &str, receipts: &[Value]) -> Result<String, String> {
        let material = BatchMaterial { sequence, previous_hash, receipts };
        let encoded = serde_json::to_vec(&material).map_err(|error| error.to_string())?;
        Ok(format!("{:x}", Sha256::digest(encoded)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path() -> PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("genos-bio-receipts-{nonce}.jsonl"))
    }

    #[test]
    fn receipt_batch_survives_reopen_and_detects_tampering() {
        let path = temp_path();
        let store = BiologicalReceiptStore::open(&path);
        let receipt = serde_json::json!({ "schema": "genos.biological-execution-receipt/v1", "cost": 1.0 });
        store.append_receipts(std::slice::from_ref(&receipt)).unwrap();
        let reopened = BiologicalReceiptStore::open(&path);
        assert_eq!(reopened.read_all().unwrap(), vec![receipt]);
        let mut content = std::fs::read_to_string(&path).unwrap();
        content = content.replace("\"cost\":1.0", "\"cost\":2.0");
        std::fs::write(&path, content).unwrap();
        assert!(reopened.read_all().is_err());
        let _ = std::fs::remove_file(path);
    }
}
