//! Recherche évolutionnaire des mécanismes du soi (P3 audit conscience).
//!
//! Question expérimentale : si l'on place des agents sous des contraintes de
//! survie où chaque mécanisme du soi a un COÛT, lesquels sont sélectionnés
//! spontanément — et dans quels environnements ?
//!
//! Population A : architecture prescrite (toutes strates actives).
//! Population B : primitives minimales (strates évolutables).
//!
//! Si B développe spontanément attention/self-model/workspace/agency/
//! metacognition parce qu'ils améliorent la survie, ces mécanismes sont
//! une RÉPONSE ADAPTATIVE, pas une décoration.
//!
//! Le génotype encode l'activation des strates du soi :
//! self_model, memory, interoception, workspace, agency, homeostasis,
//! metacognition. Chaque gène ∈ [0,1] : 0 = strate inactive, 1 = pleinement
//! active. La fitness est la SURVIE mesurée dans un environnement simulé où :
//!   - les environnements hostiles récompensent l'interoception/homeostasis
//!   - les environnements prévisibles rendent le self-model coûteux
//!   - les environnements trompeurs récompensent l'agency comparator
//!   - chaque strate active consomme de l'énergie (coût métabolique)

use crate::evolution::{Individual, Population};
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════════════════
// Génotype du soi : 7 gènes d'activation
// ═══════════════════════════════════════════════════════════════════════════════

pub const SELF_GENES: [&str; 7] = [
    "self_model",
    "memory",
    "interoception",
    "workspace",
    "agency",
    "homeostasis",
    "metacognition",
];

/// Coût métabolique par strate active (énergie consommée par tick).
const STRATE_COSTS: [f64; 7] = [0.08, 0.10, 0.05, 0.12, 0.06, 0.07, 0.09];

/// Bénéfice par strate selon le type d'environnement.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum EnvironmentKind {
    /// Ressources rares, pannes fréquentes : interoception + homeostasis payent.
    Hostile,
    /// Feedback fiable : le self-model coûte plus qu'il ne rapporte.
    Predictable,
    /// Actions aux effets bruités : l'agency comparator évite les fausses attributions.
    Deceptive,
    /// Alternance de phases : métacognition + mémoire payent.
    Volatile,
}

