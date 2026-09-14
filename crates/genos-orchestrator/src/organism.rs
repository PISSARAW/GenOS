//! Boucle unifiée de l'organisme : un seul cycle qui **perçoit**, se **régule**
//! (réparation, nourriture), **décide**, **agit**, **consomme** de l'ATP et
//! **apprend** — en couplant toutes les phases précédentes.
//!
//! `organism_tick` compose : autopoïèse (Phase 6), métabolisme (Phase 3),
//! buts endogènes (Phase 2), décision/apprentissage (Phases 4) et, en variante,
//! l'environnement incarné (Phase 1).

use crate::GenosEcosystem;
use crate::director::Strategy;
use crate::environment::Environment;
use crate::planner::Concept;

/// Réglages de la boucle organisme.
#[derive(Clone, Debug)]
pub struct OrganismConfig {
    pub auto_repair: bool,
    /// Nourrir automatiquement sous ce niveau d'ATP.
    pub feed_below: f64,
    pub feed_amount: f64,
}

impl Default for OrganismConfig {
    fn default() -> Self {
        Self {
            auto_repair: true,
            feed_below: 80.0,
            feed_amount: 50.0,
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
}

impl GenosEcosystem {
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
            };
        }

        // 1. Régulation : auto-réparation de la frontière et des composants.
        let mut repairs = Vec::new();
        if config.auto_repair
            && self.orchestrator.membrane.integrity < self.orchestrator.membrane.capacity - 0.1
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
        let report = self.tick(&goal);

        OrganismReport {
            tick,
            goal: format!("{goal:?}"),
            strategy: Some(report.strategy),
            executed: report.executed,
            integrity: self.orchestrator.membrane.integrity,
            atp: self.orchestrator.metabolism.available(),
            alive: self.orchestrator.membrane.integrity > 0.0,
            repairs,
            fed,
            halt: report.halt,
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
            };
        }

        let mut repairs = Vec::new();
        if config.auto_repair
            && self.orchestrator.membrane.integrity < self.orchestrator.membrane.capacity - 0.1
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
            integrity: self.orchestrator.membrane.integrity,
            atp: self.orchestrator.metabolism.available(),
            alive: self.orchestrator.membrane.integrity > 0.0,
            repairs,
            fed,
            halt: if embodied.success {
                None
            } else {
                Some(embodied.reason)
            },
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
