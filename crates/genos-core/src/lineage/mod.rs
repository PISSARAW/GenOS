pub mod dag;
pub mod tree;

#[cfg(test)]
mod tests;

pub use dag::*;
pub use tree::*;

use crate::ids::BranchId;

// Pull in `BranchId` so the unused-import lint stays quiet on crates
// that disable `dead_code` for it through the lineage re-export path.
const _: fn() = || {
    let _ = BranchId::new;
};
