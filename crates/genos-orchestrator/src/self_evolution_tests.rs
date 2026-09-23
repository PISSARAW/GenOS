use super::*;

#[test]
fn all_strates_active_is_viable_in_hostile_env() {
    // L'agent prescrit (toutes strates) survit : le design de référence tient.
    let f = survival_fitness(&[1.0; 7], &EnvironmentKind::Hostile, 30);
    assert!(f > 0.0, "prescribed agent must survive, got {f}");
}

#[test]
fn empty_self_dies_or_underperforms_in_hostile_env() {
    // Aucune strate : coût nul mais aucun bénéfice → performance quasi nulle.
    let empty = survival_fitness(&[0.0; 7], &EnvironmentKind::Hostile, 30);
    let full = survival_fitness(&[1.0; 7], &EnvironmentKind::Hostile, 30);
    assert!(
        full > empty,
        "full self must outperform empty self in hostile env: {full} vs {empty}"
    );
}

#[test]
fn over_activation_can_kill_by_metabolic_cost() {
    // Toutes strates à fond dans un environnement prévisible : le coût
    // métabolique dépasse le bénéfice → mort métabolique (fitness pénalisée).
    let predictable = survival_fitness(&[1.0; 7], &EnvironmentKind::Predictable, 60);
    let hostile = survival_fitness(&[1.0; 7], &EnvironmentKind::Hostile, 60);
    // En prévisible, les strates ne rapportent presque rien : la fitness
    // doit être nettement plus basse qu'en hostile (où elles payent).
    assert!(
        hostile > predictable,
        "hostile must reward strata more than predictable: {hostile} vs {predictable}"
    );
}

#[test]
fn evolution_selects_strata_in_hostile_env() {
    let report = evolve_self_strata(&EnvironmentKind::Hostile, 40, 42);
    // Après 40 générations, au moins une strate doit être sélectionnée
    // (interoception/homeostasis attendues d'après le profil de bénéfices).
    assert!(
        !report.selected_strata.is_empty(),
        "evolution must select strata in hostile env: {:?}",
        report.mean_activation
    );
}

#[test]
fn evolution_rejects_costly_strata_in_predictable_env() {
    let report = evolve_self_strata(&EnvironmentKind::Predictable, 40, 42);
    // En prévisible, les strates coûteuses doivent être désactivées.
    assert!(
        !report.rejected_strata.is_empty(),
        "evolution must reject costly strata in predictable env: {:?}",
        report.mean_activation
    );
}

#[test]
fn deceptive_env_selects_agency() {
    let report = evolve_self_strata(&EnvironmentKind::Deceptive, 40, 42);
    let agency = report
        .mean_activation
        .iter()
        .find(|(name, _)| name == "agency")
        .map(|(_, v)| *v)
        .unwrap_or(0.0);
    // Le comparateur d'agency a le bénéfice le plus élevé en trompeur.
    assert!(
        agency > 0.3,
        "deceptive env must select agency comparator, got {agency}"
    );
}

#[test]
fn reports_are_deterministic_per_seed() {
    let a = evolve_self_strata(&EnvironmentKind::Volatile, 20, 7);
    let b = evolve_self_strata(&EnvironmentKind::Volatile, 20, 7);
    assert_eq!(a.mean_fitness, b.mean_fitness);
    assert_eq!(a.mean_activation, b.mean_activation);
}

#[test]
fn full_experiment_runs_all_environments() {
    let reports = run_self_evolution_experiment(&[1, 2]);
    assert_eq!(reports.len(), 8); // 4 environnements × 2 seeds
    assert!(reports.iter().all(|r| r.mean_activation.len() == 7));
}
