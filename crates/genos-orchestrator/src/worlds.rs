//! Mondes parallèles : expérimentation comparée et barrière de preuve.
//!
//! Chaque `Hypothesis` est exécutée dans un **monde isolé** (copie de l'état) :
//! Trinity = trois mondes (Basic / Planned / Self-Correcting) avec des
//! stratégies distinctes. Les preuves produites sont comparées ; seul un monde
//! franchissant la barrière de preuve est promu, sinon on escalade.

use crate::director::{Director, Strategy};
use crate::organization::{select_organization, select_superorganism, Superorganism};
use crate::planner::{Concept, Goal, WorldState};

/// Hypothèses comparées, façon Trinity.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Hypothesis {
    /// Implémentation directe, minimale.
    Basic,
    /// Implémentation planifiée (observation puis action).
    Planned,
    /// Implémentation indépendante puis auto-correction par preuve.
    SelfCorrecting,
    /// Exploration élargie (recherche diverse).
    Exploratory,
}

impl Hypothesis {
    pub fn trinity() -> [Hypothesis; 3] {
        [Hypothesis::Basic, Hypothesis::Planned, Hypothesis::SelfCorrecting]
    }

    pub fn name(self) -> &'static str {
        match self {
            Hypothesis::Basic => "basic",
            Hypothesis::Planned => "planned",
            Hypothesis::SelfCorrecting => "self_correcting",
            Hypothesis::Exploratory => "exploratory",
        }
    }

    pub fn strategy(self) -> Strategy {
        match self {
            Hypothesis::Basic => Strategy::Solo,
            Hypothesis::Planned => Strategy::Biome,
            Hypothesis::SelfCorrecting => Strategy::ATeam,
            Hypothesis::Exploratory => Strategy::Biocenose,
        }
    }
}

/// Preuve produite par un monde.
#[derive(Clone, Debug)]
pub struct WorldOutcome {
    pub hypothesis: Hypothesis,
    pub steps: Vec<Concept>,
    pub reached: bool,
    pub progress: f64,
    pub cost: f64,
    pub organization: &'static str,
    pub superorganism: Superorganism,
    pub promotable: bool,
}

/// Résultat comparé des mondes.
#[derive(Clone, Debug)]
pub struct Multiverse {
    pub worlds: Vec<WorldOutcome>,
    pub promoted: Option<usize>,
    pub reason: String,
}

impl Multiverse {
    /// Exécute chaque hypothèse dans un monde isolé et compare les preuves.
    pub fn run(goal: &Goal, initial: &WorldState, hypotheses: &[Hypothesis]) -> Self {
        let director = Director::new();
        let worlds: Vec<WorldOutcome> = hypotheses
            .iter()
            .map(|h| run_world(&director, *h, goal, initial))
            .collect();
        finish(worlds)
    }

    /// Mondes **isolés réels** : chaque hypothèse tourne dans son propre
    /// `GenosEcosystem` (construit par `build`) et est exécutée en parallèle.
    pub fn run_isolated<F>(goal: &Goal, hypotheses: &[Hypothesis], build: F) -> Self
    where
        F: Fn(Hypothesis) -> crate::GenosEcosystem + Sync,
    {
        let worlds: Vec<WorldOutcome> = std::thread::scope(|scope| {
            let handles: Vec<_> = hypotheses
                .iter()
                .map(|hypothesis| {
                    let build = &build;
                    let hypothesis = *hypothesis;
                    scope.spawn(move || {
                        let mut eco = build(hypothesis);
                        let planned = eco
                            .director
                            .plan_strategy(hypothesis.strategy(), &eco.observe(), goal);
                        let concepts: Vec<Concept> =
                            planned.into_iter().map(|s| s.concept).collect();
                        let executed = eco.execute_concepts(&concepts);
                        let observed = eco.observe();
                        let reached = observed.goal_reached(goal);
                        let progress = observed.progress(goal);
                        let cost = executed.iter().map(|c| c.cost()).sum();
                        WorldOutcome {
                            hypothesis,
                            steps: executed,
                            reached,
                            progress,
                            cost,
                            organization: select_organization(&observed, goal).name,
                            superorganism: select_superorganism(&observed, goal),
                            promotable: reached || progress >= 0.75,
                        }
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().expect("monde isole"))
                .collect()
        });
        finish(worlds)
    }

    /// Trinity : trois mondes (Basic / Planned / Self-Correcting).
    pub fn trinity(goal: &Goal, initial: &WorldState) -> Self {
        Self::run(goal, initial, &Hypothesis::trinity())
    }

    pub fn winner(&self) -> Option<&WorldOutcome> {
        self.promoted.map(|i| &self.worlds[i])
    }

    /// Fusion : union des concepts testés par tous les mondes.
    pub fn merged_steps(&self) -> Vec<Concept> {
        let mut out: Vec<Concept> = Vec::new();
        for world in &self.worlds {
            for concept in &world.steps {
                if !out.contains(concept) {
                    out.push(*concept);
                }
            }
        }
        out
    }
}

fn finish(worlds: Vec<WorldOutcome>) -> Multiverse {
    let best = worlds
        .iter()
        .enumerate()
        .filter(|(_, w)| w.promotable)
        .max_by(|a, b| {
            score(a.1)
                .partial_cmp(&score(b.1))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(i, _)| i);
    let reason = match best {
        Some(i) => format!(
            "monde '{}' promu (preuve suffisante, progression {:.2})",
            worlds[i].hypothesis.name(),
            worlds[i].progress
        ),
        None => "aucun monde ne franchit la barriere de preuve : escalade requise".to_string(),
    };
    Multiverse {
        worlds,
        promoted: best,
        reason,
    }
}

fn score(world: &WorldOutcome) -> f64 {
    let reached = if world.reached { 2.0 } else { 0.0 };
    reached + world.progress - world.cost * 0.001
}

fn run_world(
    director: &Director,
    hypothesis: Hypothesis,
    goal: &Goal,
    initial: &WorldState,
) -> WorldOutcome {
    let state = initial.clone();
    let mut steps: Vec<Concept> = director
        .plan_strategy(hypothesis.strategy(), &state, goal)
        .into_iter()
        .map(|s| s.concept)
        .collect();

    // Auto-correction : si le but n'est pas atteint, invalider la défense
    // directe et re-planifier depuis un état corrigé.
    if hypothesis == Hypothesis::SelfCorrecting {
        let mut probe = state.clone();
        for concept in &steps {
            probe.apply(*concept);
        }
        if !probe.goal_reached(goal)
            && let Some(failed) = steps.iter().copied().find(|c| c.tag() == "defendre")
        {
            let mut corrected = state.clone();
            corrected.failed.insert(failed);
            steps = director
                .plan_strategy(hypothesis.strategy(), &corrected, goal)
                .into_iter()
                .map(|s| s.concept)
                .collect();
        }
    }

    let mut replayed = state.clone();
    let mut cost = 0.0;
    for concept in &steps {
        cost += concept.cost();
        replayed.apply(*concept);
    }
    let reached = replayed.goal_reached(goal);
    let progress = replayed.progress(goal);

    WorldOutcome {
        hypothesis,
        steps,
        reached,
        progress,
        cost,
        organization: select_organization(&replayed, goal).name,
        superorganism: select_superorganism(&replayed, goal),
        promotable: reached || progress >= 0.75,
    }
}
