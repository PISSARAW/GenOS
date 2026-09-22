use serde_json::json;

use genos_store::fossil::{BurialContext, FossilRegistry, FossilizationMode, Melanosome};

use crate::Genome;

fn extract_hard_parts(genome: &Genome) -> Vec<String> {
    let mut parts = vec!["genome".to_string(), "dna".to_string()];
    if !genome.genes.is_empty() {
        parts.push("genes".to_string());
    }
    if !genome.plasmids.is_empty() {
        parts.push("plasmids".to_string());
    }
    parts
}

fn extract_markers(genome: &Genome) -> Vec<Melanosome> {
    let mut markers = Vec::new();
    for (locus, gene) in &genome.genes {
        let favorable = gene.p53_repair_check();
        let value = if favorable { "expressed" } else { "silent" };
        markers.push(Melanosome::from_outcome(locus, value, favorable));
    }
    markers
}

pub fn fossilize_genome(registry: &mut FossilRegistry, genome: &Genome, reason: &str) -> genos_store::fossil::FossilRecord {
    let mut ctx = BurialContext::new(&genome.lineage_id().to_string(), reason);
    ctx.mode = FossilizationMode::Petrification;
    ctx.hard_parts = extract_hard_parts(genome);
    ctx.phenotype_markers = extract_markers(genome);
    ctx.mineral_payload = json!({
        "genome_id": genome.genome_id(),
        "content_hash": genome.content_hash(),
        "generation": genome.generation,
    });
    registry.bury(ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gene::Gene;
    use crate::ChromatinState;

    #[test]
    fn test_fossilize_genome_creates_valid_fossil() {
        let genome = Genome::new("FOSSIL_INTEGRATION");
        let mut registry = FossilRegistry::new();

        let record = fossilize_genome(&mut registry, &genome, "test extinction");
        assert_eq!(record.mode, FossilizationMode::Petrification);
        assert!(!record.payload_hash.is_empty());
        assert!(record.verify_integrity());
    }

    #[test]
    fn test_extract_hard_parts_includes_genome_and_dna() {
        let genome = Genome::new("HARD_PARTS");
        let parts = extract_hard_parts(&genome);
        assert!(parts.contains(&"genome".to_string()));
        assert!(parts.contains(&"dna".to_string()));
    }

    #[test]
    fn test_fossilize_with_expressed_gene_produces_favorable_marker() {
        let mut genome = Genome::new("MARKER_TEST");
        let mut gene = Gene::new("EXPRESSED_GENE", "ATGC");
        gene.chromatin_state = ChromatinState::Euchromatin;
        genome.insert_gene(gene);

        let markers = extract_markers(&genome);
        let marker = markers
            .iter()
            .find(|m| m.marker == "EXPRESSED_GENE")
            .unwrap();
        assert_eq!(
            marker.shape,
            genos_store::fossil::MelanosomeShape::Elongated
        );
    }
}
