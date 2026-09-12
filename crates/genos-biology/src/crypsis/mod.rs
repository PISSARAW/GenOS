pub mod homochromy;
pub mod homotypy;
pub mod disruptive;
pub mod thayer_countershading;

pub use homochromy::{DynamicChromatophore, FixedHomochromy, PigmentType, TargetEnvironment, ThreatLevel};
pub use homotypy::{HomotypicCamouflage, StructuralMorphology};
pub use disruptive::{DisruptedFragment, DisruptiveColoration};
pub use thayer_countershading::{PerceivedReliefProfile, ThayerCountershading};
