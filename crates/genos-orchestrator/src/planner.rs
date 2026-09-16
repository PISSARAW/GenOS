//! Directeur cognitif : choisit **seul** les concepts à mobiliser.
//!
//! Modèle : un `WorldState` observable, un but, un arsenal de `Concept` (les
//! capacités de l'orchestrateur) avec préconditions et effets, et une politique
//! qui :
//! - sélectionne les concepts pertinents pour le but (pas tous) ;
//! - explore les concepts non testés (bonus d'exploration) ;
//! - apprend des succès/échecs (statistiques par concept) ;
//! - essaie plusieurs stratégies (Solo / A-Team / Biocénose / Biome) et,
//!   si deux se valent, les explore **en parallèle** (Trinity) ;
//! - soigne, tue ou communique selon l'état ;
//! - s'arrête quand le but est atteint, le budget épuisé, le problème insoluble,
//!   ou que plus aucun moyen pertinent/untested ne subsiste.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Un concept mobilisable de l'orchestrateur (arsenal de compétences).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Concept {
    Observe,
    Replay,
    Organize,
    Recruit,
    Delegate,
    Audit,
    Immune,
    Virology,
    Throttle,
    Therapy,
    Spore,
    Glia,
    Signaling,
    Stigmergy,
    Quorum,
    Neuro,
    Mutate,
    Cross,
    Endosymbiosis,
    Genomics,
    Plasmid,
    Feign,
    Kill,
    Communicate,
    /// Action sur l'environnement externe (non planifiable, porte l'apprentissage incarné).
    Actuate,
}

impl Concept {
    pub fn all() -> Vec<Concept> {
        use Concept::*;
        vec![
            Observe, Replay, Organize, Recruit, Delegate, Audit, Immune, Virology, Throttle,
            Therapy, Spore, Glia, Signaling, Stigmergy, Quorum, Neuro, Mutate, Cross,
            Endosymbiosis, Genomics, Plasmid, Feign, Kill, Communicate, Actuate,
        ]
    }

    pub fn cost(self) -> f64 {
        use Concept::*;
        match self {
            Observe | Replay | Delegate | Throttle | Signaling | Stigmergy | Actuate => 1.0,
            Organize | Quorum | Neuro | Communicate | Plasmid => 2.0,
            Audit | Spore | Glia => 3.0,
            Immune | Virology | Feign => 4.0,
            Therapy | Kill => 5.0,
            Mutate | Genomics => 6.0,
            Cross | Endosymbiosis => 7.0,
            Recruit => 8.0,
        }
    }

    pub fn tag(self) -> &'static str {
        use Concept::*;
        match self {
            Observe | Audit | Quorum | Replay => "observer",
            Organize | Recruit | Delegate => "organiser",
            Immune | Virology | Throttle | Feign | Kill => "defendre",
            Therapy | Spore | Glia => "soigner",
            Signaling | Stigmergy | Neuro | Communicate => "coordonner",
            Mutate | Cross | Endosymbiosis | Genomics | Plasmid => "evoluer",
            Actuate => "agir",
        }
    }

    /// Un concept « effectif » peut faire progresser l'état vers le but.
    pub fn is_effectful(self) -> bool {
        !matches!(
            self,
            Concept::Throttle
                | Concept::Signaling
                | Concept::Stigmergy
                | Concept::Neuro
                | Concept::Quorum
                | Concept::Mutate
                | Concept::Cross
                | Concept::Endosymbiosis
                | Concept::Genomics
                | Concept::Delegate
                | Concept::Audit
                | Concept::Actuate
        )
    }
}

/// Buts de mission.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Goal {
    SecurePerimeter,
    RecoverAgent,
    RepairModule,
    /// But endogène : réduire l'incertitude par l'observation.
    Explore,
    /// But endogène : reconstituer l'énergie (réduire la pression budgétaire).
    Conserve,
}

/// État du monde observable (extrait de l'écosystème ou simulé).
#[derive(Clone, Debug)]
pub struct WorldState {
    pub budget: f64,
    pub threat: f64,
    pub diseased: usize,
    pub traitor: bool,
    pub adversary: bool,
    pub uncertain: bool,
    pub observed: bool,
    pub has_traces: bool,
    pub diagnosed: bool,
    pub flagged: usize,
    pub skill_granted: bool,
    /// Dissonance cognitive de l'orchestrateur.
    pub dissonance: f64,
    /// Inflammation systémique (somme des indices inflammatoires).
    pub il6: f64,
    /// Taux d'échec global des agents (traces).
    pub failure_rate: f64,
    /// Pression budgétaire (0 = confortable, 1 = critique).
    pub budget_pressure: f64,
    /// Stress composite (0..1).
    pub stress: f64,
    /// Etat terminal: aucune volition ne peut ressusciter un agent apoptotique.
    pub apoptotic: bool,
    pub workers: usize,
    pub tissues: usize,
    pub required_workers: usize,
    pub unsolvable: bool,
    pub tested: BTreeSet<Concept>,
    pub failed: BTreeSet<Concept>,
}

