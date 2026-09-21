//! Volition endogène : buts autonomes **hors mission contractuelle**.
//!
//! Deux mécanismes, distincts du `Goal`/`Director`/`Planner` habituels :
//! - le **réflexe vital** (survie pure) : quand la pression de survie devient
//!   critique, l'organisme agit directement pour se préserver, **sans passer
//!   par la délibération** (Director/Planner) et **sans se soucier du but
//!   externe** en cours — une volition qui n'a besoin de la permission
//!   d'aucune mission.
//! - le **désir libre** : un appétit qui croît tant que l'organisme est en
//!   sécurité, ne vise la résorption d'aucun déficit mesurable, et s'exprime
//!   pour lui-même (autotélique) dès qu'il est assez fort.
//!
//! Les deux portent une **mémoire d'un tick à l'autre** (`VolitionState`) :
//! contrairement à `Drives`/`GoalSelector` (recalculés à neuf depuis le seul
//! `WorldState` instantané), la volition se **propage** avec une inertie
//! endogène, comme une pulsion qui persiste au-delà de l'instant qui l'a fait
//! naître.

use crate::director::Strategy;
use crate::drives::Drives;
use crate::planner::WorldState;
use crate::tick::TickReport;
use crate::GenosEcosystem;
use serde_json::json;

/// Coût ATP du réflexe vital : débité directement, hors coût de `Concept`.
const VITAL_REFLEX_ATP_COST: f64 = 5.0;
/// Coût ATP du désir libre : débité directement, hors coût de `Concept`.
const FREE_DESIRE_ATP_COST: f64 = 2.0;
/// Réparation de membrane appliquée par le réflexe vital, si l'ATP est disponible.
const VITAL_REFLEX_REPAIR_AMOUNT: f64 = 0.15;
/// En-dessous de ce seuil d'intégrité membranaire, la survie est en jeu
/// physiquement : le réflexe vital ne se substitue à la mission que dans une
/// crise réelle, jamais pour un simple déficit déjà géré par la mission
/// normale (maladie, menace) via `RecoverAgent`/`SecurePerimeter`.
const MEMBRANE_CRISIS_THRESHOLD: f64 = 0.3;

/// Volition endogène persistante : porte la mémoire du tick précédent au lieu
/// d'être recalculée à neuf (buts autonomes hors mission contractuelle).
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct VolitionState {
    /// Pression de survie, avec mémoire (moyenne mobile exponentielle).
    pub survival_drive: f64,
    /// Désir libre : croît hors de tout déficit mesurable, purement pour
    /// lui-même, et s'efface devant l'urgence sans jamais être requis par elle.
    pub free_desire: f64,
    pub ticks_survived: u64,
}

impl VolitionState {
    const MOMENTUM: f64 = 0.6;
    const DESIRE_GROWTH_PER_SAFE_TICK: f64 = 0.08;
    const DESIRE_DECAY_UNDER_PRESSURE: f64 = 0.15;
    /// Au-delà de ce seuil, la survie devient un réflexe direct : elle
    /// court-circuite le Directeur/Planificateur et toute mission externe.
    pub const CRITICAL_SURVIVAL_THRESHOLD: f64 = 0.85;
    /// Au-delà de ce seuil, le désir libre est assez fort pour s'exprimer par
    /// lui-même, sans qu'aucun déficit du monde ne l'exige.
    pub const FREE_DESIRE_THRESHOLD: f64 = 0.6;

    /// Propage la volition d'un tick au suivant (inertie endogène), au lieu de
    /// la recalculer à neuf depuis le seul instant présent.
    pub fn propagate(previous: &VolitionState, state: &WorldState) -> VolitionState {
        let instant = Drives::from_state(state).survival;
        let survival_drive = (Self::MOMENTUM * previous.survival_drive
            + (1.0 - Self::MOMENTUM) * instant)
            .clamp(0.0, 1.0);
        let safe =
            state.threat <= 0.0 && !state.adversary && state.diseased == 0 && !state.traitor;
        let free_desire = if state.apoptotic {
            0.0
        } else if safe {
            (previous.free_desire + Self::DESIRE_GROWTH_PER_SAFE_TICK).min(1.0)
        } else {
            (previous.free_desire - Self::DESIRE_DECAY_UNDER_PRESSURE).max(0.0)
        };
        VolitionState {
            survival_drive,
            free_desire,
            ticks_survived: previous.ticks_survived.saturating_add(1),
        }
    }

    /// Vrai quand la survie exige un réflexe immédiat, hors délibération.
    pub fn demands_vital_reflex(&self) -> bool {
        self.survival_drive >= Self::CRITICAL_SURVIVAL_THRESHOLD
    }

    /// Vrai quand le désir libre est assez fort pour s'exprimer par lui-même.
    pub fn demands_free_expression(&self) -> bool {
        self.free_desire >= Self::FREE_DESIRE_THRESHOLD
    }
}

impl GenosEcosystem {
    /// Volition endogène courante (survie + désir libre), avec mémoire.
    pub fn volition_state(&self) -> VolitionState {
        self.instincts.volition
    }

    /// Dernière raison de réflexe vital déclenché (hors mission), le cas échéant.
    pub fn last_vital_reflex(&self) -> Option<&str> {
        self.instincts.last_reflex.as_deref()
    }

    /// Dernière expression de désir libre (hors mission), le cas échéant.
    pub fn last_free_desire(&self) -> Option<&str> {
        self.instincts.last_desire_expression.as_deref()
    }

