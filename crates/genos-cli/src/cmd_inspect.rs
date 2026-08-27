use crate::args::{InspectBeliefArgs, InspectFormat, OutputFormat};
use crate::output::{print_provenance_tree, print_serialized, InspectBeliefOutput};
use crate::resolve::{resolve_snapshot_ref, snapshot_store_from};
use anyhow::{Context, Result};
use genos_core::{
    beliefs::provenance::EventLookup, provenance_for_belief, AgentEvent, AgentSnapshot, BeliefId,
};
use std::collections::HashMap;
use std::path::Path;

pub async fn cmd_inspect_belief(args: InspectBeliefArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(
        args.snapshots.clone().map(|p| p.display().to_string()),
        &args.root,
    )
    .await
    .unwrap();
    let snapshot = resolve_snapshot_ref(&args.snapshot, &*snapshot_store).await?;

    let belief_id = BeliefId(args.belief_id.clone());
    let lookup = match &args.events {
        Some(path) => LocalEventLookup::load(path, &snapshot)
            .with_context(|| format!("loading events from {}", path.display()))?,
        None => LocalEventLookup::empty(),
    };

    let mut tree = provenance_for_belief(&snapshot, &belief_id, &lookup);

    // Augment every `tool_output` node with the record's detail and the
    // originating event (when the event store has it).
    for child in &mut tree.children {
        if child.kind == "tool_output" {
            if let Some(tool_output_id) = child
                .id
                .as_ref()
                .map(|s| genos_core::ids::ToolOutputId(s.clone()))
            {
                if let Some(record) = snapshot.tool_output(&tool_output_id) {
                    genos_core::augment_tool_output_node(child, record, &lookup);
                }
            }
        }
    }

    let out = InspectBeliefOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        belief_id: args.belief_id.clone(),
        tree,
    };

    match args.format {
        InspectFormat::Text => {
            print_provenance_tree(&out.tree);
            Ok(())
        }
        InspectFormat::Json => print_serialized(&out, OutputFormat::Json),
        InspectFormat::Yaml => print_serialized(&out, OutputFormat::Yaml),
    }
}

/// JSONL-backed [`EventLookup`] for the CLI. Reads the events file as
/// newline-separated JSON, filters to `snapshot.branch_id`, and indexes by
/// `event_id` so the walker can resolve a tool output's originating event.
struct LocalEventLookup {
    events: HashMap<genos_core::ids::EventId, AgentEvent>,
}

impl LocalEventLookup {
    fn empty() -> Self {
        Self {
            events: HashMap::new(),
        }
    }

    fn load(path: &Path, snapshot: &AgentSnapshot) -> Result<Self> {
        let bytes = std::fs::read(path)
            .with_context(|| format!("reading events file {}", path.display()))?;
        let text = std::str::from_utf8(&bytes).context("events file is not valid UTF-8")?;
        let branch_id = snapshot.branch_id.clone();
        let mut events = HashMap::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let event: AgentEvent =
                serde_json::from_str(line).with_context(|| format!("parsing event {}", line))?;
            if event.branch_id.as_ref() == Some(&branch_id) {
                events.insert(event.event_id.clone(), event);
            }
        }
        Ok(Self { events })
    }
}

impl EventLookup for LocalEventLookup {
    fn event(&self, id: &genos_core::ids::EventId) -> Option<AgentEvent> {
        self.events.get(id).cloned()
    }
}