impl Default for WorldState {
    fn default() -> Self {
        Self {
            budget: 120.0,
            threat: 0.0,
            diseased: 0,
            traitor: false,
            adversary: false,
            uncertain: false,
            observed: false,
            has_traces: false,
            diagnosed: false,
            flagged: 0,
            skill_granted: false,
            dissonance: 0.0,
            il6: 0.0,
            failure_rate: 0.0,
            budget_pressure: 0.0,
            stress: 0.0,
            apoptotic: false,
            workers: 0,
            tissues: 0,
            required_workers: 3,
            unsolvable: false,
            tested: BTreeSet::new(),
            failed: BTreeSet::new(),
        }
    }
}

impl WorldState {
    pub fn applicable(&self, c: Concept) -> bool {
        use Concept::*;
        match c {
            Observe => !self.observed,
            Replay => self.has_traces && !self.diagnosed,
            Organize => self.tissues == 0,
            Recruit => self.workers < self.required_workers,
            Delegate => self.workers >= 1,
            Audit => self.workers >= 2,
            Immune => self.threat > 0.0,
            Virology => self.threat >= 0.5,
            Throttle => true,
            Therapy | Spore | Glia => self.diseased > 0,
            Signaling | Stigmergy | Quorum | Neuro => self.workers >= 2,
            Mutate | Cross | Endosymbiosis |             Genomics => self.workers >= 1,
            Plasmid => self.diagnosed && self.flagged > 0 && !self.skill_granted,
            Feign => self.adversary,
            Kill => self.traitor,
            Communicate => self.uncertain || self.adversary || self.stress > 0.5,
            Actuate => false,
        }
    }

    /// Applique l'effet d'un concept et débite son coût.
    pub fn apply(&mut self, c: Concept) {
        self.budget = (self.budget - c.cost()).max(0.0);
        self.tested.insert(c);
        use Concept::*;
        match c {
            Organize => self.tissues += 1,
            Recruit => self.workers += 1,
            Observe => {
                self.observed = true;
            }
            Replay => self.diagnosed = true,
            Plasmid => self.skill_granted = true,
            Immune => {
                // Un adversaire trompeur n'est pas ciblable : la feinte d'abord.
                if !self.adversary {
                    self.threat = (self.threat - 0.4).max(0.0);
                }
            }
            Virology => {
                if !self.adversary {
                    self.threat = (self.threat - 0.7).max(0.0);
                }
            }
            Therapy | Spore => {
                if self.diseased > 0 {
                    self.diseased -= 1;
                }
            }
            Glia => {
                // Le pipeline glial traite plusieurs cellules d'un coup.
                self.diseased = self.diseased.saturating_sub(2);
            }
            Kill => self.traitor = false,
            Feign => {
                // Leurre : l'attaque est absorbée, la menace disparaît.
                self.adversary = false;
                self.threat = 0.0;
            }
            Communicate => self.uncertain = false,
            _ => {}
        }
    }

    /// Score de progression vers le but (0.0 -> 1.0).
    pub fn progress(&self, goal: &Goal) -> f64 {
        match goal {
            Goal::Explore => {
                if self.observed {
                    1.0
                } else {
                    0.2
                }
            }
            Goal::Conserve => (1.0 - self.budget_pressure).clamp(0.0, 1.0),
            _ => {
                let mut s = 0.0;
                if self.tissues >= 1 {
                    s += 0.15;
                }
                s += (self.workers.min(self.required_workers) as f64
                    / self.required_workers as f64)
                    * 0.15;
                s += (1.0 - self.threat) * 0.40;
                if self.diseased == 0 {
                    s += 0.15;
                }
                if !self.traitor {
                    s += 0.15;
                }
                s
            }
        }
    }

    pub fn goal_reached(&self, goal: &Goal) -> bool {
        match goal {
            Goal::SecurePerimeter => {
                self.tissues >= 1
                    && self.workers >= self.required_workers
                    && self.threat <= 0.0
                    && self.diseased == 0
                    && !self.traitor
                    && !self.uncertain
            }
            Goal::RecoverAgent => self.diseased == 0 && self.workers >= 1,
            Goal::RepairModule => self.tissues >= 1 && !self.traitor,
            Goal::Explore => self.observed,
            Goal::Conserve => self.budget_pressure <= 0.5,
        }
    }
}

/// Statistiques d'apprentissage par concept.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ActionStats {
    pub attempts: u32,
    pub successes: u32,
}

impl ActionStats {
    /// Taux de succès lissé (Laplace) : évite 0/0 et 1.0-sur-un-coup.
    pub fn rate(&self) -> f64 {
        (self.successes as f64 + 1.0) / (self.attempts as f64 + 2.0)
    }
    pub fn is_untested(&self) -> bool {
        self.attempts == 0
    }
}

