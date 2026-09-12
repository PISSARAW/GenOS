pub mod homochromy;
pub mod homotypy;
pub mod disruptive;

pub use homochromy::{DynamicChromatophore, FixedHomochromy, PigmentType, TargetEnvironment, ThreatLevel};
pub use homotypy::{HomotypicCamouflage, StructuralMorphology};
pub use disruptive::{DisruptedFragment, DisruptiveColoration};
