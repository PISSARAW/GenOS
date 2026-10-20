//! Mesure reelle, promotion separee et retrait d'un apprentissage DiCode.

use crate::dreaming::{EvidenceEnvironment, SyntheticFinding};
use serde::{Deserialize, Serialize};

/// Mesure independante prise sur la decision reelle, jamais dans le banc.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RealDecisionEvidence {
    pub decision_id: String,
    pub baseline_coverage_permille: u16,
    pub candidate_coverage_permille: u16,
    pub evidence_refs: Vec<String>,
    pub independent_validation_receipt: Option<String>,
    pub environment: EvidenceEnvironment,
}

/// Entree de comparaison entre piste synthetique et effet reel.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecisionAssessmentInput {
    pub finding: SyntheticFinding,
    pub real_evidence: RealDecisionEvidence,
}

/// Conclusion sur l'effet decisionnel. Elle n'accorde aucune promotion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecisionAssessment {
    pub decision_id: String,
    pub real_decision_improved: bool,
    pub real_validation_accepted: bool,
    pub synthetic_trace_refs: Vec<String>,
    pub real_evidence_refs: Vec<String>,
    pub promotion_eligible: bool,
    pub reasons: Vec<String>,
}

/// Plan de retrait requis avant toute promotion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RollbackPlan {
    pub rollback_ref: String,
    pub reversible: bool,
}

/// Demande envoyee a une gate distincte du laboratoire et de la mesure.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PromotionRequest {
    pub assessment: DecisionAssessment,
    pub human_approval_receipt: Option<String>,
    pub policy_receipt: Option<String>,
    pub rollback: RollbackPlan,
}

/// Avis de la gate ; son eligibilite n'execute pas la promotion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PromotionVerdict {
    pub eligible: bool,
    pub reasons: Vec<String>,
}

/// Observation post-promotion sur le systeme reel.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LiveDecisionObservation {
    pub decision_id: String,
    pub responsibility_coverage_permille: u16,
    pub evidence_refs: Vec<String>,
    pub environment: EvidenceEnvironment,
}

/// Entree de surveillance et seuil de retrait.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WithdrawalInput {
    pub observation: LiveDecisionObservation,
    pub minimum_coverage_permille: u16,
    pub rollback: RollbackPlan,
}

/// Decision de retrait, avec reference de rollback si elle est executable.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WithdrawalDecision {
    pub withdraw: bool,
    pub rollback_ref: Option<String>,
    pub reasons: Vec<String>,
}

fn usable_receipt(receipt: &Option<String>) -> bool {
    receipt
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty())
}

fn assessment_reasons(input: &DecisionAssessmentInput) -> Vec<String> {
    let mut reasons = Vec::new();
    let evidence = &input.real_evidence;
    if !input.finding.responsibility_gap_observed {
        reasons.push("la piste synthetique ne revele aucune lacune".to_string());
    }
    if input.finding.decision_id != evidence.decision_id {
        reasons.push("les identifiants de decision divergent".to_string());
    }
    if evidence.environment != EvidenceEnvironment::RealSystem || evidence.evidence_refs.is_empty()
    {
        reasons.push("une mesure du systeme reel est absente".to_string());
    }
    if !usable_receipt(&evidence.independent_validation_receipt) {
        reasons.push("la validation reelle independante est absente".to_string());
    }
    let valid_scale = evidence.baseline_coverage_permille <= 1_000
        && evidence.candidate_coverage_permille <= 1_000;
    if !valid_scale || evidence.candidate_coverage_permille <= evidence.baseline_coverage_permille {
        reasons.push("la couverture de responsabilite ne progresse pas".to_string());
    }
    reasons
}

fn decision_improved(input: &DecisionAssessmentInput) -> bool {
    let evidence = &input.real_evidence;
    input.finding.responsibility_gap_observed
        && input.finding.decision_id == evidence.decision_id
        && evidence.environment == EvidenceEnvironment::RealSystem
        && !evidence.evidence_refs.is_empty()
        && usable_receipt(&evidence.independent_validation_receipt)
        && evidence.baseline_coverage_permille <= 1_000
        && evidence.candidate_coverage_permille <= 1_000
        && evidence.candidate_coverage_permille > evidence.baseline_coverage_permille
}

/// Verifie par une mesure reelle si la piste synthetique a ameliore la decision.
pub fn assess_real_decision(input: DecisionAssessmentInput) -> DecisionAssessment {
    let evidence = &input.real_evidence;
    let real_scope = evidence.environment == EvidenceEnvironment::RealSystem;
    let independent = usable_receipt(&evidence.independent_validation_receipt);
    let improved = decision_improved(&input);
    let reasons = assessment_reasons(&input);
    DecisionAssessment {
        decision_id: evidence.decision_id.clone(),
        real_decision_improved: improved,
        real_validation_accepted: real_scope && independent,
        synthetic_trace_refs: input.finding.evidence_refs,
        real_evidence_refs: evidence.evidence_refs.clone(),
        promotion_eligible: false,
        reasons,
    }
}