impl EnvironmentKind {
    pub fn benefit_profile(&self) -> [f64; 7] {
        match self {
            //              self  memory intero worksp agency homeo metacog
            EnvironmentKind::Hostile => [0.05, 0.05, 0.30, 0.10, 0.05, 0.35, 0.10],
            EnvironmentKind::Predictable => [0.02, 0.10, 0.02, 0.05, 0.02, 0.05, 0.02],
            EnvironmentKind::Deceptive => [0.10, 0.10, 0.05, 0.15, 0.40, 0.05, 0.15],
            EnvironmentKind::Volatile => [0.10, 0.30, 0.10, 0.15, 0.05, 0.10, 0.30],
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Simulation de survie (phénotype → fitness)
// ═══════════════════════════════════════════════════════════════════════════════

/// Un épisode de survie : l'agent vit N ticks dans l'environnement.
/// La performance RÉCOLTE de l'énergie (les strates actives font vivre
/// l'agent), le métabolisme des strates la consomme. Survie = énergie
/// finale — mourir de sur-activation est une stratégie perdante, mais
/// ne rien activer l'est aussi dans un milieu qui récompense l'action.
/// Fitness de survie avec gènes bornés : l'activation d'une strate est
/// un niveau d'investissement ∈ [0,1], le clamp garantit la sémantique
/// même si le mutateur gaussien dépasse les bornes.
///
/// AVERTISSEMENT CIRCULARITÉ : les bénéfices par strate et milieu sont
/// DÉCLARÉS dans `benefit_profile` — l'évolution retrouve ce qu'on y a
/// mis. Ce module mesure une DIRECTION DE SÉLECTION sous hypothèses
/// déclarées, pas une découverte. Le contrôle par permutation
/// (voir tests) le démontre : permuter le profil permute la sélection.
pub fn survival_fitness(genes: &[f64], kind: &EnvironmentKind, ticks: usize) -> f64 {
    survival_fitness_detailed(genes, kind, ticks).fitness
}

/// Résultat détaillé d'un épisode : fitness + sort (survie ou mort).
/// Expose le tick de mort pour ne pas comparer une fitness de survivant
/// à une fitness pénalisée de mort précoce sans le dire (artefact Δ).
#[derive(Clone, Debug, PartialEq)]
pub struct SurvivalOutcome {
    pub fitness: f64,
    pub survived: bool,
    pub death_tick: Option<u64>,
}

pub fn survival_fitness_detailed(
    genes: &[f64],
    kind: &EnvironmentKind,
    ticks: usize,
) -> SurvivalOutcome {
    let clamped: Vec<f64> = genes.iter().map(|g| g.clamp(0.0, 1.0)).collect();
    survival_fitness_clamped(&clamped, kind, ticks)
}

fn survival_fitness_clamped(
    genes: &[f64],
    kind: &EnvironmentKind,
    ticks: usize,
) -> SurvivalOutcome {
    let benefits = kind.benefit_profile();
    let mut energy = 1.0;
    let mut performance = 0.0;

    for tick in 0..ticks {
        // Coût métabolique : chaque strate active consomme.
        let cost: f64 = SELF_GENES
            .iter()
            .enumerate()
            .map(|(i, _)| STRATE_COSTS[i] * genes[i])
            .sum();
        energy -= cost;

        // Récolte : les strates actives rapportent de l'énergie selon le
        // milieu, avec un bruit environnemental que l'agency filtre.
        let noise = match kind {
            EnvironmentKind::Predictable => 0.05,
            EnvironmentKind::Hostile | EnvironmentKind::Volatile => 0.20,
            EnvironmentKind::Deceptive => 0.30,
        };
        let tick_noise = pseudo_noise(genes, tick).abs() * noise;
        let noise_after_agency = tick_noise * (1.0 - 0.8 * genes[4]);
        let harvest: f64 = SELF_GENES
            .iter()
            .enumerate()
            .map(|(i, _)| benefits[i] * genes[i])
            .sum::<f64>()
            - noise_after_agency;

        energy += harvest;
        performance += harvest;

        if energy <= 0.0 {
            // Mort métabolique : la sur-activation des strates coûte la vie.
            return SurvivalOutcome {
                fitness: performance * 0.1,
                survived: false,
                death_tick: Some(tick as u64),
            };
        }
    }

    SurvivalOutcome {
        fitness: performance + energy,
        survived: true,
        death_tick: None,
    }
}

/// Bruit déterministe (pas de RNG externe : fitness reproductible).
fn pseudo_noise(genes: &[f64], tick: usize) -> f64 {
    let seed = genes
        .iter()
        .enumerate()
        .fold(tick as f64, |acc, (i, g)| acc + (i + 1) as f64 * g * 1000.0);
    ((seed * 0.618033988749895).fract() - 0.5) * 2.0
}

// ═══════════════════════════════════════════════════════════════════════════════
// Expérience A/B : prescrit vs évolutif
// ═══════════════════════════════════════════════════════════════════════════════

/// Bilan d'une population après évolution.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SelfEvolutionReport {
    pub kind: EnvironmentKind,
    pub generations: u64,
    /// Activation moyenne par strate dans la population finale.
    pub mean_activation: Vec<(String, f64)>,
    /// Fitness moyenne finale.
    pub mean_fitness: f64,
    /// Fitness d'un agent prescrit (toutes strates à 1.0).
    pub prescribed_fitness: f64,
    /// L'agent prescrit a-t-il survécu à l'épisode de référence ?
    /// Faux en Predictable : le Δ « évolution > prescrite » est un
    /// artefact de mort métabolique précoce du prescrit, pas une
    /// supériorité de l'évolué sur un soi complet viable.
    pub prescribed_survived: bool,
    /// Tick de mort du prescrit (None si survie).
    pub prescribed_death_tick: Option<u64>,
    /// Les strates sélectionnées spontanément (> 0.5 d'activation moyenne).
    pub selected_strata: Vec<String>,
    /// Les strates rejetées (< 0.2 d'activation moyenne).
    pub rejected_strata: Vec<String>,
}

/// Population B : strates évolutables depuis des primitives minimales
/// (activation initiale faible, la sélection décide). Les gènes sont
/// bornés [0,1] : ce sont des activations, pas des amplitudes.
pub fn evolvable_population(seed: u64) -> Population {
    let mut pop = Population::new(Population::NewConfig {
        names: vec!["niche_a".to_string(), "niche_b".to_string()],
        per_island: 12,
        gene_count: SELF_GENES.len(),
        seed,
    });
    // Départ minimal : activation aléatoire faible [0, 0.3].
    for island in &mut pop.islands {
        for individual in &mut island.individuals {
            for (i, gene) in individual.genes.iter_mut().enumerate() {
                *gene = (pseudo_noise(&[seed as f64], i).abs() * 0.3).clamp(0.0, 1.0);
            }
        }
    }
    pop
}

/// Population A : toutes strates prescrites à 1.0 (référence).
pub fn prescribed_population(seed: u64) -> Population {
    let mut pop = Population::new(Population::NewConfig {
        names: vec!["prescribed".to_string()],
        per_island: 8,
        gene_count: SELF_GENES.len(),
        seed,
    });
    for island in &mut pop.islands {
        for individual in &mut island.individuals {
            for gene in &mut individual.genes {
                *gene = 1.0;
            }
        }
    }
    pop
}

/// Exécute l'évolution de la population B dans un environnement.
pub fn evolve_self_strata(
    kind: &EnvironmentKind,
    generations: u64,
    seed: u64,
) -> SelfEvolutionReport {
    let mut pop = evolvable_population(seed);
    let fitness = |genes: &[f64]| survival_fitness(genes, kind, 30);

    for _ in 0..generations {
        let _ = pop.evolve(&fitness);
    }

    let individuals: Vec<&Individual> = pop
        .islands
        .iter()
        .flat_map(|i| i.individuals.iter())
        .collect();
    let n = individuals.len().max(1) as f64;

    let mean_activation: Vec<(String, f64)> = SELF_GENES
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let mean = individuals
                .iter()
                .map(|ind| ind.genes[i].clamp(0.0, 1.0))
                .sum::<f64>()
                / n;
            (name.to_string(), (mean * 1000.0).round() / 1000.0)
        })
        .collect();
    let mean_fitness = individuals.iter().map(|i| i.fitness).sum::<f64>() / n;
    let prescribed = survival_fitness_detailed(&vec![1.0; SELF_GENES.len()], kind, 30);

