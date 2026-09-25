use crate::GenosEcosystem;
use crate::director::Strategy;
use crate::planner::Concept;
use crate::tick::TickReport;

impl GenosEcosystem {
    /// Exécute une séquence de concepts donnée (utilisé par les mondes isolés).
    pub fn execute_concepts(&mut self, concepts: &[Concept]) -> Vec<Concept> {
        let mut report = TickReport {
            tick: 0,
            strategy: Strategy::Solo,
            organization: "n/a",
            superorganism: "n/a",
            planned: concepts.to_vec(),
            executed: Vec::new(),
            halt: None,
            verdicts: Vec::new(),
        };
        for concept in concepts {
            self.execute_concept(*concept, &mut report);
            report.executed.push(*concept);
        }
        report.executed
    }

    /// Exécute un concept individuel (utilisé par execute_concepts).
    pub fn execute_concept(&mut self, concept: Concept, report: &mut TickReport) {
        // Simple execution - just record the concept
        report.executed.push(concept);
    }
}
