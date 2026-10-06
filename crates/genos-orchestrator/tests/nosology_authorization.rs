#![cfg(feature = "api")]

use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::authorized_therapy::TherapyAuthorization;
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const SECRET: &str = "nosology-test-authority";

struct Context {
    ecosystem: GenosEcosystem,
    store: BiologicalReceiptStore,
    auth: TherapyAuthorization,
    path: std::path::PathBuf,
}

fn context(markers: &[(&str, f64)], therapy: Value) -> Context {
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| {
        // Toutes les lectures du secret dans ce binaire suivent cette initialisation.
        unsafe {
            std::env::set_var("GENOS_THERAPY_AUTH_SECRET", SECRET);
        }
    });
    let path = std::env::temp_dir().join(format!("genos-nosology-{}.jsonl", Uuid::new_v4()));
    let store = BiologicalReceiptStore::open(&path);
    let mut ecosystem = GenosEcosystem::new("nosology-authorization");
    let mission = Uuid::new_v4();
    ecosystem.set_mission_id(mission);
    ecosystem
        .orchestrator
        .create_tissue("Clinical", "Worker")
        .unwrap();
    let mut cell = AgentCell::new("patient", "simulation", "Worker");
    for (key, value) in markers {
        cell.clinical.markers.insert((*key).into(), *value);
    }
    let cell_id = ecosystem.orchestrator.add_worker("Clinical", cell).unwrap();
    let genome_id = ecosystem.seed_germline(cell_id, "CLINICAL").unwrap();
    let source = Uuid::new_v4();
    let mut population = ecosystem.population_state_receipt(0).unwrap();
    population["receipt_id"] = json!(source);
    store.append_receipts(&[population]).unwrap();
    let cell_json = serde_json::to_value(&ecosystem.orchestrator.active_cells[&cell_id])
        .unwrap()
        .to_string();
    let mut auth = TherapyAuthorization {
        authorization_id: Uuid::new_v4(),
        mission_id: mission,
        cell_id,
        genome_id,
        genome_fingerprint: ecosystem.orchestrator.genomes[&genome_id]
            .fingerprint()
            .unwrap()
            .content_hash,
        cell_state_digest: format!("{:x}", Sha256::digest(cell_json.as_bytes())),
        source_receipt_id: source,
        therapy_json: therapy.to_string(),
        approver_id: "test-admin".into(),
        expires_at_unix_ms: u64::MAX,
        signature: String::new(),
    };
    auth.signature = auth.expected_signature(SECRET);
    Context {
        ecosystem,
        store,
        auth,
        path,
    }
}

impl Drop for Context {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[test]
fn authorized_marker_change_is_durable_and_idempotent() {
    let mut ctx = context(&[("metal_toxin_load", 0.75)], json!("ChelationTherapy"));
    let receipt = ctx
        .ecosystem
        .apply_authorized_therapy(&ctx.auth, &ctx.store)
        .unwrap();
    assert_eq!(receipt["status"], "applied");
    assert_eq!(receipt["treatment_administered"], true);
    assert_eq!(receipt["outcome"]["marker_changes"][0]["before"], 0.75);
    let count = ctx.store.read_all().unwrap().len();
    assert_eq!(
        ctx.ecosystem
            .apply_authorized_therapy(&ctx.auth, &ctx.store)
            .unwrap(),
        receipt
    );
    assert_eq!(ctx.store.read_all().unwrap().len(), count);
    let mut restored = GenosEcosystem::new("restored");
    restored.restore_population(&ctx.store).unwrap();
    assert_eq!(
        restored.orchestrator.active_cells[&ctx.auth.cell_id]
            .clinical
            .markers["metal_toxin_load"],
        0.5
    );
    assert_eq!(
        restored
            .apply_authorized_therapy(&ctx.auth, &ctx.store)
            .unwrap(),
        receipt
    );
}

#[test]
fn no_target_receipt_never_claims_a_treatment_was_administered() {
    let mut ctx = context(&[], json!("ChelationTherapy"));
    let receipt = ctx
        .ecosystem
        .apply_authorized_therapy(&ctx.auth, &ctx.store)
        .unwrap();
    assert_eq!(receipt["status"], "no_target");
    assert_eq!(receipt["treatment_administered"], false);
    assert!(
        ctx.ecosystem.orchestrator.active_cells[&ctx.auth.cell_id]
            .clinical
            .last_treatment_applied
            .is_none()
    );
    assert_eq!(
        ctx.ecosystem
            .apply_authorized_therapy(&ctx.auth, &ctx.store)
            .unwrap(),
        receipt
    );
}

#[test]
fn unsafe_treatment_is_a_durable_refusal() {
    let mut ctx = context(
        &[("vascular_occlusion", 0.75)],
        json!("CoronaryReperfusionThrombolysis"),
    );
    let receipt = ctx
        .ecosystem
        .apply_authorized_therapy(&ctx.auth, &ctx.store)
        .unwrap();
    assert_eq!(receipt["status"], "refused");
    assert_eq!(receipt["treatment_administered"], false);
    assert_eq!(
        ctx.ecosystem.orchestrator.active_cells[&ctx.auth.cell_id]
            .clinical
            .markers["vascular_occlusion"],
        0.75
    );
    assert_eq!(
        ctx.ecosystem
            .apply_authorized_therapy(&ctx.auth, &ctx.store)
            .unwrap(),
        receipt
    );
}

#[test]
fn stale_or_forged_authorization_cannot_change_the_cell() {
    let mut ctx = context(&[("metal_toxin_load", 0.75)], json!("ChelationTherapy"));
    ctx.auth.signature = "0".repeat(64);
    assert!(
        ctx.ecosystem
            .apply_authorized_therapy(&ctx.auth, &ctx.store)
            .is_err()
    );
    ctx.auth.signature = ctx.auth.expected_signature(SECRET);
    ctx.ecosystem
        .orchestrator
        .active_cells
        .get_mut(&ctx.auth.cell_id)
        .unwrap()
        .clinical
        .markers
        .insert("metal_toxin_load".into(), 0.6);
    assert!(
        ctx.ecosystem
            .apply_authorized_therapy(&ctx.auth, &ctx.store)
            .is_err()
    );
    assert_eq!(
        ctx.ecosystem.orchestrator.active_cells[&ctx.auth.cell_id]
            .clinical
            .markers["metal_toxin_load"],
        0.6
    );
}
