use crate::{command_error, cargo_program};
use crate::commands::recovery::RecoveryCommands;
use sha2::{Digest, Sha256};

pub fn handle_recovery(cmd: &RecoveryCommands, yes: bool) {
    match cmd {
        RecoveryCommands::Rehydrate {
            dry_run,
            execute,
            from_checkpoint,
            wal_path,
            checkpoint_path,
            store_dir,
        } => {
            handle_recover(
                *dry_run,
                *execute,
                *from_checkpoint,
                wal_path,
                checkpoint_path,
                store_dir,
                yes,
            );
        }
        RecoveryCommands::WalStatus {
            wal_path,
            checkpoint_path,
        } => {
            handle_status(wal_path, checkpoint_path);
        }
        RecoveryCommands::Truncate {
            before_seq,
            wal_path,
        } => {
            handle_truncate(*before_seq, wal_path, yes);
        }
    }
}

fn handle_recover(
    dry_run: bool,
    execute: bool,
    from_checkpoint: Option<u64>,
    wal_path: &str,
    checkpoint_path: &str,
    store_dir: &str,
    yes: bool,
) {
    println!("🔄 GenOS Orchestration Recovery");
    println!("================================");
    println!("Store directory: {}", store_dir);
    println!("WAL path: {}", wal_path);
    println!("Checkpoint path: {}", checkpoint_path);
    println!();

    if !std::path::Path::new(checkpoint_path).exists() {
        command_error(&format!("Checkpoint file not found: {}", checkpoint_path));
    }

    if !std::path::Path::new(wal_path).exists() {
        command_error(&format!("WAL file not found: {}", wal_path));
    }

    // Load checkpoint
    let checkpoint_content = std::fs::read_to_string(checkpoint_path)
        .unwrap_or_else(|e| command_error(&format!("Failed to read checkpoint: {}", e)));

    let checkpoint: serde_json::Value = serde_json::from_str(&checkpoint_content)
        .unwrap_or_else(|e| command_error(&format!("Invalid checkpoint JSON: {}", e)));

    let checkpoint_seq = checkpoint.get("seq_id").and_then(|v| v.as_u64()).unwrap_or(0);
    let timestamp = checkpoint.get("timestamp").and_then(|v| v.as_str()).unwrap_or("unknown");

    println!("📋 Checkpoint trouvé:");
    println!("   Séquence: {}", checkpoint_seq);
    println!("   Timestamp: {}", timestamp);
    println!("   Barrières actives: {}", checkpoint.get("active_barriers").map(|v| v.as_array().unwrap_or(&vec![]).len()).unwrap_or(0));
    println!("   Promesses actives: {}", checkpoint.get("active_promises").map(|v| v.as_array().unwrap_or(&vec![]).len()).unwrap_or(0));
    println!("   Processus actifs: {}", checkpoint.get("active_processes").map(|v| v.as_array().unwrap_or(&vec![]).len()).unwrap_or(0));
    println!();

    // Read WAL
    let wal_content = std::fs::read_to_string(wal_path)
        .unwrap_or_else(|e| command_error(&format!("Failed to read WAL: {}", e)));

    let wal_entries: Vec<serde_json::Value> = wal_content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();

    let from_seq = from_checkpoint.unwrap_or(checkpoint_seq);
    let entries_to_replay: Vec<_> = wal_entries
        .iter()
        .filter(|e| e.get("seq_id").and_then(|v| v.as_u64()).unwrap_or(0) > from_seq)
        .collect();

    println!("📖 WAL lu:");
    println!("   Total entrées: {}", wal_entries.len());
    println!("   Entrées à rejouer (après seq {}): {}", from_seq, entries_to_replay.len());
    println!();

    if entries_to_replay.is_empty() {
        println!("✅ Aucune entrée à rejouer. L'état est déjà à jour.");
        return;
    }

    // Show recovery plan
    println!("📋 Plan de récupération:");
    for entry in &entries_to_replay {
        let seq = entry.get("seq_id").and_then(|v| v.as_u64()).unwrap_or(0);
        let entry_type = entry.get("entry_type").and_then(|v| v.as_str()).unwrap_or("unknown");
        let timestamp = entry.get("timestamp").and_then(|v| v.as_str()).unwrap_or("unknown");
        println!("   [{}] {} @ {}", seq, entry_type, timestamp);
    }
    println!();

    if dry_run && !execute {
        println!("🔍 Mode DRY-RUN: Aucun changement appliqué.");
        println!("   Pour exécuter: g recover --execute --yes");
        return;
    }

    if execute && !yes {
        command_error("L'option --yes est requise pour confirmer l'exécution de la récupération");
    }

    println!("⚡ Exécution de la récupération...");

    // Call the native genos-cli recover command
    let mut args: Vec<String> = vec!["run".into(), "-q".into(), "-p".into(), "genos-cli".into(), "--".into(), "recover".into()];
    if let Some(seq) = from_checkpoint {
        args.push("--from-checkpoint".into());
        args.push(seq.to_string());
    }
    args.push("--wal-path".into());
    args.push(wal_path.into());
    args.push("--checkpoint-path".into());
    args.push(checkpoint_path.into());
    args.push("--store-dir".into());
    args.push(store_dir.into());

    let status = std::process::Command::new(cargo_program())
        .args(&args)
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("✅ Récupération terminée avec succès.");
        }
        Ok(s) => {
            command_error(&format!("Échec de la récupération (code {})", s.code().unwrap_or(1)));
        }
        Err(e) => {
            command_error(&format!("Impossible d'exécuter la récupération: {}", e));
        }
    }
}

