//! Observation live : construit l'état du monde à partir de l'écosystème.
//!
//! Ferme la boucle perception → décision : le directeur lit un `WorldState`
//! dérivé de l'état réel (`GenosEcosystem`) au lieu d'une entrée manuelle.

use crate::GenosEcosystem;
use crate::planner::WorldState;
use crate::trace::{Outcome, Verdict};
use genos_biology::pathology::assess_agent_clinical_status;

impl GenosEcosystem {
    /// Observe l'écosystème et produit l'état utilisé par le directeur.
    pub fn observe(&self) -> WorldState {
        let tissues = self.orchestrator.tissues.len();
        let workers: usize = self
            .orchestrator
            .tissues
            .values()
            .map(|tissue| tissue.somatic_cells.len())
            .sum();
        let active_virions = self
            .virology
            .virions
            .iter()
            .filter(|virion| !virion.is_neutralized)
            .count();
        let diseased = self
            .orchestrator
            .active_cells
            .values()
            .filter(|cell| !assess_agent_clinical_status(cell).is_healthy)
            .count();
        let flagged = self
            .traces
            .traces
            .keys()
            .filter(|id| self.traces.diagnose(**id) != Verdict::Healthy)
            .count();

        // Entrées de stress : dissonance, inflammation, échec, pression budgétaire.
        let dissonance = self.orchestrator.conscience_state.dissonance_level;
        let il6: f64 = self
            .orchestrator
            .active_cells
            .values()
            .map(|cell| cell.clinical.inflammatory_index)
            .sum();
        let (attempts, failures) = self
            .traces
            .traces
            .values()
            .flat_map(|trace| &trace.events)
            .fold((0usize, 0usize), |(attempts, failures), event| {
                (
                    attempts + 1,
                    failures + usize::from(matches!(event.outcome, Outcome::Failure)),
                )
            });
        let failure_rate = if attempts == 0 {
            0.0
        } else {
            failures as f64 / attempts as f64
        };
        let budget = self.orchestrator.metabolism.available();
        let budget_pressure = (1.0 - budget / 200.0).clamp(0.0, 1.0);
        let stress = (0.35 * (dissonance / 50.0)
            + 0.25 * (il6 / 10.0)
            + 0.20 * failure_rate
            + 0.20 * budget_pressure)
            .clamp(0.0, 1.0);

        WorldState {
            tissues,
            workers,
            threat: (active_virions as f64 * 0.4).min(1.0),
            diseased,
            uncertain: self.events.count() == 0,
            observed: self.events.count() > 0,
            budget,
            adversary: active_virions >= 2,
            has_traces: self.traces.known() > 0,
            flagged,
            dissonance,
            il6,
            failure_rate,
            budget_pressure,
            stress,
            required_workers: 5,
            ..WorldState::default()
        }
    }
}
