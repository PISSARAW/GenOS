use genos_orchestrator::{Candidate, Demand, GenosEcosystem, RecruitmentPlanner};

fn cand(id: &str, role: &str, caps: &[&str], proven: &[&str], cost: f64) -> Candidate {
    Candidate {
        id: id.to_string(),
        role: role.to_string(),
        capabilities: caps.iter().map(|s| s.to_string()).collect(),
        proven: proven.iter().map(|s| s.to_string()).collect(),
        cost,
    }
}

#[test]
fn licence_recruits_one_agent_per_required_role() {
    let cands = vec![
        cand("CnidocyteGuard", "sentinel", &["interception"], &["interception"], 10.0),
        cand("GuardCellThrottler", "regulator", &["throttle"], &["throttle"], 10.0),
        cand("Noise", "worker", &["misc"], &["misc"], 1.0),
    ];
    let demand = Demand {
        roles: vec!["sentinel".into(), "regulator".into()],
        capabilities: vec![],
        budget: 100.0,
    };
    let decision = RecruitmentPlanner::new(8, 0.25).plan(&demand, &cands);
    assert!(decision.feasible, "recrutement par role doit etre faisable");
    assert_eq!(decision.selected.len(), 2);
    let roles: Vec<&str> = decision.selected.iter().map(|s| s.role.as_str()).collect();
    assert!(roles.contains(&"sentinel") && roles.contains(&"regulator"));

    // L'orchestrateur exécute la décision : tissu créé + 2 cellules.
    let mut eco = GenosEcosystem::new("Overmind");
    let executed = eco.recruit("Biome", &demand, &cands);
    assert!(executed.feasible);
    assert_eq!(
        eco.orchestrator.tissues.get("Biome").unwrap().somatic_cells.len(),
        2
    );
}

#[test]
fn master_covers_capabilities_and_prefers_trusted_candidates() {
    let cands = vec![
        cand("Trusted", "analyst", &["parse", "verify"], &["parse", "verify"], 20.0),
        cand("Weak", "analyst", &["parse", "verify"], &["parse"], 5.0),
        cand("Solver", "solver", &["verify"], &["verify"], 8.0),
    ];
    let demand = Demand {
        roles: vec![],
        capabilities: vec!["parse".into(), "verify".into()],
        budget: 100.0,
    };
    let decision = RecruitmentPlanner::new(8, 0.25).plan(&demand, &cands);
    assert!(decision.feasible);
    // Trusted (trust 1.0) couvre parse ET verify : un seul recrutement suffit.
    assert_eq!(decision.selected.len(), 1);
    assert_eq!(decision.selected[0].candidate, "Trusted");
    assert!(decision.selected[0].score > decision.selected[0].cost * 0.1);
}

#[test]
fn doctorat_refuses_on_budget_and_rejects_impostors() {
    let cands = vec![
        cand("Impostor", "sentinel", &["interception"], &[], 1.0),
        cand("Expensive", "sentinel", &["interception"], &["interception"], 500.0),
    ];
    let demand = Demand {
        roles: vec!["sentinel".into()],
        capabilities: vec![],
        budget: 100.0,
    };
    let decision = RecruitmentPlanner::new(8, 0.25).plan(&demand, &cands);
    assert!(!decision.feasible, "budget insuffisant => infaisable");
    assert!(decision.selected.is_empty());
    assert!(decision
        .rejected
        .iter()
        .any(|(id, reason)| id == "Impostor" && reason.contains("imposteur")));
    assert!(decision
        .rejected
        .iter()
        .any(|(_, reason)| reason.contains("budget insuffisant")));
}
