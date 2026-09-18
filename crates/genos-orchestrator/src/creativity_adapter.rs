use crate::director::Director;
use crate::planner::Concept;
use genos_creativity::consolidation::{ActionStats, ConsolidationTarget};
use genos_creativity::dopamine::DopamineTarget;
use std::collections::BTreeMap;

/// Adaptateur entre les concepts locaux de l'orchestrateur et ceux du crate
/// créativité. Les deux crates restent découplés sans perdre la consolidation.
pub(crate) struct CreativityDirectorAdapter<'a> {
    director: &'a mut Director,
    stats: BTreeMap<genos_creativity::Concept, ActionStats>,
}

impl<'a> CreativityDirectorAdapter<'a> {
    pub(crate) fn new(director: &'a mut Director) -> Self {
        let stats = director
            .stats
            .iter()
            .map(|(concept, stats)| {
                (
                    to_creative_concept(*concept),
                    ActionStats {
                        attempts: stats.attempts,
                        successes: stats.successes,
                    },
                )
            })
            .collect();
        Self { director, stats }
    }

    pub(crate) fn finish(self) {
        let CreativityDirectorAdapter { director, stats } = self;
        director.stats = stats
            .into_iter()
            .map(|(concept, stats)| {
                (
                    from_creative_concept(concept),
                    crate::planner::ActionStats {
                        attempts: stats.attempts,
                        successes: stats.successes,
                    },
                )
            })
            .collect();
    }
}

impl DopamineTarget for CreativityDirectorAdapter<'_> {
    fn exploration_weight(&self) -> f64 {
        self.director.exploration_weight
    }

    fn set_exploration_weight(&mut self, value: f64) {
        self.director.exploration_weight = value;
    }

    fn stress_cost_weight(&self) -> f64 {
        self.director.stress_cost_weight
    }

    fn set_stress_cost_weight(&mut self, value: f64) {
        self.director.stress_cost_weight = value;
    }
}

impl ConsolidationTarget for CreativityDirectorAdapter<'_> {
    fn stats_mut(&mut self) -> &mut BTreeMap<genos_creativity::Concept, ActionStats> {
        &mut self.stats
    }

    fn record_concept(&mut self, concept: genos_creativity::Concept, success: bool) {
        self.director.record(from_creative_concept(concept), success);
    }

    fn learner_predict(&self, concept: &genos_creativity::Concept, context: &[f64]) -> f64 {
        self.director
            .learner
            .predict(from_creative_concept(*concept), context)
    }

    fn learner_update(
        &mut self,
        concept: &genos_creativity::Concept,
        context: &[f64],
        reward: f64,
    ) {
        self.director
            .learner
            .update(from_creative_concept(*concept), context, reward);
    }
}

pub(crate) fn to_creative_concept(concept: Concept) -> genos_creativity::Concept {
    use genos_creativity::Concept as C;
    match concept {
        Concept::Observe => C::Observe,
        Concept::Replay => C::Replay,
        Concept::Organize => C::Organize,
        Concept::Recruit => C::Recruit,
        Concept::Delegate => C::Delegate,
        Concept::Audit => C::Audit,
        Concept::Immune => C::Immune,
        Concept::Virology => C::Virology,
        Concept::Throttle => C::Throttle,
        Concept::Therapy => C::Therapy,
        Concept::Spore => C::Spore,
        Concept::Glia => C::Glia,
        Concept::Signaling => C::Signaling,
        Concept::Stigmergy => C::Stigmergy,
        Concept::Quorum => C::Quorum,
        Concept::Neuro => C::Neuro,
        Concept::Mutate => C::Mutate,
        Concept::Cross => C::Cross,
        Concept::Endosymbiosis => C::Endosymbiosis,
        Concept::Genomics => C::Genomics,
        Concept::Plasmid => C::Plasmid,
        Concept::Feign => C::Feign,
        Concept::Kill => C::Kill,
        Concept::Communicate => C::Communicate,
        Concept::Actuate => C::Actuate,
    }
}

pub(crate) fn from_creative_concept(concept: genos_creativity::Concept) -> Concept {
    use genos_creativity::Concept as C;
    match concept {
        C::Observe => Concept::Observe,
        C::Replay => Concept::Replay,
        C::Organize => Concept::Organize,
        C::Recruit => Concept::Recruit,
        C::Delegate => Concept::Delegate,
        C::Audit => Concept::Audit,
        C::Immune => Concept::Immune,
        C::Virology => Concept::Virology,
        C::Throttle => Concept::Throttle,
        C::Therapy => Concept::Therapy,
        C::Spore => Concept::Spore,
        C::Glia => Concept::Glia,
        C::Signaling => Concept::Signaling,
        C::Stigmergy => Concept::Stigmergy,
        C::Quorum => Concept::Quorum,
        C::Neuro => Concept::Neuro,
        C::Mutate => Concept::Mutate,
        C::Cross => Concept::Cross,
        C::Endosymbiosis => Concept::Endosymbiosis,
        C::Genomics => Concept::Genomics,
        C::Plasmid => Concept::Plasmid,
        C::Feign => Concept::Feign,
        C::Kill => Concept::Kill,
        C::Communicate => Concept::Communicate,
        C::Actuate => Concept::Actuate,
    }
}
