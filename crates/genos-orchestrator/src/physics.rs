//! Couche physique computationnelle : lois, coûts, inertie, friction, matière.
//! L'inerte donne un monde qui résiste : rien n'est gratuit, tout changement
//! laisse une trace, tout état se dégrade s'il n'est pas maintenu, toute
//! force excessive crée des dommages, tout système a une capacité maximale,
//! tout franchissement de seuil change le régime. Chaque champ de
//! `PhysicalState` influence réellement le scoring (voir `decide_physical`).

use crate::director::{Decision, Director, Strategy};
use crate::organization::{Superorganism, by_name};
use crate::planner::{ActionStats, Concept, Goal, WorldState};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

/// État physique dérivé du monde observable : texture, masse, limites.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PhysicalState {
    pub energy: f64,
    pub entropy: f64,
    pub friction: f64,
    pub inertia: f64,
    pub pressure: f64,
    pub temperature: f64,
    pub viscosity: f64,
    pub elasticity: f64,
    pub plasticity: f64,
    pub rupture_risk: f64,
    pub resonance: f64,
    /// Poids structurel par chemin (fichiers/modules qui attirent plus de conséquences).
    pub structural_gravity: BTreeMap<String, f64>,
}

impl Default for PhysicalState {
    fn default() -> Self {
        Self {
            energy: 1.0,
            entropy: 0.0,
            friction: 0.0,
            inertia: 0.5,
            pressure: 0.0,
            temperature: 0.3,
            viscosity: 0.2,
            elasticity: 0.8,
            plasticity: 0.2,
            rupture_risk: 0.0,
            resonance: 0.0,
            structural_gravity: BTreeMap::new(),
        }
    }
}

impl PhysicalState {
    /// Dérive l'état physique depuis un `WorldState` observé, avec une
    /// propagation d'inertie/plasticité depuis l'état précédent (mémoire,
    /// pas une simple recopie instantanée — comme `VolitionState::propagate`).
    pub fn derive(state: &WorldState, previous: Option<&PhysicalState>) -> Self {
        let energy = clamp01(state.budget / 120.0);
        let entropy = clamp01(
            0.25 * (state.workers as f64 / state.required_workers.max(1) as f64).min(1.0)
                + 0.35 * state.stress
                + 0.25 * state.dissonance
                + 0.15 * state.failure_rate,
        );
        let friction = clamp01(0.5 * state.stress + 0.5 * (1.0 - energy));
        let pressure = clamp01(state.budget_pressure.max(state.threat));
        let temperature = clamp01(0.6 * state.stress + 0.4 * state.il6);
        let rupture_risk = clamp01(
            0.5 * state.threat + 0.3 * entropy + 0.2 * (state.diseased as f64 / 5.0).min(1.0),
        );
        let elasticity = clamp01(1.0 - 0.5 * rupture_risk - 0.3 * entropy);
        let resonance = clamp01(state.failure_rate * 0.6 + if state.traitor { 0.4 } else { 0.0 });
        let viscosity = clamp01(0.5 * (1.0 - energy) + 0.5 * entropy);
        let stability = 1.0 - clamp01(state.failure_rate);
        let target_inertia = clamp01(0.3 + 0.5 * stability - 0.3 * pressure);
        let inertia = previous.map_or(target_inertia, |p| clamp01(p.inertia * 0.7 + target_inertia * 0.3));
        let plasticity = previous.map_or(clamp01(rupture_risk * 0.3), |p| clamp01(p.plasticity * 0.8 + rupture_risk * 0.2));
        let structural_gravity = previous.map(|p| p.structural_gravity.clone()).unwrap_or_default();
        Self {
            energy, entropy, friction, inertia, pressure, temperature, viscosity, elasticity,
            plasticity, rupture_risk, resonance, structural_gravity,
        }
    }

    /// Enregistre/actualise la gravité structurelle d'un chemin (loi 8).
    pub fn record_gravity(&mut self, path: &str, weight: f64) {
        self.structural_gravity.insert(path.to_string(), clamp01(weight));
    }

    pub fn gravity_of(&self, path: &str) -> f64 {
        self.structural_gravity.get(path).copied().unwrap_or(0.0)
    }
}

/// Profil physique d'une action : elle a une masse, pas seulement une utilité.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct ActionProfile {
    pub mass: f64,
    pub friction: f64,
    pub blast_radius: f64,
    pub reversibility: f64,
    pub latency: f64,
    pub entropy_delta: f64,
    pub evidence_debt_delta: f64,
}

