use crate::genome::*;
use serde::{Deserialize, Serialize};


pub enum TransposonType {
    CutAndPaste,
    CopyAndPaste,
}

impl DnaStrand {
    pub fn transposon_jump(&mut self, source_idx: usize, length: usize, dest_idx: usize, mode: TransposonType) -> Result<(), String> {
        if source_idx + length > self.sequence.len() || dest_idx > self.sequence.len() {
            return Err("Index hors limites".to_string());
        }

        let fragment = match mode {
            TransposonType::CutAndPaste => {
                let tail = self.sequence.split_off(source_idx + length);
                let cut = self.sequence.split_off(source_idx);
                self.sequence.extend(tail);
                cut
            },
            TransposonType::CopyAndPaste => {
                self.sequence[source_idx..source_idx + length].to_vec()
            }
        };

        let actual_dest = if let TransposonType::CutAndPaste = mode {
            if dest_idx > source_idx {
                dest_idx.saturating_sub(length)
            } else {
                dest_idx
            }
        } else {
            dest_idx
        };
        
        let tail = self.sequence.split_off(actual_dest);
        self.sequence.extend(fragment);
        self.sequence.extend(tail);

        Ok(())
    }

    pub fn chromosomal_deletion(&mut self, start: usize, length: usize) {
        if start + length <= self.sequence.len() {
            self.sequence.drain(start..start + length);
        }
    }

    pub fn chromosomal_duplication(&mut self, start: usize, length: usize, insert_at: usize) {
        if start + length <= self.sequence.len() && insert_at <= self.sequence.len() {
            let chunk = self.sequence[start..start + length].to_vec();
            let mut tail = self.sequence.split_off(insert_at);
            self.sequence.extend(chunk);
            self.sequence.extend(tail);
        }
    }

    pub fn chromosomal_inversion(&mut self, start: usize, length: usize) {
        if start + length <= self.sequence.len() {
            self.sequence[start..start + length].reverse();
        }
    }

    pub fn chromosomal_translocation(&mut self, other_chromosome: &mut DnaStrand, start: usize, length: usize, insert_at: usize) {
        if start + length <= self.sequence.len() && insert_at <= other_chromosome.sequence.len() {
            let chunk = self.sequence.drain(start..start + length).collect::<Vec<_>>();
            let mut tail = other_chromosome.sequence.split_off(insert_at);
            other_chromosome.sequence.extend(chunk);
            other_chromosome.sequence.extend(tail);
        }
    }

    pub fn synthesize(text: &str) -> Self {
        let base64_str = BASE64.encode(text);
        let mut sequence = Vec::new();
        const BASE64_ALPHABET: &[u8] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        for c in base64_str.chars() {
            if let Some(idx) = BASE64_ALPHABET.iter().position(|&x| x == c as u8) {
                let n1 = DnaNucleotide::from_bits((idx >> 4) as u8);
                let n2 = DnaNucleotide::from_bits((idx >> 2) as u8);
                let n3 = DnaNucleotide::from_bits(idx as u8);
                sequence.push(n1);
                sequence.push(n2);
                sequence.push(n3);
            }
        }
        Self { sequence }
    }

