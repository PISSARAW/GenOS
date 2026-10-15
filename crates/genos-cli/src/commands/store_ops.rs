use chrono::Utc;
use genos_biology::spore::Spore;
use genos_genome::Genome;
use genos_store::{
    BurialContext, Capsule, CryptobiosisStore, FossilRecord, FossilRegistry, FossilizationMode,
};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

fn get_storage_dir(subdir: &str) -> PathBuf {
    let dir = crate::commands::root_resolver::resolve_matrix_root().join(subdir);
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn handle_cryptobiosis(
    agent_id: &str,
    action: Option<&str>,
    state: Option<&str>
) -> Result<(), String> {
    let act = action.unwrap_or("freeze").to_lowercase();
    let vault_dir = get_storage_dir("vault");
    let file_path = vault_dir.join(format!("{}.json", agent_id));

    match act.as_str() {
        "freeze" => {
            let state_json = match state {
                Some(raw) => serde_json::from_str(raw).unwrap_or_else(|_| {
                    json!({ "agent_id": agent_id, "raw_state": raw })
                }),
                None => json!({ "agent_id": agent_id, "state": "vitrified" }),
            };

            let mut vault = CryptobiosisStore::new();
            let frozen = vault.freeze(agent_id, state_json.clone());
            let capsule = Capsule::create(agent_id, state_json);

            let genome = Genome::new(agent_id);
            let bunker = Spore::create_bacterial_endospore(&genome);

            let record = json!({
                "agent_id": agent_id,
                "state_snapshot": frozen.state_snapshot,
                "frozen_at": frozen.frozen_at,
                "hydration_level": frozen.hydration_level,
                "capsule_id": capsule.capsule_id.to_string(),
                "capsule_hash": capsule.hash,
                "bunker_armor": bunker.bunker_armor,
                "spore_type": format!("{:?}", bunker.spore_type)
            });

            fs::write(&file_path, serde_json::to_string_pretty(&record).unwrap())
                .map_err(|e| format!("Failed to save frozen agent: {}", e))?;

            let output = json!({
                "success": true,
                "operation": "cryptobiosis",
                "action": "freeze",
                "agent_id": agent_id,
                "bunker_armor": bunker.bunker_armor,
                "spore_type": format!("{:?}", bunker.spore_type),
                "capsule_hash": capsule.hash,
                "frozen_at": frozen.frozen_at,
                "hydration_level": frozen.hydration_level,
                "status": "FROZEN_VITRIFIED"
            });
            println!("{}", serde_json::to_string_pretty(&output).unwrap());
            Ok(())
        }
        "thaw" => {
            if !file_path.exists() {
                let output = json!({
                    "success": false,
                    "operation": "cryptobiosis",
                    "action": "thaw",
                    "agent_id": agent_id,
                    "error": "Agent not found in cryptobiosis vault"
                });
                println!("{}", serde_json::to_string_pretty(&output).unwrap());
                return Ok(());
            }

            let content = fs::read_to_string(&file_path)
                .map_err(|e| format!("Failed to read frozen agent: {}", e))?;
            let record: serde_json::Value = serde_json::from_str(&content)
                .map_err(|e| format!("Corrupt cryptobiosis record: {}", e))?;
            let _ = fs::remove_file(&file_path);

            let output = json!({
                "success": true,
                "operation": "cryptobiosis",
                "action": "thaw",
                "agent_id": agent_id,
                "hydration_level": 1.0,
                "thawed_at": Utc::now().to_rfc3339(),
                "state_snapshot": record.get("state_snapshot").cloned().unwrap_or(json!({})),
                "capsule_hash": record.get("capsule_hash").and_then(|v| v.as_str()).unwrap_or(""),
                "status": "RESUSCITATED"
            });
            println!("{}", serde_json::to_string_pretty(&output).unwrap());
            Ok(())
        }
        "status" => {
            let exists = file_path.exists();
            let output = json!({
                "success": true,
                "operation": "cryptobiosis",
                "action": "status",
                "agent_id": agent_id,
                "is_dormant": exists,
                "hydration_level": if exists { 0.0 } else { 1.0 },
                "status": if exists { "DORMANT_FROZEN" } else { "ACTIVE" }
            });
            println!("{}", serde_json::to_string_pretty(&output).unwrap());
            Ok(())
        }
        _ => Err(format!("Unknown cryptobiosis action: {}", act)),
    }
}

pub fn handle_fossil_record(
    lineage_id: &str,
    reason: &str,
    mode: Option<&str>
) -> Result<(), String> {
    handle_fossil_record_at(
        &crate::commands::root_resolver::resolve_matrix_root(),
        FossilRecordRequest { lineage_id, reason, mode },
    )
}

pub(crate) struct FossilRecordRequest<'a> {
    pub(crate) lineage_id: &'a str,
    pub(crate) reason: &'a str,
    pub(crate) mode: Option<&'a str>,
}

