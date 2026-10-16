use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

const WORKER_SCHEMA: &str = "genos.worker-biological-execution-receipt/v1";
const HOMEOSTASIS_SCHEMA: &str = "genos.homeostasis-transition-receipt/v2";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ReceiptReference {
    receipt_id: String,
    run_id: String,
    payload_hash: String,
}

pub(crate) struct EvidenceBundle {
    pub worker_ids: Vec<String>, pub receipts: Vec<ReceiptReference>,
    pub homeostasis_receipt_hash: String, pub state_id: String,
    pub evidence: Vec<String>,
}

struct WorkerRow { worker_id: String, status: String }
struct WorkerReceipt {
    receipt_id: String, run_id: String, payload_hash: String, receipt_json: String,
}
struct HomeostasisReceipt {
    allowed: i64, contract_revision: i64, contract_hash: String,
    receipt_hash: String, receipt_json: String,
}
struct VerifiedHomeostasis { receipt_hash: String, state_id: String }

pub(crate) fn verify_evidence(
    connection: &Connection,
    mission_id: &str,
    plan_hash: &str,
) -> Result<EvidenceBundle, String> {
    let workers = load_workers(connection, mission_id)?;
    let receipts = workers.iter().map(|worker| verify_worker(connection, mission_id, worker))
        .collect::<Result<Vec<_>, _>>()?;
    let homeostasis = verify_homeostasis(connection, mission_id, &receipts)?;
    let worker_ids = workers.into_iter().map(|worker| worker.worker_id).collect();
    let evidence = evidence_refs(&receipts, &homeostasis, plan_hash);
    Ok(EvidenceBundle { worker_ids, receipts,
        homeostasis_receipt_hash: homeostasis.receipt_hash,
        state_id: homeostasis.state_id, evidence })
}

fn load_workers(connection: &Connection, mission_id: &str) -> Result<Vec<WorkerRow>, String> {
    let workers = query_workers(connection, mission_id)?;
    validate_workers(&workers)?;
    Ok(workers)
}

