//! Durable evidence and restart recovery for DNA-driven recruitment.

use crate::{Demand, GenosEcosystem, RecruitmentDecision};
use genos_dna::{AgentDna, express};
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const RECEIPT_SCHEMA: &str = "genos.epigenetic-recruitment-receipt/v1";
const LINK_SCHEMA: &str = "genos.epigenetic-recruitment-recovery/v1";
const SNAPSHOT_SCHEMA: &str = "genos.population-state/v1";

pub struct EpigeneticRecruitmentRequest<'a> {
    pub store: &'a BiologicalReceiptStore,
    pub tissue: &'a str,
    pub demand: &'a Demand,
    pub candidates: &'a [(&'a AgentDna, f64)],
    pub tick: u64,
}

impl GenosEcosystem {
    /// Recruit from expressed DNA and commit the population plus linked evidence.
    pub fn recruit_dna_for_mission(
        &mut self,
        request: EpigeneticRecruitmentRequest<'_>,
    ) -> Result<RecruitmentDecision, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        let previous_cells = self.orchestrator.active_cells.keys().copied().collect::<Vec<_>>();
        let expressions = request.candidates.iter().map(|(dna, cost)| expression_record(dna, *cost))
            .collect::<Result<Vec<_>, _>>()?;
        let decision = self.recruit_dna(request.tissue, request.demand, request.candidates);
        let cells = recruited_cells(self, &previous_cells, &decision)?;
        let snapshot = self.population_state_receipt(request.tick)?;
        let snapshot_hash = digest(&snapshot)?;
        let receipt_id = Uuid::new_v4();
        let receipt = json!({
            "schema": RECEIPT_SCHEMA,
            "receipt_id": receipt_id,
            "mission_id": mission_id,
            "tick": request.tick,
            "tissue": request.tissue,
            "demand": {"roles": request.demand.roles, "capabilities": request.demand.capabilities, "budget": request.demand.budget},
            "decision": decision_json(&decision),
            "expressions": expressions,
            "recruited_cells": cells,
            "population_snapshot_sha256": snapshot_hash,
        });
        let link = json!({
            "schema": LINK_SCHEMA,
            "receipt_id": receipt_id,
            "mission_id": mission_id,
            "tick": request.tick,
            "population_snapshot_sha256": snapshot_hash,
        });
        request.store.append_receipts(&[snapshot, receipt, link])?;
        Ok(decision)
    }

    /// Restore the linked population and verify recruited cell identity after restart.
    pub fn restore_epigenetic_recruitment(
        &mut self,
        store: &BiologicalReceiptStore,
    ) -> Result<Value, String> {
        let entries = store.read_all()?;
        let (receipt, snapshot) = linked_recruitment(&entries)?;
        let mission_id: Uuid = serde_json::from_value(receipt["mission_id"].clone())
            .map_err(|error| error.to_string())?;
        if self.mission_id.is_some_and(|mission| mission != mission_id) {
            return Err("epigenetic recruitment mission mismatch".into());
        }
        validate_snapshot(receipt, snapshot)?;
        self.restore_population(store)?;
        validate_restored_cells(self, receipt)?;
        Ok(receipt.clone())
    }
}

fn expression_record(dna: &AgentDna, cost: f64) -> Result<Value, String> {
    let phenotype = express::express(dna);
    let dna_flux = genos_dna::codec::encode(dna)?;
    let role_mark = dna.epigenome.marks.get("ROLE")
        .map(|mark| json!({"kind": mark.kind, "level": mark.level}))
        .unwrap_or(Value::Null);
    Ok(json!({
        "candidate": dna.meta.name,
        "dna_sha256": genos_dna::codec::content_hash(dna)?,
        "dna_flux": dna_flux,
        "cost": cost,
        "phenotype_role": phenotype.role,
        "phenotype_capabilities": phenotype.capabilities,
        "role_mark": role_mark,
    }))
}

fn recruited_cells(
    ecosystem: &GenosEcosystem,
    previous: &[Uuid],
    decision: &RecruitmentDecision,
) -> Result<Vec<Value>, String> {
    let mut cells = ecosystem.orchestrator.active_cells.iter()
        .filter(|(id, _)| !previous.contains(id))
        .map(|(id, cell)| json!({"cell_id": id, "name": cell.name, "role": cell.role}))
        .collect::<Vec<_>>();
    cells.sort_by(|left, right| left["cell_id"].as_str().cmp(&right["cell_id"].as_str()));
    if cells.len() != decision.selected.len() {
        return Err("recruitment decision and created cells differ".into());
    }
    Ok(cells)
}

fn decision_json(decision: &RecruitmentDecision) -> Value {
    json!({
        "feasible": decision.feasible,
        "spent": decision.spent,
        "selected": decision.selected.iter().map(|selection| json!({
            "candidate": selection.candidate,
            "key": selection.key,
            "role": selection.role,
            "cost": selection.cost,
        })).collect::<Vec<_>>(),
        "rejected": decision.rejected,
    })
}