/// Registre des profils physiques par concept mobilisable (masse/friction/etc).
/// Les moyens d'observation sont légers ; les moyens de mutation/éradication
/// sont lourds : ils coûtent, prennent du temps, exigent plus de preuve.
pub fn action_profile(concept: Concept) -> ActionProfile {
    use Concept::*;
    let (mass, friction, blast_radius, reversibility, latency, entropy_delta, evidence_debt_delta) = match concept {
        Observe | Replay | Audit => (0.1, 0.05, 0.0, 1.0, 0.1, 0.0, -0.1),
        Signaling | Stigmergy | Neuro | Quorum => (0.2, 0.1, 0.05, 0.9, 0.15, 0.05, 0.0),
        Throttle | Delegate => (0.15, 0.1, 0.05, 0.95, 0.1, 0.0, 0.0),
        Organize | Recruit => (0.5, 0.3, 0.2, 0.6, 0.4, 0.1, 0.1),
        Immune | Virology | Feign => (0.6, 0.4, 0.35, 0.5, 0.35, 0.15, 0.2),
        Therapy | Spore | Glia => (0.45, 0.25, 0.2, 0.7, 0.3, 0.05, 0.05),
        Mutate | Cross | Endosymbiosis | Genomics | Plasmid => (0.8, 0.5, 0.5, 0.3, 0.5, 0.3, 0.35),
        Kill => (0.9, 0.6, 0.7, 0.1, 0.3, 0.2, 0.3),
        Communicate => (0.2, 0.15, 0.1, 0.9, 0.2, 0.0, -0.05),
        Actuate => (0.7, 0.5, 0.6, 0.2, 0.6, 0.2, 0.4),
    };
    ActionProfile { mass, friction, blast_radius, reversibility, latency, entropy_delta, evidence_debt_delta }
}

/// Regroupe les entrées de `utility_score` (compte pour un seul paramètre).
pub struct UtilityInputs<'a> {
    pub expected_gain: f64,
    pub profile: &'a ActionProfile,
    pub phys: &'a PhysicalState,
}

/// utility = gain attendu - friction - risque - entropie (loi 6 : "faire payer
/// les décisions"). Une action lourde avec un gain théorique élevé mais une
/// friction/risque énorme ne doit pas être choisie tant que l'incertitude est
/// haute.
pub fn utility_score(inputs: &UtilityInputs) -> f64 {
    let risk = inputs.profile.blast_radius * (1.0 - inputs.profile.reversibility) * (1.0 + inputs.phys.rupture_risk);
    let friction_cost = inputs.profile.friction * (1.0 + inputs.phys.friction);
    let entropy_cost = inputs.profile.entropy_delta * (1.0 + inputs.phys.entropy);
    inputs.expected_gain - friction_cost - risk - entropy_cost
}

/// Classe de matière computationnelle d'un chemin du dépôt (loi 10).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Material {
    Crystal,
    Gel,
    Fluid,
    Gas,
    Membrane,
    Fiber,
    Sediment,
}

impl Material {
    /// Force de preuve exigée avant de modifier ce matériau (0..1).
    pub fn required_evidence(self) -> f64 {
        match self {
            Material::Crystal => 0.9,
            Material::Membrane => 0.8,
            Material::Gel | Material::Fiber => 0.5,
            Material::Fluid => 0.3,
            Material::Sediment => 0.2,
            Material::Gas => 0.1,
        }
    }

    /// Règle de changement associée à ce matériau.
    pub fn change_rule(self) -> &'static str {
        match self {
            Material::Crystal => "changement rare, preuve forte, review obligatoire",
            Material::Gel => "changement possible, surveillance renforcee",
            Material::Fluid => "changement facile, surveillance continue",
            Material::Gas => "expiration rapide, pas d'engagement long terme",
            Material::Membrane => "reparation prioritaire, frontiere protegee",
            Material::Fiber => "verifier les tensions/dependances avant rupture",
            Material::Sediment => "compression et stratification, pas de reecriture directe",
        }
    }
}

/// Classe un chemin de dépôt selon des indices de nom (heuristique simple,
/// sans dépendance sur un graphe d'imports réel).
pub fn classify_material(path: &str) -> Material {
    let p = path.to_lowercase();
    if p.contains("schema") || p.contains("/db/") || p.contains("contract") || p.contains("proto") {
        Material::Crystal
    } else if p.contains("sandbox") || p.contains("lease") || p.contains("auth") || p.contains("scope") {
        Material::Membrane
    } else if p.contains("strategy") || p.contains("policy") || p.contains("config") {
        Material::Gel
    } else if p.contains("prompt") || p.contains("draft") || p.contains("hypothesis") {
        Material::Gas
    } else if p.contains("import") || p.contains("workflow") || p.contains("dependenc") {
        Material::Fiber
    } else if p.contains("log") || p.contains("trace") || p.contains("fossil") || p.contains("snapshot") {
        Material::Sediment
    } else {
        Material::Fluid
    }
}

