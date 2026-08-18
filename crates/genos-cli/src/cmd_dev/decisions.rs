use super::helpers::*;
use crate::args::*;
use anyhow::Result;
use genos_core::*;
use serde_json::json;

pub fn cmd_record_decision(args: RecordDecisionArgs) -> Result<()> {
    let mut record = DecisionRecord::new(args.title);
    record.alternatives = args.alternatives;
    record.evidence = args.evidence;
    record.assumptions = args.assumptions;
    record.code_refs = args.code_refs;
    record.test_refs = args.test_refs;
    record.requirement_refs = args.requirement_refs;
    record.expected = args.expected;
    record.observed = args.observed;
    record.parent_hypothesis = args.parent_hypothesis;
    if record.observed.is_some() && record.expected != record.observed {
        record.status = "questionable".into();
    }
    let path = ledger(&args.root, "decisions");
    let mut records: Vec<DecisionRecord> = read_vec(&path)?;
    records.push(record.clone());
    save_vec(&path, &records)?;
    output(&record)
}

pub fn cmd_blame(args: BlameArgs) -> Result<()> {
    let records: Vec<DecisionRecord> = read_vec(&ledger(&args.root, "decisions"))?;
    let needle = args.reference.to_lowercase();
    let matches: Vec<_> = records
        .into_iter()
        .filter(|d| {
            d.id.to_lowercase().contains(&needle)
                || d.title.to_lowercase().contains(&needle)
                || d.code_refs
                    .iter()
                    .chain(&d.test_refs)
                    .chain(&d.requirement_refs)
                    .any(|r| r.to_lowercase().contains(&needle))
        })
        .collect();
    output(json!({"reference": args.reference, "decisions": matches}))
}

pub fn cmd_invalidate_assumption(args: InvalidateAssumptionArgs) -> Result<()> {
    let path = ledger(&args.root, "decisions");
    let mut records: Vec<DecisionRecord> = read_vec(&path)?;
    let needle = args.assumption.to_lowercase();
    let mut affected = Vec::new();
    for record in &mut records {
        if record
            .assumptions
            .iter()
            .any(|assumption| assumption.to_lowercase().contains(&needle))
        {
            record.status = "assumption_invalidated".into();
            affected.push(json!({
                "decision_id": record.id,
                "title": record.title,
                "code_refs": record.code_refs,
                "test_refs": record.test_refs,
                "requirement_refs": record.requirement_refs,
            }));
        }
    }
    save_vec(&path, &records)?;
    output(json!({
        "assumption": args.assumption,
        "observed": args.observed,
        "status": "invalidated",
        "affected": affected,
    }))
}
