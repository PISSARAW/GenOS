use super::types::{BranchFinding, KnowledgeSynthesisProposal, SynthesisStatus};

pub fn synthesize_branch_knowledge(
    findings: Vec<BranchFinding>,
) -> Result<KnowledgeSynthesisProposal, String> {
    if findings.is_empty() || findings.iter().any(|finding| finding.evidence.is_empty()) {
        return Err("knowledge synthesis requires evidence-bearing findings".to_string());
    }
    Ok(KnowledgeSynthesisProposal {
        findings,
        validation_branch: None,
        status: SynthesisStatus::Proposed,
    })
}

pub fn validate_synthesis(
    proposal: &mut KnowledgeSynthesisProposal,
    validation_branch: genos_core::BranchId,
    passed: bool,
) {
    proposal.validation_branch = Some(validation_branch);
    proposal.status = if passed {
        SynthesisStatus::Validated
    } else {
        SynthesisStatus::Rejected
    };
}