fn handle_status(wal_path: &str, checkpoint_path: &str) {
    println!("📊 Statut de récupération GenOS");
    println!("===============================");
    println!();

    // Check checkpoint
    if std::path::Path::new(checkpoint_path).exists() {
        let content = std::fs::read_to_string(checkpoint_path)
            .unwrap_or_else(|e| command_error(&format!("Failed to read checkpoint: {}", e)));

        let checkpoint: serde_json::Value = serde_json::from_str(&content)
            .unwrap_or_else(|e| command_error(&format!("Invalid checkpoint JSON: {}", e)));

        let seq = checkpoint.get("seq_id").and_then(|v| v.as_u64()).unwrap_or(0);
        let timestamp = checkpoint.get("timestamp").and_then(|v| v.as_str()).unwrap_or("unknown");
        let barriers = checkpoint.get("active_barriers").map(|v| v.as_array().unwrap_or(&vec![]).len()).unwrap_or(0);
        let promises = checkpoint.get("active_promises").map(|v| v.as_array().unwrap_or(&vec![]).len()).unwrap_or(0);
        let processes = checkpoint.get("active_processes").map(|v| v.as_array().unwrap_or(&vec![]).len()).unwrap_or(0);

        println!("✅ Checkpoint valide:");
        println!("   Séquence: {}", seq);
        println!("   Timestamp: {}", timestamp);
        println!("   Barrières: {}", barriers);
        println!("   Promesses: {}", promises);
        println!("   Processus: {}", processes);
    } else {
        println!("❌ Checkpoint non trouvé: {}", checkpoint_path);
    }
    println!();

    // Check WAL
    if std::path::Path::new(wal_path).exists() {
        let content = std::fs::read_to_string(wal_path)
            .unwrap_or_else(|e| command_error(&format!("Failed to read WAL: {}", e)));

        let entries: Vec<serde_json::Value> = content
            .lines()
            .filter(|l| !l.trim().is_empty())
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect();

        let mut type_counts = std::collections::HashMap::new();
        let mut last_seq = 0u64;
        let mut integrity_ok = true;

        for entry in &entries {
            let seq = entry.get("seq_id").and_then(|v| v.as_u64()).unwrap_or(0);
            last_seq = last_seq.max(seq);

            let entry_type = entry.get("entry_type").and_then(|v| v.as_str()).unwrap_or("unknown");
            *type_counts.entry(entry_type).or_insert(0) += 1;

            // Verify hash
            if let (Some(payload), Some(payload_hash)) = (
                entry.get("payload"),
                entry.get("payload_hash").and_then(|v| v.as_str())
            ) {
                let payload_str = serde_json::to_string(payload).unwrap_or_default();
                let computed = Sha256::digest(payload_str.as_bytes());
                let computed_hash = hex::encode(computed);
                if computed_hash != payload_hash {
                    integrity_ok = false;
                    println!("⚠️  Hash mismatch at seq {}", seq);
                }
            }
        }

        println!("✅ WAL accessible:");
        println!("   Total entrées: {}", entries.len());
        println!("   Dernière séquence: {}", last_seq);
        println!("   Intégrité cryptographique: {}", if integrity_ok { "VALIDE ✅" } else { "COMPROMISE ❌" });
        println!("   Répartition par type:");
        for (t, count) in type_counts {
            println!("     {}: {}", t, count);
        }
    } else {
        println!("❌ WAL non trouvé: {}", wal_path);
    }
}

fn handle_truncate(before_seq: u64, wal_path: &str, yes: bool) {
    if !yes {
        command_error("L'option --yes est requise pour confirmer le tronquage du WAL (opération destructrice)");
    }

    println!("⚠️  Tronquage du WAL avant la séquence {}", before_seq);
    println!("   Fichier: {}", wal_path);
    println!("   Cette opération est IRRÉVERSIBLE.");
    println!();

    // Use the native CLI to truncate
    let before_seq_str = before_seq.to_string();
    let status = std::process::Command::new(cargo_program())
        .args([
            "run", "-q", "-p", "genos-cli", "--",
            "recover", "truncate",
            "--before-seq", &before_seq_str,
            "--wal-path", wal_path,
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("✅ WAL tronqué avec succès.");
        }
        Ok(s) => {
            command_error(&format!("Échec du tronquage (code {})", s.code().unwrap_or(1)));
        }
        Err(e) => {
            command_error(&format!("Impossible d'exécuter le tronquage: {}", e));
        }
    }
}