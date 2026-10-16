use genos_orchestrator::{
    kernel_cycle::ControlKernel,
    kernel_runtime_verifier::{verify_database, VerificationTarget},
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;

const MISSION: &str = "mission-kernel-verifier";
const OBJECTIVE: &str = "exécuter une mission Node vérifiée";
const PLAN_HASH: &str = "ece4ffd7e665819442b7f9f2a59b96ff5b371e14c8e03d20f9afab8039274625";

#[test]
fn verifies_durable_node_worker_and_homeostasis_evidence() {
    let fixture = mission_fixture();
    let target = target();
    let verification = verify_database(fixture.path(), &target).unwrap();
    verification.require_verified().unwrap();
    let report = ControlKernel::new(OBJECTIVE)
        .verified_report(&verification)
        .unwrap();
    assert!(report.verified);
    report.independent_verification.unwrap().require_verified().unwrap();
    assert_eq!(verification.worker_ids(), &[String::from("worker-1")]);
    assert_eq!(verification.evidence().len(), 4);
}

#[test]
fn rejects_a_tampered_worker_receipt_hash() {
    let fixture = mission_fixture();
    let connection = Connection::open(fixture.path()).unwrap();
    connection.execute(
        "UPDATE biological_worker_receipts SET payload_hash = 'tampered' WHERE run_id = 'run-1'",
        [],
    ).unwrap();
    drop(connection);
    let target = target();
    let error = verify_database(fixture.path(), &target).unwrap_err();
    assert!(error.contains("worker receipt hash mismatch"));
}

#[test]
fn rejects_a_worker_receipt_from_another_mission() {
    let fixture = mission_fixture();
    let connection = Connection::open(fixture.path()).unwrap();
    connection.execute(
        "UPDATE biological_worker_receipts SET mission_id = 'other-mission' WHERE run_id = 'run-1'",
        [],
    ).unwrap();
    drop(connection);
    let error = verify_database(fixture.path(), &target()).unwrap_err();
    assert!(error.contains("has no durable receipt"));
}

fn mission_fixture() -> NamedTempFile {
    let file = NamedTempFile::new().unwrap();
    let connection = Connection::open(file.path()).unwrap();
    create_schema(&connection);
    insert_identity(&connection);
    let worker = worker_receipt();
    insert_worker_evidence(&connection, &worker);
    insert_homeostasis(&connection, &worker);
    drop(connection);
    file
}

fn create_schema(connection: &Connection) {
    connection.execute_batch(
        "CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT, status TEXT);
         CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT, execution_mode TEXT);
         CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT);
         CREATE TABLE mission_regeneration_attempts
           (mission_id TEXT, lost_agent_id TEXT, status TEXT);
         CREATE TABLE strategy_execution_runs
           (id TEXT PRIMARY KEY, agent_id TEXT, status TEXT);
         CREATE TABLE biological_worker_receipts
           (receipt_id TEXT, run_id TEXT, mission_id TEXT, payload_hash TEXT, receipt_json TEXT);
         CREATE TABLE biological_worker_observations
           (run_id TEXT, event_hash TEXT, applied INTEGER);
         CREATE TABLE homeostasis_transition_receipts
           (mission_id TEXT, allowed INTEGER, contract_revision INTEGER,
            contract_hash TEXT, receipt_hash TEXT, receipt_json TEXT);
         CREATE TABLE homeostasis_states
           (id TEXT, mission_id TEXT, status TEXT, state_json TEXT);
         CREATE TABLE rust_kernel_mission_plans
           (mission_id TEXT, objective_hash TEXT, plan_hash TEXT, plan_json TEXT);",
    ).unwrap();
}

fn insert_identity(connection: &Connection) {
    connection.execute(
        "INSERT INTO missions VALUES (?1, ?2, 'completed')",
        params![MISSION, OBJECTIVE],
    ).unwrap();
    connection.execute(
        "INSERT INTO agents VALUES ('worker-1', 'completed', 'worker')",
        [],
    ).unwrap();
    connection.execute(
        "INSERT INTO mission_agents VALUES (?1, 'worker-1')",
        [MISSION],
    ).unwrap();
    connection.execute(
        "INSERT INTO strategy_execution_runs VALUES ('run-1', 'worker-1', 'completed')",
        [],
    ).unwrap();
    connection.execute(
        "INSERT INTO biological_worker_observations VALUES ('run-1', 'event-hash-1', 1)",
        [],
    ).unwrap();
    let plan = json!({ "decision_no_change": false, "spawns": ["verifier"] });
    connection.execute(
        "INSERT INTO rust_kernel_mission_plans VALUES (?1, ?2, ?3, ?4)",
        params![MISSION, sha256(OBJECTIVE.as_bytes()), PLAN_HASH,
            serde_json::to_string(&plan).unwrap()],
    ).unwrap();
}

fn worker_receipt() -> Value {
    json!({
        "schema": "genos.worker-biological-execution-receipt/v1",
        "runtime": "node-worker",
        "receiptId": "worker-receipt-1",
        "missionId": MISSION,
        "runId": "run-1",
        "workerId": "worker-1",
        "result": { "status": "completed", "completed": true, "verified": true },
        "budgetAssessment": { "satisfied": true },
        "evidence": { "observations": ["event-hash-1"] }
    })
}

fn insert_worker_evidence(connection: &Connection, receipt: &Value) {
    let serialized = serde_json::to_string(receipt).unwrap();
    let hash = sha256(serialized.as_bytes());
    connection.execute(
        "INSERT INTO biological_worker_receipts VALUES
          ('worker-receipt-1', 'run-1', ?1, ?2, ?3)",
        params![MISSION, hash, serialized],
    ).unwrap();
}

fn insert_homeostasis(connection: &Connection, worker: &Value) {
    let worker_serialized = serde_json::to_string(worker).unwrap();
    let worker_hash = sha256(worker_serialized.as_bytes());
    let state = json!({ "homeostasisSatisfied": true, "evidence": { "satisfied": true } });
    connection.execute(
        "INSERT INTO homeostasis_states VALUES
          ('state-1', ?1, 'homeostasis_satisfied', ?2)",
        params![MISSION, serde_json::to_string(&state).unwrap()],
    ).unwrap();
    let receipt = json!({
        "schema": "genos.homeostasis-transition-receipt/v2",
        "missionId": MISSION,
        "contractRevision": 1,
        "contractHash": "contract-hash-1",
        "stateId": "state-1",
        "allowed": true,
        "executionReceipts": [{
            "receiptId": "worker-receipt-1",
            "runId": "run-1",
            "payloadHash": worker_hash
        }]
    });
    let serialized = serde_json::to_string(&receipt).unwrap();
    let receipt_hash = sha256(serialized.as_bytes());
    connection.execute(
        "INSERT INTO homeostasis_transition_receipts VALUES
          (?1, 1, 1, 'contract-hash-1', ?2, ?3)",
        params![MISSION, receipt_hash, serialized],
    ).unwrap();
}

fn sha256(value: &[u8]) -> String {
    format!("{:x}", Sha256::digest(value))
}

fn target<'a>() -> VerificationTarget<'a> {
    VerificationTarget {
        mission_id: MISSION,
        expected_objective: OBJECTIVE,
        expected_plan_hash: PLAN_HASH,
    }
}
