use crate::args::{
    HallucinationAnalyzeArgs, HallucinationCorrectArgs, HallucinationDetectArgs,
    HallucinationExtractArgs, HallucinationInjectArgs, HallucinationSimulateArgs,
    HallucinationTestArgs, OutputFormat,
};
use crate::output::{print_serialized, snapshot_path_or_none, write_serialized};
use crate::resolve::{event_store_from, resolve_snapshot_ref, snapshot_store_from};
use anyhow::{bail, Context, Result};
use genos_core::{upsert_belief_at, AgentSnapshot, BeliefStatus, EvidenceRef, ToolOutputRecord};
use genos_store::{EventStore, SnapshotStore};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct HallucinationFinding {
    pub kind: String,
    pub subject: String,
    pub detail: String,
}

#[derive(Serialize)]
pub struct HallucinationDetectOutput {
    pub source: String,
    pub tool_output_count: usize,
    pub belief_count: usize,
    pub finding_count: usize,
    pub findings: Vec<HallucinationFinding>,
}

#[derive(Serialize)]
pub struct HallucinationInjectOutput {
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub belief_id: String,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f32,
    pub kind: String,
    pub status: BeliefStatus,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
    pub event_id: Option<String>,
    pub event_sequence: Option<u64>,
}

#[derive(Serialize)]
pub struct HallucinationCaseResult {
    pub subject: String,
    pub predicate: Option<String>,
    pub object: Option<String>,
    pub expect: String,
    pub actual: String,
    pub pass: bool,
}

#[derive(Serialize)]
pub struct HallucinationTestOutput {
    pub suite_path: String,
    pub case_count: usize,
    pub passed: usize,
    pub failed: usize,
    pub results: Vec<HallucinationCaseResult>,
}

#[derive(Serialize)]
pub struct ExtractNode {
    pub belief_id: String,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f32,
    pub status: String,
    pub evidence: Vec<String>,
}

#[derive(Serialize)]
pub struct ExtractEdge {
    pub from: String,
    pub to: String,
    pub relation: String,
}

#[derive(Serialize)]
pub struct HallucinationExtractOutput {
    pub snapshot_id: String,
    pub branch_id: String,
    pub nodes: Vec<ExtractNode>,
    pub edges: Vec<ExtractEdge>,
}

#[derive(Serialize)]
pub struct HallucinationAnalyzeOutput {
    pub snapshot_id: String,
    pub branch_id: String,
    pub belief_count: usize,
    pub grounded: usize,
    pub ungrounded: usize,
    pub grounded_ratio: f32,
    pub confidence_entropy_bits: f64,
    pub status_counts: BTreeMap<String, usize>,
    pub verdict: String,
}

#[derive(Serialize)]
pub struct HallucinationCorrectOutput {
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub rejected_belief_ids: Vec<String>,
    pub rejection_count: usize,
    pub remaining_grounded: usize,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
}

#[derive(Serialize)]
pub struct HallucinationSimulateOutput {
    pub model: String,
    pub parent_snapshot_id: String,
    pub injected_subject: String,
    pub injected_belief_id: String,
    pub findings_before_injection: usize,
    pub findings_after_injection: usize,
    pub detected: bool,
    pub findings: Vec<HallucinationFinding>,
}

async fn load_snapshot(
    spec: &str,
    snapshots: Option<PathBuf>,
    root: &Path,
) -> Result<(AgentSnapshot, PathBuf)> {
    let store = snapshot_store_from(snapshots, root);
    let snapshot = resolve_snapshot_ref(spec, &store).await?;
    Ok((snapshot, store.file_path().to_path_buf()))
}

fn receipt_is_verified(receipt: &Option<genos_core::ExecutionReceipt>) -> bool {
    receipt
        .as_ref()
        .is_some_and(|receipt| receipt.verified_by_env)
}

/// A belief counts as grounded only when every piece of evidence points at a
/// recorded, successful tool output whose execution receipt the environment
/// verified. Note-only evidence cannot be externally checked, so it does not
/// ground a claim.
fn belief_is_grounded(belief: &genos_core::Belief, outputs: &[ToolOutputRecord]) -> bool {
    !belief.evidence.is_empty()
        && belief
            .evidence
            .iter()
            .all(|evidence| match evidence.tool_output_id() {
                None => false,
                Some(tool_output_id) => outputs
                    .iter()
                    .find(|output| &output.id == tool_output_id)
                    .is_some_and(|output| output.success && receipt_is_verified(&output.receipt)),
            })
}

fn audit_snapshot(snapshot: &AgentSnapshot) -> Vec<HallucinationFinding> {
    let mut findings = Vec::new();
    let outputs = &snapshot.state.tool_outputs;

    for output in outputs {
        if output.receipt.is_none() {
            findings.push(HallucinationFinding {
                kind: "missing_receipt".into(),
                subject: output.id.0.clone(),
                detail: format!(
                    "tool '{}' produced output without an execution receipt",
                    output.tool_name
                ),
            });
        } else if !receipt_is_verified(&output.receipt) {
            findings.push(HallucinationFinding {
                kind: "unverified_execution".into(),
                subject: output.id.0.clone(),
                detail: format!(
                    "tool '{}' executed without environment verification",
                    output.tool_name
                ),
            });
        }
    }

    for belief in &snapshot.state.beliefs {
        if belief.evidence.is_empty() {
            findings.push(HallucinationFinding {
                kind: "ungrounded_belief".into(),
                subject: belief.id.0.clone(),
                detail: format!(
                    "belief '{} {} {}' carries no evidence",
                    belief.subject, belief.predicate, belief.object_value
                ),
            });
            continue;
        }

        let mut problems = Vec::new();
        for evidence in &belief.evidence {
            match evidence.tool_output_id() {
                None => problems.push("note evidence cannot be externally verified".to_string()),
                Some(tool_output_id) => {
                    match outputs.iter().find(|output| &output.id == tool_output_id) {
                        None => problems.push(format!(
                            "dangling evidence reference '{}'",
                            tool_output_id.0
                        )),
                        Some(output) => {
                            if !output.success {
                                problems.push(format!(
                                    "evidence '{}' comes from a failed tool call",
                                    tool_output_id.0
                                ));
                            }
                            if !receipt_is_verified(&output.receipt) {
                                problems.push(format!(
                                    "evidence '{}' lacks a verified execution receipt",
                                    tool_output_id.0
                                ));
                            }
                        }
                    }
                }
            }
        }
        if !problems.is_empty() {
            findings.push(HallucinationFinding {
                kind: "weak_evidence".into(),
                subject: belief.id.0.clone(),
                detail: format!("belief '{}': {}", belief.subject, problems.join("; ")),
            });
        }
    }

    findings
}

