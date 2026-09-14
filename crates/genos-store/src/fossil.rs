//! Fossilisation stratigraphique : archive terminale, immuable et irréversible
//! d'une lignée d'agent. Le fossile est une **preuve**, pas une sauvegarde :
//! il s'excave en lecture seule et n'est jamais ressuscitable.
//!
//! Voir [docs/01-concepts/fossilisation.md] et [docs/adr/0003-fossilization-stratigraphic-archive.md].

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

/// Mode de taphonomie (comment la matière a été préservée).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FossilizationMode {
    /// Remplacement molécule à molécule (matière minéralisée conservée).
    Petrification,
    /// Empreinte externe : seule la forme (interfaces) survit.
    ExternalMold,
    /// Moule interne : seule la trace de remplissage (décisions) survit.
    InternalMold,
    /// Ichnofossile : empreinte d'activité (provenance, pistes).
    Trace,
}

impl Default for FossilizationMode {
    fn default() -> Self {
        Self::Petrification
    }
}

impl FossilizationMode {
    pub fn from_label(label: &str) -> Self {
        match label.trim().to_ascii_lowercase().as_str() {
            "external_mold" | "external-mold" | "moule_externe" => Self::ExternalMold,
            "internal_mold" | "internal-mold" | "moule_interne" => Self::InternalMold,
            "trace" | "ichnofossil" | "trace_fossile" => Self::Trace,
            _ => Self::Petrification,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Petrification => "petrification",
            Self::ExternalMold => "external_mold",
            Self::InternalMold => "internal_mold",
            Self::Trace => "trace",
        }
    }
}

/// Forme du marqueur phénotypique résiduel (analogue du mélanosome).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MelanosomeShape {
    /// Bâtonnets allongés (eumélanosomes) : issue favorable / sûre.
    Elongated,
    /// Sphères courtes (phéomélanosomes) : issue adverse / risquée.
    Spherical,
}

/// Marqueur phénotypique qui survit à la compaction et révèle ce qu'était l'agent.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Melanosome {
    pub marker: String,
    pub value: String,
    pub shape: MelanosomeShape,
}

impl Melanosome {
    pub fn from_outcome(marker: &str, value: &str, favorable: bool) -> Self {
        Self {
            marker: marker.to_string(),
            value: value.to_string(),
            shape: if favorable {
                MelanosomeShape::Elongated
            } else {
                MelanosomeShape::Spherical
            },
        }
    }
}

/// Classification phénotypique reconstituée à partir des mélanosomes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhenotypeClass {
    SafeSuccess,
    RiskyFailure,
    Neutral,
}

/// Lecture phénotypique d'un fossile (résultat de `decode`).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PhenotypeReading {
    pub inferred_class: PhenotypeClass,
    pub favorable_markers: usize,
    pub adverse_markers: usize,
    pub confidence: f64,
}

/// Décode la morphométrie des marqueurs en classe de phénotype.
pub fn decode_phenotype(markers: &[Melanosome]) -> PhenotypeReading {
    let favorable = markers
        .iter()
        .filter(|m| m.shape == MelanosomeShape::Elongated)
        .count();
    let adverse = markers
        .iter()
        .filter(|m| m.shape == MelanosomeShape::Spherical)
        .count();
    let total = favorable + adverse;
    if total == 0 {
        return PhenotypeReading {
            inferred_class: PhenotypeClass::Neutral,
            favorable_markers: 0,
            adverse_markers: 0,
            confidence: 0.0,
        };
    }
    if favorable >= adverse {
        PhenotypeReading {
            inferred_class: PhenotypeClass::SafeSuccess,
            favorable_markers: favorable,
            adverse_markers: adverse,
            confidence: favorable as f64 / total as f64,
        }
    } else {
        PhenotypeReading {
            inferred_class: PhenotypeClass::RiskyFailure,
            favorable_markers: favorable,
            adverse_markers: adverse,
            confidence: adverse as f64 / total as f64,
        }
    }
}

/// Enregistrement minéral d'une lignée éteinte.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FossilRecord {
    pub fossil_id: Uuid,
    pub extinct_lineage_id: String,
    pub reason: String,
    pub recorded_at: String,
    #[serde(default)]
    pub mode: FossilizationMode,
    #[serde(default)]
    pub stratum_id: String,
    #[serde(default)]
    pub payload_hash: String,
    #[serde(default = "default_quality")]
    pub conservation_quality: f64,
    #[serde(default)]
    pub hard_parts: Vec<String>,
    #[serde(default)]
    pub soft_parts_lost: Vec<String>,
    #[serde(default)]
    pub phenotype_markers: Vec<Melanosome>,
    #[serde(default)]
    pub mineral_payload: Value,
}

fn default_quality() -> f64 {
    1.0
}

impl FossilRecord {
    /// Recalcule le hash minéral : détecte toute réécriture post-hoc.
    pub fn verify_integrity(&self) -> bool {
        self.payload_hash == mineral_hash_of(self)
    }

    pub fn reading(&self) -> PhenotypeReading {
        decode_phenotype(&self.phenotype_markers)
    }
}

/// Contexte d'enfouissement : regroupe les paramètres du pipeline de taphonomie.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BurialContext {
    pub lineage_id: String,
    pub reason: String,
    #[serde(default)]
    pub mode: FossilizationMode,
    #[serde(default)]
    pub hard_parts: Vec<String>,
    #[serde(default)]
    pub soft_parts_lost: Vec<String>,
    #[serde(default)]
    pub phenotype_markers: Vec<Melanosome>,
    #[serde(default)]
    pub mineral_payload: Value,
}

