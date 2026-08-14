use crate::args::{
    OutputFormat, SnapshotCheckpointArgs, SnapshotCompareArgs, SnapshotGetArgs, SnapshotListArgs,
    SnapshotRestoreArgs, SnapshotSaveArgs,
};
use crate::output::{
    print_serialized, snapshot_path_or_none, write_serialized, SnapshotCheckpointOutput,
    SnapshotCompareOutput, SnapshotGetOutput, SnapshotListOutput, SnapshotRestoreOutput,
    SnapshotSaveOutput,
};
use crate::resolve::{event_store_from, read_snapshot, resolve_snapshot_ref, snapshot_store_from};
use anyhow::{bail, Result};
use genos_core::{checkpoint_snapshot, compare_snapshots, restore_snapshot};
use genos_store::{EventStore, SnapshotStore};
use std::path::PathBuf;

pub async fn cmd_snapshot_save(args: SnapshotSaveArgs) -> Result<()> {
    let snapshot = read_snapshot(&args.snapshot)?;
    let store = snapshot_store_from(args.store, &args.root);

    let snapshot_id = snapshot.snapshot_id.0.clone();
    store.save_snapshot(snapshot).await?;

    let out = SnapshotSaveOutput {
        store_path: store.file_path().display().to_string(),
        snapshot_id,
    };
    print_serialized(&out, args.format)
}

pub async fn cmd_snapshot_get(args: SnapshotGetArgs) -> Result<()> {
    let store = snapshot_store_from(args.store, &args.root);

    let snapshot = store.get_snapshot(args.snapshot_id.clone()).await?;
    let out = SnapshotGetOutput {
        store_path: store.file_path().display().to_string(),
        snapshot_id: args.snapshot_id,
        found: snapshot.is_some(),
        snapshot,
    };

    print_serialized(&out, args.format)
}

pub async fn cmd_snapshot_list(args: SnapshotListArgs) -> Result<()> {
    let store = snapshot_store_from(args.store, &args.root);

    let snapshot_ids = store.list_snapshot_ids().await?;
    let out = SnapshotListOutput {
        store_path: store.file_path().display().to_string(),
        count: snapshot_ids.len(),
        snapshot_ids,
    };

    print_serialized(&out, args.format)
}

pub async fn cmd_snapshot_compare(args: SnapshotCompareArgs) -> Result<()> {
    let store = snapshot_store_from(args.store, &args.root);
    let a = resolve_snapshot_ref(&args.a, &store).await?;
    let b = resolve_snapshot_ref(&args.b, &store).await?;

    let comparison = compare_snapshots(&a, &b);
    let out = SnapshotCompareOutput {
        a_snapshot_id: a.snapshot_id.0.clone(),
        b_snapshot_id: b.snapshot_id.0.clone(),
        comparison,
    };
    print_serialized(&out, args.format)?;

    if args.expect_same_state && !out.comparison.same_logical_state {
        bail!(
            "expected identical logical state, but these fields differ: {}",
            out.comparison.differing_fields.join(", ")
        );
    }

    if args.expect_distinct_identity && !out.comparison.distinct_identity {
        bail!(
            "expected distinct identity, but snapshot_id_distinct={}, agent_id_distinct={}, branch_id_distinct={}",
            out.comparison.distinct_snapshot_id,
            out.comparison.distinct_agent_id,
            out.comparison.distinct_branch_id
        );
    }

    if !args.expect_differing_fields.is_empty() {
        let mut expected = args.expect_differing_fields.clone();
        expected.sort();
        expected.dedup();
        let mut actual = out.comparison.differing_fields.clone();
        actual.sort();

        if expected != actual {
            bail!(
                "expected exactly these fields to differ: [{}], got [{}]",
                expected.join(", "),
                actual.join(", ")
            );
        }
    }

    Ok(())
}

