//! MISSION : réparer un module défaillant.
//!
//! Un module de calcul a été corrompu par un vecteur viral (la règle `mul`
//! effectue une addition). L'orchestrateur doit : détecter la menace, localiser
//! la règle fautive, mettre la cellule en quarantaine, faire appliquer le patch,
//! faire vérifier la preuve par un pair indépendant, sceller un snapshot signé
//! puis réintégrer la cellule. Le livrable vérifiable : la suite de tests du
//! module passe.

use genos_orchestrator::genos_biology::bioluminescence::FluorophoreColor;
use genos_orchestrator::genos_biology::spore::SporeType;
use genos_orchestrator::genos_cell::AgentCell;
use genos_orchestrator::genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::GenosEcosystem;
use std::collections::BTreeMap;

// --- Le module réparable ---------------------------------------------------

struct Module {
    name: String,
    rules: BTreeMap<String, String>,
}

impl Module {
    fn new() -> Self {
        let mut rules = BTreeMap::new();
        rules.insert("add".to_string(), "a + b".to_string());
        rules.insert("sub".to_string(), "a - b".to_string());
        // CORRUPTION : la multiplication a été remplacée par une addition.
        rules.insert("mul".to_string(), "a + b".to_string());
        Self {
            name: "calc".to_string(),
            rules,
        }
    }

    fn eval(&self, op: &str, a: i64, b: i64) -> Result<i64, String> {
        let rule = self
            .rules
            .get(op)
            .ok_or_else(|| format!("regle absente: {op}"))?;
        eval_expr(rule, a, b)
    }

    fn patch(&mut self, op: &str, expr: &str) -> bool {
        self.rules.insert(op.to_string(), expr.to_string()).is_some()
    }