impl BurialContext {
    pub fn new(lineage_id: &str, reason: &str) -> Self {
        Self {
            lineage_id: lineage_id.to_string(),
            reason: reason.to_string(),
            mode: FossilizationMode::Petrification,
            hard_parts: Vec::new(),
            soft_parts_lost: Vec::new(),
            phenotype_markers: Vec::new(),
            mineral_payload: Value::Null,
        }
    }
}

/// Spécimen excavé : lecture seule, jamais promouvable.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FossilSpecimen {
    pub record: FossilRecord,
    pub integrity_verified: bool,
    pub reading: PhenotypeReading,
}

/// Une strate sédimentaire : lot daté de fossiles (datation stratigraphique).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SedimentStratum {
    pub stratum_id: String,
    pub deposited_at: String,
    pub fossil_count: usize,
    pub fossil_ids: Vec<Uuid>,
}

/// Registre stratigraphique des lignées éteintes.
#[derive(Default)]
pub struct FossilRegistry {
    records: Vec<FossilRecord>,
}

impl FossilRegistry {
    pub fn new() -> Self {
        Self {
            records: Vec::new(),
        }
    }

    /// Reconstruit un registre à partir de fossiles persistés (relecture).
    pub fn from_records(records: Vec<FossilRecord>) -> Self {
        Self { records }
    }

    /// Fossilisation minimale (rétro-compatible).
    pub fn fossilize(&mut self, lineage_id: &str, reason: &str) -> FossilRecord {
        self.bury(BurialContext::new(lineage_id, reason))
    }

    /// Pipeline de taphonomie : triage → minéralisation → dépôt en strate.
    pub fn bury(&mut self, ctx: BurialContext) -> FossilRecord {
        let recorded_at = Utc::now().to_rfc3339();
        let mut record = FossilRecord {
            fossil_id: Uuid::new_v4(),
            extinct_lineage_id: ctx.lineage_id,
            reason: ctx.reason,
            recorded_at: recorded_at.clone(),
            mode: ctx.mode,
            stratum_id: stratum_of(&recorded_at),
            payload_hash: String::new(),
            conservation_quality: conservation_quality(&ctx.hard_parts, &ctx.soft_parts_lost),
            hard_parts: ctx.hard_parts,
            soft_parts_lost: ctx.soft_parts_lost,
            phenotype_markers: ctx.phenotype_markers,
            mineral_payload: ctx.mineral_payload,
        };
        record.payload_hash = mineral_hash_of(&record);
        self.records.push(record.clone());
        record
    }

    pub fn all_fossils(&self) -> &[FossilRecord] {
        &self.records
    }

    pub fn find(&self, fossil_id: &Uuid) -> Option<&FossilRecord> {
        self.records.iter().find(|r| r.fossil_id == *fossil_id)
    }

    pub fn by_lineage(&self, lineage_id: &str) -> Vec<&FossilRecord> {
        self.records
            .iter()
            .filter(|r| r.extinct_lineage_id == lineage_id)
            .collect()
    }

    /// Excavation en lecture seule. Aucune résurrection n'est possible.
    pub fn excavate(&self, fossil_id: &Uuid) -> Option<FossilSpecimen> {
        self.find(fossil_id).map(|record| FossilSpecimen {
            integrity_verified: record.verify_integrity(),
            reading: record.reading(),
            record: record.clone(),
        })
    }

    /// Regroupe les fossiles par strate, dans l'ordre de dépôt.
    pub fn strata(&self) -> Vec<SedimentStratum> {
        let mut order: Vec<String> = Vec::new();
        let mut grouped: HashMap<String, SedimentStratum> = HashMap::new();
        for rec in &self.records {
            let stratum = grouped.entry(rec.stratum_id.clone()).or_insert_with(|| {
                order.push(rec.stratum_id.clone());
                SedimentStratum {
                    stratum_id: rec.stratum_id.clone(),
                    deposited_at: rec.recorded_at.clone(),
                    fossil_count: 0,
                    fossil_ids: Vec::new(),
                }
            });
            stratum.fossil_count += 1;
            stratum.fossil_ids.push(rec.fossil_id);
        }
        order
            .into_iter()
            .filter_map(|id| grouped.remove(&id))
            .collect()
    }
}

fn stratum_of(recorded_at: &str) -> String {
    let day = recorded_at
        .split('T')
        .next()
        .unwrap_or(recorded_at)
        .trim();
    if day.is_empty() {
        "stratum-unknown".to_string()
    } else {
        format!("stratum-{day}")
    }
}

fn conservation_quality(hard: &[String], soft: &[String]) -> f64 {
    let total = hard.len() + soft.len();
    if total == 0 {
        1.0
    } else {
        hard.len() as f64 / total as f64
    }
}

/// Hash minéral canonique : SHA-256 de la matière préservée (hors hash).
fn mineral_hash_of(record: &FossilRecord) -> String {
    let material = serde_json::json!({
        "lineage_id": record.extinct_lineage_id,
        "reason": record.reason,
        "recorded_at": record.recorded_at,
        "mode": record.mode,
        "hard_parts": record.hard_parts,
        "soft_parts_lost": record.soft_parts_lost,
        "phenotype_markers": record.phenotype_markers,
        "mineral_payload": record.mineral_payload,
    });
    let bytes = serde_json::to_vec(&material).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    format!("{:x}", hasher.finalize())
}