pub(crate) fn handle_fossil_record_at(root: &std::path::Path, request: FossilRecordRequest<'_>) -> Result<(), String> {
    let FossilRecordRequest { lineage_id, reason, mode } = request;
    let mut ctx = BurialContext::new(lineage_id, reason);
    if let Some(label) = mode {
        ctx.mode = FossilizationMode::from_label(label);
    }

    let mut registry = FossilRegistry::new();
    let fossil = registry.bury(ctx);

    let fossil_dir = root.join("fossils");
    fs::create_dir_all(&fossil_dir).map_err(|e| format!("Failed to create fossil archive: {}", e))?;
    let file_path = fossil_dir.join(format!("{}_{}.json", lineage_id, fossil.fossil_id));

    let mut record = serde_json::to_value(&fossil)
        .map_err(|e| format!("Failed to serialize fossil: {}", e))?;
    if let Some(obj) = record.as_object_mut() {
        obj.insert("stratum".to_string(), json!("STRATIGRAPHIC_FOSSIL"));
    }

    fs::write(&file_path, serde_json::to_string_pretty(&record).unwrap())
        .map_err(|e| format!("Failed to record stratigraphic fossil: {}", e))?;

    let mut output = record;
    if let Some(obj) = output.as_object_mut() {
        obj.insert("success".to_string(), json!(true));
        obj.insert("operation".to_string(), json!("fossil_record"));
    }
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

fn load_fossils() -> Result<Vec<FossilRecord>, String> {
    Ok(load_fossil_documents(None)?.into_iter().map(|(record, _)| record).collect())
}

fn provenance_status(record: &FossilRecord) -> Result<&'static str, String> {
    match (record.source_event_id.is_some(), record.source_event_hash.is_some()) {
        (false, false) => Ok("legacy_unprovenanced"),
        (true, true) => Ok("source_event_attested_by_backend"),
        _ => Err(format!("Incomplete source-event provenance in fossil {}", record.fossil_id)),
    }
}

fn load_fossil_documents(target_fossil_id: Option<&str>) -> Result<Vec<(FossilRecord, serde_json::Value)>, String> {
    let fossil_dir = get_storage_dir("fossils");
    load_fossil_documents_from(&fossil_dir, target_fossil_id)
}

pub(crate) fn load_fossil_documents_from(
    fossil_dir: &std::path::Path,
    target_fossil_id: Option<&str>,
) -> Result<Vec<(FossilRecord, serde_json::Value)>, String> {
    load_fossil_documents_with_retired_signers(fossil_dir, target_fossil_id, false)
}

fn load_fossil_documents_with_retired_signers(
    fossil_dir: &std::path::Path,
    target_fossil_id: Option<&str>,
    allow_untrusted_signers: bool,
) -> Result<Vec<(FossilRecord, serde_json::Value)>, String> {
    let mut documents = Vec::new();
    let entries = match fs::read_dir(fossil_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(documents),
        Err(error) => return Err(format!("Failed to read fossil archive {}: {}", fossil_dir.display(), error)),
    };
    for entry in entries {
        let path = entry.map_err(|error| format!("Failed to enumerate fossil archive {}: {}", fossil_dir.display(), error))?.path();
        if let Some(document) = load_fossil_candidate(&path, target_fossil_id, allow_untrusted_signers)? {
            documents.push(document);
        }
    }
    Ok(documents)
}

fn load_fossil_candidate(
    path: &std::path::Path,
    target_fossil_id: Option<&str>,
    allow_untrusted_signers: bool,
) -> Result<Option<(FossilRecord, serde_json::Value)>, String> {
    if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
        return Ok(None);
    }
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read fossil candidate {}: {}", path.display(), error))?;
    let value = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("Invalid fossil candidate {}: {}", path.display(), error))?;
    if target_fossil_id.is_some_and(|target| value.get("fossil_id").and_then(serde_json::Value::as_str) != Some(target)) {
        return Ok(None);
    }
    let record = serde_json::from_value::<FossilRecord>(value.clone())
        .map_err(|error| format!("Invalid fossil candidate {}: {}", path.display(), error))?;
    if !record.verify_integrity() { return Err(format!("Fossil candidate integrity check failed: {}", path.display())); }
    verify_fossil_candidate_provenance(path, &value, allow_untrusted_signers)?;
    Ok(Some((record, value)))
}

