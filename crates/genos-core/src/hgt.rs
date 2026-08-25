use crate::genome::{AgentGenome, Locus};
use crate::operon::Operon;
use serde::{Deserialize, Serialize};

/// Unité génétique mobile (élément transposable) capable de s'insérer
/// de manière autonome dans le génome pour propager des fragments (payload).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Transposon {
    pub name: String,
    pub payload: Vec<Locus>,
    pub insertion_sequence: String,
}

/// Erreurs de transposition.
#[derive(Clone, Debug, PartialEq)]
pub enum TranspositionError {
    /// Le génome ne porte aucun chromosome cible.
    NoTargetChromosome,
    /// Élément déjà présent : le génome est immunisé contre la ré-insertion
    /// du même transposon (mécanisme anti-amplification).
    AlreadyInserted,
    /// Le transposon ne porte aucun gène.
    EmptyPayload,
}

/// Rapport d'une insertion réussie d'élément transposable.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct InsertionReport {
    pub transposon_name: String,
    pub chromosome: String,
    pub insertion_index: usize,
}

/// PRNG déterministe (SplitMix64) : la transposition est reproductible.
fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

impl Transposon {
    /// Insère de manière autonome le payload du transposon dans le génome.
    ///
    /// Sélection du site d'insertion :
    /// 1. **Spécifique au site** : si un locus porte un gène dont le nom correspond
    ///    à `insertion_sequence`, le payload est inséré juste après ce locus.
    /// 2. **Aléatoire déterministe** (fallback) : chromosome et position dérivés
    ///    du `seed` via SplitMix64 (reproductible byte-for-byte).
    pub fn insert_into(
        &self,
        genome: &mut AgentGenome,
        seed: u64,
    ) -> Result<InsertionReport, TranspositionError> {
        if self.payload.is_empty() {
            return Err(TranspositionError::EmptyPayload);
        }
        if genome.cognition.chromosomes.is_empty() {
            return Err(TranspositionError::NoTargetChromosome);
        }

        // Immunisation : refus si un gène caractéristique du payload est déjà présent.
        let sentinel = &self.payload[0].gene_name;
        let already_present = genome
            .cognition
            .chromosomes
            .iter()
            .any(|c| c.loci.iter().any(|l| &l.gene_name == sentinel));
        if already_present {
            return Err(TranspositionError::AlreadyInserted);
        }

        // 1. Site spécifique.
        if !self.insertion_sequence.is_empty() {
            for chromosome in genome.cognition.chromosomes.iter_mut() {
                if let Some(pos) = chromosome
                    .loci
                    .iter()
                    .position(|l| l.gene_name == self.insertion_sequence)
                {
                    let index = pos + 1;
                    splice(chromosome, index, &self.payload);
                    return Ok(InsertionReport {
                        transposon_name: self.name.clone(),
                        chromosome: chromosome.name.clone(),
                        insertion_index: index,
                    });
                }
            }
        }

        // 2. Fallback aléatoire déterministe.
        let mut state = seed;
        let chrom_index = (splitmix64(&mut state) as usize)
            % genome.cognition.chromosomes.len();
        let chromosome = &mut genome.cognition.chromosomes[chrom_index];
        let index = if chromosome.loci.is_empty() {
            0
        } else {
            (splitmix64(&mut state) as usize) % (chromosome.loci.len() + 1)
        };
        splice(chromosome, index, &self.payload);
        Ok(InsertionReport {
            transposon_name: self.name.clone(),
            chromosome: chromosome.name.clone(),
            insertion_index: index,
        })
    }
}

/// Insère les loci du payload à l'index donné d'un chromosome.
fn splice(chromosome: &mut crate::genome::Chromosome, index: usize, payload: &[Locus]) {
    for (offset, locus) in payload.iter().enumerate() {
        chromosome.loci.insert(index + offset, locus.clone());
    }
}

/// Véhicule de transfert horizontal, regroupant un ensemble d'opérons.
/// Permet à un agent d'acquérir de nouvelles compétences "à la volée".
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlasmidPackage {
    pub id: String,
    pub origin_of_transfer: String,
    pub operons: Vec<Operon>,
    pub compatibility_group: String,
}

