//! Buts endogènes : les **drives** (énergie, intégrité, curiosité) dérivent du
//! monde, et le `GoalSelector` en déduit un but **sans qu'aucun but externe ne
//! soit fourni** (réduction de déficit, façon homéostasie).

use crate::GenosEcosystem;
use crate::planner::{Concept, Goal, WorldState};
use crate::tick::{MissionReport, TickReport};

/// Besoins internes (1 = satisfait pour energie/integrite, 1 = forte pour curiosite).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Drives {
    pub energy: f64,
    pub integrity: f64,
    pub curiosity: f64,
    /// Pression endogène de préservation, indépendante d'une mission externe.
    pub survival: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Volition {
    pub survival_drive: f64,
    pub mission_independent: bool,
    pub terminal: bool,
}

impl Drives {
    pub fn from_state(state: &WorldState) -> Self {
        let integrity = (1.0
            - state.diseased as f64 / 3.0
            - if state.traitor { 1.0 } else { 0.0 }
            - 0.5 * state.stress)
            .clamp(0.0, 1.0);
        Self {
            energy: (1.0 - state.budget_pressure).clamp(0.0, 1.0),
            integrity,
            curiosity: (1.0 - state.stress).clamp(0.0, 1.0)
                * if state.observed { 0.3 } else { 1.0 },
            survival: (0.35 * state.budget_pressure
                + 0.25 * state.stress
                + 0.20 * state.threat
                + 0.20 * (1.0 - integrity))
                .clamp(0.0, 1.0),
        }
    }

    pub fn volition(state: &WorldState) -> Volition {
        let drives = Self::from_state(state);
        Volition {
            survival_drive: drives.survival,
            mission_independent: true,
            terminal: state.apoptotic,
        }
    }
}

/// Sélectionne un but endogène à partir des drives et de l'état.
pub struct GoalSelector;

impl GoalSelector {
    pub fn drives(state: &WorldState) -> Drives {
        Drives::from_state(state)
    }

    pub fn select(state: &WorldState) -> Goal {
        if state.apoptotic {
            return Goal::Conserve;
        }
        let drives = Drives::from_state(state);
        if drives.survival >= 0.7 {
            return Goal::Conserve;
        }
        if state.diseased > 0 || state.traitor {
            return Goal::RecoverAgent;
        }
        if (state.threat > 0.0 || state.adversary) && !state.observed {
            return Goal::SecurePerimeter;
        }
        if drives.energy < 0.4 {
            return Goal::Conserve;
        }
        if drives.curiosity > 0.5 && !state.observed {
            return Goal::Explore;
        }
        Goal::SecurePerimeter
    }
}

impl GenosEcosystem {
    /// Drives courants dérivés de l'état observé.
    pub fn drives(&self) -> Drives {
        Drives::from_state(&self.observe())
    }

    /// But endogène courant (aucun but externe requis).
    pub fn autonomous_goal(&self) -> Goal {
        GoalSelector::select(&self.observe())
    }

    pub fn tick_autonomous(&mut self) -> TickReport {
        let goal = self.autonomous_goal();
        self.tick(&goal)
    }

    /// Boucle autonome : à chaque tick, le but est **recalculé** depuis les drives.
    pub fn run_autonomous(&mut self, max_ticks: usize) -> MissionReport {
        let agents_before = self.orchestrator.active_cells.len();
        let mut executed: Vec<Concept> = Vec::new();
        let mut verdicts = 0usize;
        let mut halt_reason = None;
        let mut halted = false;
        let mut ticks = 0usize;
        let mut goals: Vec<String> = Vec::new();

        for _ in 0..max_ticks {
            let goal = self.autonomous_goal();
            goals.push(format!("{goal:?}"));
            let report = self.tick(&goal);
            ticks += 1;
            for concept in &report.executed {
                if !executed.contains(concept) {
                    executed.push(*concept);
                }
            }
            verdicts += report.verdicts.len();
            if let Some(reason) = report.halt {
                halt_reason = Some(reason);
                halted = true;
                break;
            }
        }

        let final_state = self.observe();
        let reached = final_state.goal_reached(&GoalSelector::select(&final_state));
        MissionReport {
            ticks,
            halted,
            halt_reason,
            reached,
            executed,
            verdicts,
            agents_before,
            agents_after: self.orchestrator.active_cells.len(),
            traces: self.traces.known(),
            goals,
        }
    }
}