fn verify_fossil_candidate_provenance(
    path: &std::path::Path,
    value: &serde_json::Value,
    allow_untrusted_signers: bool,
) -> Result<(), String> {
    let verification = super::fossil_attestation::verify_backend_attestation_status(value)
        .map_err(|error| format!("Fossil provenance verification failed: {} ({error})", path.display()))?;
    if verification == super::fossil_attestation::BackendAttestationStatus::SignerNotTrusted
        && !allow_untrusted_signers {
        return Err(format!("Fossil provenance verification failed: {} (Unknown backend fossil signer)", path.display()));
    }
    Ok(())
}

pub fn handle_fossil_strata() -> Result<(), String> {
    let registry = FossilRegistry::from_records(load_fossils()?);
    let strata = registry.strata();
    let output = json!({
        "success": true,
        "operation": "fossil_strata",
        "total_strata": strata.len(),
        "strata": strata,
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub fn handle_fossil_excavate(fossil_id: &str) -> Result<(), String> {
    let records = load_fossil_documents(Some(fossil_id))?
        .into_iter().map(|(record, _)| record).collect();
    let registry = FossilRegistry::from_records(records);
    let id = uuid::Uuid::parse_str(fossil_id)
        .map_err(|e| format!("Invalid fossil id '{}': {}", fossil_id, e))?;

    let output = match registry.excavate_result(&id) {
        Ok(specimen) => json!({
            "success": true,
            "operation": "fossil_excavate",
            "read_only": true,
            "resurrection": "forbidden",
            "provenance_status": provenance_status(&specimen.record)?,
            "specimen": specimen,
        }),
        Err(e) => json!({
            "success": false,
            "operation": "fossil_excavate",
            "fossil_id": fossil_id,
            "error": e.message(),
        }),
    };
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub fn handle_fossil_decode(fossil_id: &str) -> Result<(), String> {
    let records = load_fossil_documents(Some(fossil_id))?
        .into_iter().map(|(record, _)| record).collect();
    let registry = FossilRegistry::from_records(records);
    let id = uuid::Uuid::parse_str(fossil_id)
        .map_err(|e| format!("Invalid fossil id '{}': {}", fossil_id, e))?;

    let output = match registry.find(&id) {
        Some(record) => json!({
            "success": true,
            "operation": "fossil_decode",
            "fossil_id": record.fossil_id.to_string(),
            "extinct_lineage_id": record.extinct_lineage_id,
            "provenance_status": provenance_status(record)?,
            "reading": record.reading(),
            "phenotype_markers": record.phenotype_markers,
        }),
        None => json!({
            "success": false,
            "operation": "fossil_decode",
            "fossil_id": fossil_id,
            "error": "Fossil not found in stratigraphic registry.",
        }),
    };
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub fn handle_fossil_list() -> Result<(), String> {
    handle_fossil_list_at(&crate::commands::root_resolver::resolve_matrix_root())
}

pub(crate) fn handle_fossil_list_at(root: &std::path::Path) -> Result<(), String> {
    let documents = load_fossil_documents_with_retired_signers(&root.join("fossils"), None, true)?;
    let mut verification_complete = true;
    let fossils = documents.into_iter().map(|(record, value)| {
        let (attestation_status, source_status) = match super::fossil_attestation::verify_backend_attestation_status(&value)? {
            super::fossil_attestation::BackendAttestationStatus::Verified => {
                ("verified", "source_event_attested_by_backend")
            }
            super::fossil_attestation::BackendAttestationStatus::Unprovenanced => {
                ("legacy_unprovenanced", "legacy_unprovenanced")
            }
            super::fossil_attestation::BackendAttestationStatus::SignerNotTrusted => {
                verification_complete = false;
                ("signer_not_trusted", "source_event_present_unverified_signer")
            }
        };
        Ok(json!({
            "provenance_status": source_status,
            "authenticity_status": attestation_status,
            "record": value,
        }))
    }).collect::<Result<Vec<_>, String>>()?;

    let output = json!({
        "success": true,
        "operation": "fossil_list",
        "verification_complete": verification_complete,
        "total_fossils": fossils.len(),
        "fossils": fossils
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}
