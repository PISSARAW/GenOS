//! Belief and tool-call mutators.
//!
//! Extracted from `mutate.rs` so the file stays under the 400-line rule while
//! the belief-evidence and tool-output record paths have room to grow. The
//! flow shape mirrors `cmd_snapshot_add_memory`: load snapshot, run the core
//! write, persist the snapshot, optionally append to the event store.

use crate::args::{OutputFormat, SnapshotRecordToolCallArgs, SnapshotSetBeliefArgs};
use crate::output::{
    print_serialized, snapshot_path_or_none, write_serialized, SnapshotRecordToolCallOutput,
    SnapshotSetBeliefOutput,
};
use crate::resolve::{event_store_from, resolve_snapshot_ref, snapshot_store_from};
use anyhow::Result;
use genos_core::{
    record_tool_call_on_branch, upsert_belief, upsert_belief_with_evidence, EvidenceRef,
    ToolCallRequest,
};
use genos_store::{EventStore, SnapshotStore};

pub async fn cmd_snapshot_set_belief(args: SnapshotSetBeliefArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots.clone().map(|p| p.display().to_string()), &args.root).await.unwrap();
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &*snapshot_store).await?;

    // `--evidence` routes through `upsert_belief_with_evidence`, which
    // validates each `EvidenceRef::ToolOutput` against `state.tool_outputs`,
    // defaults the new belief's status to `Inferred` (unless the caller passed
    // one â€” they didn't here, so the no-`--status` path takes the default), and
    // dedupes re-linked refs. A no-`--evidence` call still uses
    // `upsert_belief` to keep the existing 5-arg shape for back-compat.
    let write = if args.evidence.is_empty() {
        upsert_belief(
            &mut snapshot,
            &args.subject,
            &args.predicate,
            &args.object_value,
            args.confidence,
        )
    } else {
        let evidence: Vec<EvidenceRef> = args
            .evidence
            .iter()
            .map(|raw| EvidenceRef::ToolOutput {
                tool_output_id: genos_core::ids::ToolOutputId(raw.clone()),
            })
            .collect();
        upsert_belief_with_evidence(
            &mut snapshot,
            &args.subject,
            &args.predicate,
            &args.object_value,
            args.confidence,
            evidence,
            None,
        )?
    };

    // A belief write advances the branch it happened on, so by default it lands
    // back in the file that snapshot came from.
    let out_path = args
        .out
        .clone()
        .or_else(|| snapshot_path_or_none(&args.snapshot));
    if let Some(path) = &out_path {
        write_serialized(path, &snapshot, OutputFormat::Json)?;
    }

    let event_store = if args.emit_events {
        Some(event_store_from(args.events, &args.root))
    } else {
        None
    };
    let event_id = match &event_store {
        Some(store) => {
            let event_id = write.event.event_id.0.clone();
            store.append(write.event.clone()).await?;
            // The contradiction marker event is part of the same branch's audit
            // trail â€” append it right after, so a replay of the branch sees
            // both the belief write and the contradiction in order.
            if let Some(marker) = &write.contradiction_event {
                store.append(marker.clone()).await?;
            }
            Some(event_id)
        }
        None => None,
    };

    // Capture the move-only fields before constructing the output, so the
    // `print_contradiction_notice` call below still owns a complete `write`.
    let subject = write.subject.clone();
    let predicate = write.predicate.clone();
    let object_value = write.object_value.clone();
    let confidence = write.confidence;
    let previous_confidence = write.previous_confidence;
    let belief_id_str: String = write.belief_id.0.clone();
    let kind = write.kind;
    let status = write.status.clone();
    let contradictions_str: Vec<String> =
        write.contradictions.iter().map(|id| id.0.clone()).collect();
    let added_evidence_str: Vec<String> = write
        .added_evidence
        .iter()
        .map(|reference| reference.label())
        .collect();
    let tool_output_id_str = write.tool_output_id.as_ref().map(|id| id.0.clone());
    let event_sequence = write.event.sequence;
    let contradiction_event_id = write
        .contradiction_event
        .as_ref()
        .map(|marker| marker.event_id.0.clone());

    let out = SnapshotSetBeliefOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        agent_id: snapshot.agent_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        subject: subject.clone(),
        predicate: predicate.clone(),
        object_value: object_value.clone(),
        confidence,
        previous_confidence,
        belief_id: belief_id_str.clone(),
        kind,
        status,
        contradictions: contradictions_str,
        added_evidence: added_evidence_str,
        tool_output_id: tool_output_id_str,
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| args.snapshots.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "<dynamic>".to_string())),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
        event_id,
        event_sequence,
        contradiction_event_id: contradiction_event_id.clone(),
    };

    if args.save {
        snapshot_store.save_snapshot(&snapshot).await?;
    }

    print_serialized(&out, args.format)?;

    if !write.contradictions.is_empty() {
        crate::output::print_contradiction_notice(
            &belief_id_str,
            &object_value,
            &subject,
            &predicate,
            &write.contradictions,
        );
    }

    Ok(())
}

pub async fn cmd_snapshot_record_tool_call(args: SnapshotRecordToolCallArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots.clone().map(|p| p.display().to_string()), &args.root).await.unwrap();
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &*snapshot_store).await?;

    // Tool input / output: try to parse as JSON, fall back to a JSON string so
    // the record carries the user's text verbatim in either case. This matches
    // the spirit of the rest of the CLI: structured when possible, string
    // when not.
    let input_json = match args.input.as_deref() {
        Some(raw) => {
            serde_json::from_str(raw).unwrap_or_else(|_| serde_json::Value::String(raw.to_string()))
        }
        None => serde_json::Value::Null,
    };
    let output_json = match args.output.as_deref() {
        Some(raw) => {
            serde_json::from_str(raw).unwrap_or_else(|_| serde_json::Value::String(raw.to_string()))
        }
        None => serde_json::Value::Null,
    };

    let write = record_tool_call_on_branch(
        &mut snapshot,
        ToolCallRequest {
            tool_name: &args.tool_name,
            input: input_json,
            output: output_json,
            success: args.success,
            receipt: None,
            is_tainted: true,
        },
    );

    // Recording a tool call advances the branch it happened on, so by default
    // it lands back in the file that snapshot came from.
    let out_path = args
        .out
        .clone()
        .or_else(|| snapshot_path_or_none(&args.snapshot));
    if let Some(path) = &out_path {
        write_serialized(path, &snapshot, OutputFormat::Json)?;
    }

    let event_store = if args.emit_events {
        Some(event_store_from(args.events, &args.root))
    } else {
        None
    };
    let (requested_event_id, completed_event_id, last_sequence) = match &event_store {
        Some(store) => {
            let requested_id = write.requested_event.event_id.0.clone();
            let completed_id = write.completed_event.event_id.0.clone();
            store.append(write.requested_event.clone()).await?;
            store.append(write.completed_event.clone()).await?;
            (requested_id, completed_id, write.completed_event.sequence)
        }
        None => (
            write.requested_event.event_id.0.clone(),
            write.completed_event.event_id.0.clone(),
            write.completed_event.sequence,
        ),
    };

    let out = SnapshotRecordToolCallOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        agent_id: snapshot.agent_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        tool_output_id: write.record.id.0.clone(),
        tool_name: write.record.tool_name.clone(),
        success: write.record.success,
        requested_event_id,
        completed_event_id,
        event_sequence: last_sequence,
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| args.snapshots.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "<dynamic>".to_string())),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
    };

    if args.save {
        snapshot_store.save_snapshot(&snapshot).await?;
    }

    print_serialized(&out, args.format)
}
