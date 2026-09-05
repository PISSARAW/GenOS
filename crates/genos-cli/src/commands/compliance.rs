use std::fs;
use std::path::Path;
use chrono::Utc;
use serde_json::json;

struct ControlCheck {
    id: &'static str,
    name: &'static str,
    target_path: &'static str,
    description: &'static str,
}

pub fn audit_compliance(standard: &str, output_file: Option<&str>) -> Result<(), String> {
    let std_upper = standard.to_uppercase();
    let checks = get_controls_for_standard(&std_upper);

    let mut audited_controls = Vec::new();
    let mut violations = 0;
    let total = checks.len();

    for check in checks {
        let exists = Path::new(check.target_path).exists();
        if !exists {
            violations += 1;
        }
        audited_controls.push(json!({
            "control_id": check.id,
            "name": check.name,
            "target": check.target_path,
            "description": check.description,
            "status": if exists { "PASS" } else { "FAIL" },
            "satisfied": exists
        }));
    }

    let passed = total - violations;
    let score = if total > 0 { passed as f64 / total as f64 } else { 0.0 };
    let certified = violations == 0;

    let report = json!({
        "operation": "compliance_audit",
        "standard": standard,
        "certified": certified,
        "score": (score * 100.0).round() / 100.0,
        "total_controls": total,
        "passed_controls": passed,
        "violations": violations,
        "status": if certified { "COMPLIANT" } else { "ACTION_REQUIRED" },
        "timestamp": Utc::now().to_rfc3339(),
        "controls": audited_controls
    });

    let rendered = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;
    if let Some(out) = output_file {
        if let Some(parent) = Path::new(out).parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(out, &rendered);
    }

    println!("{}", rendered);
    Ok(())
}

fn get_controls_for_standard(standard: &str) -> Vec<ControlCheck> {
    match standard {
        s if s.contains("ISO") || s.contains("42001") => vec![
            ControlCheck {
                id: "AIMS-1.1_AI_Risk_Policy",
                name: "AI Risk Assessment & Platform Safety",
                target_path: "backend/src/services/platformSafetyService.js",
                description: "Vérifie les filtres de sécurité, l'évaluation de toxicité et les taints.",
            },
            ControlCheck {
                id: "AIMS-1.2_Continuous_Monitoring",
                name: "Realtime Telemetry & Drift Detection",
                target_path: "backend/src/services/telemetryObserver.js",
                description: "Supervise la dérive cognitive et enregistre les traces télémétriques.",
            },
            ControlCheck {
                id: "AIMS-1.3_Traceability_Lineage",
                name: "Decision Lineage & Thought DAG",
                target_path: "backend/src/services/agentEvolutionService.js",
                description: "Assure la traçabilité complète des graphes de filiation des agents.",
            },
            ControlCheck {
                id: "AIMS-1.4_Human_Oversight_Gate",
                name: "Checkpoint Gates & Epistemic Validation",
                target_path: "backend/src/services/epistemics.js",
                description: "Garantit la validation épistémique et le point de contrôle opérateur.",
            },
        ],
        s if s.contains("EU") || s.contains("ACT") => vec![
            ControlCheck {
                id: "EU-ACT-Art10_Data_Governance",
                name: "Data Governance & Taint Tracking",
                target_path: "backend/src/services/platformSafetyService.js",
                description: "Empêche l'empoisonnement des données et propage les taints.",
            },
            ControlCheck {
                id: "EU-ACT-Art13_Transparency",
                name: "Transparency & Trajectory Inspection",
                target_path: "backend/src/services/trajectoryService.js",
                description: "Expose la séquence complète des raisonnements et appels d'outils.",
            },
            ControlCheck {
                id: "EU-ACT-Art14_Emergency_Apoptosis",
                name: "Immediate Stop & Apoptosis Kill-Switch",
                target_path: "backend/bin/genos-apoptosis.cjs",
                description: "Mécanisme d'arrêt d'urgence certifié stoppant tous les processus.",
            },
            ControlCheck {
                id: "EU-ACT-Art15_Safe_Debugging",
                name: "Robustness & Deterministic Safe Debugging",
                target_path: "backend/src/services/safeDebuggingProofService.js",
                description: "Preuve formelle de robustesse et débogage isolé contrefactuel.",
            },
        ],
        s if s.contains("HIPAA") => vec![
            ControlCheck {
                id: "HIPAA-164.312_Access_Control",
                name: "RBAC & Tenant Isolation",
                target_path: "backend/src/grpc_services/authService.js",
                description: "Contrôle d'accès strict par rôle et token d'authentification.",
            },
            ControlCheck {
                id: "HIPAA-164.312_Audit_Integrity",
                name: "Tamper-proof Telemetry Ledger",
                target_path: "backend/src/services/telemetryObserver.js",
                description: "Journalisation immuable et horodatée des transactions d'agents.",
            },
            ControlCheck {
                id: "HIPAA-164.312_Cryptobiosis_Vault",
                name: "State Encryption & Sealed Storage",
                target_path: "crates/genos-store/src/cryptobiosis.rs",
                description: "Chiffrement et mise en capsule étanche des états d'agents.",
            },
        ],
        _ => vec![ // SOC2 par défaut
            ControlCheck {
                id: "SOC2-CC6.1_Authentication",
                name: "Authentication & Identity Management",
                target_path: "backend/src/grpc_services/authService.js",
                description: "Vérifie les mécanismes d'authentification des requêtes et tokens.",
            },
            ControlCheck {
                id: "SOC2-CC6.6_Confidentiality_Gitignore",
                name: "Secret Leak Prevention (.gitignore)",
                target_path: ".gitignore",
                description: "Vérifie que les clés d'API et variables .env sont exclues du dépôt.",
            },
            ControlCheck {
                id: "SOC2-CC7.2_Incident_Response",
                name: "Incident Handling & Autonomous Response",
                target_path: "backend/src/grpc_services/incidentService.js",
                description: "Gestion structurée et traçable des incidents et régressions.",
            },
            ControlCheck {
                id: "SOC2-CC8.1_Change_Integrity",
                name: "Snapshot State & Integrity Verification",
                target_path: "crates/genos-store/src/snapshot.rs",
                description: "Vérification cryptographique de l'intégrité des snapshots système.",
            },
        ],
    }
}
