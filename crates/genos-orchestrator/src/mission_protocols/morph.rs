use super::morph_types::{MorphReceipt, Roster, RosterPlan};
use super::store::{Store, digest};
use super::types::{Binding, Event};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde_json::json;

pub fn ensure_schema(connection: &Connection) -> Result<(), String> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS rust_protocol_rosters(
          organization_key TEXT PRIMARY KEY, version INTEGER NOT NULL,
          roster_json TEXT NOT NULL, roster_digest TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS rust_protocol_morph(
          transition_key TEXT PRIMARY KEY, binding_digest TEXT NOT NULL,
          plan_digest TEXT NOT NULL, plan_json TEXT NOT NULL,
          source_json TEXT NOT NULL, source_digest TEXT NOT NULL,
          status TEXT NOT NULL, receipt_json TEXT NOT NULL);"
    ).map_err(|e| e.to_string())
}

fn organization_key(binding: &Binding) -> Result<String, String> {
    digest(&json!({"mission_id":binding.mission_id,"workspace":binding.workspace,
        "actor_id":binding.actor_id}))
}

fn transition_key(binding: &Binding, transition: &str) -> Result<String, String> {
    digest(&json!({"organization":organization_key(binding)?,"transition_id":transition}))
}

fn read_roster(connection: &Connection, binding: &Binding) -> Result<Option<Roster>, String> {
    let row = roster_record(connection, binding)?;
    let Some((raw, expected, version)) = row else { return Ok(None); };
    let roster: Roster = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if digest(&roster)? != expected || roster.version != version {
        return Err("MORPH roster integrity/version conflict".into());
    }
    Ok(Some(roster))
}

