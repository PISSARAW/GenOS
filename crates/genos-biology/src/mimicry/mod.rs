pub mod batesian;
pub mod mullerian;
pub mod peckhamian;
pub mod automimicry;
pub mod wasmannian;
pub mod non_visual;

pub use batesian::{AposematicWarning, BatesianMimicry};
pub use mullerian::MullerianMimicryRing;
pub use peckhamian::{HoneypotCaptureReport, LureType, PeckhamianHoneypot};
pub use automimicry::{AutomimicryOcelli, OcellusImpactReport};
pub use wasmannian::{WasmannianAuditReport, WasmannianAuditor};
pub use non_visual::{AcousticUltrasonicMimicry, ChemicalPheromoneMimicry, NonVisualMode};
