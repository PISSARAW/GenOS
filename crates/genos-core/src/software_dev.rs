use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

fn id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::now_v7().simple())
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HypothesisStatus {
    Proposed,
    Testing,
    Supported,
    Falsified,
    Suspended,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DevEvidenceRef {
    pub claim: String,
    pub source: String,
    pub supports: bool,
    #[serde(default)]
    pub artifact: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Hypothesis {
    pub id: String,
    pub parent: Option<String>,
    pub statement: String,
    pub confidence: f64,
    pub status: HypothesisStatus,
    #[serde(default)]
    pub evidence: Vec<DevEvidenceRef>,
    #[serde(default)]
    pub experiments: Vec<String>,
    #[serde(default)]
    pub children: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HypothesisTree {
    pub id: String,
    pub problem: String,
    pub root: String,
    pub hypotheses: BTreeMap<String, Hypothesis>,
    pub created_at: DateTime<Utc>,
}

impl HypothesisTree {
    pub fn new(problem: impl Into<String>, candidates: Vec<String>) -> Self {
        let root = id("hyp");
        let mut hypotheses = BTreeMap::new();
        let children = candidates
            .into_iter()
            .map(|statement| {
                let child_id = id("hyp");
                hypotheses.insert(
                    child_id.clone(),
                    Hypothesis {
                        id: child_id.clone(),
                        parent: Some(root.clone()),
                        statement,
                        confidence: 0.5,
                        status: HypothesisStatus::Proposed,
                        evidence: vec![],
                        experiments: vec![],
                        children: vec![],
                    },
                );
                child_id
            })
            .collect();
        hypotheses.insert(
            root.clone(),
            Hypothesis {
                id: root.clone(),
                parent: None,
                statement: "root problem".into(),
                confidence: 1.0,
                status: HypothesisStatus::Testing,
                evidence: vec![],
                experiments: vec![],
                children,
            },
        );
        Self {
            id: id("diag"),
            problem: problem.into(),
            root,
            hypotheses,
            created_at: Utc::now(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrajectoryStatus {
    Active,
    Suspended,
    Failed,
    Winner,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ComputeBudget {
    pub token_share: f64,
    pub time_share: f64,
    pub test_share: f64,
    pub model_tier: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Trajectory {
    pub id: String,
    pub strategy: String,
    pub hypothesis_id: Option<String>,
    pub score: f64,
    pub cost: f64,
    pub status: TrajectoryStatus,
    pub budget: ComputeBudget,
    #[serde(default)]
    pub observations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SolveRun {
    pub id: String,
    pub problem: String,
    pub blind_review: bool,
    pub objective: String,
    pub trajectories: Vec<Trajectory>,
    pub created_at: DateTime<Utc>,
}

impl SolveRun {
    pub fn new(problem: impl Into<String>, strategies: Vec<String>, minimal_patch: bool) -> Self {
        let share = 1.0 / strategies.len().max(1) as f64;
        let trajectories = strategies
            .into_iter()
            .map(|strategy| Trajectory {
                id: id("traj"),
                strategy,
                hypothesis_id: None,
                score: 0.0,
                cost: 0.0,
                status: TrajectoryStatus::Active,
                budget: ComputeBudget {
                    token_share: share,
                    time_share: share,
                    test_share: share,
                    model_tier: "cheap".into(),
                },
                observations: vec![],
            })
            .collect();
        Self {
            id: id("solve"),
            problem: problem.into(),
            blind_review: true,
            objective: if minimal_patch {
                "minimize(diff_size) subject to correctness".into()
            } else {
                "maximize verified utility".into()
            },
            trajectories,
            created_at: Utc::now(),
        }
    }

    pub fn allocate_and_prune(&mut self, keep: usize) {
        self.trajectories
            .sort_by(|a, b| b.score.total_cmp(&a.score));
        for (index, trajectory) in self.trajectories.iter_mut().enumerate() {
            if index >= keep {
                trajectory.status = TrajectoryStatus::Suspended;
                trajectory.budget.token_share = 0.0;
                trajectory.budget.time_share = 0.0;
                trajectory.budget.test_share = 0.0;
            }
        }
        let active_weight: f64 = self
            .trajectories
            .iter()
            .filter(|t| t.status == TrajectoryStatus::Active)
            .map(|t| (t.score + 1.0).max(0.1))
            .sum();
        for trajectory in self
            .trajectories
            .iter_mut()
            .filter(|t| t.status == TrajectoryStatus::Active)
        {
            let share = (trajectory.score + 1.0).max(0.1) / active_weight.max(0.1);
            trajectory.budget.token_share = share;
            trajectory.budget.time_share = share;
            trajectory.budget.test_share = share;
            trajectory.budget.model_tier = if share >= 0.5 {
                "frontier"
            } else if share >= 0.2 {
                "standard"
            } else {
                "cheap"
            }
            .into();
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DecisionRecord {
    pub id: String,
    pub title: String,
    pub alternatives: Vec<String>,
    pub evidence: Vec<String>,
    pub assumptions: Vec<String>,
    pub expected: Option<String>,
    pub observed: Option<String>,
    pub status: String,
    pub code_refs: Vec<String>,
    pub test_refs: Vec<String>,
    pub requirement_refs: Vec<String>,
    pub parent_hypothesis: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl DecisionRecord {
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            id: id("dec"),
            title: title.into(),
            alternatives: vec![],
            evidence: vec![],
            assumptions: vec![],
            expected: None,
            observed: None,
            status: "accepted".into(),
            code_refs: vec![],
            test_refs: vec![],
            requirement_refs: vec![],
            parent_hypothesis: None,
            created_at: Utc::now(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExperienceArtifact {
    pub id: String,
    pub strategy: String,
    pub context: String,
    pub outcome: String,
    pub successful: bool,
    pub evidence: Vec<String>,
    pub source_branch: Option<String>,
    pub imported_into: Vec<String>,
    pub created_at: DateTime<Utc>,
}

impl ExperienceArtifact {
    pub fn new(strategy: String, context: String, outcome: String, successful: bool) -> Self {
        Self {
            id: id("exp"),
            strategy,
            context,
            outcome,
            successful,
            evidence: vec![],
            source_branch: None,
            imported_into: vec![],
            created_at: Utc::now(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReviewPlan {
    pub id: String,
    pub target: String,
    pub blind: bool,
    pub critics: Vec<String>,
    pub worlds: Vec<String>,
    pub rounds: u32,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FutureCiPlan {
    pub id: String,
    pub target: String,
    pub worlds: Vec<String>,
    pub agents: Vec<String>,
    pub dependency: Option<String>,
    pub migration_from: Option<String>,
    pub migration_to: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct RepositoryGenome {
    pub architecture: Vec<String>,
    pub conventions: Vec<String>,
    pub invariants: Vec<String>,
    pub security_rules: Vec<String>,
    pub testing_policy: Vec<String>,
    pub performance_requirements: Vec<String>,
    pub domain_language: Vec<String>,
    pub forbidden_patterns: Vec<String>,
    pub learned_rules: Vec<LearnedRule>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LearnedRule {
    pub statement: String,
    pub confidence: f64,
    pub provenance: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct CompiledMemory {
    pub active: Vec<String>,
    pub facts: Vec<String>,
    pub decisions: Vec<String>,
    pub failures: Vec<String>,
    pub constraints: Vec<String>,
    pub open_questions: Vec<String>,
    pub source_refs: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pruning_preserves_lineage_and_reallocates_compute() {
        let mut run = SolveRun::new("bug", vec!["a".into(), "b".into(), "c".into()], false);
        run.trajectories[0].score = 8.0;
        run.trajectories[1].score = 2.0;
        run.allocate_and_prune(2);
        assert_eq!(run.trajectories.len(), 3);
        assert_eq!(run.trajectories[2].status, TrajectoryStatus::Suspended);
        let active: f64 = run.trajectories.iter().map(|t| t.budget.token_share).sum();
        assert!((active - 1.0).abs() < 0.0001);
        assert_eq!(run.trajectories[0].budget.model_tier, "frontier");
    }

    #[test]
    fn hypothesis_tree_keeps_parent_child_links() {
        let tree = HypothesisTree::new("freeze", vec!["deadlock".into(), "pool".into()]);
        let root = tree.hypotheses.get(&tree.root).unwrap();
        assert_eq!(root.children.len(), 2);
        assert!(root
            .children
            .iter()
            .all(|child| tree.hypotheses[child].parent.as_ref() == Some(&tree.root)));
    }
}
