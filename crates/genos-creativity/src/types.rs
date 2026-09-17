//! Types minimalistes alignés sur genos-orchestrator pour le moteur de créativité.
//!
//! Ces types sont des copies locales car genos-creativity ne peut pas dépendre
//! de genos-orchestrator (cycle de dépendance). Ils sont alignés sur les types
//! réels du crate orchestrator.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Concepts mobilisable par l'orchestrateur (copie locale alignée).
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
    Actuate,
}

impl Concept {
    pub fn all() -> Vec<Concept> {
        use Concept::*;
        vec![
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
            Actuate,
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

/// Buts de mission (copie locale alignée).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum Goal {
    #[default]
    SecurePerimeter,
    RecoverAgent,
    RepairModule,
    Explore,
    Conserve,
}

/// État du monde observable (copie locale minimale pour le moteur de créativité).
#[derive(Clone, Debug)]
pub struct WorldState {
    pub budget: f64,
    pub observed: bool,
    pub tested: BTreeSet<Concept>,
    pub goal: Goal,
}

impl Default for WorldState {
    fn default() -> Self {
        Self {
            budget: f64::MAX,
            observed: false,
            tested: BTreeSet::new(),
            goal: Goal::SecurePerimeter,
        }
    }
}

impl WorldState {
    pub fn applicable(&self, c: Concept) -> bool {
        !self.tested.contains(&c)
    }
}

/// Métabolisme énergétique simplifié pour le moteur de créativité.
#[derive(Clone, Debug)]
pub struct Metabolism {
    pub atp: f64,
    pub capacity: f64,
}

impl Default for Metabolism {
    fn default() -> Self {
        Self {
            atp: 100.0,
            capacity: 100.0,
        }
    }
}

impl Metabolism {
    pub fn new(capacity: f64) -> Self {
        Self {
            atp: capacity,
            capacity,
        }
    }

    pub fn available(&self) -> f64 {
        self.atp
    }

    pub fn consume(&mut self, cost: f64) -> bool {
        if self.atp + 1e-9 >= cost {
            self.atp -= cost;
            true
        } else {
            false
        }
    }
}