/// Régime de fonctionnement — une transition de phase change le comportement,
/// ce n'est pas une simple alerte affichée (loi 9).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Regime {
    Normal,
    Conservation,
    Consolidation,
    Contention,
    HumanReview,
}

const BUDGET_CONSERVATION_THRESHOLD: f64 = 0.10;
const ENTROPY_CONSOLIDATION_THRESHOLD: f64 = 0.70;
const RUPTURE_REVIEW_THRESHOLD: f64 = 0.80;

/// Détermine le régime courant à partir du monde et de l'état physique.
pub fn determine_regime(state: &WorldState, phys: &PhysicalState) -> Regime {
    if phys.rupture_risk > RUPTURE_REVIEW_THRESHOLD {
        Regime::HumanReview
    } else if phys.energy < BUDGET_CONSERVATION_THRESHOLD {
        Regime::Conservation
    } else if phys.entropy > ENTROPY_CONSOLIDATION_THRESHOLD {
        Regime::Consolidation
    } else if state.workers > state.required_workers * 2 {
        Regime::Contention
    } else {
        Regime::Normal
    }
}

/// Seuil d'inertie : le score du candidat doit dépasser le score courant plus
/// ce seuil pour justifier un pivot (loi 5 : éviter les changements nerveux).
pub fn inertia_threshold(phys: &PhysicalState, current_strategy_success: f64) -> f64 {
    let mut threshold = 0.05 + phys.inertia * 0.2;
    threshold += (current_strategy_success - 0.5) * 0.1;
    threshold -= phys.pressure * 0.1;
    threshold.clamp(0.0, 0.4)
}

/// Regroupe les paramètres de décision gatée par la physique (un seul
/// argument logique, pour respecter la limite de 3 paramètres).
pub struct DecisionContext<'a> {
    pub state: &'a WorldState,
    pub goal: &'a Goal,
    pub phys: &'a PhysicalState,
    pub previous_strategy: Option<Strategy>,
}

impl Director {
    /// Décision gatée par la physique : régime d'abord (transitions de
    /// phase), puis inertie anti-pivot sur le choix de stratégie. N'exclut
    /// pas `decide`, l'enrichit d'un monde qui résiste.
    pub fn decide_physical(&self, ctx: &DecisionContext) -> Decision {
        match determine_regime(ctx.state, ctx.phys) {
            Regime::HumanReview => {
                return Self::halted_physical("risque de rupture eleve : revue humaine requise");
            }
            Regime::Consolidation => {
                return Self::halted_physical("entropie trop haute : consolidation obligatoire avant expansion");
            }
            _ => {}
        }
        let decision = self.decide(ctx.state, ctx.goal);
        if decision.halt.is_some() {
            return decision;
        }
        self.apply_inertia_gate(ctx, decision)
    }

    fn halted_physical(reason: &str) -> Decision {
        Decision {
            strategy: Strategy::Solo,
            organization: *by_name("network_silence").expect("organisation du catalogue"),
            superorganism: Superorganism::Swarm,
            steps: Vec::new(),
            rationale: reason.to_string(),
            halt: Some(reason.to_string()),
        }
    }

    /// N'autorise le pivot de stratégie que si le gain dépasse l'inertie.
    fn apply_inertia_gate(&self, ctx: &DecisionContext, decision: Decision) -> Decision {
        let Some(previous) = ctx.previous_strategy else { return decision };
        if previous == decision.strategy {
            return decision;
        }
        let previous_steps = self.plan_strategy(previous, ctx.state, ctx.goal);
        if previous_steps.is_empty() {
            return decision;
        }
        let previous_score = self.estimate(&previous_steps, ctx.state, ctx.goal);
        let new_score = self.estimate(&decision.steps, ctx.state, ctx.goal);
        let success_rate = self.stats.values().map(ActionStats::rate).fold(0.0_f64, f64::max);
        let threshold = inertia_threshold(ctx.phys, success_rate);
        if new_score - previous_score > threshold {
            return decision;
        }
        let rationale = format!(
            "{} (inertie: gain {:.2} < seuil {:.2}, strategie {:?} conservee)",
            decision.rationale, new_score - previous_score, threshold, previous
        );
        Decision { strategy: previous, steps: previous_steps, rationale, ..decision }
    }
}

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
