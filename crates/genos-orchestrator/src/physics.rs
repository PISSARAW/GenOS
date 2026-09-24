//! Couche physique computationnelle : lois, coûts, inertie, friction, matière.
//! L'inerte donne un monde qui résiste : rien n'est gratuit, tout changement
//! laisse une trace, tout état se dégrade s'il n'est pas maintenu, toute
//! force excessive crée des dommages, tout système a une capacité maximale,
//! tout franchissement de seuil change le régime. Chaque champ de
//! `PhysicalState` influence réellement le scoring (voir `decide_physical`).

use crate::director::{Decision, Director, EstimateContext, Strategy};
use crate::organization::{Superorganism, by_name};
use crate::planner::{ActionStats, Concept, Goal, WorldState};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

fn entropy_from(state: &WorldState) -> f64 {
    clamp01(
        0.25 * (state.workers as f64 / state.required_workers.max(1) as f64).min(1.0)
            + 0.35 * state.stress
            + 0.25 * state.dissonance
            + 0.15 * state.failure_rate,
    )
}

fn rupture_risk_from(state: &WorldState, entropy: f64) -> f64 {
    clamp01(0.5 * state.threat + 0.3 * entropy + 0.2 * (state.diseased as f64 / 5.0).min(1.0))
}

fn inertia_from(state: &WorldState, previous: Option<&PhysicalState>, pressure: f64) -> f64 {
    let stability = 1.0 - clamp01(state.failure_rate);
    let target_inertia = clamp01(0.3 + 0.5 * stability - 0.3 * pressure);
    previous.map_or(target_inertia, |p| {
        clamp01(p.inertia * 0.7 + target_inertia * 0.3)
    })
}

fn plasticity_from(previous: Option<&PhysicalState>, rupture_risk: f64) -> f64 {
    previous.map_or(clamp01(rupture_risk * 0.3), |p| {
        clamp01(p.plasticity * 0.8 + rupture_risk * 0.2)
    })
}

const MATERIAL_RULES: [(&str, Material); 20] = [
    ("schema", Material::Crystal),
    ("/db/", Material::Crystal),
    ("contract", Material::Crystal),
    ("proto", Material::Crystal),
    ("sandbox", Material::Membrane),
    ("lease", Material::Membrane),
    ("auth", Material::Membrane),
    ("scope", Material::Membrane),
    ("strategy", Material::Gel),
    ("policy", Material::Gel),
    ("config", Material::Gel),
    ("prompt", Material::Gas),
    ("draft", Material::Gas),
    ("hypothesis", Material::Gas),
    ("import", Material::Fiber),
    ("workflow", Material::Fiber),
    ("dependenc", Material::Fiber),
    ("log", Material::Sediment),
    ("trace", Material::Sediment),
    ("fossil", Material::Sediment),
];

fn material_from_prefix(p: &str) -> Material {
    for (keyword, material) in &MATERIAL_RULES {
        if p.contains(keyword) {
            return *material;
        }
    }
    Material::Fluid
}

fn risk_cost(inputs: &UtilityInputs) -> f64 {
    inputs.profile.blast_radius
        * (1.0 - inputs.profile.reversibility)
        * (1.0 + inputs.phys.rupture_risk)
}

fn friction_cost(inputs: &UtilityInputs) -> f64 {
    inputs.profile.friction * (1.0 + inputs.phys.friction)
}

fn entropy_cost(inputs: &UtilityInputs) -> f64 {
    inputs.profile.entropy_delta * (1.0 + inputs.phys.entropy)
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
    pub fn derive(state: &WorldState, previous: Option<&PhysicalState>) -> Self {
        let energy = clamp01(state.budget / 120.0);
        let entropy = entropy_from(state);
        let friction = clamp01(0.5 * state.stress + 0.5 * (1.0 - energy));
        let pressure = clamp01(state.budget_pressure.max(state.threat));
        let temperature = clamp01(0.6 * state.stress + 0.4 * state.il6);
        let rupture_risk = rupture_risk_from(state, entropy);
        let elasticity = clamp01(1.0 - 0.5 * rupture_risk - 0.3 * entropy);
        let resonance = clamp01(state.failure_rate * 0.6 + if state.traitor { 0.4 } else { 0.0 });
        let viscosity = clamp01(0.5 * (1.0 - energy) + 0.5 * entropy);
        let inertia = inertia_from(state, previous, pressure);
        let plasticity = plasticity_from(previous, rupture_risk);
        let structural_gravity = previous.map(|p| p.structural_gravity.clone()).unwrap_or_default();
        Self {
            energy,
            entropy,
            friction,
            inertia,
            pressure,
            temperature,
            viscosity,
            elasticity,
            plasticity,
            rupture_risk,
            resonance,
            structural_gravity,
        }
    }

    pub fn record_gravity(&mut self, path: &str, weight: f64) {
        self.structural_gravity
            .insert(path.to_string(), clamp01(weight));
    }

    pub fn gravity_of(&self, path: &str) -> f64 {
        self.structural_gravity.get(path).copied().unwrap_or(0.0)
    }
}

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

