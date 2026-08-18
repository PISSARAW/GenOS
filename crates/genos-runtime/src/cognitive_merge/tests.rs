use super::*;
use genos_core::{AgentEventType, BeliefStatus, BranchId, EvidenceRef};

fn claim(
    id: &str,
    branch: &str,
    subject: &str,
    predicate: &str,
    object: &str,
    confidence: f64,
) -> CognitiveClaim {
    CognitiveClaim {
        claim_id: id.to_string(),
        branch_id: BranchId(branch.to_string()),
        subject: subject.to_string(),
        predicate: predicate.to_string(),
        object_value: object.to_string(),
        confidence,
        evidence: vec![format!("eval:{id}")],
        kind: EpistemicKind::Hypothesis,
        statement: format!("{subject} {predicate} {object}"),
        conditions: vec![],
    }
}

#[test]
fn contradictory_redis_claims_stay_disputed_while_root_cause_is_accepted() {
    let claims = vec![
        claim("a", "A", "redis", "necessary", "false", 0.9),
        claim("b", "B", "redis", "necessary", "true", 0.95),
        claim("c", "C", "contention", "root_cause", "postgresql", 0.92),
    ];
    let report = cognitive_merge(&claims, &[], &CognitiveMergeConfig::default()).unwrap();
    assert_eq!(report.disputed.len(), 2);
    assert_eq!(report.accepted, vec!["contention:root_cause=postgresql"]);
    assert!(report
        .candidates
        .iter()
        .all(|candidate| !candidate.evidence.is_empty()));
}

#[test]
fn parent_receives_beliefs_not_a_union_of_branch_memories() {
    let parent = crate::test_support::snapshot();
    let claims = vec![
        claim("a", "A", "redis", "necessary", "false", 0.9),
        claim("b", "B", "redis", "necessary", "true", 0.95),
        claim("c", "C", "contention", "root_cause", "postgresql", 0.92),
    ];
    let report = cognitive_merge(&claims, &[], &CognitiveMergeConfig::default()).unwrap();
    let application = apply_cognitive_merge(&parent, &report);
    assert!(application.snapshot.state.memories.is_empty());
    assert_eq!(application.snapshot.state.beliefs.len(), 3);
    assert_eq!(
        application
            .snapshot
            .state
            .beliefs
            .iter()
            .filter(|belief| belief.status == BeliefStatus::Disputed)
            .count(),
        2
    );
    assert!(application
        .events
        .iter()
        .any(|event| event.event_type == AgentEventType::CognitiveMergeApplied));
}

#[test]
fn duplicate_claims_from_one_branch_do_not_fake_independent_confirmation() {
    let claims = vec![
        claim("a1", "A", "database", "healthy", "true", 0.6),
        claim("a2", "A", "database", "healthy", "true", 0.7),
    ];
    let report = cognitive_merge(
        &claims,
        &[],
        &CognitiveMergeConfig {
            acceptance_threshold: 0.75,
            minimum_independent_branches: 1,
        },
    )
    .unwrap();
    assert_eq!(report.candidates[0].confidence, 0.7);
    assert_eq!(report.candidates[0].status, MergeClaimStatus::Unresolved);
    assert_eq!(report.candidates[0].supporting_branches.len(), 1);
}

#[test]
fn experience_packets_build_a_typed_graph_and_contextual_synthesis() {
    let mut a = claim("a", "A", "redis", "useful", "false", 0.9);
    a.statement = "Redis appears unnecessary".to_string();
    a.kind = EpistemicKind::Result;
    let mut b = claim("b", "B", "redis", "useful", "true", 0.95);
    b.statement = "Redis reduces contention".to_string();
    b.kind = EpistemicKind::Observation;
    let mut c = claim("c", "C", "contention", "root_cause", "postgresql", 0.92);
    c.statement = "PostgreSQL storage behavior is the likely root cause".to_string();
    c.kind = EpistemicKind::Discovery;
    let packet = |branch: &str, conditions: &[&str], belief: CognitiveClaim| BranchExperience {
        branch_id: BranchId(branch.to_string()),
        conditions: conditions.iter().map(|value| value.to_string()).collect(),
        observations: vec![ExperienceItem {
            item_id: format!("observation-{branch}"),
            description: "measured lock contention".to_string(),
            evidence: vec![format!("trace-{branch}")],
        }],
        actions: vec![],
        results: vec![],
        beliefs_created: vec![belief],
        beliefs_modified: vec![],
        failures: vec![],
        discoveries: vec![],
        uncertainty: vec![],
        evidence: vec![format!("experiment-{branch}")],
    };
    let experiences = vec![
        packet("A", &["baseline without Redis"], a),
        packet("B", &["high write contention with Redis"], b),
        packet("C", &["PostgreSQL lock analysis"], c),
    ];
    let relations = vec![
        ClaimRelation {
            from_claim: "a".to_string(),
            to_claim: "b".to_string(),
            kind: ClaimRelationKind::Contradicts,
            confidence: 0.9,
            evidence: vec!["different outcomes".to_string()],
        },
        ClaimRelation {
            from_claim: "c".to_string(),
            to_claim: "b".to_string(),
            kind: ClaimRelationKind::Qualifies,
            confidence: 0.9,
            evidence: vec!["mitigation differs from root cause".to_string()],
        },
    ];
    let report =
        merge_experiences(&experiences, &relations, &CognitiveMergeConfig::default()).unwrap();
    assert!(report
        .graph
        .nodes
        .iter()
        .any(|node| node.kind == CognitiveGraphNodeKind::Observation));
    assert!(report
        .graph
        .edges
        .iter()
        .any(|edge| edge.kind == CognitiveGraphEdgeKind::CreatesBelief));
    let synthesis = report
        .syntheses
        .iter()
        .find(|synthesis| synthesis.topics.contains(&"redis".to_string()))
        .unwrap();
    assert_eq!(synthesis.conclusions.len(), 3);
    assert!(synthesis.summary.contains("baseline without Redis"));
    assert!(synthesis.summary.contains("PostgreSQL storage behavior"));
    assert_eq!(synthesis.residual_conflicts.len(), 1);
}

#[test]
fn preferences_remain_hypotheses_and_context_survives_parent_application() {
    let parent = crate::test_support::snapshot();
    let mut preference = claim("p", "A", "database", "preferred", "postgresql", 0.95);
    preference.kind = EpistemicKind::Preference;
    preference.statement = "PostgreSQL is preferred for operational simplicity".to_string();
    preference.conditions = vec!["small operations team".to_string()];
    let report = cognitive_merge(&[preference], &[], &CognitiveMergeConfig::default()).unwrap();
    let application = apply_cognitive_merge(&parent, &report);
    let belief = &application.snapshot.state.beliefs[0];
    assert_eq!(belief.status, BeliefStatus::Hypothesis);
    assert!(belief.evidence.iter().any(|evidence| matches!(
        evidence,
        EvidenceRef::Note { text } if text == "cognitive_merge:condition:small operations team"
    )));
}