    fn source(&self) -> String {
        self.rules
            .iter()
            .map(|(k, v)| format!("{k}: {v}"))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn eval_expr(expr: &str, a: i64, b: i64) -> Result<i64, String> {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() != 3 {
        return Err(format!("expression invalide: {expr}"));
    }
    let term = |t: &str| -> Result<i64, String> {
        match t {
            "a" => Ok(a),
            "b" => Ok(b),
            other => other.parse::<i64>().map_err(|e| e.to_string()),
        }
    };
    let (lhs, rhs) = (term(parts[0])?, term(parts[2])?);
    match parts[1] {
        "+" => Ok(lhs + rhs),
        "-" => Ok(lhs - rhs),
        "*" => Ok(lhs * rhs),
        op => Err(format!("operateur inconnu: {op}")),
    }
}

struct Case {
    op: &'static str,
    a: i64,
    b: i64,
    expected: i64,
}

fn suite() -> Vec<Case> {
    vec![
        Case { op: "add", a: 2, b: 3, expected: 5 },
        Case { op: "sub", a: 9, b: 4, expected: 5 },
        Case { op: "mul", a: 3, b: 4, expected: 12 },
        Case { op: "mul", a: 5, b: 5, expected: 25 },
    ]
}

fn run_suite(module: &Module, cases: &[Case]) -> Vec<Result<(), String>> {
    cases
        .iter()
        .map(|c| {
            module.eval(c.op, c.a, c.b).and_then(|got| {
                if got == c.expected {
                    Ok(())
                } else {
                    Err(format!(
                        "{} {} {} => {} (attendu {})",
                        c.op, c.a, c.b, got, c.expected
                    ))
                }
            })
        })
        .collect()
}

fn failing_op(results: &[Result<(), String>]) -> Option<String> {
    results.iter().find(|r| r.is_err()).map(|e| {
        e.as_ref()
            .err()
            .and_then(|m| m.split_whitespace().next())
            .unwrap_or("?")
            .to_string()
    })
}

fn main() {
    println!("=== MISSION : reparer un module defaillant ===\n");

    let mut eco = GenosEcosystem::new("Griot_Prime");
    let cases = suite();
    let mut module = Module::new();

    // 1. Constituer l'équipe de réparation.
    eco.orchestrator.create_tissue("Repair_Bay", "Reparation").unwrap();
    eco.orchestrator.create_tissue("Verification", "Preuves").unwrap();
    let chidi = eco
        .orchestrator
        .add_worker("Repair_Bay", AgentCell::new("Chidi", "logique", "Patcher"))
        .unwrap();
    let zola = eco
        .orchestrator
        .add_worker("Repair_Bay", AgentCell::new("Zola", "resilience", "Guard"))
        .unwrap();
    let nia = eco
        .orchestrator
        .add_worker("Verification", AgentCell::new("Nia", "rigueur", "Verifier"))
        .unwrap();
    eco.orchestrator.delegate_task("Repair_Bay", (chidi, "patcher mul")).unwrap();
    eco.orchestrator.delegate_task("Verification", (nia, "verifier la preuve")).unwrap();
    println!("[1] Equipe : Chidi (patch), Zola (garde), Nia (verificateur)");

    // 2. DIAGNOSTIC : la suite échoue sur la règle corrompue.
    let before = run_suite(&module, &cases);
    let broken = failing_op(&before);
    assert_eq!(broken.as_deref(), Some("mul"), "le diagnostic doit localiser 'mul'");
    println!("[2] Diagnostic : {}/{} tests en echec, regle fautive = 'mul'",
        before.iter().filter(|r| r.is_err()).count(), cases.len());

    // 3. DÉTECTION DE LA MENACE : le vecteur viral a injecté la corruption.
    eco.orchestrator
        .immune_selection
        .detectors
        .push(AntibodyDetector::new("phage", "MODULE_MUL", 0.8));
    let virion = eco.virology.synthesize_bacteriophage("MODULE_MUL", "CORRUPT_MUL");
    let antigen = Antigen {
        id: "corruption-mul".into(),
        epitope: "MODULE_MUL".into(),
        danger_level: 0.9,
    };
    assert!(eco.orchestrator.detect_immune_threat(&antigen));
    assert!(eco.neutralize_virion(virion, 0.9));
    println!("[3] Menace detectee (immunite clonale) et virion neutralise");

    // 4. LOCALISATION : trace stigmergique du point de défaillance.
    eco.deposit_trail("SUSPECT_MUL", 9.0);
    assert_eq!(eco.read_trail("SUSPECT_MUL"), 9.0);
    println!("[4] Localisation : piste 'SUSPECT_MUL' deposee");

    // 5. QUARANTAINE de la cellule porteuse + mise à l'écart du code corrompu.
    let capsule = eco.seal_capsule("corrupt_calc", serde_json::json!({ "source": module.source() }));
    assert!(eco.capsules.get(&capsule).unwrap().verify());
    let spore = eco.orchestrator.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    println!("[5] Quarantaine : code scelle (capsule {capsule}), cellule sporulee");

    // 6. PATCH : application du correctif par Chidi.
    assert!(module.patch("mul", "a * b"));
    println!("[6] Patch applique : 'mul' -> 'a * b'");

    // 7. PREUVE : la suite passe après réparation.
    let after = run_suite(&module, &cases);
    let after_ok = after.iter().all(|r| r.is_ok());
    assert!(after_ok, "la suite doit passer apres le patch");
    println!("[7] Preuve : {}/{} tests verts", after.len(), cases.len());

    // 8. AUDIT anti-collusion : la preuve d'Alice doit être coûteuse ET réelle.
    let cheap = eco.orchestrator.audit_collusion("Verification", ("Nia", 50, true));
    let real = eco.orchestrator.audit_collusion("Verification", ("Nia", 1200, after_ok));
    assert!(cheap.is_err() && real.is_ok());
    println!("[8] Audit : signal trompeur rejete, preuve reelle acceptee");

    // 9. SNAPSHOT signé du module réparé.
    let dir = std::env::temp_dir().join(format!("genos-repair-{}", std::process::id()));
    eco.snapshots.open(dir).unwrap();
    let snap = eco
        .snapshots
        .save("calc", "main", serde_json::json!({
            "snapshot_id": "fix-mul",
            "world_id": "repair",
            "genome": {},
            "state": { "source": module.source(), "tests_passed": after.len() }
        }))
        .unwrap();
    assert!(eco.snapshots.get(&snap).is_some());
    println!("[9] Snapshot signe : {snap}");

    // 10. JOURNALISATION de la preuve + telemetrie.
    eco.record_event("MODULE_REPAIRED", serde_json::json!({
        "module": module.name,
        "rule": "mul",
        "tests": after.len()
    }));
    eco.orchestrator.emit_bioluminescence(
        FluorophoreColor::Green,
        "Nucleus",
        ("REPAIR", "module calc repare"),
    );

    // 11. RÉINTÉGRATION : la cellule en quarantaine revient saine.
    let revived = eco.orchestrator.germinate_spore(spore, (true, true)).unwrap();
    assert_eq!(revived.cell_id, zola);
    assert!(eco.orchestrator.delegate_task("Repair_Bay", (zola, "surveiller")).is_ok());
    println!("[11] Reintegration : cellule {zola} de retour dans Repair_Bay");

    // --- Livrable vérifiable ---
    assert!(after.iter().all(|r| r.is_ok()));
    assert_eq!(eco.read_events(0).len(), 1);
    assert_eq!(module.eval("mul", 6, 7).unwrap(), 42);
    println!("\nRESULTAT FINAL : mul(6,7) = {} (attendu 42)", module.eval("mul", 6, 7).unwrap());
    println!("MISSION ACCOMPLIE : module '{}' repare et prouve", module.name);
}
