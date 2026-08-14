//! Typed evidence links on a belief.
//!
//! `Belief.evidence: Vec<EvidenceRef>` carries the chain back to whatever the
//! claim was derived from: a tool output recorded on the same branch, or a
//! free-form note when the basis isn't structured. The enum is `#[serde(default)]`
//! at the field level so older snapshots (which had `evidence: Vec<String>`)
//! deserialize to an empty list without a migration.

use crate::ids::ToolOutputId;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum EvidenceRef {
    /// The belief was derived from this tool output (recorded on the same
    /// branch's `state.tool_outputs`).
    ToolOutput { tool_output_id: ToolOutputId },
    /// A free-form textual note. Used when the basis isn't a recorded tool
    /// call — observations, prior beliefs, or external context.
    Note { text: String },
}

impl EvidenceRef {
    /// Short human-readable label used by the inspect tree.
    pub fn label(&self) -> String {
        match self {
            EvidenceRef::ToolOutput { tool_output_id } => {
                format!("tool_output:{}", tool_output_id)
            }
            EvidenceRef::Note { text } => format!("note:{text}"),
        }
    }

    /// The `id` of the referenced tool output, if this ref points at one.
    pub fn tool_output_id(&self) -> Option<&ToolOutputId> {
        match self {
            EvidenceRef::ToolOutput { tool_output_id } => Some(tool_output_id),
            EvidenceRef::Note { .. } => None,
        }
    }
}

impl fmt::Display for EvidenceRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.label())
    }
}
