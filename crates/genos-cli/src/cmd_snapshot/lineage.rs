//! `snapshot lineage` command — build a lineage tree from the event stream.

use crate::args::{LineageFormat, OutputFormat, SnapshotLineageArgs};
use crate::output::{print_lineage_tree, print_serialized, SnapshotLineageOutput};
use crate::resolve::{event_store_from, read_snapshot, snapshot_store_from};
use anyhow::{bail, Result};
use genos_core::build_lineage_dag;
use genos_store::{EventStore, SnapshotStore};

pub async fn cmd_snapshot_lineage(args: SnapshotLineageArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots.clone(), &args.root_dir);
    let event_store = event_store_from(args.events, &args.root_dir);

    // Resolve the anchor (root) snapshot, then build the dag, then walk.
    let (root_id, root_snapshot) = match (&args.snapshot, &args.root) {
        (Some(spec), _) => {
            // The user passed `--snapshot`. Accept either a file path or
            // an id resolved in the snapshot store.
            let path = std::path::Path::new(spec);
            if path.is_file() {
                let snap = read_snapshot(path)?;
                (snap.snapshot_id.clone(), Some(snap))
            } else {
                let snap = snapshot_store
                    .get_snapshot(spec.clone())
                    .await?
                    .ok_or_else(|| anyhow::anyhow!("snapshot '{spec}' not in store"))?;
                (snap.snapshot_id.clone(), Some(snap))
            }
        }
        (None, Some(id)) => {
            let snap = snapshot_store
                .get_snapshot(id.clone())
                .await?
                .ok_or_else(|| anyhow::anyhow!("snapshot '{id}' not in store"))?;
            (snap.snapshot_id.clone(), Some(snap))
        }
        (None, None) => {
            // No anchor: build the dag first, then auto-detect the root.
            let events = event_store.stream(None).await?;
            let dag = build_lineage_dag(&events);
            match dag.auto_root() {
                Some(root) => (root, None),
                None => bail!("no anchor given and the event stream has no parent-less snapshots"),
            }
        }
    };

    let events = event_store.stream(None).await?;
    let dag = build_lineage_dag(&events);
    let mut tree = dag.tree_at(&root_id);

    // Augment the root with the branch id and creation time from the
    // resolved snapshot file (or store entry) when available. The dag
    // doesn't carry that metadata — it only knows about edges.
    if let Some(snap) = root_snapshot {
        tree.branch_id = Some(snap.branch_id.0.clone());
        tree.created_at = snap.created_at;
    }

    let out = SnapshotLineageOutput {
        root_snapshot_id: root_id.0.clone(),
        edges: dag.edges.len(),
        tree,
    };

    match args.format {
        LineageFormat::Json => print_serialized(&out, OutputFormat::Json),
        LineageFormat::Yaml => print_serialized(&out, OutputFormat::Yaml),
        LineageFormat::Text => {
            print_lineage_tree(&out.tree);
            Ok(())
        }
    }
}
