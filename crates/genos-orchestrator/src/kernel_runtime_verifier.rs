//! Vérification indépendante d'une mission Node depuis ses preuves SQLite.

use crate::kernel_runtime_evidence::{EvidenceBundle, ReceiptReference, verify_evidence};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

const SCHEMA: &str = "genos.kernel-independent-verification/v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MissionVerification {
    schema: String,
    mission_id: String,
    objective: String,
    plan_hash: String,
    verified: bool,
    verifier: String,
    worker_ids: Vec<String>,
    receipts: Vec<ReceiptReference>,
    homeostasis_receipt_hash: String,
    state_id: String,
    evidence: Vec<String>,
}

impl MissionVerification {
    pub fn require_verified(&self) -> Result<(), String> {
        if self.verified && self.schema == SCHEMA && self.verifier == "rust-sqlite-readonly-process" {
            return Ok(());
        }
        Err(String::from("independent mission verification is not valid"))
    }

    pub fn worker_ids(&self) -> &[String] { &self.worker_ids }
    pub fn evidence(&self) -> &[String] { &self.evidence }
}

pub struct VerificationTarget<'a> {
    pub mission_id: &'a str,
    pub expected_objective: &'a str,
    pub expected_plan_hash: &'a str,
}

struct MissionRow { objective: String, status: String }

pub fn verify_database(
    database: &Path,
    target: &VerificationTarget<'_>,
) -> Result<MissionVerification, String> {
    validate_identifier(target.mission_id)?;
    let connection = open_readonly(database)?;
    validate_target(&connection, target)?;
    let evidence = verify_evidence(&connection, target.mission_id, target.expected_plan_hash)?;
    Ok(build_verification(target, evidence))
}

fn open_readonly(database: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("cannot open runtime database read-only: {error}"))
}

fn validate_target(
    connection: &Connection,
    target: &VerificationTarget<'_>,
) -> Result<(), String> {
    let mission = load_mission(connection, target.mission_id)?;
    validate_mission(&mission, target.expected_objective)?;
    verify_kernel_plan(connection, target)
}

fn build_verification(
    target: &VerificationTarget<'_>,
    evidence: EvidenceBundle,
) -> MissionVerification {
    MissionVerification {
        schema: SCHEMA.into(), mission_id: target.mission_id.into(),
        objective: target.expected_objective.into(), plan_hash: target.expected_plan_hash.into(),
        verified: true, verifier: String::from("rust-sqlite-readonly-process"),
        worker_ids: evidence.worker_ids, receipts: evidence.receipts,
        homeostasis_receipt_hash: evidence.homeostasis_receipt_hash,
        state_id: evidence.state_id, evidence: evidence.evidence,
    }
}

fn verify_kernel_plan(
    connection: &Connection,
    target: &VerificationTarget<'_>,
) -> Result<(), String> {
    let stored = load_kernel_plan(connection, target.mission_id)?;
    validate_kernel_plan(&stored, target)
}

fn load_kernel_plan(
    connection: &Connection,
    mission_id: &str,
) -> Result<(String, String, String), String> {
    connection.query_row(
        "SELECT objective_hash, plan_hash, plan_json FROM rust_kernel_mission_plans
         WHERE mission_id = ?1", [mission_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional().map_err(sql_error)?
        .ok_or_else(|| String::from("durable Rust kernel plan is missing"))
}

fn validate_kernel_plan(
    stored: &(String, String, String),
    target: &VerificationTarget<'_>,
) -> Result<(), String> {
    let (objective_hash, plan_hash, plan_json) = stored;
    require(objective_hash == &raw_hash(target.expected_objective), "kernel objective hash mismatch")?;
    require(plan_hash == target.expected_plan_hash, "kernel plan hash mismatch")?;
    serde_json::from_str::<serde_json::Value>(plan_json)
        .map_err(|error| format!("invalid durable Rust kernel plan: {error}"))?;
    require(raw_hash(plan_json) == *plan_hash, "durable Rust kernel plan was altered")
}

fn validate_identifier(value: &str) -> Result<(), String> {
    let valid = !value.is_empty() && value.len() <= 128
        && value.chars().all(|character| character.is_ascii_alphanumeric()
            || matches!(character, '-' | '_' | '.'));
    valid.then_some(()).ok_or_else(|| String::from("mission id is not safe"))
}

fn load_mission(connection: &Connection, mission_id: &str) -> Result<MissionRow, String> {
    connection.query_row(
        "SELECT objective, status FROM missions WHERE mission_id = ?1", [mission_id],
        |row| Ok(MissionRow { objective: row.get(0)?, status: row.get(1)? }),
    ).optional().map_err(sql_error)?
        .ok_or_else(|| String::from("mission was not persisted"))
}

fn validate_mission(mission: &MissionRow, expected: &str) -> Result<(), String> {
    require(mission.objective == expected, "persisted mission objective does not match")?;
    require(mission.status == "completed", "mission is not completed")
}

fn raw_hash(value: &str) -> String { hex_hash(value.as_bytes()) }
fn hex_hash(value: &[u8]) -> String { format!("{:x}", Sha256::digest(value)) }
fn require(condition: bool, message: &str) -> Result<(), String> {
    condition.then_some(()).ok_or_else(|| message.to_string())
}
fn sql_error(error: rusqlite::Error) -> String {
    format!("cannot read durable mission evidence: {error}")
}

#[cfg(test)]
mod tests {
    use super::{MissionRow, validate_mission};

    #[test]
    fn independent_verifier_accepts_only_the_canonical_completed_status() {
        assert!(validate_mission(
            &MissionRow { objective: String::from("objective"), status: String::from("completed") },
            "objective",
        ).is_ok());
        for status in ["passed", "success", "running", "blocked", "failed"] {
            let result = validate_mission(
                &MissionRow { objective: String::from("objective"), status: status.into() },
                "objective",
            );
            assert_eq!(result.unwrap_err(), "mission is not completed", "status: {status}");
        }
    }
}