    /// Propage la volition endogène (mémoire d'un tick à l'autre).
    pub(crate) fn propagate_volition(&mut self, state: &WorldState) {
        self.instincts.volition = VolitionState::propagate(&self.instincts.volition, state);
    }

    /// Réflexe vital : préservation directe, **hors** Director/Planner et hors
    /// mission contractuelle — déclenché seulement par une crise physique
    /// réelle (membrane en péril), pas par un déficit déjà géré par la mission.
    pub(crate) fn vital_reflex(&mut self) -> bool {
        let in_crisis = self.orchestrator.membrane.total_integrity() < MEMBRANE_CRISIS_THRESHOLD;
        if !in_crisis || !self.instincts.volition.demands_vital_reflex() {
            self.instincts.last_reflex = None;
            return false;
        }
        let pressure = self.instincts.volition.survival_drive;
        let spent = self.orchestrator.metabolism.consume(VITAL_REFLEX_ATP_COST);
        if !spent {
            return false;
        }
        self.orchestrator.membrane.repair(VITAL_REFLEX_REPAIR_AMOUNT);
        let reason = format!(
            "survie pure : pression={pressure:.2} (hors mission, hors deliberation)"
        );
        self.record_event(
            "VITAL_REFLEX",
            json!({ "reason": &reason, "atp_spent": spent, "survival_drive": pressure }),
        );
        self.instincts.last_reflex = Some(reason);
        true
    }

    /// Désir libre : le système agit pour lui-même, sans qu'aucun but externe
    /// ni aucun déficit mesurable ne l'exige — préférence autotélique.
    pub(crate) fn express_free_desire(&mut self, state: &WorldState) -> bool {
        if state.apoptotic || !self.instincts.volition.demands_free_expression() {
            return false;
        }
        let intensity = self.instincts.volition.free_desire;
        let spent = self.orchestrator.metabolism.consume(FREE_DESIRE_ATP_COST);
        if !spent {
            return false;
        }
        self.deposit_trail("VAGABONDAGE", intensity);
        self.record_event(
            "FREE_DESIRE",
            json!({ "intensity": intensity, "atp_spent": spent, "reason": "desir libre, independant de toute mission" }),
        );
        self.instincts.last_desire_expression =
            Some(format!("vagabondage(intensite={intensity:.2})"));
        self.instincts.volition.free_desire = 0.0;
        true
    }

    /// Bilan de tick pour un arrêt sans délibération (membrane rompue, apoptose).
    pub(crate) fn halted_report(&self, reason: &str) -> TickReport {
        self.bare_report(Some(reason.to_string()))
    }

    /// Bilan de tick pour un réflexe vital : le tick a agi, hors délibération.
    pub(crate) fn reflex_report(&self) -> TickReport {
        self.bare_report(None)
    }

fn bare_report(&self, halt: Option<String>) -> TickReport {
        TickReport {
            tick: self.events.count() as u64,
            strategy: Strategy::Solo,
            organization: "n/a",
            superorganism: "n/a",
            planned: Vec::new(),
            executed: Vec::new(),
            halt,
            verdicts: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn survival_drive_persiste_au_dela_de_l_instant_qui_l_a_fait_naitre() {
        let threatened = WorldState { threat: 0.9, stress: 0.9, ..Default::default() };
        let safe = WorldState::default();
        let after_threat = VolitionState::propagate(&VolitionState::default(), &threatened);
        assert!(after_threat.survival_drive > 0.0);
        let after_calm = VolitionState::propagate(&after_threat, &safe);
        // La pression retombe progressivement mais NE tombe PAS instantanement a 0 :
        // c'est la memoire endogene, contrairement a Drives::from_state (pur, sans etat).
        assert!(after_calm.survival_drive > 0.0);
        assert!(after_calm.survival_drive < after_threat.survival_drive);
    }

    #[test]
    fn desir_libre_croit_en_securite_et_ne_resout_aucun_deficit() {
        let mut volition = VolitionState::default();
        let safe = WorldState::default();
        for _ in 0..10 {
            volition = VolitionState::propagate(&volition, &safe);
        }
        assert!(volition.demands_free_expression());
    }

    #[test]
    fn desir_libre_s_efface_devant_l_urgence_sans_etre_requis_par_elle() {
        let mut volition = VolitionState::default();
        let safe = WorldState::default();
        for _ in 0..10 {
            volition = VolitionState::propagate(&volition, &safe);
        }
        assert!(volition.demands_free_expression());
        let danger = WorldState { threat: 0.9, ..Default::default() };
        for _ in 0..3 {
            volition = VolitionState::propagate(&volition, &danger);
        }
        assert!(!volition.demands_free_expression());
    }

    #[test]
    fn reflexe_vital_court_circuite_le_director_hors_de_toute_mission() {
        let mut eco = GenosEcosystem::new("survivant");
        eco.orchestrator.membrane.integrity = 0.05;
        eco.orchestrator.membrane.semantic_integrity = 0.05;
        let critical = WorldState {
            threat: 1.0,
            stress: 1.0,
            diseased: 3,
            budget_pressure: 1.0,
            ..Default::default()
        };
        for _ in 0..5 {
            eco.propagate_volition(&critical);
        }
        assert!(eco.volition_state().demands_vital_reflex());
        assert!(eco.vital_reflex());
        assert!(eco.last_vital_reflex().is_some());
    }
}
