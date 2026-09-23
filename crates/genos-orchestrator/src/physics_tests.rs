use super::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_bas_active_le_regime_de_conservation() {
        let state = WorldState { budget: 5.0, ..Default::default() };
        let phys = PhysicalState::derive(&state, None);
        assert_eq!(determine_regime(&state, &phys), Regime::Conservation);
    }

    #[test]
    fn menace_et_maladie_elevent_le_risque_de_rupture_jusqu_a_la_revue_humaine() {
        let state = WorldState { threat: 1.0, diseased: 5, stress: 1.0, ..Default::default() };
        let phys = PhysicalState::derive(&state, None);
        assert!(phys.rupture_risk > RUPTURE_REVIEW_THRESHOLD);
        assert_eq!(determine_regime(&state, &phys), Regime::HumanReview);
    }

    #[test]
    fn inertie_haute_augmente_le_seuil_de_pivot() {
        let calm = PhysicalState { inertia: 0.9, pressure: 0.0, ..Default::default() };
        let agile = PhysicalState { inertia: 0.1, pressure: 0.0, ..Default::default() };
        assert!(inertia_threshold(&calm, 0.5) > inertia_threshold(&agile, 0.5));
    }

    #[test]
    fn pression_forte_reduit_le_seuil_de_pivot() {
        let phys = PhysicalState { inertia: 0.5, pressure: 0.9, ..Default::default() };
        let base = PhysicalState { inertia: 0.5, pressure: 0.0, ..Default::default() };
        assert!(inertia_threshold(&phys, 0.5) < inertia_threshold(&base, 0.5));
    }

    #[test]
    fn action_lourde_et_risquee_a_une_utilite_penalisee_par_le_risque_de_rupture() {
        let profile = action_profile(Concept::Kill);
        let calm = PhysicalState::default();
        let crise = PhysicalState { rupture_risk: 0.9, friction: 0.8, entropy: 0.7, ..Default::default() };
        let calm_score = utility_score(&UtilityInputs { expected_gain: 1.0, profile: &profile, phys: &calm });
        let crise_score = utility_score(&UtilityInputs { expected_gain: 1.0, profile: &profile, phys: &crise });
        assert!(crise_score < calm_score);
    }

    #[test]
    fn action_legere_reste_avantageuse_meme_en_crise() {
        let profile = action_profile(Concept::Observe);
        let crise = PhysicalState { rupture_risk: 0.9, friction: 0.8, entropy: 0.7, ..Default::default() };
        let score = utility_score(&UtilityInputs { expected_gain: 0.5, profile: &profile, phys: &crise });
        assert!(score > 0.0);
    }

    #[test]
    fn fichier_schema_est_classe_cristal_et_exige_preuve_forte() {
        let material = classify_material("backend/src/db/schema.js");
        assert_eq!(material, Material::Crystal);
        assert!(material.required_evidence() >= 0.9);
    }

    #[test]
    fn fichier_de_log_est_du_sediment_peu_exigeant() {
        let material = classify_material("backend/logs/trace.log");
        assert_eq!(material, Material::Sediment);
        assert!(material.required_evidence() < Material::Crystal.required_evidence());
    }

    #[test]
    fn regime_de_consolidation_bloque_toute_expansion() {
        let state = WorldState { stress: 1.0, dissonance: 1.0, failure_rate: 1.0, ..Default::default() };
        let phys = PhysicalState::derive(&state, None);
        let goal = Goal::Explore;
        let director = Director::new();
        let ctx = DecisionContext { state: &state, goal: &goal, phys: &phys, previous_strategy: None };
        let decision = director.decide_physical(&ctx);
        assert!(decision.halt.is_some());
        assert!(decision.rationale.contains("consolidation"));
    }
}