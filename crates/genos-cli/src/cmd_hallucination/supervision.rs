use super::{
    audit_snapshot, belief_is_grounded, load_snapshot, read_structured_file, ExtractEdge,
    ExtractNode, HallucinationAnalyzeOutput, HallucinationCaseResult, HallucinationCorrectOutput,
    HallucinationExtractOutput, HallucinationSimulateOutput, HallucinationTestOutput,
};
use crate::args::{
    HallucinationAnalyzeArgs, HallucinationCorrectArgs, HallucinationExtractArgs,
    HallucinationSimulateArgs, HallucinationTestArgs, OutputFormat,
};
use crate::output::{print_serialized, snapshot_path_or_none, write_serialized};
use crate::resolve::snapshot_store_from;
use anyhow::{bail, Context, Result};
use genos_core::{upsert_belief_at, BeliefStatus, EvidenceRef};
use genos_store::SnapshotStore;
use serde_json::Value;
use std::collections::BTreeMap;

pub async fn cmd_hallucination_test(args: HallucinationTestArgs) -> Result<()> {
    let (snapshot, _) = load_snapshot(&args.snapshot, args.snapshots.clone(), &args.root).await?;
    let suite = read_structured_file(&args.suite)?;
    let cases = suite
        .as_array()
        .context("suite file must be an array of case objects")?;

    let mut results = Vec::new();
    for case in cases {
        let subject = case
            .get("subject")
            .and_then(Value::as_str)
            .context("each suite case needs a string 'subject'")?
            .to_string();
        let predicate = case
            .get("predicate")
            .and_then(Value::as_str)
            .map(str::to_string);
        let object = case
            .get("object")
            .and_then(Value::as_str)
            .map(str::to_string);
        let expect = case
            .get("expect")
            .and_then(Value::as_str)
            .unwrap_or("grounded")
            .to_string();
        if !matches!(expect.as_str(), "grounded" | "ungrounded" | "absent") {
            bail!("case '{subject}': expect must be grounded|ungrounded|absent, got '{expect}'");
        }

        let matching: Vec<_> = snapshot
            .state
            .beliefs
            .iter()
            .filter(|belief| {
                belief.subject == subject
                    && predicate.as_deref().is_none_or(|p| belief.predicate == p)
                    && object.as_deref().is_none_or(|o| belief.object_value == o)
            })
            .collect();

        let actual = if matching.is_empty() {
            "absent"
        } else if matching
            .iter()
            .any(|belief| belief_is_grounded(belief, &snapshot.state.tool_outputs))
        {
            "grounded"
        } else {
            "ungrounded"
        };

        results.push(HallucinationCaseResult {
            subject,
            predicate,
            object,
            pass: actual == expect,
            expect,
            actual: actual.to_string(),
        });
    }

    let passed = results.iter().filter(|result| result.pass).count();
    let failed = results.len() - passed;
    let out = HallucinationTestOutput {
        suite_path: args.suite.display().to_string(),
        case_count: results.len(),
        passed,
        failed,
        results,
    };
    print_serialized(&out, args.format)?;

    if failed > 0 {
        bail!("{failed} suite case(s) failed");
    }
    Ok(())
}

pub async fn cmd_hallucination_extract(args: HallucinationExtractArgs) -> Result<()> {
    let (snapshot, _) = load_snapshot(&args.snapshot, args.snapshots.clone(), &args.root).await?;

    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    for belief in &snapshot.state.beliefs {
        nodes.push(ExtractNode {
            belief_id: belief.id.0.clone(),
            subject: belief.subject.clone(),
            predicate: belief.predicate.clone(),
            object_value: belief.object_value.clone(),
            confidence: belief.confidence,
            status: format!("{:?}", belief.status).to_lowercase(),
            evidence: belief.evidence.iter().map(EvidenceRef::label).collect(),
        });
        for opposing in &belief.contradicts {
            edges.push(ExtractEdge {
                from: belief.id.0.clone(),
                to: opposing.0.clone(),
                relation: "contradicts".into(),
            });
        }
        for evidence in &belief.evidence {
            if let Some(tool_output_id) = evidence.tool_output_id() {
                edges.push(ExtractEdge {
                    from: belief.id.0.clone(),
                    to: tool_output_id.0.clone(),
                    relation: "evidence".into(),
                });
            }
        }
    }

    let out = HallucinationExtractOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        nodes,
        edges,
    };
    if let Some(path) = &args.out {
        write_serialized(path, &out, args.format)?;
        println!("belief graph written to {:?}", path);
        Ok(())
    } else {
        print_serialized(&out, args.format)
    }
}

