use genos_genome::Genome;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt::Write;
use uuid::Uuid;
use crate::seed::{default_seed, rng_from_seed};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DivisionMode {
    Mitosis,
    BinaryFission,
    Budding,
    Schizogony,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct MitosisAttestation {
    pub parent_id: Uuid,
    pub clone_id: Uuid,
    pub lineage_id: Uuid,
    pub spindle_aligned: bool,
    pub spindle_alignment_hash: String,
    pub attestation_hash: String,
    pub amitosis_rejected: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MitosisResult {
    pub parent: Genome,
    pub clone: Genome,
    pub attestation: MitosisAttestation,
}

pub const MIN_MEROZOITES: usize = 2;
pub const MAX_MEROZOITES: usize = 128;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BuddingResult {
    pub mother: Genome,
    pub daughter: Genome,
    pub daughter_volume: f64,
    pub bud_scars: u32,
    pub hayflick_limit: u32,
    pub remaining_divisions: u32,
    pub is_senescent: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SchizogonyResult {
    pub mother_genome_id: Uuid,
    pub mother_lysed: bool,
    pub merozoites: Vec<Genome>,
    pub mutation_rate_applied: f64,
}

pub struct CellDivision;

fn mutate_nucleotide<R: rand::Rng + ?Sized>(nucleotide: &genos_genome::DnaNucleotide, rng: &mut R) -> genos_genome::DnaNucleotide {
    use genos_genome::DnaNucleotide::*;
    let alternatives = match nucleotide {
        A => [C, G, T],
        C => [A, G, T],
        G => [A, C, T],
        T => [A, C, G],
    };
    let idx = rng.random_range(0..3);
    alternatives[idx].clone()
}

impl CellDivision {
    pub fn binary_fission(genome: &Genome, mutation_rate: f64) -> Result<(Genome, Genome), String> {
        Self::binary_fission_with_seed(genome, mutation_rate, &default_seed(&genome.genome_id().to_string(), "binary_fission"))
    }

    pub fn binary_fission_with_seed(genome: &Genome, mutation_rate: f64, seed: &str) -> Result<(Genome, Genome), String> {
        if !(0.0..=1.0).contains(&mutation_rate) {
            return Err("Mutation rate must be between 0 and 1".to_string());
        }
        let parent = genome.clone();
        let mut child = genome.derive_child();
        let mut rng = rng_from_seed(seed);

        // Procaryote : allègement des métadonnées lourdes eucaryotes (rétrovirus, chromosomes surnuméraires)
        child.endogenous_retroviruses.clear();
        child.extra_chromosomes.clear();

        // Réplication et partitionnement des plasmides avec nouveaux IDs
        child.plasmids = child.plasmids
            .into_iter()
            .map(|mut p| {
                p.id = Uuid::new_v4();
                p
            })
            .collect();

        // Mutation stochastique réaliste des chromosomes
        if mutation_rate > 0.0 {
            let mut maternal = child.chromosome_maternal.as_slice().to_vec();
            let mut paternal = child.chromosome_paternal.as_slice().to_vec();
            for nucleotide in maternal.iter_mut().chain(paternal.iter_mut()) {
                if rng.random_bool(mutation_rate) {
                    *nucleotide = mutate_nucleotide(nucleotide, &mut rng);
                }
            }
            child.chromosome_maternal.replace_sequence(maternal);
            child.chromosome_paternal.replace_sequence(paternal);

            // Synchronisation : mutation stochastique des séquences d'ADN des gènes
            for gene in child.genes.values_mut() {
                let mut seq = gene.dna.as_slice().to_vec();
                for nucleotide in &mut seq {
                    if rng.random_bool(mutation_rate) {
                        *nucleotide = mutate_nucleotide(nucleotide, &mut rng);
                    }
                }
                gene.dna.replace_sequence(seq);
            }
        }

        // Procaryote : absence de condensation hétérochromatine complexe
        for gene in child.genes.values_mut() {
            gene.chromatin_state = genos_genome::ChromatinState::Euchromatin;
            gene.developmentally_locked = false;
        }

        Ok((parent, child))
    }

    /// Spindle Assembly Checkpoint (SAC) :
    /// Vérifie l'alignement chromosomique sur le plan équatorial mitotique,
    /// l'intégrité diploïde et la validité structurelle du génome.
    pub fn verify_spindle_alignment(genome: &Genome) -> Result<String, String> {
        genome.validate()?;
        let mat_len = genome.chromosome_maternal.len();
        let pat_len = genome.chromosome_paternal.len();
        if mat_len == 0 || pat_len == 0 {
            return Err("Mitotic spindle assembly checkpoint failed: chromosomal strand is empty".to_string());
        }
        if mat_len != pat_len {
            return Err(format!(
                "Mitotic spindle assembly checkpoint failed: chromosomal length mismatch (maternal: {}, paternal: {})",
                mat_len, pat_len
            ));
        }

        let mut hasher = Sha256::new();
        for n in genome.chromosome_maternal.as_slice() {
            hasher.update([match n {
                genos_genome::DnaNucleotide::A => b'A',
                genos_genome::DnaNucleotide::C => b'C',
                genos_genome::DnaNucleotide::G => b'G',
                genos_genome::DnaNucleotide::T => b'T',
            }]);
        }
        hasher.update(b"::SPINDLE_EQUATORIAL_PLANE::");
        for n in genome.chromosome_paternal.as_slice() {
            hasher.update([match n {
                genos_genome::DnaNucleotide::A => b'A',
                genos_genome::DnaNucleotide::C => b'C',
                genos_genome::DnaNucleotide::G => b'G',
                genos_genome::DnaNucleotide::T => b'T',
            }]);
        }
        let mut hex = String::with_capacity(64);
        for byte in hasher.finalize() {
            write!(&mut hex, "{:02x}", byte).unwrap();
        }
        Ok(hex)
    }

    /// Mitose attestée : Division symétrique avec vérification du fuseau mitotique
    /// et génération d'une preuve d'attestation cryptographique éliminant l'amitose.
    pub fn mitosis_attested(genome: &Genome) -> Result<MitosisResult, String> {
        let spindle_hash = Self::verify_spindle_alignment(genome)?;
        let parent = genome.clone();
        let clone = genome.derive_child();

        let mut hasher = Sha256::new();
        hasher.update(parent.genome_id().as_bytes());
        hasher.update(clone.genome_id().as_bytes());
        hasher.update(genome.lineage_id().as_bytes());
        hasher.update(spindle_hash.as_bytes());
        hasher.update(b"MITOSIS_ATTESTED_COUNTERFACTUAL_FORK_V3");
        let mut attestation_hash = String::with_capacity(64);
        for byte in hasher.finalize() {
            write!(&mut attestation_hash, "{:02x}", byte).unwrap();
        }

        let attestation = MitosisAttestation {
            parent_id: parent.genome_id(),
            clone_id: clone.genome_id(),
            lineage_id: genome.lineage_id(),
            spindle_aligned: true,
            spindle_alignment_hash: spindle_hash,
            attestation_hash,
            amitosis_rejected: true,
        };

        Ok(MitosisResult {
            parent,
            clone,
            attestation,
        })
    }

    /// Mitose symétrique standard : délègue à `mitosis_attested` en garantissant
    /// le passage du Spindle Assembly Checkpoint.
    pub fn mitosis(genome: &Genome) -> Result<(Genome, Genome), String> {
        let result = Self::mitosis_attested(genome)?;
        Ok((result.parent, result.clone))
    }

    pub const DEFAULT_HAYFLICK_LIMIT: u32 = 50;

    pub fn budding(mother: &Genome, daughter_volume: f64) -> Result<(Genome, Genome), String> {
        let result = Self::budding_with_limit(
            mother,
            daughter_volume,
            mother.bud_scars.len() as u32,
            mother.hayflick_limit,
        )?;
        Ok((result.mother, result.daughter))
    }

    pub fn budding_with_limit(
        mother: &Genome,
        daughter_volume: f64,
        current_scars: u32,
        hayflick_limit: u32,
    ) -> Result<BuddingResult, String> {
        if daughter_volume <= 0.0 || daughter_volume >= 1.0 {
            return Err("Daughter volume must be between 0 and 1".to_string());
        }
        if current_scars >= hayflick_limit {
            return Err(format!(
                "Hayflick limit reached: cell has accumulated {} bud scars (limit: {})",
                current_scars, hayflick_limit
            ));
        }

        let mut daughter = mother.derive_child();
        let mut parent = mother.clone();
        let _ = parent.add_bud_scar(daughter.genome_id());
        parent.hayflick_limit = hayflick_limit;

        let new_scars = parent.bud_scars.len().max(current_scars as usize + 1) as u32;
        let is_senescent = new_scars >= hayflick_limit;

        parent.insert_gene(genos_genome::Gene::new("bud_scars", &new_scars.to_string()));
        parent.insert_gene(genos_genome::Gene::new("hayflick_limit", &hayflick_limit.to_string()));
        parent.insert_gene(genos_genome::Gene::new("is_senescent", &is_senescent.to_string()));

        // Asymétrie génomique : le volume d'expression des gènes du bourgeon est pondéré par daughter_volume
        for gene in daughter.genes.values_mut() {
            gene.expression_volume = (gene.expression_volume * daughter_volume).clamp(0.01, 1.0);
        }

        daughter.insert_gene(genos_genome::Gene::new("lineage_mode", "ephemeral_bud"));
        daughter.insert_gene(genos_genome::Gene::new("daughter_volume", &daughter_volume.to_string()));
        daughter.insert_gene(genos_genome::Gene::new("bud_scars", "0"));
        let daughter_limit = (hayflick_limit / 2).max(1);
        daughter.hayflick_limit = daughter_limit;
        daughter.bud_scars.clear();
        daughter.insert_gene(genos_genome::Gene::new("hayflick_limit", &daughter_limit.to_string()));
        daughter.insert_gene(genos_genome::Gene::new("is_senescent", "false"));

        Ok(BuddingResult {
            mother: parent,
            daughter,
            daughter_volume,
            bud_scars: new_scars,
            hayflick_limit,
            remaining_divisions: hayflick_limit.saturating_sub(new_scars),
            is_senescent,
        })
    }

    pub fn bud_cell(mother: &mut genos_cell::AgentCell, daughter_volume: f64) -> Result<genos_cell::AgentCell, String> {
        mother.budding(daughter_volume)
    }

    pub fn schizogony(mother: &Genome, merozoite_count: usize) -> Result<Vec<Genome>, String> {
        let seed = default_seed(&mother.genome_id().to_string(), "schizogony");
        let result = Self::schizogony_with_seed(mother, merozoite_count, 0.0, &seed)?;
        Ok(result.merozoites)
    }

    pub fn schizogony_with_seed(
        mother: &Genome,
        merozoite_count: usize,
        mutation_rate: f64,
        seed: &str,
    ) -> Result<SchizogonyResult, String> {
        if merozoite_count < MIN_MEROZOITES || merozoite_count > MAX_MEROZOITES {
            return Err(format!(
                "Merozoite count must be between {} and {}, got {}",
                MIN_MEROZOITES, MAX_MEROZOITES, merozoite_count
            ));
        }
        if !(0.0..=1.0).contains(&mutation_rate) {
            return Err("Mutation rate must be between 0 and 1".to_string());
        }

        let mut rng = rng_from_seed(seed);
        let mut daughters = Vec::with_capacity(merozoite_count);

        for idx in 0..merozoite_count {
            let mut daughter = mother.derive_child();
            if mutation_rate > 0.0 {
                let mut maternal = daughter.chromosome_maternal.as_slice().to_vec();
                let mut paternal = daughter.chromosome_paternal.as_slice().to_vec();
                for nucleotide in maternal.iter_mut().chain(paternal.iter_mut()) {
                    if rng.random_bool(mutation_rate) {
                        *nucleotide = match nucleotide {
                            genos_genome::DnaNucleotide::A => genos_genome::DnaNucleotide::C,
                            genos_genome::DnaNucleotide::C => genos_genome::DnaNucleotide::G,
                            genos_genome::DnaNucleotide::G => genos_genome::DnaNucleotide::T,
                            genos_genome::DnaNucleotide::T => genos_genome::DnaNucleotide::A,
                        };
                    }
                }
                daughter.chromosome_maternal.replace_sequence(maternal);
                daughter.chromosome_paternal.replace_sequence(paternal);
            }
            daughter.insert_gene(genos_genome::Gene::new(
                "merozoite_index",
                &idx.to_string(),
            ));
            daughters.push(daughter);
        }

        Ok(SchizogonyResult {
            mother_genome_id: mother.genome_id(),
            mother_lysed: true,
            merozoites: daughters,
            mutation_rate_applied: mutation_rate,
        })
    }
}
