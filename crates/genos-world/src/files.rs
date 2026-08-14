//! File-level fork isolation.
//!
//! The world counterpart of `genos_core::variables`: instead of a variable in
//! working memory, the diverging state is a file inside a forked world. Both
//! providers fork by copying the parent snapshot, so a write inside one world
//! is invisible to its siblings and to the world it was forked from. This
//! module checks that property rather than assuming it.

use crate::WorldProvider;
use genos_core::WorldId;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A world paired with the contents it is expected to hold for a file.
///
/// For a fork, `expected` is what that branch wrote. For the parent, it is what
/// the file held before the forks were written to.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorldFileExpectation {
    pub world_id: WorldId,
    pub expected: Option<String>,
}

impl WorldFileExpectation {
    /// Expect `world_id` to hold `expected`.
    pub fn holds(world_id: &WorldId, expected: &str) -> Self {
        Self {
            world_id: world_id.clone(),
            expected: Some(expected.to_string()),
        }
    }

    /// Expect the file to be absent from `world_id`.
    pub fn absent(world_id: &WorldId) -> Self {
        Self {
            world_id: world_id.clone(),
            expected: None,
        }
    }
}

/// What one world actually holds for the file under check.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldFileObservation {
    pub world_id: WorldId,
    pub expected_contents: Option<String>,
    pub actual_contents: Option<String>,
    pub matches_expected: bool,
}

/// Outcome of checking that forked worlds wrote the same file differently
/// without any write escaping its world.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIsolationReport {
    pub path: String,
    pub parent: WorldFileObservation,
    pub branches: Vec<WorldFileObservation>,
    /// The parent world still holds its pre-fork contents.
    pub parent_preserved: bool,
    /// Every branch still holds what it wrote: no sibling overwrote it.
    pub branches_hold_expected_contents: bool,
    /// No two branches ended on the same contents, i.e. the writes diverged.
    pub branch_contents_distinct: bool,
    /// All three conditions above.
    pub isolated: bool,
    /// One line per broken expectation; empty when `isolated` holds.
    pub violations: Vec<String>,
}

/// Configuration for a file-isolation check. Bundling these into a struct
/// keeps the check below the 3-parameter rule and makes the call site
/// self-documenting.
pub struct FileIsolationCheck<'a> {
    pub provider: &'a dyn WorldProvider,
    pub path: &'a str,
    pub parent: &'a WorldFileExpectation,
    pub branches: &'a [WorldFileExpectation],
}

impl<'a> FileIsolationCheck<'a> {
    pub fn new(
        provider: &'a dyn WorldProvider,
        path: &'a str,
        parent: &'a WorldFileExpectation,
        branches: &'a [WorldFileExpectation],
    ) -> Self {
        Self {
            provider,
            path,
            parent,
            branches,
        }
    }

    /// Run the check. Forking a world holding `hello.txt = "hello"` twice and
    /// writing `"bonjour"` in one fork and `"hola"` in the other must leave
    /// the two forks on their own values and the parent on `"hello"`.
    pub async fn run(&self) -> anyhow::Result<FileIsolationReport> {
        let parent_observation = observe(self.provider, self.path, self.parent).await?;

        let mut branch_observations = Vec::with_capacity(self.branches.len());
        for branch in self.branches {
            branch_observations.push(observe(self.provider, self.path, branch).await?);
        }

        let mut violations = Vec::new();

        if !parent_observation.matches_expected {
            violations.push(format!(
                "parent world {} expected {}={} but holds {}",
                parent_observation.world_id,
                self.path,
                render(&parent_observation.expected_contents),
                render(&parent_observation.actual_contents),
            ));
        }

        for observation in &branch_observations {
            if !observation.matches_expected {
                violations.push(format!(
                    "world {} expected {}={} but holds {}",
                    observation.world_id,
                    self.path,
                    render(&observation.expected_contents),
                    render(&observation.actual_contents),
                ));
            }
        }

        let mut seen = HashSet::new();
        let branch_contents_distinct = branch_observations
            .iter()
            .all(|observation| seen.insert(observation.actual_contents.clone()));
        if !branch_contents_distinct {
            violations.push(format!(
                "two worlds ended on the same contents for {}: {}",
                self.path,
                branch_observations
                    .iter()
                    .map(|observation| render(&observation.actual_contents))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }

        let parent_preserved = parent_observation.matches_expected;
        let branches_hold_expected_contents = branch_observations
            .iter()
            .all(|observation| observation.matches_expected);

        Ok(FileIsolationReport {
            path: self.path.to_string(),
            parent: parent_observation,
            branches: branch_observations,
            parent_preserved,
            branches_hold_expected_contents,
            branch_contents_distinct,
            isolated: parent_preserved
                && branches_hold_expected_contents
                && branch_contents_distinct,
            violations,
        })
    }
}

async fn observe(
    provider: &dyn WorldProvider,
    path: &str,
    expectation: &WorldFileExpectation,
) -> anyhow::Result<WorldFileObservation> {
    let actual_contents = provider.read_file(&expectation.world_id, path).await?;

    Ok(WorldFileObservation {
        world_id: expectation.world_id.clone(),
        matches_expected: actual_contents == expectation.expected,
        expected_contents: expectation.expected.clone(),
        actual_contents,
    })
}

fn render(contents: &Option<String>) -> String {
    match contents {
        Some(contents) => format!("\"{contents}\""),
        None => "<absent>".to_string(),
    }
}

/// Free-function wrapper kept for backward compatibility with call sites
/// that have not been migrated to the [`FileIsolationCheck`] builder yet.
pub async fn check_file_isolation(
    provider: &dyn WorldProvider,
    path: &str,
    parent: &WorldFileExpectation,
    branches: &[WorldFileExpectation],
) -> anyhow::Result<FileIsolationReport> {
    FileIsolationCheck::new(provider, path, parent, branches)
        .run()
        .await
}
