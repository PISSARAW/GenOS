use genos_orchestrator::{Candidate, Demand, GenosEcosystem, RecruitRequest, RecruitmentPlanner};

/// Paramètres de construction d'un candidat (limite de 3 paramètres).
struct CandInput<'a> {
    id: &'a str,
    role: &'a str,
    caps: &'a [&'a str],
    proven: &'a [&'a str],
    cost: f64,
}

fn cand(input: CandInput<'_>) -> Candidate {
    Candidate {
        id: input.id.to_string(),
        role: input.role.to_string(),
        capabilities: input.caps.iter().map(|s| s.to_string()).collect(),
        proven: input.proven.iter().map(|s| s.to_string()).collect(),
        cost: input.cost,
    }
}

#[test]
fn licence_recruits_one_agent_per_required_role() {
    let cands = vec![
        cand(CandInput { id: "CnidocyteGuard", role: "sentinel", caps: &["interception"], proven: &["interception"], cost: 10.0 }),
        cand(CandInput { id: "GuardCellThrottler", role: "regulator", caps: &["throttle"], proven: &["throttle"], cost: 10.0 }),
        cand(CandInput { id: "Noise", role: "worker", caps: &["misc"], proven: &["misc"], cost: 1.0 }),
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
    let executed = eco.recruit(RecruitRequest { tissue: "Biome", demand: &demand, candidates: &cands });
    assert!(executed.feasible);
    assert_eq!(
        eco.orchestrator.tissues.get("Biome").unwrap().somatic_cells.len(),
        2
    );
}

#[test]
fn master_covers_capabilities_and_prefers_trusted_candidates() {
    let cands = vec![
        cand(CandInput { id: "Trusted", role: "analyst", caps: &["parse", "verify"], proven: &["parse", "verify"], cost: 20.0 }),
        cand(CandInput { id: "Weak", role: "analyst", caps: &["parse", "verify"], proven: &["parse"], cost: 5.0 }),
        cand(CandInput { id: "Solver", role: "solver", caps: &["verify"], proven: &["verify"], cost: 8.0 }),
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
        cand(CandInput { id: "Impostor", role: "sentinel", caps: &["interception"], proven: &[], cost: 1.0 }),
        cand(CandInput { id: "Expensive", role: "sentinel", caps: &["interception"], proven: &["interception"], cost: 500.0 }),
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
