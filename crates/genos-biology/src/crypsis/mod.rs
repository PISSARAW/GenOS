pub mod homochromy;
pub mod homotypy;
pub mod disruptive;
pub mod thayer_countershading;
pub mod counterillumination;
pub mod transparency;
pub mod active_masking;

pub use homochromy::{DynamicChromatophore, FixedHomochromy, PigmentType, TargetEnvironment, ThreatLevel};
pub use homotypy::{HomotypicCamouflage, StructuralMorphology};
pub use disruptive::{DisruptedFragment, DisruptiveColoration};
pub use thayer_countershading::{PerceivedReliefProfile, ThayerCountershading};
pub use counterillumination::{Counterillumination, PhotophoreState};
pub use transparency::{GhostExecutionYield, GlassNodeTransparency};
pub use active_masking::{ActiveDecoratorMasking, EnvironmentalFragment};
