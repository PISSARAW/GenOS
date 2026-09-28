use serde::{Deserialize, Serialize};

use super::{check_compatible, SCHEMA_VERSION};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CellGenomeLink {
    pub cell_id: String,
    pub genome_id: String,
    pub phenotype_hash: String,
    pub schema_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PortableManifest {
    pub cell_id: String,
    pub genome_id: String,
    pub phenotype_hash: String,
    pub lineage_id: String,
    pub schema_version: String,
}

pub fn link_cell_genome(cell_id: &str, genome_id: &str, phenotype: &str) -> CellGenomeLink {
    CellGenomeLink {
        cell_id: cell_id.to_string(),
        genome_id: genome_id.to_string(),
        phenotype_hash: phenotype.to_string(),
        schema_version: SCHEMA_VERSION.to_string(),
    }
}

pub fn to_manifest(link: &CellGenomeLink, lineage_id: &str) -> Result<PortableManifest, String> {
    check_compatible(&link.schema_version)?;
    if link.phenotype_hash.is_empty() {
        return Err("phenotype manquant".to_string());
    }
    Ok(PortableManifest {
        cell_id: link.cell_id.clone(),
        genome_id: link.genome_id.clone(),
        phenotype_hash: link.phenotype_hash.clone(),
        lineage_id: lineage_id.to_string(),
        schema_version: SCHEMA_VERSION.to_string(),
    })
}

pub fn check_manifest(manifest: &PortableManifest) -> Result<(), String> {
    check_compatible(&manifest.schema_version)?;
    if manifest.lineage_id.is_empty() {
        return Err("lignee manquante".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod adapter_tests {
    use super::*;

    #[test]
    fn lien_converti_en_manifeste() {
        let link = link_cell_genome("cell_1", "genome_1", "pheno_hash");
        let manifest = to_manifest(&link, "lin_1").expect("manifeste");
        assert!(check_manifest(&manifest).is_ok());
    }

    #[test]
    fn phenotype_vide_refuse() {
        let link = link_cell_genome("cell_1", "genome_1", "");
        assert!(to_manifest(&link, "lin_1").is_err());
    }
}
