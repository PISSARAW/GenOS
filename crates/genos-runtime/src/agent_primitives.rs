use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Build the explicit logical state used to bootstrap a manifest-driven
/// project into an atomic agent-world capsule.
pub fn initialize_project_snapshot(
    name: &str,
    role: &str,
    world_id: genos_core::WorldId,
    branch_id: genos_core::BranchId,
    budget_steps: u64,
) -> genos_core::AgentSnapshot {
    use genos_core::*;
    let genome_id = GenomeId::new();
    AgentSnapshot {
        snapshot_id: SnapshotId::new(),
        agent_id: AgentId::new(),
        branch_id: branch_id.clone(),
        branch_metadata: BranchMetadata::default(),
        genome: AgentGenome {
            id: genome_id.clone(),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            ecological_niche: None,
            version: GenomeVersion("0.1.0".to_string()),
            identity: Identity {
                name: name.to_string(),
                role: role.to_string(),
            },
            cognition: CognitionConfig {
                chromosomes: vec![
                    genos_core::Chromosome {
                        name: "C1".to_string(),
                        loci: vec![
                            genos_core::Locus { gene_name: "exploration".to_string(), value: 0.7, epigenetic_marker: 0.0 },
                            genos_core::Locus { gene_name: "risk_tolerance".to_string(), value: 0.25, epigenetic_marker: 0.0 },
                            genos_core::Locus { gene_name: "verification_threshold".to_string(), value: 0.8, epigenetic_marker: 0.0 },
                        ],
                        operons: vec![],
                    }
                ],
                planning_depth: 6,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: MemoryPolicy {
                working_max_items: 64,
                episodic_enabled: true,
                semantic_enabled: true,
            },
            model_policy: ModelPolicy {
                strategy: "project-runtime".to_string(),
                preferred_providers: vec![],
                allow_local: true,
            },
            tool_policy: ToolPolicy {
                permissions: vec![],
            },
            inferred_traits: vec![],
            breeding: None,
        },
        state: AgentState {
            genome: GenomeRef {
                genome_id,
                version: "0.1.0".to_string(),
            },
            working_memory: WorkingMemory { items: vec![] },
            semantic_memory: SemanticMemory { refs: vec![] },
            episodic_memory: EpisodicMemory { refs: vec![] },
            memories: vec![],
            tool_outputs: vec![],
            beliefs: vec![],
            active_goals: vec![],
            world_id: world_id.clone(),
            event_cursor: EventCursor {
                branch_id,
                sequence: 0,
                last_event_id: None,
            },
            execution: ExecutionMetadata {
                step: 0,
                last_model_provider: None,
            },
            artifact_refs: vec![],
        },
        world_id,
        tool_state: ToolState {
            active_tools: vec![],
        },
        runtime_metadata: RuntimeMetadata {
            runtime_version: env!("CARGO_PKG_VERSION").to_string(),
            budget_steps_remaining: budget_steps,
        },
        created_at: chrono::Utc::now(),
    }
}

/// Canonical lifecycle vocabulary shared by the CLI and project reports.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentPrimitive {
    Init,
    Snapshot,
    Restore,
    Fork,
    Mutate,
    Run,
    Diff,
    Merge,
    Lineage,
    Replay,
    /// Représente un aveu d'incompétence de l'agent. Mécanisme de mitigation des hallucinations 
    /// (via R-Tuning) pour s'abstenir formellement d'agir plutôt que de "tricher".
    ActiveRefusal,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrimitiveStatus {
    Completed,
    Failed,
    Deferred,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrimitiveInvocation {
    pub sequence: u64,
    pub primitive: AgentPrimitive,
    pub subject: String,
    pub status: PrimitiveStatus,
    #[serde(default)]
    pub details: Value,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentPrimitiveTrace {
    pub invocations: Vec<PrimitiveInvocation>,
}

impl AgentPrimitiveTrace {
    pub fn completed(
        &mut self,
        primitive: AgentPrimitive,
        subject: impl Into<String>,
        details: Value,
    ) {
        self.record(primitive, subject, PrimitiveStatus::Completed, details);
    }

    pub fn failed(
        &mut self,
        primitive: AgentPrimitive,
        subject: impl Into<String>,
        details: Value,
    ) {
        self.record(primitive, subject, PrimitiveStatus::Failed, details);
    }

    pub fn deferred(
        &mut self,
        primitive: AgentPrimitive,
        subject: impl Into<String>,
        details: Value,
    ) {
        self.record(primitive, subject, PrimitiveStatus::Deferred, details);
    }

    pub fn contains(&self, primitive: AgentPrimitive) -> bool {
        self.invocations
            .iter()
            .any(|invocation| invocation.primitive == primitive)
    }

    pub fn count(&self, primitive: AgentPrimitive) -> usize {
        self.invocations
            .iter()
            .filter(|invocation| invocation.primitive == primitive)
            .count()
    }

    fn record(
        &mut self,
        primitive: AgentPrimitive,
        subject: impl Into<String>,
        status: PrimitiveStatus,
        details: Value,
    ) {
        self.invocations.push(PrimitiveInvocation {
            sequence: self.invocations.len() as u64 + 1,
            primitive,
            subject: subject.into(),
            status,
            details,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn trace_uses_one_monotonic_sequence_for_the_canonical_vocabulary() {
        let mut trace = AgentPrimitiveTrace::default();
        trace.completed(AgentPrimitive::Init, "project", json!({}));
        trace.completed(AgentPrimitive::Snapshot, "S0", json!({}));
        trace.failed(AgentPrimitive::Run, "branch-A", json!({ "exit_code": 1 }));

        assert_eq!(trace.invocations[0].sequence, 1);
        assert_eq!(trace.invocations[2].sequence, 3);
        assert_eq!(trace.count(AgentPrimitive::Run), 1);
        assert!(trace.contains(AgentPrimitive::Snapshot));
    }
}