/// Trait définissant la capacité d'un agent à assimiler des fragments génétiques externes.
pub trait HorizontalGeneTransfer {
    /// Absorbe un plasmide et l'intègre directement au génome de l'agent.
    fn absorb_plasmid(&mut self, plasmid: &PlasmidPackage);
}

impl HorizontalGeneTransfer for AgentGenome {
    fn absorb_plasmid(&mut self, plasmid: &PlasmidPackage) {
        if let Some(chromosome) = self.cognition.chromosomes.first_mut() {
            chromosome.operons.extend(plasmid.operons.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::{Chromosome, CognitionConfig, Identity};
    use crate::ids::GenomeId;

    fn locus(name: &str) -> Locus {
        Locus {
            gene_name: name.to_string(),
            value: 0.5,
            epigenetic_marker: 0.0,
        }
    }

    fn genome_with(gene_names: &[&str]) -> AgentGenome {
        AgentGenome {
            id: GenomeId::new(),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            breeding: None,
            ecological_niche: None,
            version: crate::genome::GenomeVersion("0.1.0".to_string()),
            identity: Identity {
                name: "t".to_string(),
                role: "test".to_string(),
            },
            cognition: CognitionConfig {
                chromosomes: vec![
                    Chromosome {
                        name: "C1".to_string(),
                        loci: gene_names.iter().map(|n| locus(n)).collect(),
                        operons: vec![],
                    },
                    Chromosome {
                        name: "C2".to_string(),
                        loci: vec![locus("other")],
                        operons: vec![],
                    },
                ],
                planning_depth: 2,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: crate::genome::MemoryPolicy {
                working_max_items: 1,
                episodic_enabled: false,
                semantic_enabled: false,
            },
            model_policy: crate::genome::ModelPolicy {
                strategy: "test".to_string(),
                preferred_providers: vec![],
                allow_local: true,
            },
            tool_policy: crate::genome::ToolPolicy {
                permissions: vec![],
            },
            inferred_traits: vec![],
        }
    }

    fn test_transposon(target: &str) -> Transposon {
        Transposon {
            name: "Tn-compile".to_string(),
            payload: vec![locus("lint_strictness"), locus("build_parallelism")],
            insertion_sequence: target.to_string(),
        }
    }

    #[test]
    fn insertion_is_site_specific_when_target_present() {
        let mut g = genome_with(&["exploration", "verification_threshold"]);
        let tn = test_transposon("exploration");
        let report = tn.insert_into(&mut g, 42).unwrap();
        assert_eq!(report.chromosome, "C1");
        assert_eq!(report.insertion_index, 1);
        assert_eq!(g.cognition.chromosomes[0].loci[1].gene_name, "lint_strictness");
        assert_eq!(
            g.cognition.chromosomes[0].loci[2].gene_name,
            "build_parallelism"
        );
    }

    #[test]
    fn fallback_insertion_is_deterministic_for_same_seed() {
        let mut a = genome_with(&["exploration"]);
        let mut b = genome_with(&["exploration"]);
        let tn = test_transposon(""); // pas de site cible
        let ra = tn.insert_into(&mut a, 7).unwrap();
        let rb = tn.insert_into(&mut b, 7).unwrap();
        assert_eq!(ra, rb);
        // Un autre seed peut donner un site différent.
        let mut c = genome_with(&["exploration"]);
        let rc = tn.insert_into(&mut c, 8).unwrap();
        let _ = rc;
    }

    #[test]
    fn reinsertion_of_same_element_is_rejected() {
        let mut g = genome_with(&["exploration"]);
        let tn = test_transposon("");
        tn.insert_into(&mut g, 1).unwrap();
        assert_eq!(tn.insert_into(&mut g, 2), Err(TranspositionError::AlreadyInserted));
    }

    #[test]
    fn empty_payload_or_genome_is_rejected() {
        let empty_tn = Transposon {
            name: "Tn-empty".to_string(),
            payload: vec![],
            insertion_sequence: String::new(),
        };
        let mut g = genome_with(&["exploration"]);
        assert_eq!(empty_tn.insert_into(&mut g, 1), Err(TranspositionError::EmptyPayload));

        let tn = test_transposon("");
        let mut bare = genome_with(&[]);
        bare.cognition.chromosomes.clear();
        assert_eq!(tn.insert_into(&mut bare, 1), Err(TranspositionError::NoTargetChromosome));
    }
}
