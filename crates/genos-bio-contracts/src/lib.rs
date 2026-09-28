use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: &str = "1.0.0";
pub const SCHEMA_MAJOR: &str = "1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrganismRef {
    pub organism_id: String,
    pub mission_id: String,
    pub schema_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CellRef {
    pub cell_id: String,
    pub lineage_id: String,
    pub schema_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GenomeRef {
    pub genome_id: String,
    pub phenotype_hash: String,
    pub schema_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BudgetClaim {
    pub resource: String,
    pub reserved: f64,
    pub consumed: f64,
    pub ceiling: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BioSignal {
    pub signal_id: String,
    pub event_id: String,
    pub kind: String,
    pub origin: EffectOrigin,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BioEffect {
    pub effect_id: String,
    pub origin: EffectOrigin,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EffectOrigin {
    Simulated,
    Local,
    External,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BioReceipt {
    pub organism_id: String,
    pub agent_id: String,
    pub genome_id: String,
    pub episode_id: String,
    pub initial_state_hash: String,
    pub effect_id: String,
    pub proof: String,
    pub effect_origin: EffectOrigin,
    pub schema_version: String,
}

pub fn schema_version() -> &'static str {
    SCHEMA_VERSION
}

pub fn is_compatible(version: &str) -> bool {
    major_of(version) == SCHEMA_MAJOR
}

pub fn major_of(version: &str) -> &str {
    version.split('.').next().unwrap_or("")
}

pub fn check_compatible(version: &str) -> Result<(), String> {
    if is_compatible(version) {
        Ok(())
    } else {
        Err(version_mismatch(version))
    }
}

pub fn version_mismatch(version: &str) -> String {
    format!("incompatible schema {} != {}", version, SCHEMA_VERSION)
}

pub fn validate_budget(claim: &BudgetClaim) -> Result<(), String> {
    if claim.reserved < 0.0 {
        return Err("reserved negatif".to_string());
    }
    if claim.consumed > claim.reserved {
        return Err("depassement budget".to_string());
    }
    if claim.reserved > claim.ceiling {
        return Err("plafond depasse".to_string());
    }
    Ok(())
}

pub fn validate_receipt(receipt: &BioReceipt) -> Result<(), String> {
    check_compatible(&receipt.schema_version)?;
    if receipt.proof.is_empty() {
        return Err("preuve manquante".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests;

pub mod ids;
pub mod states;
pub mod lifecycle;