pub async fn cmd_hallucination_detect(args: HallucinationDetectArgs) -> Result<()> {
    let (source, tool_output_count, belief_count, findings) = if let Some(trace) = &args.trace {
        let raw =
            fs::read_to_string(trace).with_context(|| format!("reading {}", trace.display()))?;
        let mut findings = Vec::new();
        let mut record_count = 0usize;
        for (index, line) in raw
            .lines()
            .filter(|line| !line.trim().is_empty())
            .enumerate()
        {
            let record: Value = serde_json::from_str(line)
                .with_context(|| format!("{} line {}: invalid JSON", trace.display(), index + 1))?;
            record_count += 1;
            let id = record
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or(&format!("line {}", index + 1))
                .to_string();
            match record
                .get("receipt")
                .and_then(|receipt| receipt.get("verified_by_env"))
                .and_then(Value::as_bool)
            {
                None => findings.push(HallucinationFinding {
                    kind: "missing_receipt".into(),
                    subject: id.clone(),
                    detail: "trace record has no receipt.verified_by_env field".into(),
                }),
                Some(false) => findings.push(HallucinationFinding {
                    kind: "unverified_execution".into(),
                    subject: id.clone(),
                    detail: "trace record was not verified by the environment".into(),
                }),
                Some(true) => {}
            }
        }
        (trace.display().to_string(), record_count, 0usize, findings)
    } else {
        let spec = match &args.snapshot {
            Some(spec) => spec.clone(),
            None => bail!("hallucination detect needs --snapshot or --trace"),
        };
        let (snapshot, _) = load_snapshot(&spec, args.snapshots.clone(), &args.root).await?;
        let findings = audit_snapshot(&snapshot);
        let tool_output_count = snapshot.state.tool_outputs.len();
        let belief_count = snapshot.state.beliefs.len();
        (spec, tool_output_count, belief_count, findings)
    };

    let finding_count = findings.len();
    let out = HallucinationDetectOutput {
        source,
        tool_output_count,
        belief_count,
        finding_count,
        findings,
    };
    print_serialized(&out, args.format)?;

    if args.fail_on_findings && finding_count > 0 {
        bail!("{finding_count} hallucination finding(s)");
    }
    Ok(())
}

pub async fn cmd_hallucination_inject(args: HallucinationInjectArgs) -> Result<()> {
    let (mut snapshot, store_path) =
        load_snapshot(&args.snapshot, args.snapshots.clone(), &args.root).await?;
    let write = upsert_belief_at(
        &mut snapshot,
        &args.target_belief,
        &args.predicate,
        &args.value,
        args.confidence,
        BeliefStatus::Hypothesis,
        chrono::Utc::now(),
    );

    let out_path = args
        .out
        .clone()
        .or_else(|| snapshot_path_or_none(&args.snapshot));
    if let Some(path) = &out_path {
        write_serialized(path, &snapshot, OutputFormat::Json)?;
    }
    if args.save {
        let store = snapshot_store_from(args.snapshots.clone(), &args.root);
        store.save_snapshot(&snapshot).await?;
    }

    let mut event_id = None;
    let mut event_sequence = None;
    if args.emit_events {
        let store = event_store_from(args.events.clone(), &args.root);
        store.append(write.event.clone()).await?;
        event_id = Some(write.event.event_id.0.clone());
        event_sequence = Some(write.event.sequence);
    }

    let out = HallucinationInjectOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        agent_id: snapshot.agent_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        belief_id: write.belief_id.0.clone(),
        subject: write.subject.clone(),
        predicate: write.predicate.clone(),
        object_value: write.object_value.clone(),
        confidence: write.confidence,
        kind: format!("{:?}", write.kind).to_lowercase(),
        status: write.status.clone(),
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args.save.then(|| store_path.display().to_string()),
        event_id,
        event_sequence,
    };
    print_serialized(&out, args.format)
}

fn read_structured_file(path: &Path) -> Result<Value> {
    let raw =
        fs::read_to_string(path).with_context(|| format!("reading suite {}", path.display()))?;
    if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
        serde_json::from_str(&raw).with_context(|| format!("parsing {}", path.display()))
    } else {
        serde_yaml::from_str(&raw).with_context(|| format!("parsing {}", path.display()))
    }
}

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
        let store = snapshot_store_from(args.snapshots.clone(), &args.root);
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
        snapshot_store_path: args.save.then(|| {
            snapshot_store_from(args.snapshots.clone(), &args.root)
                .file_path()
                .display()
                .to_string()
        }),
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
