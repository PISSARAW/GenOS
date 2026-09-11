use std::fs;
use std::path::Path;
use std::path::PathBuf;
use serde_json::json;
use crate::commands::output_guard::WriteOptions;
use crate::commands::output_guard::write_output_file;

pub struct AuditRequest<'a> {
    pub snapshot_id: &'a str,
    pub output: Option<&'a str>,
    pub force: bool,
    pub parents: bool,
}

struct Assessment {
    hash: String,
    score: f64,
    status: &'static str,
}

fn capsule_file_for(snapshot_id: &str) -> PathBuf {
    crate::commands::root_resolver::resolve_matrix_root().join("capsules").join(format!("{}.json", snapshot_id))
}

fn assessment_unreadable() -> Assessment {
    Assessment { hash: "unreadable".into(), score: 0.0, status: "ERROR" }
}

fn assessment_corrupt() -> Assessment {
    Assessment { hash: "corrupt".into(), score: 0.0, status: "CORRUPT" }
}

fn assessment_from_capsule(capsule: &genos_store::Capsule) -> Assessment {
    if capsule.verify() {
        return Assessment { hash: capsule.hash.clone(), score: 1.0, status: "APPROVED" };
    }
    Assessment { hash: capsule.hash.clone(), score: 0.0, status: "TAMPERED" }
}

fn assess_content(content: &str) -> Assessment {
    match serde_json::from_str::<genos_store::Capsule>(content) {
        Ok(capsule) => assessment_from_capsule(&capsule),
        Err(_) => assessment_corrupt(),
    }
}

fn assess_capsule(path: &Path) -> Assessment {
    match fs::read_to_string(path) {
        Ok(content) => assess_content(&content),
        Err(_) => assessment_unreadable(),
    }
}

fn render_audit(snapshot_id: &str, assessment: &Assessment) -> String {
    let audit_id = format!("audit-{}", uuid::Uuid::new_v4().simple());
    let audit_data = json!({
        "audit_id": audit_id,
        "snapshot_id": snapshot_id,
        "integrity_hash": assessment.hash,
        "policy_violations": match assessment.score < 1.0 {
            true => 1,
            false => 0,
        },
        "compliance_score": assessment.score,
        "status": assessment.status
    });
    serde_json::to_string_pretty(&audit_data).unwrap_or_default()
}

fn print_audit(rendered: &str) -> Result<(), String> {
    println!("{}", rendered);
    Ok(())
}

fn write_audit_report(out: &str, rendered: &str, req: &AuditRequest) -> Result<(), String> {
    let opts = WriteOptions { force: req.force, parents: req.parents };
    match write_output_file(out, rendered, &opts) {
        Ok(()) => print_audit(rendered),
        Err(reason) => Err(reason),
    }
}

fn persist_audit(req: &AuditRequest, rendered: &str) -> Result<(), String> {
    match req.output {
        Some(out) => write_audit_report(out, rendered, req),
        None => print_audit(rendered),
    }
}

pub fn handle_audit(req: &AuditRequest) -> Result<(), String> {
    let path = capsule_file_for(req.snapshot_id);
    if path.exists() {
        let assessment = assess_capsule(&path);
        let rendered = render_audit(req.snapshot_id, &assessment);
        return persist_audit(req, &rendered);
    }
    Err(format!("Capsule not found for snapshot: {}", req.snapshot_id))
}