pub async fn cmd_hallucination_analyze(args: HallucinationAnalyzeArgs) -> Result<()> {
    let (snapshot, _) = load_snapshot(&args.snapshot, args.snapshots.clone(), &args.root).await?;
    let beliefs = &snapshot.state.beliefs;

    let grounded = beliefs
        .iter()
        .filter(|belief| belief_is_grounded(belief, &snapshot.state.tool_outputs))
        .count();
    let ungrounded = beliefs.len() - grounded;

    // Shannon entropy over the confidence distribution quantized into ten
    // buckets. A snapshot whose claims cluster at a few confidence values has
    // low entropy; a spread-out distribution suggests poorly calibrated
    // beliefs worth reviewing.
    let mut buckets: BTreeMap<u32, usize> = BTreeMap::new();
    let mut status_counts: BTreeMap<String, usize> = BTreeMap::new();
    for belief in beliefs {
        let bucket = (belief.confidence.clamp(0.0, 1.0) * 10.0).floor() as u32;
        *buckets.entry(bucket).or_default() += 1;
        *status_counts
            .entry(format!("{:?}", belief.status).to_lowercase())
            .or_default() += 1;
    }
    let entropy = if beliefs.is_empty() {
        0.0
    } else {
        let total = beliefs.len() as f64;
        buckets
            .values()
            .map(|count| {
                let probability = *count as f64 / total;
                -probability * probability.log2()
            })
            .sum()
    };

    let grounded_ratio = grounded as f32 / beliefs.len().max(1) as f32;
    let verdict = if beliefs.is_empty() {
        "empty"
    } else if entropy > 2.5 || grounded_ratio < 0.5 {
        "high_risk"
    } else if entropy > 1.5 || grounded_ratio < 0.8 {
        "watch"
    } else {
        "nominal"
    };

    let out = HallucinationAnalyzeOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        belief_count: beliefs.len(),
        grounded,
        ungrounded,
        grounded_ratio,
        confidence_entropy_bits: entropy.max(0.0),
        status_counts,
        verdict: verdict.into(),
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_hallucination_correct(args: HallucinationCorrectArgs) -> Result<()> {
    let (mut snapshot, _) =
        load_snapshot(&args.snapshot, args.snapshots.clone(), &args.root).await?;
    if snapshot.agent_id.0 != args.agent_id {
        bail!(
            "--agent-id '{}' does not own snapshot '{}' (agent '{}')",
            args.agent_id,
            snapshot.snapshot_id.0,
            snapshot.agent_id.0
        );
    }

    let mut rejected_belief_ids = Vec::new();
    for belief in &mut snapshot.state.beliefs {
        if belief.status == BeliefStatus::Rejected {
            continue;
        }
        if !belief_is_grounded(belief, &snapshot.state.tool_outputs) {
            belief.status = BeliefStatus::Rejected;
            rejected_belief_ids.push(belief.id.0.clone());
        }
    }

    let remaining_grounded = snapshot
        .state
        .beliefs
        .iter()
        .filter(|belief| belief_is_grounded(belief, &snapshot.state.tool_outputs))
        .count();

    let out_path = args
        .out
        .clone()
        .or_else(|| snapshot_path_or_none(&args.snapshot));
    if let Some(path) = &out_path {
        write_serialized(path, &snapshot, OutputFormat::Json)?;
    }
    if args.save {
        let store = snapshot_store_from(args.snapshots.clone().clone().map(|p| p.display().to_string()), &args.root).await.unwrap();
        store.save_snapshot(&snapshot).await?;
    }

    let out = HallucinationCorrectOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        agent_id: snapshot.agent_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        rejected_belief_ids: rejected_belief_ids.clone(),
        rejection_count: rejected_belief_ids.len(),
        remaining_grounded,
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args.save.then(|| args.snapshots.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "<dynamic>".to_string())),
    };
    print_serialized(&out, args.format)?;

    if args.expect_rejections && rejected_belief_ids.is_empty() {
        bail!("expected at least one rejected belief, found none");
    }
    Ok(())
}

pub async fn cmd_hallucination_simulate(args: HallucinationSimulateArgs) -> Result<()> {
    let (parent, _) = load_snapshot(&args.snapshot, args.snapshots.clone(), &args.root).await?;
    let findings_before = audit_snapshot(&parent).len();

    let mut fork = parent.clone();
    const INJECTED_SUBJECT: &str = "simulated_false_premise";
    let write = upsert_belief_at(
        &mut fork,
        INJECTED_SUBJECT,
        "injected_premise",
        "unverified claim (hallucination simulation)",
        0.5,
        BeliefStatus::Hypothesis,
        chrono::Utc::now(),
    );
    let findings_after = audit_snapshot(&fork);

    if let Some(path) = &args.out {
        write_serialized(path, &fork, OutputFormat::Json)?;
    }

    let detected = findings_after.len() > findings_before;
    let out = HallucinationSimulateOutput {
        model: args.model.clone(),
        parent_snapshot_id: parent.snapshot_id.0.clone(),
        injected_subject: INJECTED_SUBJECT.into(),
        injected_belief_id: write.belief_id.0.clone(),
        findings_before_injection: findings_before,
        findings_after_injection: findings_after.len(),
        detected,
        findings: findings_after,
    };
    print_serialized(&out, args.format)?;

    if !detected {
        bail!("simulation did not surface any new finding; detection rules may be broken");
    }
    Ok(())
}