    /// Expose l'ADN ÃƒÂ  un agent mutagÃƒÂ¨ne
    pub fn expose_to_mutagen(&mut self, mutagen: Mutagen) {
        match mutagen {
            // Erreurs internes (Substitution / Faux-sens)
            Mutagen::ReplicationError(idx, base) | Mutagen::OxidativeStress(idx, base) => {
                if idx < self.sequence.len() {
                    self.sequence[idx] = base;
                }
            }
            // Rayons X : Cassure nette
            Mutagen::IonizingRadiation(idx) => {
                if idx < self.sequence.len() {
                    self.sequence.truncate(idx);
                }
            }
            // Agents Chimiques : Insertion de force (DÃƒÂ©calage du cadre)
            Mutagen::Chemical(idx, base) => {
                if idx <= self.sequence.len() {
                    self.sequence.insert(idx, base);
                }
            }
            // Virus : Coupe un gÃƒÂ¨ne sain et s'insÃƒÂ¨re au milieu
            Mutagen::Virus(idx, viral_dna) => {
                if idx <= self.sequence.len() {
                    for (i, base) in viral_dna.sequence.iter().enumerate() {
                        self.sequence.insert(idx + i, base.clone());
                    }
                }
            }
            // UV : Cherche les Thymines (T) adjacentes et les fusionne (crÃƒÂ©ant un dÃƒÂ©calage)
            Mutagen::Ultraviolet => {
                let mut to_remove = Vec::new();
                for i in 0..self.sequence.len().saturating_sub(1) {
                    if self.sequence[i] == DnaNucleotide::T
                        && self.sequence[i + 1] == DnaNucleotide::T
                    {
                        to_remove.push(i + 1); // Fusion
                    }
                }
                for (offset, idx) in to_remove.into_iter().enumerate() {
                    self.sequence.remove(idx - offset); // Compense le dÃƒÂ©calage lors de la suppression
                }
            }
        }
    }
}

