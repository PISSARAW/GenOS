use super::{
    audit_snapshot, load_snapshot, HallucinationDetectOutput, HallucinationFinding,
    HallucinationInjectOutput,
};
use crate::args::{HallucinationDetectArgs, HallucinationInjectArgs, OutputFormat};
use crate::output::{print_serialized, snapshot_path_or_none, write_serialized};
use crate::resolve::{event_store_from, snapshot_store_from};
use anyhow::{bail, Context, Result};
use genos_core::{upsert_belief_at, BeliefStatus};
use genos_store::{EventStore, SnapshotStore};
use serde_json::Value;
use std::fs;

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
        let store = snapshot_store_from(
            args.snapshots
                .clone()
                .clone()
                .map(|p| p.display().to_string()),
            &args.root,
        )
        .await
        .unwrap();
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
