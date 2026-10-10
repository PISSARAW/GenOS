use genos_genome::{DnaNucleotide, Genome, INSTINCT_LOCUS_PREFIX};

use crate::model::{AgentDna, Mutation};
use crate::operations::rebuild_inheriting;

#[derive(Clone, Debug)]
pub struct PointMutationOptions {
    pub locus: String,
    pub position: usize,
    pub replacement: DnaNucleotide,
}

fn apply_point(genome: &mut Genome, options: &PointMutationOptions) -> Result<DnaNucleotide, String> {
    if options.locus.starts_with(INSTINCT_LOCUS_PREFIX) {
        return Err("protected instinct locus cannot be mutated".to_string());
    }
    let gene = genome.genes.get_mut(&options.locus)
        .ok_or_else(|| format!("gene locus '{}' not found", options.locus))?;
    let original = *gene.dna.as_slice().get(options.position)
        .ok_or_else(|| format!("position {} is outside locus '{}'", options.position, options.locus))?;
    if original == options.replacement {
        return Err("point mutation must change the nucleotide".to_string());
    }
    gene.dna.mutate_point(options.position, options.replacement);
    Ok(original)
}

pub fn mutate_point(dna: &AgentDna, options: &PointMutationOptions) -> Result<AgentDna, String> {
    let mut genome = dna.to_genome()?.derive_child();
    let original = apply_point(&mut genome, options)?;
    genome.validate()?;
    let mut provenance = dna.provenance.clone();
    provenance.parents = vec![dna.meta.genome_id];
    provenance.signer = None;
    provenance.mutations.push(Mutation {
        gene: Some(options.locus.clone()),
        kind: format!("point:{}", options.position),
        from: format!("{original:?}"),
        to: format!("{:?}", options.replacement),
    });
    let name = format!("{}_point_{}", dna.meta.name, provenance.mutations.len());
    let candidate = rebuild_inheriting(&genome, dna, (&name, provenance));
    crate::validate::validate(&candidate)?;
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Provenance;
    use genos_genome::{Gene, Genome};
    use rand::SeedableRng;

    #[test]
    fn point_mutation_changes_one_base_and_keeps_source() {
        let mut genome = Genome::new("base");
        genome.insert_gene(Gene::new("ROLE", "worker"));
        let source = AgentDna::from_genome(&genome, "base", Provenance {
            signer: Some("parent-signer".into()), ..Provenance::default()
        });
        let original = source.genes["ROLE"].dna.as_slice().to_vec();
        let replacement = original[3].mutate(&mut rand::rngs::StdRng::seed_from_u64(2));
        let options = PointMutationOptions { locus: "ROLE".into(), position: 3, replacement };
        let candidate = mutate_point(&source, &options).expect("point mutation");
        let changed = candidate.genes["ROLE"].dna.as_slice().iter().zip(&original)
            .filter(|(left, right)| left != right).count();
        assert_eq!(changed, 1);
        assert_eq!(source.genes["ROLE"].dna.as_slice(), original);
        assert_ne!(candidate.meta.genome_id, source.meta.genome_id);
        assert_eq!(candidate.meta.parent_ids, vec![source.meta.genome_id]);
        assert_eq!(candidate.provenance.parents, vec![source.meta.genome_id]);
        assert_eq!(candidate.provenance.signer, None);
        assert_eq!(candidate.provenance.mutations[0].kind, "point:3");
        assert!(mutate_point(&source, &PointMutationOptions { replacement: original[3], ..options.clone() }).is_err());
        assert!(mutate_point(&source, &PointMutationOptions { position: original.len(), ..options }).is_err());
        assert!(mutate_point(&source, &PointMutationOptions {
            locus: "LOCUS_INSTINCT_TEST".into(), position: 0, replacement,
        }).is_err());
    }
}