pub fn action_profile(concept: Concept) -> ActionProfile {
    use Concept::*;
    let (mass, friction, blast_radius, reversibility, latency, entropy_delta, evidence_debt_delta) =
        match concept {
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
    ActionProfile {
        mass,
        friction,
        blast_radius,
        reversibility,
        latency,
        entropy_delta,
        evidence_debt_delta,
    }
}

pub struct UtilityInputs<'a> {
    pub expected_gain: f64,
    pub profile: &'a ActionProfile,
    pub phys: &'a PhysicalState,
}

pub fn utility_score(inputs: &UtilityInputs) -> f64 {
    inputs.expected_gain - friction_cost(inputs) - risk_cost(inputs) - entropy_cost(inputs)
}

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

pub fn classify_material(path: &str) -> Material {
    // Nom seul : heuristique plafonnée. Un grade à preuve forte
    // (Crystal/Membrane) n'est JAMAIS conféré par le nommage seul : il exige
    // un type de contenu déclaré explicite (classify_material_explicit).
    match material_from_prefix(&path.to_lowercase()) {
        Material::Crystal | Material::Membrane => Material::Gel,
        other => other,
    }
}

/// Classification avec type de contenu déclaré explicite (ex. "schema",
/// "contract", "log"). Seule la déclaration explicite, croisée avec le nom,
/// peut conférer un grade à preuve forte.
pub fn classify_material_explicit(path: &str, declared_type: &str) -> Material {
    let declared = material_from_prefix(&declared_type.to_lowercase());
    match declared {
        Material::Crystal | Material::Membrane => {
            if material_from_prefix(&path.to_lowercase()) == declared {
                declared
            } else {
                classify_material(path)
            }
        }
        _ => classify_material(path),
    }
}

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

pub fn inertia_threshold(phys: &PhysicalState, current_strategy_success: f64) -> f64 {
    let mut threshold = 0.05 + phys.inertia * 0.2;
    threshold += (current_strategy_success - 0.5) * 0.1;
    threshold -= phys.pressure * 0.1;
    threshold.clamp(0.0, 0.4)
}

pub struct DecisionContext<'a> {
    pub state: &'a WorldState,
    pub goal: &'a Goal,
    pub phys: &'a PhysicalState,
    pub previous_strategy: Option<Strategy>,
}

impl Director {
    pub fn decide_physical(&self, ctx: &DecisionContext) -> Decision {
        match determine_regime(ctx.state, ctx.phys) {
            Regime::HumanReview => {
                return Self::halted_physical("risque de rupture eleve : revue humaine requise");
            }
            Regime::Consolidation => {
                return Self::halted_physical(
                    "entropie trop haute : consolidation obligatoire avant expansion",
                );
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

    fn apply_inertia_gate(&self, ctx: &DecisionContext, decision: Decision) -> Decision {
        let Some(previous) = ctx.previous_strategy else {
            return decision;
        };
        if previous == decision.strategy {
            return decision;
        }
        use crate::director::PlanRequest;
        let request = PlanRequest {
            strategy: previous,
            state: ctx.state.clone(),
            goal: ctx.goal.clone(),
        };
        let previous_steps = self.plan_strategy(&request);
        if previous_steps.is_empty() {
            return decision;
        }
        let ctx_est = EstimateContext {
            initial: ctx.state,
            goal: ctx.goal,
        };
        let previous_score = self.estimate(&previous_steps, &ctx_est);
        let new_score = self.estimate(&decision.steps, &ctx_est);
        let success_rate = self
            .stats
            .values()
            .map(ActionStats::rate)
            .fold(0.0_f64, f64::max);
        let threshold = inertia_threshold(ctx.phys, success_rate);
        if new_score - previous_score > threshold {
            return decision;
        }
        let rationale = format!(
            "{} (inertie: gain {:.2} < seuil {:.2}, strategie {:?} conservee)",
            decision.rationale,
            new_score - previous_score,
            threshold,
            previous
        );
        Decision {
            strategy: previous,
            steps: previous_steps,
            rationale,
            ..decision
        }
    }
}

#[cfg(test)]
mod physics_tests;