fn query_workers(connection: &Connection, mission_id: &str) -> Result<Vec<WorkerRow>, String> {
    let mut statement = connection.prepare(
        "SELECT a.id, a.status FROM mission_agents ma JOIN agents a ON a.id = ma.agent_id
         WHERE ma.mission_id = ?1 AND a.execution_mode = 'worker'
         AND NOT EXISTS (SELECT 1 FROM mission_regeneration_attempts replacement
           WHERE replacement.mission_id = ma.mission_id
           AND replacement.lost_agent_id = a.id AND replacement.status = 'verified')
         ORDER BY a.id",
    ).map_err(sql_error)?;
    let rows = statement.query_map([mission_id], |row| {
        Ok(WorkerRow { worker_id: row.get(0)?, status: row.get(1)? })
    }).map_err(sql_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(sql_error)
}

fn validate_workers(workers: &[WorkerRow]) -> Result<(), String> {
    if workers.is_empty() { return Err(String::from("mission has no effective Node worker")); }
    if let Some(worker) = workers.iter().find(|worker| worker.status != "completed") {
        return Err(format!("worker {} is not completed", worker.worker_id));
    }
    Ok(())
}

fn verify_worker(
    connection: &Connection,
    mission_id: &str,
    worker: &WorkerRow,
) -> Result<ReceiptReference, String> {
    let receipt = load_worker_receipt(connection, mission_id, &worker.worker_id)?;
    let payload = parse_worker_receipt(&receipt)?;
    validate_worker_payload(&payload, (&receipt, worker), mission_id)?;
    verify_observations(connection, &receipt.run_id, &payload)?;
    Ok(ReceiptReference { receipt_id: receipt.receipt_id,
        run_id: receipt.run_id, payload_hash: receipt.payload_hash })
}

fn parse_worker_receipt(receipt: &WorkerReceipt) -> Result<Value, String> {
    serde_json::from_str(&receipt.receipt_json)
        .map_err(|error| format!("invalid worker receipt JSON: {error}"))
}

fn validate_worker_payload(
    payload: &Value,
    binding: (&WorkerReceipt, &WorkerRow),
    mission_id: &str,
) -> Result<(), String> {
    let (receipt, worker) = binding;
    require(raw_hash(&receipt.receipt_json) == receipt.payload_hash, "worker receipt hash mismatch")?;
    require(payload["schema"] == WORKER_SCHEMA, "worker receipt schema mismatch")?;
    require(payload["missionId"] == mission_id, "worker receipt mission mismatch")?;
    require(payload["workerId"] == worker.worker_id, "worker receipt identity mismatch")?;
    require(payload["runId"] == receipt.run_id, "worker receipt run mismatch")?;
    require(payload["result"]["verified"] == true, "worker result is not verified")?;
    require(payload["budgetAssessment"]["satisfied"] == true, "worker budget is not satisfied")
}

fn load_worker_receipt(
    connection: &Connection,
    mission_id: &str,
    worker_id: &str,
) -> Result<WorkerReceipt, String> {
    connection.query_row(
        "SELECT wr.receipt_id, r.id, wr.payload_hash, wr.receipt_json
         FROM strategy_execution_runs r JOIN biological_worker_receipts wr ON wr.run_id = r.id
         WHERE r.agent_id = ?1 AND wr.mission_id = ?2 AND r.status = 'completed'
         ORDER BY r.rowid DESC LIMIT 1", (worker_id, mission_id),
        |row| Ok(WorkerReceipt { receipt_id: row.get(0)?, run_id: row.get(1)?,
            payload_hash: row.get(2)?, receipt_json: row.get(3)? }),
    ).optional().map_err(sql_error)?
        .ok_or_else(|| format!("worker {worker_id} has no durable receipt"))
}

fn verify_observations(
    connection: &Connection,
    run_id: &str,
    receipt: &Value,
) -> Result<(), String> {
    let observations = load_observations(connection, run_id)?;
    validate_observations(&observations, receipt)
}

fn load_observations(connection: &Connection, run_id: &str) -> Result<Vec<(String, i64)>, String> {
    let mut statement = connection.prepare(
        "SELECT event_hash, applied FROM biological_worker_observations
         WHERE run_id = ?1 ORDER BY rowid",
    ).map_err(sql_error)?;
    let rows = statement.query_map([run_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(sql_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(sql_error)
}

fn validate_observations(observations: &[(String, i64)], receipt: &Value) -> Result<(), String> {
    require(!observations.is_empty(), "worker has no durable observation")?;
    require(observations.iter().all(|entry| entry.1 == 1), "worker has unapplied observations")?;
    let expected = receipt["evidence"]["observations"].as_array()
        .ok_or_else(|| String::from("worker receipt lacks observation evidence"))?;
    let actual = observations.iter().map(|entry| Value::String(entry.0.clone())).collect::<Vec<_>>();
    require(expected == &actual, "worker observation evidence mismatch")
}

fn verify_homeostasis(
    connection: &Connection,
    mission_id: &str,
    workers: &[ReceiptReference],
) -> Result<VerifiedHomeostasis, String> {
    let row = load_homeostasis_receipt(connection, mission_id)?;
    let receipt = parse_homeostasis_receipt(&row)?;
    validate_homeostasis_payload(&row, &receipt, mission_id)?;
    verify_execution_refs(&receipt, workers)?;
    let state_id = receipt["stateId"].as_str()
        .ok_or_else(|| String::from("homeostasis state id is missing"))?;
    verify_state(connection, mission_id, state_id)?;
    Ok(VerifiedHomeostasis { receipt_hash: row.receipt_hash, state_id: state_id.into() })
}

fn parse_homeostasis_receipt(row: &HomeostasisReceipt) -> Result<Value, String> {
    serde_json::from_str(&row.receipt_json)
        .map_err(|error| format!("invalid homeostasis receipt JSON: {error}"))
}

fn validate_homeostasis_payload(
    row: &HomeostasisReceipt,
    receipt: &Value,
    mission_id: &str,
) -> Result<(), String> {
    require(row.allowed == 1, "homeostasis transition was denied")?;
    require(raw_hash(&row.receipt_json) == row.receipt_hash, "homeostasis receipt hash mismatch")?;
    require(receipt["schema"] == HOMEOSTASIS_SCHEMA, "homeostasis schema mismatch")?;
    require(receipt["missionId"] == mission_id, "homeostasis mission mismatch")?;
    require(receipt["allowed"] == true, "homeostasis receipt is not allowed")?;
    require(receipt["contractRevision"] == row.contract_revision, "contract revision mismatch")?;
    require(receipt["contractHash"] == row.contract_hash, "contract hash mismatch")
}

fn load_homeostasis_receipt(
    connection: &Connection,
    mission_id: &str,
) -> Result<HomeostasisReceipt, String> {
    connection.query_row(
        "SELECT allowed, contract_revision, contract_hash, receipt_hash, receipt_json
         FROM homeostasis_transition_receipts WHERE mission_id = ?1 ORDER BY rowid DESC LIMIT 1",
        [mission_id], |row| Ok(HomeostasisReceipt { allowed: row.get(0)?,
            contract_revision: row.get(1)?, contract_hash: row.get(2)?,
            receipt_hash: row.get(3)?, receipt_json: row.get(4)? }),
    ).optional().map_err(sql_error)?
        .ok_or_else(|| String::from("homeostasis receipt is missing"))
}

fn verify_execution_refs(receipt: &Value, workers: &[ReceiptReference]) -> Result<(), String> {
    let references = receipt["executionReceipts"].as_array()
        .ok_or_else(|| String::from("homeostasis execution receipts are missing"))?;
    for worker in workers {
        let found = references.iter().any(|reference| {
            reference["receiptId"] == worker.receipt_id
                && reference["runId"] == worker.run_id
                && reference["payloadHash"] == worker.payload_hash
        });
        require(found, "worker receipt is not bound to homeostasis")?;
    }
    Ok(())
}

fn verify_state(connection: &Connection, mission_id: &str, state_id: &str) -> Result<(), String> {
    let state: Option<(String, String)> = connection.query_row(
        "SELECT status, state_json FROM homeostasis_states WHERE id = ?1 AND mission_id = ?2",
        (state_id, mission_id), |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional().map_err(sql_error)?;
    let (status, serialized) = state.ok_or_else(|| String::from("homeostasis state is missing"))?;
    require(status == "homeostasis_satisfied", "homeostasis state is not satisfied")?;
    let value: Value = serde_json::from_str(&serialized)
        .map_err(|error| format!("invalid homeostasis state JSON: {error}"))?;
    require(value["homeostasisSatisfied"] == true, "homeostasis state binding is false")
}

fn evidence_refs(
    workers: &[ReceiptReference],
    homeostasis: &VerifiedHomeostasis,
    plan_hash: &str,
) -> Vec<String> {
    let mut evidence = workers.iter().map(|receipt| {
        format!("sqlite:biological_worker_receipts:{}:{}", receipt.receipt_id, receipt.payload_hash)
    }).collect::<Vec<_>>();
    evidence.push(format!("sqlite:homeostasis_transition_receipts:{}", homeostasis.receipt_hash));
    evidence.push(format!("sqlite:homeostasis_states:{}", homeostasis.state_id));
    evidence.push(format!("sqlite:rust_kernel_mission_plans:{plan_hash}"));
    evidence
}

fn raw_hash(value: &str) -> String { hex_hash(value.as_bytes()) }
fn hex_hash(value: &[u8]) -> String { format!("{:x}", Sha256::digest(value)) }
fn require(condition: bool, message: &str) -> Result<(), String> {
    condition.then_some(()).ok_or_else(|| message.to_string())
}
fn sql_error(error: rusqlite::Error) -> String {
    format!("cannot read durable mission evidence: {error}")
}