/* =====================================================================
5. LE GÃƒË†NE, PLASMIDE, ET GÃƒâ€°NOME (HiÃƒÂ©rarchie finale)
===================================================================== */
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ChromatinState {
    Euchromatin,
    HeterochromatinConstitutive,
    HeterochromatinFacultative,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Gene {
    /// La canalisation dÃ©veloppementale : Si true, la plasticitÃ© est terminÃ©e, l'Ã©tat Ã©pigÃ©nÃ©tique est irrÃ©versible.
    pub developmentally_locked: bool,
    pub locus: String,
    pub dna: DnaStrand,
    pub is_methylated: bool,
    pub expression_volume: f64,
    pub chromatin_state: ChromatinState,
    // --- NOUVEAU : RÃ©gulation Cellulaire ---
    pub required_activator: Option<String>,
    pub bound_repressor: Option<String>,
    pub default_exons: Vec<(usize, usize)>,
}

pub struct Spliceosome;
impl Spliceosome {
    /// Ã‰pissage Alternatif : DÃ©coupe l'ARN prÃ©-messager pour ne garder que les Exons
    pub fn splice(pre_mrna: &RnaStrand, exons: &[(usize, usize)]) -> RnaStrand {
        let mut mature = Vec::new();
        for &(start, end) in exons {
            if start < pre_mrna.sequence.len() {
                let end = std::cmp::min(end, pre_mrna.sequence.len());
                mature.extend_from_slice(&pre_mrna.sequence[start..end]);
            }
        }
        RnaStrand { sequence: mature }
    }
}


impl Gene {
    pub fn new(locus: &str, instruction: &str) -> Self {
        Self {
            locus: locus.to_string(),
            dna: DnaStrand::synthesize(instruction),
            is_methylated: false,
            expression_volume: 1.0,
            chromatin_state: ChromatinState::Euchromatin,
            developmentally_locked: false,
            required_activator: None,
            bound_repressor: None,
            default_exons: Vec::new(),
        }
    }

    pub fn express(
        &self, 
        active_tfs: &[String], 
        alternative_splicing: Option<&[(usize, usize)]>,
        micro_rnas: &[String]
    ) -> Result<String, String> {
        if self.chromatin_state == ChromatinState::HeterochromatinConstitutive || self.chromatin_state == ChromatinState::HeterochromatinFacultative {
            return Err("OFF: L'ADN est trop serre (Heterochromatine)".to_string());
        }

        if let Some(repressor) = &self.bound_repressor {
            if active_tfs.contains(repressor) {
                return Err("OFF: Un Represseur bloque physiquement le gene.".to_string());
            }
        }
        if let Some(activator) = &self.required_activator {
            if !active_tfs.contains(activator) {
                return Err("OFF: En attente de l'Activateur pour demarrer.".to_string());
            }
        }

        let pre_mrna = RnaPolymerase::transcribe(&self.dna);

        let mature_mrna = if let Some(custom_exons) = alternative_splicing {
            Spliceosome::splice(&pre_mrna, custom_exons)
        } else if !self.default_exons.is_empty() {
            Spliceosome::splice(&pre_mrna, &self.default_exons)
        } else {
            pre_mrna
        };

        if micro_rnas.contains(&self.locus) {
            return Err("DETRUIT: Le microARN a detruit l'ARNm.".to_string());
        }

        let protein = Ribosome::translate(&mature_mrna);
        protein.fold()
    }

    pub fn p53_repair_check(&self) -> bool {
        self.express(&[], None, &[]).is_ok()
    }
}




#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Plasmid {
    pub id: Uuid,
    pub instruction: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Genome {

    pub genome_id: Uuid,
    pub lineage_id: Uuid,
    pub chromosome_maternal: DnaStrand,
    pub chromosome_paternal: DnaStrand,
    pub genes: BTreeMap<String, Gene>,
    pub plasmids: Vec<Plasmid>,
    pub endogenous_retroviruses: Vec<Gene>,
    pub regulatory_enhancers: Vec<String>,
    pub extra_chromosomes: Vec<DnaStrand>,
    pub missing_chromosomes: usize,
}


impl Genome {

    pub fn new(base_instruction: &str) -> Self {
        let id = Uuid::new_v4();
        let strand = DnaStrand::synthesize(base_instruction);
        Self {
            genome_id: id,
            lineage_id: id,
            chromosome_maternal: strand.clone(),
            chromosome_paternal: strand,
            genes: BTreeMap::new(),
            plasmids: Vec::new(),
            endogenous_retroviruses: Vec::new(),
            regulatory_enhancers: Vec::new(),
            extra_chromosomes: Vec::new(),
            missing_chromosomes: 0,
        }
    }

    pub fn insert_gene(&mut self, gene: Gene) {
        self.genes.insert(gene.locus.clone(), gene);
    }

    /// CRISPR-Cas9 (Knockout Génétique Moderne)
    pub fn crispr_cas9_knockout(&mut self, target_gene_name: &str) -> bool {
        self.genes.remove(target_gene_name).is_some()
    }

    /// Recombinaison Homologue (Knockout Vieille École)
    pub fn homologous_recombination_knockout(&mut self, target_gene_name: &str) -> bool {
        if let Some(gene) = self.genes.get_mut(target_gene_name) {
            gene.dna = crate::genome::DnaStrand::synthesize("STOP_CODON_BROKEN_TOOL");
            true
        } else {
            false
        }
    }

    /// PSEUDOGÉNISATION (Fossilisation d'un Outil)
    pub fn pseudogenize(&mut self, target_gene_name: &str) -> bool {
        if let Some(gene) = self.genes.get_mut(target_gene_name) {
            gene.required_activator = Some("BROKEN_PROMOTER_NEVER_ACTIVATES".to_string());
            gene.is_methylated = true; // Silencieux à jamais
            true
        } else {
            false
        }
    }

    /// RÉTRO-PSEUDOGÈNE (Le piratage raté)
    pub fn insert_retro_pseudogene(&mut self, name: &str, sequence: &str) {
        let mut pseudo = Gene::new(name, sequence);
        pseudo.default_exons = vec![(0, pseudo.dna.sequence.len())];
        pseudo.required_activator = Some("MISSING_PROMOTER".to_string());
        self.endogenous_retroviruses.push(pseudo);
    }

    pub fn repair_double_strand_break(&mut self, is_maternal_broken: bool, start: usize, length: usize) {
        let brca_functional = self.genes.get("BRCA").map_or(false, |g| g.p53_repair_check());

        if brca_functional {
            // RECOMBINAISON HOMOLOGUE (Copie parfaite depuis le jumeau)
            // Contournement du borrow checker pour modifier l'un en lisant l'autre
            let missing_chunk = if is_maternal_broken {
                if start + length <= self.chromosome_paternal.sequence.len() {
                    Some(self.chromosome_paternal.sequence[start..start+length].to_vec())
                } else { None }
            } else {
                if start + length <= self.chromosome_maternal.sequence.len() {
                    Some(self.chromosome_maternal.sequence[start..start+length].to_vec())
                } else { None }
            };

            if let Some(chunk) = missing_chunk {
                let broken = if is_maternal_broken {
                    &mut self.chromosome_maternal
                } else {
                    &mut self.chromosome_paternal
                };
                
                if start <= broken.sequence.len() {
                    let mut tail = broken.sequence.split_off(start);
                    broken.sequence.extend(chunk);
                    broken.sequence.extend(tail);
                }
            }
        } else {
            // NHEJ (Non-Homologous End Joining) - Mode Brouillon
            // Raccorde les bouts casses en sacrifiant ce qui a ete perdu (Deletion irreversible)
            // => On ne recopie rien, la perte est definitive !
        }
    }

    pub fn epigenetic_prison_for_transposons(&mut self) {
        for gene in self.endogenous_retroviruses.iter_mut() {
            gene.is_methylated = true;
            gene.chromatin_state = ChromatinState::HeterochromatinConstitutive;
        }
        for (_, gene) in self.genes.iter_mut() {
            if gene.locus.contains("TRANSPOSON") {
                gene.is_methylated = true;
                gene.chromatin_state = ChromatinState::HeterochromatinConstitutive;
            }
        }
    }

    pub fn duplicate_gene_for_evolution(&mut self, target_locus: &str) -> Result<String, String> {
        if let Some(original) = self.genes.get(target_locus) {
            let mut duplicate = original.clone();
            // Génère un nouveau nom unique pour la copie
            let new_locus = format!("{}_COPY_{}", target_locus, self.genes.len());
            duplicate.locus = new_locus.clone();
            
            // L'insertion simule l'enjambement inégal (une copie de plus dans l'ADN)
            self.genes.insert(new_locus.clone(), duplicate);
            Ok(new_locus)
        } else {
            Err("Le gène cible n'existe pas".to_string())
        }
    }

    pub fn apply_genomic_imprinting_conflict(&mut self) {
        let mut igf2_pat = Gene::new("IGF2_PATERNAL", "MAX_GROWTH_FACTOR_11");
        igf2_pat.is_methylated = false; 
        let mut igf2_mat = Gene::new("IGF2_MATERNAL", "MAX_GROWTH_FACTOR_11");
        igf2_mat.is_methylated = true; 
        let mut igf2r_mat = Gene::new("IGF2R_MATERNAL", "GROWTH_DECOY_RECEPTOR");
        igf2r_mat.is_methylated = false; 
        self.genes.insert("IGF2_PATERNAL".to_string(), igf2_pat);
        self.genes.insert("IGF2_MATERNAL".to_string(), igf2_mat);
        self.genes.insert("IGF2R_MATERNAL".to_string(), igf2r_mat);
    }

    pub fn hash_library(&self) -> String {
        let serialized = serde_json::to_string(self).unwrap();
        let mut hasher = sha2::Sha256::new();
        sha2::Digest::update(&mut hasher, serialized.as_bytes());
        let mut hex = String::with_capacity(64);
        for byte in hasher.finalize() {
            use std::fmt::Write;
            write!(&mut hex, "{:02x}", byte).unwrap();
        }
        hex
    }

    pub fn retroviral_integration(&mut self, is_germline: bool) {
        let virus_gene = Gene::new("VIRAL_CODE", "VIRAL_DNA_SEQUENCE");
        if is_germline {
            let mut endogenized = virus_gene.clone();
            endogenized.locus = "ENDOGENOUS_RETROVIRUS".to_string();
            endogenized.is_methylated = true; 
            self.endogenous_retroviruses.push(endogenized);
        } else {
            self.genes.insert("VIRAL_INFECTION".to_string(), virus_gene);
        }
    }

    pub fn domesticate_syncytin(&mut self) -> Result<(), String> {
        if let Some(mut erv) = self.endogenous_retroviruses.pop() {
            erv.is_methylated = false;
            erv.locus = "SYNCYTIN_PLACENTA".to_string();
            self.genes.insert(erv.locus.clone(), erv);
            Ok(())
        } else {
            Err("Aucun rétrovirus endogène disponible.".to_string())
        }
    }
}