/// Evalue une promotion dans une etape separee et reversible.
pub fn evaluate_promotion(request: PromotionRequest) -> PromotionVerdict {
    let mut reasons = Vec::new();
    if !request.assessment.real_decision_improved || !request.assessment.real_validation_accepted {
        reasons.push("l'effet reel independant n'est pas etabli".to_string());
    }
    if !usable_receipt(&request.human_approval_receipt) {
        reasons.push("l'approbation humaine est absente".to_string());
    }
    if !usable_receipt(&request.policy_receipt) {
        reasons.push("le recu de politique est absent".to_string());
    }
    if !request.rollback.reversible || request.rollback.rollback_ref.trim().is_empty() {
        reasons.push("le rollback executable est absent".to_string());
    }
    PromotionVerdict {
        eligible: reasons.is_empty(),
        reasons,
    }
}

/// Retire par defaut si la surveillance reelle devient aveugle ou regresse.
pub fn evaluate_withdrawal(input: WithdrawalInput) -> WithdrawalDecision {
    let blind = input.observation.environment != EvidenceEnvironment::RealSystem
        || input.observation.evidence_refs.is_empty();
    let regressed =
        input.observation.responsibility_coverage_permille < input.minimum_coverage_permille;
    let withdraw = blind || regressed;
    let mut reasons = Vec::new();
    if blind {
        reasons.push("surveillance reelle aveugle".to_string());
    }
    if regressed {
        reasons.push("couverture de responsabilite sous le seuil".to_string());
    }
    let rollback_ref =
        (withdraw && input.rollback.reversible && !input.rollback.rollback_ref.trim().is_empty())
            .then_some(input.rollback.rollback_ref);
    WithdrawalDecision {
        withdraw,
        rollback_ref,
        reasons,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn finding() -> SyntheticFinding {
        SyntheticFinding {
            bench_id: "dream:d-1".to_string(),
            decision_id: "d-1".to_string(),
            responsibility_gap_observed: true,
            evidence_refs: vec!["fixture://missing-owner".to_string()],
            environment: EvidenceEnvironment::SyntheticEducational,
            production_proof: false,
            promotion_eligible: false,
        }
    }

    fn real_evidence() -> RealDecisionEvidence {
        RealDecisionEvidence {
            decision_id: "d-1".to_string(),
            baseline_coverage_permille: 400,
            candidate_coverage_permille: 900,
            evidence_refs: vec!["ledger://release/d-1".to_string()],
            independent_validation_receipt: Some("verify://independent/d-1".to_string()),
            environment: EvidenceEnvironment::RealSystem,
        }
    }

    #[test]
    fn synthetic_result_alone_never_proves_real_improvement() {
        let mut evidence = real_evidence();
        evidence.environment = EvidenceEnvironment::SyntheticEducational;
        let assessment = assess_real_decision(DecisionAssessmentInput {
            finding: finding(),
            real_evidence: evidence,
        });
        assert!(!assessment.real_decision_improved);
        assert!(!assessment.promotion_eligible);
    }

    #[test]
    fn real_improvement_still_requires_a_separate_promotion_gate() {
        let assessment = assess_real_decision(DecisionAssessmentInput {
            finding: finding(),
            real_evidence: real_evidence(),
        });
        assert!(assessment.real_decision_improved);
        assert!(!assessment.promotion_eligible);
        let verdict = evaluate_promotion(PromotionRequest {
            assessment,
            human_approval_receipt: Some("human://approval/d-1".to_string()),
            policy_receipt: Some("policy://pass/d-1".to_string()),
            rollback: RollbackPlan {
                rollback_ref: "snapshot://before/d-1".to_string(),
                reversible: true,
            },
        });
        assert!(verdict.eligible);
    }

    #[test]
    fn real_regression_selects_the_declared_rollback() {
        let decision = evaluate_withdrawal(WithdrawalInput {
            observation: LiveDecisionObservation {
                decision_id: "d-1".to_string(),
                responsibility_coverage_permille: 500,
                evidence_refs: vec!["ledger://release/d-1/post".to_string()],
                environment: EvidenceEnvironment::RealSystem,
            },
            minimum_coverage_permille: 800,
            rollback: RollbackPlan {
                rollback_ref: "snapshot://before/d-1".to_string(),
                reversible: true,
            },
        });
        assert!(decision.withdraw);
        assert_eq!(
            decision.rollback_ref.as_deref(),
            Some("snapshot://before/d-1")
        );
    }
}
