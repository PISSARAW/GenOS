use crate::args::{DiffArgs, DiffFormat, OutputFormat, ReplayBasicArgs, ReplayFromSnapshotArgs};
use crate::output::{
    print_diff_text, print_serialized, DiffIdentity, DiffOutput, ReplayBasicOutput,
    ReplayFromSnapshotOutput,
};
use crate::resolve::{event_store_from, resolve_snapshot_ref, snapshot_store_from};
use anyhow::{bail, Context, Result};
use genos_core::{compare_snapshots, diff_snapshots};
use genos_store::{basic_state_from_snapshot, replay_basic_state_from, EventStore, SnapshotStore};

pub async fn cmd_diff(args: DiffArgs) -> Result<()> {
    let store = snapshot_store_from(args.store.clone().map(|p| p.display().to_string()), &args.root).await.unwrap();
    let a = resolve_snapshot_ref(&args.a, &*store).await?;
    let b = resolve_snapshot_ref(&args.b, &*store).await?;

    let diff = diff_snapshots(&a, &b);
    let comparison = compare_snapshots(&a, &b);

    let out = DiffOutput {
        a_snapshot_id: a.snapshot_id.0.clone(),
        b_snapshot_id: b.snapshot_id.0.clone(),
        empty: diff.is_empty(),
        entry_count: diff.len(),
        changed_paths: diff.changed_paths(),
        identity: DiffIdentity {
            distinct_snapshot_id: comparison.distinct_snapshot_id,
            distinct_agent_id: comparison.distinct_agent_id,
            distinct_branch_id: comparison.distinct_branch_id,
            distinct_identity: comparison.distinct_identity,
        },
        diff,
    };

    match args.format {
        DiffFormat::Json => print_serialized(&out, OutputFormat::Json)?,
        DiffFormat::Yaml => print_serialized(&out, OutputFormat::Yaml)?,
        DiffFormat::Text => print_diff_text(&out),
    }

    if args.expect_empty && !out.empty {
        bail!(
            "expected an empty diff, but these paths changed: {}",
            out.changed_paths.join(", ")
        );
    }

    if !args.expect_changed_paths.is_empty() {
        let mut expected = args.expect_changed_paths.clone();
        expected.sort();
        expected.dedup();
        let mut actual = out.changed_paths.clone();
        actual.sort();

        if expected != actual {
            bail!(
                "expected exactly these paths to change: [{}], got [{}]",
                expected.join(", "),
                actual.join(", ")
            );
        }
    }

    Ok(())
}

pub async fn cmd_replay_basic(args: ReplayBasicArgs) -> Result<()> {
    let anchor = match &args.snapshot {
        Some(spec) => {
            let store = snapshot_store_from(args.snapshots.clone().map(|p| p.display().to_string()), &args.root).await.unwrap();
            Some(resolve_snapshot_ref(spec, &*store).await?)
        }
        None => None,
    };

    let branch_id = match &anchor {
        Some(snapshot) => Some(snapshot.branch_id.0.clone()),
        None => args.branch_id.clone(),
    };

    let store = event_store_from(args.events.clone(), &args.root);
    let replay_state = store.replay_basic_state(branch_id.clone()).await?;

    let out = ReplayBasicOutput {
        store_path: args.snapshots.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "<dynamic>".to_string()),
        branch_id: branch_id.clone(),
        anchor_snapshot_id: anchor
            .as_ref()
            .map(|snapshot| snapshot.snapshot_id.0.clone()),
        state: replay_state,
    };

    print_serialized(&out, args.format)?;

    // A branch replayed from its own snapshot must never surface another agent:
    // that would mean the sibling streams converged.
    if let (Some(snapshot), Some(replayed)) = (&anchor, &out.state.agent_id) {
        if *replayed != snapshot.agent_id {
            bail!(
                "branch {} replayed to agent {} but is owned by agent {} in snapshot {}",
                snapshot.branch_id,
                replayed,
                snapshot.agent_id,
                snapshot.snapshot_id
            );
        }
    }

    if let Some(expected) = &args.expect_agent_id {
        let actual = out.state.agent_id.as_ref().map(|id| id.0.as_str());
        if actual != Some(expected.as_str()) {
            bail!(
                "expected replayed agent_id {expected}, got {}",
                actual.unwrap_or("none")
            );
        }
    }

    if let Some(expected) = &args.expect_branch_id {
        let actual = out.state.branch_id.as_ref().map(|id| id.0.as_str());
        if actual != Some(expected.as_str()) {
            bail!(
                "expected replayed branch_id {expected}, got {}",
                actual.unwrap_or("none")
            );
        }
    }

    if let Some(expected) = args.expect_last_sequence {
        if out.state.last_sequence != expected {
            bail!(
                "expected replayed last_sequence {expected}, got {}",
                out.state.last_sequence
            );
        }
    }

    Ok(())
}

pub async fn cmd_replay_from_snapshot(args: ReplayFromSnapshotArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots.clone().map(|p| p.display().to_string()), &args.root).await.unwrap();
    let event_store = event_store_from(args.events.clone(), &args.root);

    let snapshot = snapshot_store
        .get_snapshot(args.snapshot_id.clone())
        .await?
        .with_context(|| format!("snapshot {} not found", args.snapshot_id))?;

    let branch_id = snapshot.branch_id.0.clone();
    let base = basic_state_from_snapshot(&snapshot);
    let from_sequence = base.last_sequence;

    let mut events = event_store.stream(Some(branch_id.clone())).await?;
    events.retain(|e| e.sequence > from_sequence);
    events.sort_by_key(|e| e.sequence);

    let state = replay_basic_state_from(base, &events);

    let out = ReplayFromSnapshotOutput {
        snapshot_store_path: args.snapshots.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "<dynamic>".to_string()),
        event_store_path: args.events.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "<dynamic>".to_string()),
        snapshot_id: args.snapshot_id,
        branch_id,
        from_sequence_exclusive: from_sequence,
        replayed_events: events.len(),
        state,
    };

    print_serialized(&out, args.format)
}
