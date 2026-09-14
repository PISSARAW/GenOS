//! Observation live : construit l'état du monde à partir de l'écosystème.
//!
//! Ferme la boucle perception → décision : le directeur lit un `WorldState`
//! dérivé de l'état réel (`GenosEcosystem`) au lieu d'une entrée manuelle.

use crate::GenosEcosystem;
use crate::planner::WorldState;
use crate::trace::Verdict;
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

        WorldState {
            tissues,
            workers,
            threat: (active_virions as f64 * 0.4).min(1.0),
            diseased,
            uncertain: self.events.count() == 0,
            budget: 40.0 + 20.0 * workers as f64,
            has_traces: self.traces.known() > 0,
            flagged,
            ..WorldState::default()
        }
    }
}
