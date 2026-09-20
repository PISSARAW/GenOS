//! Boucle unifiée de l'organisme : un seul cycle qui **perçoit**, se **régule**
//! (réparation, nourriture), **décide**, **agit**, **consomme** de l'ATP et
//! **apprend** — en couplant toutes les phases précédentes.
//!
//! `organism_tick` compose : autopoïèse (Phase 6), métabolisme (Phase 3),
//! buts endogènes (Phase 2), décision/apprentissage (Phases 4) et, en variante,
//! l'environnement incarné (Phase 1).

use crate::director::Strategy;
use crate::environment::Environment;
use crate::evolution::EvolutionReport;
use crate::planner::Concept;
use crate::GenosEcosystem;

/// Réglages de la boucle organisme.
#[derive(Clone, Debug)]
pub struct OrganismConfig {
    pub auto_repair: bool,
    /// Nourrir automatiquement sous ce niveau d'ATP.
    pub feed_below: f64,
    pub feed_amount: f64,
    /// Nombre de cycles entre deux générations ; zéro désactive l'évolution.
    pub evolve_every: u64,
}

impl Default for OrganismConfig {
    fn default() -> Self {
        Self {
            auto_repair: true,
            feed_below: 80.0,
            feed_amount: 50.0,
            evolve_every: 0,
        }
    }
}

/// Bilan d'un cycle d'organisme.
#[derive(Clone, Debug)]
pub struct OrganismReport {
    pub tick: u64,
    pub goal: String,
    pub strategy: Option<Strategy>,
    pub executed: Vec<Concept>,
    pub integrity: f64,
    pub atp: f64,
    pub alive: bool,
    pub repairs: Vec<String>,
    pub fed: bool,
    pub halt: Option<String>,
    pub evolution: Option<EvolutionReport>,
}

impl GenosEcosystem {
    fn evolve_policy(&mut self, tick: u64, config: &OrganismConfig) -> Option<EvolutionReport> {
        if config.evolve_every == 0 || tick % config.evolve_every != 0 {
            return None;
        }
        let state = self.observe();
        let goal = self.autonomous_goal();
        let population = self.population.as_mut()?;
        let base = self.director.clone();
        let context = crate::learning::context_from_state(&state);
        let report = population.evolve(&|genes| {
            let mut candidate = base.clone();
            candidate.set_context(context.clone());
            candidate.set_policy_genes(genes);
            let decision = candidate.decide(&state, &goal);
            decision.steps.iter().map(|step| step.utility).sum::<f64>()
                - decision.steps.len() as f64 * 0.01
        });
        if let Some(best) = population.best() {
            self.director.set_policy_genes(&best.genes);
        }
        Some(report)
    }

    /// Un cycle complet d'organisme (monde interne).
    pub fn organism_tick(&mut self, config: &OrganismConfig) -> OrganismReport {
        let tick = self.events.count() as u64;
        self.orchestrator.membrane.update();
        if !self.orchestrator.membrane.is_alive() {
            return OrganismReport {
                tick,
                goal: "aucun".to_string(),
                strategy: None,
                executed: Vec::new(),
                integrity: 0.0,
                atp: self.orchestrator.metabolism.available(),
                alive: false,
                repairs: Vec::new(),
                fed: false,
                halt: Some("organisme mort: membrane rompue".to_string()),
                evolution: None,
            };
        }

        // 1. Régulation : auto-réparation de la frontière et des composants.
        let mut repairs = Vec::new();
        if config.auto_repair
            && self.orchestrator.membrane.total_integrity()
                < self.orchestrator.membrane.total_capacity() - 0.1
        {
            let report = self.self_repair();
            repairs = report.actions;
        }

        // 2. Homéostasie : se nourrir quand l'ATP est bas.
        let mut fed = false;
        if self.orchestrator.metabolism.available() < config.feed_below {
            self.feed(config.feed_amount);
            fed = true;
        }

        // 3. Décision autonome (but endogène) + exécution + apprentissage.
        let goal = self.autonomous_goal();
        let evolution = self.evolve_policy(tick, config);
        let report = self.tick(&goal);

        OrganismReport {
            tick,
            goal: format!("{goal:?}"),
            strategy: Some(report.strategy),
            executed: report.executed,
            integrity: self.orchestrator.membrane.total_integrity(),
            atp: self.orchestrator.metabolism.available(),
            alive: self.orchestrator.membrane.is_alive(),
            repairs,
            fed,
            halt: report.halt,
            evolution,
        }
    }

    /// Un cycle d'organisme **incarné** : la décision agit dans un environnement.
    pub fn organism_tick_embodied<E: Environment>(
        &mut self,
        env: &mut E,
        spec: &str,
        out: &str,
        config: &OrganismConfig,
    ) -> OrganismReport {
        let tick = self.events.count() as u64;
        self.orchestrator.membrane.update();
        if !self.orchestrator.membrane.is_alive() {
            return OrganismReport {
                tick,
                goal: "aucun".to_string(),
                strategy: None,
                executed: Vec::new(),
                integrity: 0.0,
                atp: self.orchestrator.metabolism.available(),
                alive: false,
                repairs: Vec::new(),
                fed: false,
                halt: Some("organisme mort: membrane rompue".to_string()),
                evolution: None,
            };
        }

        let mut repairs = Vec::new();
        if config.auto_repair
            && self.orchestrator.membrane.total_integrity()
                < self.orchestrator.membrane.total_capacity() - 0.1
        {
            repairs = self.self_repair().actions;
        }
        let mut fed = false;
        if self.orchestrator.metabolism.available() < config.feed_below {
            self.feed(config.feed_amount);
            fed = true;
        }

        let embodied = self.embodied_task(env, spec, out, 2);
        OrganismReport {
            tick,
            goal: format!("embodied:{spec}"),
            strategy: None,
            executed: vec![Concept::Actuate],
            integrity: self.orchestrator.membrane.total_integrity(),
            atp: self.orchestrator.metabolism.available(),
            alive: self.orchestrator.membrane.is_alive(),
            repairs,
            fed,
            halt: if embodied.success {
                None
            } else {
                Some(embodied.reason)
            },
            evolution: None,
        }
    }

    /// Enchaîne plusieurs cycles et renvoie la trace des rapports.
    pub fn run_organism(
        &mut self,
        config: &OrganismConfig,
        max_ticks: usize,
    ) -> Vec<OrganismReport> {
        let mut reports = Vec::new();
        for _ in 0..max_ticks {
            let report = self.organism_tick(config);
            let dead = !report.alive;
            reports.push(report);
            if dead {
                break;
            }
        }
        reports
    }
}
