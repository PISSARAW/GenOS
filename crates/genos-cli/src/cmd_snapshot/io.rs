use crate::args::{SnapshotCompareArgs, SnapshotGetArgs, SnapshotListArgs, SnapshotSaveArgs};
use crate::output::{
    print_serialized, SnapshotCompareOutput, SnapshotGetOutput, SnapshotListOutput,
    SnapshotSaveOutput,
};
use crate::resolve::{read_snapshot, resolve_snapshot_ref, snapshot_store_from};
use anyhow::{bail, Result};
use genos_core::compare_snapshots;
use genos_store::SnapshotStore;

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
