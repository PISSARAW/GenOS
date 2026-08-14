use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

macro_rules! define_id {
    ($name:ident) => {
        #[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
        pub struct $name(pub String);

        impl $name {
            pub fn new() -> Self {
                Self(Uuid::now_v7().to_string())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }
    };
}

define_id!(AgentId);
define_id!(GenomeId);
define_id!(SnapshotId);
define_id!(BranchId);
define_id!(WorldId);
define_id!(EventId);
define_id!(ExperimentId);
define_id!(ArtifactId);
define_id!(MemoryId);
define_id!(BeliefId);
define_id!(CorrelationId);
define_id!(ToolOutputId);
