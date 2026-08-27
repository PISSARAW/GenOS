//! Système immunitaire adaptatif artificiel (AIS).
//!
//! Transposition du système immunitaire adaptatif des vertébrés :
//! - **Sélection négative** (censure thymique) : les détecteurs-candidats réagissant
//!   au corpus « self » sont éliminés avant leur déploiement.
//! - **Sélection clonale + hypermutation somatique** : un détecteur liant un
//!   antigène prolifère et mute proportionnellement à l'erreur (maturation d'affinité).
//! - **Mémoire immunitaire** : les anticorps matures sont commis dans un registre.
//! - **Théorie du danger de Matzinger** : la réponse immunitaire est déclenchée par
//!   des signaux de danger endogènes (DAMP), pas par la seule non-appartenance au self.

pub mod clonal;
pub mod danger;
pub mod detectors;
pub mod memory;

pub use clonal::ClonalSelector;
pub use danger::{DamSignal, DangerModel};
pub use detectors::{rbf_affinity, Antibody, NegativeSelector};
pub use memory::ImmuneMemoryRegistry;
