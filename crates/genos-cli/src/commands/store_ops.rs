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
    let mut ctx = BurialContext::new(lineage_id, reason);
    if let Some(label) = mode {
        ctx.mode = FossilizationMode::from_label(label);
    }

    let mut registry = FossilRegistry::new();
    let fossil = registry.bury(ctx);

    let fossil_dir = get_storage_dir("fossils");
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

fn load_fossils() -> Vec<FossilRecord> {
    let fossil_dir = get_storage_dir("fossils");
    let mut fossils = Vec::new();
    if let Ok(entries) = fs::read_dir(&fossil_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(record) = serde_json::from_str::<FossilRecord>(&content) {
                    fossils.push(record);
                }
            }
        }
    }
    fossils
}

pub fn handle_fossil_strata() -> Result<(), String> {
    let registry = FossilRegistry::from_records(load_fossils());
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
    let registry = FossilRegistry::from_records(load_fossils());
    let id = uuid::Uuid::parse_str(fossil_id)
        .map_err(|e| format!("Invalid fossil id '{}': {}", fossil_id, e))?;

    let output = match registry.excavate(&id) {
        Some(specimen) => json!({
            "success": true,
            "operation": "fossil_excavate",
            "read_only": true,
            "resurrection": "forbidden",
            "specimen": specimen,
        }),
        None => json!({
            "success": false,
            "operation": "fossil_excavate",
            "fossil_id": fossil_id,
            "error": "Fossil not found in stratigraphic registry.",
        }),
    };
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

pub fn handle_fossil_decode(fossil_id: &str) -> Result<(), String> {
    let registry = FossilRegistry::from_records(load_fossils());
    let id = uuid::Uuid::parse_str(fossil_id)
        .map_err(|e| format!("Invalid fossil id '{}': {}", fossil_id, e))?;

    let output = match registry.find(&id) {
        Some(record) => json!({
            "success": true,
            "operation": "fossil_decode",
            "fossil_id": record.fossil_id.to_string(),
            "extinct_lineage_id": record.extinct_lineage_id,
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
    let fossil_dir = get_storage_dir("fossils");
    let mut fossils: Vec<serde_json::Value> = Vec::new();

    if let Ok(entries) = fs::read_dir(&fossil_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(record) = serde_json::from_str::<serde_json::Value>(&content) {
                        fossils.push(record);
                    }
                }
            }
        }
    }

    let output = json!({
        "success": true,
        "operation": "fossil_list",
        "total_fossils": fossils.len(),
        "fossils": fossils
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}
