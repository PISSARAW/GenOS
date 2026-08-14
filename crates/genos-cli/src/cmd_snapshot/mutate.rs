use crate::args::{
    OutputFormat, SnapshotAddMemoryArgs, SnapshotCheckVarArgs, SnapshotSetCognitionArgs,
    SnapshotSetVarArgs,
};
use crate::output::{
    print_serialized, snapshot_path_or_none, write_serialized, CognitionChange,
    SnapshotAddMemoryOutput, SnapshotCheckVarOutput, SnapshotSetCognitionOutput,
    SnapshotSetVarOutput,
};
use crate::resolve::{event_store_from, resolve_snapshot_ref, snapshot_store_from};
use anyhow::{bail, Result};
use genos_core::{
    add_memory_on_branch, check_variable_isolation, write_variable_on_branch, MemoryKind,
    VariableExpectation,
};
use genos_store::{EventStore, SnapshotStore};

pub async fn cmd_snapshot_set_cognition(args: SnapshotSetCognitionArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let mut changed = Vec::new();

    if let Some(exploration) = args.exploration {
        changed.push(CognitionChange {
            field: "genome.cognition.exploration".to_string(),
            previous: snapshot.genome.cognition.exploration.to_string(),
            value: exploration.to_string(),
        });
        snapshot.genome.cognition.exploration = exploration;
    }

    if let Some(threshold) = args.verification_threshold {
        changed.push(CognitionChange {
            field: "genome.cognition.verification_threshold".to_string(),
            previous: snapshot.genome.cognition.verification_threshold.to_string(),
            value: threshold.to_string(),
        });
        snapshot.genome.cognition.verification_threshold = threshold;
    }

    if let Some(depth) = args.planning_depth {
        changed.push(CognitionChange {
            field: "genome.cognition.planning_depth".to_string(),
            previous: snapshot.genome.cognition.planning_depth.to_string(),
            value: depth.to_string(),
        });
        snapshot.genome.cognition.planning_depth = depth;
    }

    if changed.is_empty() {
        bail!(
            "nothing to change: pass at least one of --exploration, --verification-threshold, --planning-depth"
        );
    }

    // The genome id and version are left alone on purpose: this tunes a value
    // on one branch, it does not publish a new genome version.
    let out_path = args.out.clone().or_else(|| snapshot_path_or_none(&args.snapshot));
    if let Some(path) = &out_path {
        write_serialized(path, &snapshot, OutputFormat::Json)?;
    }

    let out = SnapshotSetCognitionOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        genome_id: snapshot.genome.id.0.clone(),
        changed,
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
    };

    if args.save {
        snapshot_store.save_snapshot(snapshot).await?;
    }

    print_serialized(&out, args.format)
}

pub async fn cmd_snapshot_set_var(args: SnapshotSetVarArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let write = write_variable_on_branch(&mut snapshot, &args.key, &args.value);

    // A write advances the branch it happened on, so by default it lands back in
    // the file that snapshot came from.
    let out_path = args.out.clone().or_else(|| snapshot_path_or_none(&args.snapshot));
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
            Some(event_id)
        }
        None => None,
    };

    let out = SnapshotSetVarOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        agent_id: snapshot.agent_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        key: write.key,
        previous_value: write.previous_value,
        value: write.value,
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
        event_id,
        event_sequence: write.event.sequence,
    };

    if args.save {
        snapshot_store.save_snapshot(snapshot).await?;
    }

    print_serialized(&out, args.format)
}

pub async fn cmd_snapshot_add_memory(args: SnapshotAddMemoryArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let kind: MemoryKind = args.kind.into();
    let write = add_memory_on_branch(
        &mut snapshot,
        kind,
        &args.content,
        args.source.as_deref(),
    );

    // Recording a memory advances the branch it happened on, so by default it
    // lands back in the file that snapshot came from.
    let out_path = args.out.clone().or_else(|| snapshot_path_or_none(&args.snapshot));
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
            Some(event_id)
        }
        None => None,
    };

    let out = SnapshotAddMemoryOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        agent_id: snapshot.agent_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        memory_id: write.record.id.0.clone(),
        kind: write.record.kind,
        content: write.record.content.clone(),
        created_in: write.record.created_in.0.clone(),
        created_at: write.record.created_at.to_rfc3339(),
        source: write.record.source.clone(),
        semantic_ref_count: snapshot.state.semantic_memory.refs.len(),
        episodic_ref_count: snapshot.state.episodic_memory.refs.len(),
        out_path: out_path.as_ref().map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
        event_id,
        event_sequence: write.event.sequence,
    };

    if args.save {
        snapshot_store.save_snapshot(snapshot).await?;
    }

    print_serialized(&out, args.format)
}

pub async fn cmd_snapshot_check_var(args: SnapshotCheckVarArgs) -> Result<()> {
    if args.branches.is_empty() {
        bail!("--branch is required at least once");
    }
    if !args.expects.is_empty() && args.expects.len() != args.branches.len() {
        bail!(
            "--expect must be given once per --branch, in the same order: got {} --branch and {} --expect",
            args.branches.len(),
            args.expects.len()
        );
    }

    let store = snapshot_store_from(args.store, &args.root);
    let parent = resolve_snapshot_ref(&args.parent, &store).await?;

    let mut branches = Vec::with_capacity(args.branches.len());
    for spec in &args.branches {
        branches.push(resolve_snapshot_ref(spec, &store).await?);
    }

    // Without an explicit expectation, a snapshot is expected to hold what it
    // already holds: the check then only proves the branches diverged.
    let parent_expected: Option<String> = if args.expect_parent_absent {
        None
    } else {
        args.expect_parent
            .clone()
            .or_else(|| parent.variable(&args.key).map(str::to_string))
    };
    let branch_expected: Vec<Option<String>> = branches
        .iter()
        .enumerate()
        .map(|(index, branch)| match args.expects.get(index) {
            Some(expected) => Some(expected.clone()),
            None => branch.variable(&args.key).map(str::to_string),
        })
        .collect();

    let expectations: Vec<VariableExpectation<'_>> = branches
        .iter()
        .zip(branch_expected.iter())
        .map(|(branch, expected)| VariableExpectation {
            snapshot: branch,
            expected: expected.as_deref(),
        })
        .collect();

    let report = check_variable_isolation(
        &args.key,
        VariableExpectation {
            snapshot: &parent,
            expected: parent_expected.as_deref(),
        },
        &expectations,
    );

    let out = SnapshotCheckVarOutput {
        parent_snapshot_id: parent.snapshot_id.0.clone(),
        branch_count: branches.len(),
        report,
    };
    print_serialized(&out, args.format)?;

    if args.expect_isolated && !out.report.isolated {
        bail!(
            "variable '{}' is not isolated across branches: {}",
            args.key,
            out.report.violations.join("; ")
        );
    }

    Ok(())
}