    let selected_strata = mean_activation
        .iter()
        .filter(|(_, v)| *v > 0.5)
        .map(|(name, _)| name.clone())
        .collect();
    let rejected_strata = mean_activation
        .iter()
        .filter(|(_, v)| *v < 0.2)
        .map(|(name, _)| name.clone())
        .collect();

    SelfEvolutionReport {
        kind: kind.clone(),
        generations,
        mean_activation,
        mean_fitness: (mean_fitness * 1000.0).round() / 1000.0,
        prescribed_fitness: (prescribed.fitness * 1000.0).round() / 1000.0,
        prescribed_survived: prescribed.survived,
        prescribed_death_tick: prescribed.death_tick,
        selected_strata,
        rejected_strata,
    }
}

/// Expérience complète : chaque environnement, plusieurs seeds.
pub fn run_self_evolution_experiment(seeds: &[u64]) -> Vec<SelfEvolutionReport> {
    let kinds = [
        EnvironmentKind::Hostile,
        EnvironmentKind::Predictable,
        EnvironmentKind::Deceptive,
        EnvironmentKind::Volatile,
    ];
    let mut reports = Vec::new();
    for kind in kinds {
        for &seed in seeds {
            reports.push(evolve_self_strata(&kind, 40, seed));
        }
    }
    reports
}

#[cfg(test)]
#[path = "self_evolution_tests.rs"]
mod tests;
