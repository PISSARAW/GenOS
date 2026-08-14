//! Lineage tree renderer for the `snapshot lineage` command.
//!
//! Extracted from `output.rs` so the parent module stays under the 400-line
//! rule. The printer is plain-text only; structured output (JSON / YAML)
//! flows through `print_serialized` in the parent.

use genos_core::{LineageChild, LineageNode};

/// Render a [`LineageNode`] tree to stdout using `├──` / `└──` connectors
/// and edge labels (`mutation`, `fork`, `restore`, ...) between the
/// connector and the child label.
///
/// Example:
///
/// ```text
/// a1b2c3d4 (branch=abcd1234)
/// ├── mutation 5e6f7g8h
/// │       └── mutation 9i0j1k2l
/// └── fork 3m4n5o6p
/// ```
pub fn print_lineage_tree(node: &LineageNode) {
    // The root line carries its branch id (when known) so a reader can
    // see at a glance which branch the tree is rooted on.
    match &node.branch_id {
        Some(branch) => println!("{} (branch={})", node.snapshot_id, short_id_str(branch)),
        None => println!("{}", node.snapshot_id),
    }
    print_children(&node.children, "");
}

fn print_children(children: &[LineageChild], prefix: &str) {
    let count = children.len();
    for (index, child) in children.iter().enumerate() {
        let last = index + 1 == count;
        let connector = if last { "└── " } else { "├── " };
        let next_prefix = format!("{prefix}{}", if last { "    " } else { "│   " });
        println!("{prefix}{connector}{} {}", child.relation, child.snapshot_id);
        print_children(&child.children, &next_prefix);
    }
}

fn short_id_str(id: &str) -> String {
    id.chars().take(8).collect()
}
