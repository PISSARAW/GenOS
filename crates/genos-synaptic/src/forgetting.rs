use crate::ampk::AmpkMode;
use crate::graph::SynapticMemoryGraph;

pub trait PrunableNode {
    fn synaptic_weight(&self) -> f32;
    fn prune_children(&mut self, threshold: f32);
}

pub struct ForgettingConfig {
    pub prune_threshold: f32,
}

pub struct SleepCycleProcessor {
    pub config: ForgettingConfig,
}

impl SleepCycleProcessor {
    pub fn new(config: ForgettingConfig) -> Self {
        Self { config }
    }

    pub fn execute_node_pruning<N: PrunableNode>(&self, root: &mut N, mode: AmpkMode) {
        if mode == AmpkMode::Conservation {
            root.prune_children(self.config.prune_threshold);
        }
    }

    pub fn execute_graph_pruning(&self, graph: &mut SynapticMemoryGraph, mode: AmpkMode) {
        if mode == AmpkMode::Conservation {
            graph.prune_and_scale();
        }
    }
}