fn roster_record(connection: &Connection, binding: &Binding) -> Result<Option<(String, String, u64)>, String> {
    connection.query_row(
        "SELECT roster_json,roster_digest,version FROM rust_protocol_rosters WHERE organization_key=?1",
        [organization_key(binding)?], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional().map_err(|e| e.to_string())
}

pub(crate) fn committed(connection: &Connection, binding: &Binding) -> Result<Roster, String> {
    super::store::current_checked(connection, binding)?;
    let roster = read_roster(connection, binding)?.ok_or("MORPH roster not committed")?;
    roster.validate(binding)?;
    Ok(roster)
}

fn expected_source(tx: &Transaction<'_>, input: (&Binding, &RosterPlan)) -> Result<Option<Roster>, String> {
    let (binding, plan) = input;
    let source = read_roster(tx, binding)?;
    let actual = source.as_ref().map_or(0, |roster| roster.version);
    if actual != plan.expected_version { return Err("MORPH source version CAS conflict".into()); }
    Ok(source)
}

impl Store {
    pub fn roster(&mut self, binding: &Binding) -> Result<Roster, String> {
        self.transaction(binding, |tx| { ensure_schema(tx)?; committed(tx, binding) })
    }

    pub fn ensure_roster(&mut self, binding: &Binding) -> Result<Roster, String> {
        let source = self.transaction(binding, |tx| { ensure_schema(tx)?; read_roster(tx, binding) })?;
        if let Some(roster) = &source {
            if roster.run_id == binding.run_id { return self.roster(binding); }
        }
        let expected_version = source.map_or(0, |roster| roster.version);
        let version = expected_version.checked_add(1).ok_or("MORPH version exhausted")?;
        let plan = RosterPlan { transition_id: format!("{}:pipeline", binding.run_id),
            expected_version, roster: Roster::for_binding(binding, version) };
        self.prepare_roster(binding, &plan)?;
        Ok(self.commit_roster(binding, &plan)?.roster)
    }

    pub fn prepare_roster(&mut self, binding: &Binding, plan: &RosterPlan) -> Result<MorphReceipt, String> {
        plan.validate(binding)?;
        self.transaction(binding, |tx| prepare_transaction(tx, (binding, plan)))
    }

    pub fn commit_roster(&mut self, binding: &Binding, plan: &RosterPlan) -> Result<MorphReceipt, String> {
        plan.validate(binding)?;
        self.transaction(binding, |tx| commit_transaction(tx, (binding, plan)))
    }
}

fn prepare_transaction(tx: &Transaction<'_>, input: (&Binding, &RosterPlan)) -> Result<MorphReceipt, String> {
    let (binding, plan) = input;
    ensure_schema(tx)?;
    if let Some(receipt) = existing(tx, input)? { return Ok(receipt); }
    let source = expected_source(tx, input)?;
    let receipt = make_receipt(binding, (plan, &source), "prepared")?;
    let row = prepared_row(binding, (plan, &source), &receipt)?;
    insert_prepared(tx, row)?;
    record(tx, (binding, &receipt))?;
    Ok(receipt)
}

fn insert_prepared(tx: &Transaction<'_>, row: Vec<String>) -> Result<(), String> {
    tx.execute("INSERT INTO rust_protocol_morph VALUES(?1,?2,?3,?4,?5,?6,'prepared',?7)",
        rusqlite::params_from_iter(row)).map_err(|e| e.to_string())?;
    Ok(())
}

fn prepared_row(binding: &Binding, input: (&RosterPlan, &Option<Roster>), receipt: &MorphReceipt) -> Result<Vec<String>, String> {
    let (plan, source) = input;
    Ok(vec![transition_key(binding, &plan.transition_id)?, digest(binding)?, digest(plan)?,
        serde_json::to_string(plan).map_err(|e| e.to_string())?,
        serde_json::to_string(source).map_err(|e| e.to_string())?, digest(source)?,
        serde_json::to_string(receipt).map_err(|e| e.to_string())?])
}

fn commit_transaction(tx: &Transaction<'_>, input: (&Binding, &RosterPlan)) -> Result<MorphReceipt, String> {
    let (binding, plan) = input;
    ensure_schema(tx)?;
    let prior = existing(tx, input)?.ok_or("MORPH transition not prepared")?;
    if prior.status == "committed" { return Ok(prior); }
    let source = unchanged_source(tx, input, &prior)?;
    let receipt = make_receipt(binding, (plan, &source), "committed")?;
    install_roster(tx, input)?;
    update_decision(tx, (binding, &receipt))?;
    record(tx, (binding, &receipt))?;
    Ok(receipt)
}

fn unchanged_source(tx: &Transaction<'_>, input: (&Binding, &RosterPlan), prior: &MorphReceipt) -> Result<Option<Roster>, String> {
    let source = expected_source(tx, input)?;
    if digest(&source)? != prior.source_digest { return Err("MORPH source snapshot changed".into()); }
    Ok(source)
}

fn update_decision(tx: &Transaction<'_>, input: (&Binding, &MorphReceipt)) -> Result<(), String> {
    let (binding, receipt) = input;
    let changed = tx.execute("UPDATE rust_protocol_morph SET status='committed',receipt_json=?1
         WHERE transition_key=?2 AND status='prepared'",
        params![serde_json::to_string(receipt).map_err(|e| e.to_string())?,
            transition_key(binding, &receipt.transition_id)?],
    ).map_err(|e| e.to_string())?;
    if changed != 1 { return Err("MORPH decision CAS conflict".into()); }
    Ok(())
}

fn existing(tx: &Transaction<'_>, input: (&Binding, &RosterPlan)) -> Result<Option<MorphReceipt>, String> {
    let (binding, plan) = input;
    let prior = decision_record(tx, input)?;
    let Some((owner, fingerprint, raw)) = prior else { return Ok(None); };
    if owner != digest(binding)? || fingerprint != digest(plan)? {
        return Err("MORPH transition idempotency conflict".into());
    }
    let receipt: MorphReceipt = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    validate_receipt(tx, input, &receipt)?;
    Ok(Some(receipt))
}

fn decision_record(tx: &Transaction<'_>, input: (&Binding, &RosterPlan)) -> Result<Option<(String, String, String)>, String> {
    let (binding, plan) = input;
    tx.query_row(
        "SELECT binding_digest,plan_digest,receipt_json FROM rust_protocol_morph WHERE transition_key=?1",
        [transition_key(binding, &plan.transition_id)?], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).optional().map_err(|e| e.to_string())
}

fn validate_receipt(tx: &Transaction<'_>, input: (&Binding, &RosterPlan), receipt: &MorphReceipt) -> Result<(), String> {
    let (binding, plan) = input;
    if !["prepared", "committed"].contains(&receipt.status.as_str()) {
        return Err("MORPH invalid decision status".into());
    }
    let expected = make_receipt(binding, (plan, &source_from_decision(tx, input)?), &receipt.status)?;
    if *receipt != expected { return Err("MORPH receipt integrity conflict".into()); }
    Ok(())
}

fn source_from_decision(tx: &Transaction<'_>, input: (&Binding, &RosterPlan)) -> Result<Option<Roster>, String> {
    let (binding, plan) = input;
    let (raw, fingerprint): (String, String) = tx.query_row(
        "SELECT source_json,source_digest FROM rust_protocol_morph WHERE transition_key=?1",
        [transition_key(binding, &plan.transition_id)?], |row| Ok((row.get(0)?,row.get(1)?)),
    ).map_err(|e| e.to_string())?;
    let source: Option<Roster> = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if digest(&source)? != fingerprint { return Err("MORPH source snapshot integrity conflict".into()); }
    Ok(source)
}

fn make_receipt(binding: &Binding, input: (&RosterPlan, &Option<Roster>), status: &str) -> Result<MorphReceipt, String> {
    let (plan, source) = input;
    let mut receipt = MorphReceipt { transition_id: plan.transition_id.clone(), plan_digest: digest(plan)?,
        source_digest: digest(source)?, target_digest: digest(&plan.roster)?, status: status.into(),
        roster: plan.roster.clone(), receipt_digest: String::new() };
    receipt.receipt_digest = digest(&json!({"profile":"genos.rust.morph/receipt/v1",
        "binding_digest":digest(binding)?,"receipt":receipt}))?;
    Ok(receipt)
}

fn install_roster(tx: &Transaction<'_>, input: (&Binding, &RosterPlan)) -> Result<(), String> {
    let (binding, plan) = input;
    let (key, raw, fingerprint) = roster_values(binding, &plan.roster)?;
    let changed = tx.execute(
        "INSERT INTO rust_protocol_rosters VALUES(?1,?2,?3,?4)
         ON CONFLICT(organization_key) DO UPDATE SET version=excluded.version,
         roster_json=excluded.roster_json,roster_digest=excluded.roster_digest
         WHERE rust_protocol_rosters.version=?5",
        params![key, plan.roster.version, raw, fingerprint, plan.expected_version],
    ).map_err(|e| e.to_string())?;
    if changed != 1 { return Err("MORPH target version CAS conflict".into()); }
    Ok(())
}

fn roster_values(binding: &Binding, roster: &Roster) -> Result<(String, String, String), String> {
    Ok((organization_key(binding)?, serde_json::to_string(roster).map_err(|e| e.to_string())?, digest(roster)?))
}

fn record(tx: &Transaction<'_>, input: (&Binding, &MorphReceipt)) -> Result<(), String> {
    let (binding, receipt) = input;
    let phase = match receipt.status.as_str() {
        "prepared" => "PREPARE",
        "committed" => "COMMIT",
        _ => return Err("MORPH invalid decision status".into()),
    };
    Store::event(tx, binding, Event { protocol: "MORPH", phase,
        payload: serde_json::to_value(receipt).map_err(|e| e.to_string())? })
}