fn digest(value: &Value) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    let hash = Sha256::digest(bytes);
    Ok(hash.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn linked_recruitment(entries: &[Value]) -> Result<(&Value, &Value), String> {
    let link = recovery_link(entries)?;
    let receipt = receipt_for_link(entries, link)?;
    let snapshot = snapshot_for_link(entries, link, receipt)?;
    Ok((receipt, snapshot))
}

fn recovery_link(entries: &[Value]) -> Result<&Value, String> {
    entries.iter().rev().find(|entry| entry["schema"] == LINK_SCHEMA)
        .ok_or_else(|| "epigenetic recruitment recovery link missing".into())
}

fn receipt_for_link<'a>(entries: &'a [Value], link: &Value) -> Result<&'a Value, String> {
    let receipt_id = link["receipt_id"].as_str().ok_or("recruitment receipt id missing")?;
    let receipt = entries.iter().rev()
        .find(|entry| entry["schema"] == RECEIPT_SCHEMA && entry["receipt_id"] == receipt_id)
        .ok_or("linked epigenetic recruitment receipt missing")?;
    if receipt["mission_id"] != link["mission_id"] || receipt["tick"] != link["tick"] {
        return Err("epigenetic recruitment link mismatch".into());
    }
    Ok(receipt)
}

fn snapshot_for_link<'a>(entries: &'a [Value], link: &Value, receipt: &Value) -> Result<&'a Value, String> {
    let snapshot_hash = link["population_snapshot_sha256"].as_str()
        .ok_or("recruitment snapshot digest missing")?;
    if receipt["population_snapshot_sha256"] != snapshot_hash {
        return Err("recruitment receipt snapshot digest mismatch".into());
    }
    let snapshot = entries.iter().find(|entry| {
        entry["schema"] == SNAPSHOT_SCHEMA && digest(entry).is_ok_and(|hash| hash == snapshot_hash)
    }).ok_or("linked recruitment population snapshot missing")?;
    if entries.iter().rev().find(|entry| entry["schema"] == SNAPSHOT_SCHEMA) != Some(snapshot) {
        return Err("linked recruitment snapshot is not the latest population state".into());
    }
    Ok(snapshot)
}

fn validate_snapshot(receipt: &Value, snapshot: &Value) -> Result<(), String> {
    validate_snapshot_identity(receipt, snapshot)?;
    let cells = snapshot["active_cells"].as_array().ok_or("population cells missing")?;
    validate_expressions(receipt)?;
    validate_recruited_cells(receipt, cells)
}

fn validate_snapshot_identity(receipt: &Value, snapshot: &Value) -> Result<(), String> {
    if snapshot["mission_id"] == receipt["mission_id"] && snapshot["tick"] == receipt["tick"] {
        return Ok(());
    }
    Err("recruitment population snapshot identity mismatch".into())
}

fn validate_recruited_cells(receipt: &Value, cells: &[Value]) -> Result<(), String> {
    for recruited in receipt["recruited_cells"].as_array().ok_or("recruited cells missing")? {
        if !cells.iter().any(|cell| cell["cell_id"] == recruited["cell_id"]
            && cell["cell_state"]["role"] == recruited["role"]
            && cell["cell_state"]["name"] == recruited["name"])
        {
            return Err("recruitment cell is absent from linked population snapshot".into());
        }
    }
    Ok(())
}

fn validate_expressions(receipt: &Value) -> Result<(), String> {
    let expressions = receipt["expressions"].as_array().ok_or("recruitment expressions missing")?;
    for expression in expressions {
        validate_expression(expression)?;
    }
    Ok(())
}

fn validate_expression(expression: &Value) -> Result<(), String> {
    let dna = decode_expression_dna(expression)?;
    validate_expressed_identity(expression, &dna)?;
    validate_role_mark(expression, &dna)
}

fn decode_expression_dna(expression: &Value) -> Result<AgentDna, String> {
    let flux = expression["dna_flux"].as_array().ok_or("recruitment DNA flux missing")?
        .iter().map(|byte| byte.as_u64().and_then(|value| u8::try_from(value).ok())
            .ok_or_else(|| "recruitment DNA flux is invalid".to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    genos_dna::codec::decode(&flux)
}

fn validate_expressed_identity(expression: &Value, dna: &AgentDna) -> Result<(), String> {
    let phenotype = express::express(dna);
    let capabilities = serde_json::to_value(&phenotype.capabilities)
        .map_err(|error| error.to_string())?;
    if genos_dna::codec::content_hash(dna)? == expression["dna_sha256"]
        && expression["phenotype_role"].as_str() == Some(phenotype.role.as_str())
        && capabilities == expression["phenotype_capabilities"]
        && expression["candidate"].as_str() == Some(dna.meta.name.as_str())
    {
        return Ok(());
    }
    Err("recruitment expression does not replay from its DNA".into())
}

fn validate_role_mark(expression: &Value, dna: &AgentDna) -> Result<(), String> {
    let role_mark = dna.epigenome.marks.get("ROLE")
        .map(|mark| json!({"kind": mark.kind, "level": mark.level}))
        .unwrap_or(Value::Null);
    if role_mark == expression["role_mark"] {
        return Ok(());
    }
    Err("recruitment ROLE mark differs from persisted DNA".into())
}

fn validate_restored_cells(ecosystem: &GenosEcosystem, receipt: &Value) -> Result<(), String> {
    for recruited in receipt["recruited_cells"].as_array().ok_or("recruited cells missing")? {
        let id: Uuid = serde_json::from_value(recruited["cell_id"].clone())
            .map_err(|error| error.to_string())?;
        let cell = ecosystem.orchestrator.active_cells.get(&id)
            .ok_or("recruited cell missing after population restore")?;
        if cell.role != recruited["role"] || cell.name != recruited["name"] {
            return Err("recruited cell identity changed after restore".into());
        }
    }
    Ok(())
}