pub async fn cmd_snapshot_restore(args: SnapshotRestoreArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);

    // Resolve both ends. The target is the working snapshot whose logical
    // state we're rewinding; the source is the saved snapshot we're rewinding
    // *to*.
    let target = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;
    let source = resolve_snapshot_ref(&args.source, &snapshot_store).await?;

    // Cross-branch restore is rejected by `restore_snapshot` (panic in
    // debug builds, assertion-failure in release). Catch it here and turn
    // it into a clean CLI error.
    if target.branch_id != source.branch_id {
        bail!(
            "cannot restore across branches: target branch_id={}, source branch_id={}",
            target.branch_id.0,
            source.branch_id.0
        );
    }

    let write = restore_snapshot(&target, &source);

    // The rewound target replaces the file the target was loaded from by
    // default — that's where the user's "current" working snapshot lives.
    let out_path = args
        .out
        .clone()
        .or_else(|| snapshot_path_or_none(&args.snapshot));
    if let Some(path) = &out_path {
        write_serialized(path, &write.snapshot, OutputFormat::Json)?;
    }

    let event_store = if args.emit_events {
        Some(event_store_from(args.events, &args.root))
    } else {
        None
    };
    let event_id = match &event_store {
        Some(store) => {
            let id = write.event.event_id.0.clone();
            store.append(write.event.clone()).await?;
            Some(id)
        }
        None => None,
    };

    let out = SnapshotRestoreOutput {
        target_snapshot_id: write.snapshot.snapshot_id.0.clone(),
        agent_id: write.snapshot.agent_id.0.clone(),
        branch_id: write.snapshot.branch_id.0.clone(),
        source_snapshot_id: source.snapshot_id.0.clone(),
        restored_fields: write.restored_fields.clone(),
        event_id,
        event_sequence: write.event.sequence,
        previous_sequence: write
            .event
            .payload
            .get("previous_sequence")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
    };

    if args.save {
        snapshot_store.save_snapshot(write.snapshot.clone()).await?;
    }

    print_serialized(&out, args.format)?;

    if args.expect_same_state {
        let cmp = compare_snapshots(&write.snapshot, &source);
        // The cursor legitimately advances past the Restored event, so the
        // two cursor fields always differ. Filter them out: `expect_same_state`
        // for restore means "working memory, beliefs, etc. all match" — the
        // cursor bookkeeping is part of the rewind itself.
        let unexpected: Vec<&str> = cmp
            .differing_fields
            .iter()
            .map(String::as_str)
            .filter(|field| {
                !matches!(
                    *field,
                    "state.event_cursor.sequence" | "state.event_cursor.last_event_id"
                )
            })
            .collect();
        if !unexpected.is_empty() {
            bail!(
                "expected logical state to match after restore, but these fields differ: [{}]",
                unexpected.join(", ")
            );
        }
    }

    Ok(())
}

pub async fn cmd_snapshot_checkpoint(args: SnapshotCheckpointArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots.clone(), &args.root);

    // Resolve the source snapshot — same shape as `cmd_snapshot_restore`.
    let source = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let write = checkpoint_snapshot(&source);

    // Where does the new snapshot go? Default to the file the source was
    // loaded from (so the working file is replaced in place), or fall
    // back to `.genos/snapshots/checkpoint.json` when the source was
    // referenced only by id.
    let out_path = args
        .out
        .clone()
        .or_else(|| snapshot_path_or_none(&args.snapshot))
        .unwrap_or_else(|| PathBuf::from(".genos/snapshots/checkpoint.json"));
    write_serialized(&out_path, &write.snapshot, OutputFormat::Json)?;

    let event_store = if args.emit_events {
        Some(event_store_from(args.events.clone(), &args.root))
    } else {
        None
    };
    let event_id = match &event_store {
        Some(store) => {
            let id = write.event.event_id.0.clone();
            store.append(write.event.clone()).await?;
            Some(id)
        }
        None => None,
    };

    if args.save {
        snapshot_store.save_snapshot(write.snapshot.clone()).await?;
    }

    let out = SnapshotCheckpointOutput {
        source_snapshot_id: source.snapshot_id.0.clone(),
        snapshot_id: write.snapshot.snapshot_id.0.clone(),
        agent_id: write.snapshot.agent_id.0.clone(),
        branch_id: write.snapshot.branch_id.0.clone(),
        event_id,
        event_sequence: write.event.sequence,
        out_path: out_path.display().to_string(),
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|s| s.file_path().display().to_string()),
    };
    print_serialized(&out, args.format)?;

    if args.expect_fresh_id && source.snapshot_id == write.snapshot.snapshot_id {
        bail!(
            "expected checkpoint to mint a fresh snapshot_id, got {}",
            source.snapshot_id.0
        );
    }
    if args.expect_same_branch && source.branch_id != write.snapshot.branch_id {
        bail!(
            "expected checkpoint to share branch_id ({}), got {}",
            source.branch_id.0,
            write.snapshot.branch_id.0
        );
    }

    Ok(())
}
