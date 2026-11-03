use serde::{Deserialize, Serialize};
pub use crate::nucleotide::{DnaNucleotide, RnaNucleotide};

fn legacy_width() -> u8 { 2 }
fn is_legacy(width: &u8) -> bool { *width == 2 }

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct DnaStrand {
    sequence: Vec<DnaNucleotide>,
    #[serde(default = "legacy_width", skip_serializing_if = "is_legacy")]
    bits_per_base: u8,
}

impl<'de> Deserialize<'de> for DnaStrand {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Strand {
            sequence: Vec<DnaNucleotide>,
            #[serde(default = "legacy_width")]
            bits_per_base: u8,
        }
        let strand = Strand::deserialize(deserializer)?;
        Self::with_width(strand.sequence, strand.bits_per_base).map_err(serde::de::Error::custom)
    }
}

impl DnaStrand {
    pub fn new(sequence: Vec<DnaNucleotide>) -> Self {
        let bits_per_base = if sequence.iter().any(|base| base.code() > 3) { 3 } else { 2 };
        Self { sequence, bits_per_base }
    }

    pub fn synthesize(prompt: &str) -> Self {
        Self::synthesize_with_width(prompt, 3)
    }

    pub fn synthesize_legacy(prompt: &str) -> Self {
        Self::synthesize_with_width(prompt, 2)
    }

    fn synthesize_with_width(prompt: &str, width: u8) -> Self {
        let mut sequence = Vec::new();
        let bytes = prompt.as_bytes();
        for start in (0..bytes.len() * 8).step_by(width as usize) {
            let mut code = 0;
            for bit in start..start + width as usize {
                let value = bytes.get(bit / 8).copied().unwrap_or(0);
                code = (code << 1) | ((value >> (7 - bit % 8)) & 1);
            }
            sequence.push(DnaNucleotide::ALL[code as usize]);
        }
        Self { sequence, bits_per_base: width }
    }

    pub fn bits_per_base(&self) -> u8 { self.bits_per_base }

    pub fn with_width(sequence: Vec<DnaNucleotide>, width: u8) -> Result<Self, String> {
        if ![2, 3].contains(&width) { return Err("DNA width must be 2 or 3".into()); }
        if sequence.iter().any(|base| base.code() >= (1 << width)) {
            return Err("DNA base is outside its declared alphabet".into());
        }
        Ok(Self { sequence, bits_per_base: width })
    }

    pub fn as_slice(&self) -> &[DnaNucleotide] {
        &self.sequence
    }

    pub fn as_str(&self) -> String {
        self.sequence
            .iter()
            .map(|n| n.as_char())
            .collect()
    }

    pub fn decode_instruction(&self) -> String {
        let width = self.bits_per_base as usize;
        let mut bytes = vec![0u8; self.sequence.len() * width / 8];
        for bit in 0..bytes.len() * 8 {
            let code = self.sequence[bit / width].code();
            bytes[bit / 8] |= ((code >> (width - 1 - bit % width)) & 1) << (7 - bit % 8);
        }
        String::from_utf8_lossy(&bytes).to_string()
    }

    pub fn len(&self) -> usize {
        self.sequence.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sequence.is_empty()
    }

    pub fn replace_sequence(&mut self, sequence: Vec<DnaNucleotide>) {
        if sequence.iter().any(|base| base.code() > 3) { self.bits_per_base = 3; }
        self.sequence = sequence;
    }

    pub fn recombined(&self, other: &Self, sequence: Vec<DnaNucleotide>) -> Self {
        let mut strand = self.clone();
        strand.bits_per_base = self.bits_per_base.max(other.bits_per_base);
        strand.replace_sequence(sequence);
        strand
    }

    pub fn mutate_point(&mut self, position: usize, nucleotide: DnaNucleotide) {
        if position < self.sequence.len() {
            if nucleotide.code() > 3 { self.bits_per_base = 3; }
            self.sequence[position] = nucleotide;
        }
    }

    pub fn mutate_stochastic<R: rand::RngExt + ?Sized>(&mut self, rate: f64, rng: &mut R) -> usize {
        if !rate.is_finite() || rate <= 0.0 {
            return 0;
        }
        let effective = rate.clamp(0.0, 1.0);
        let mut count = 0;
        for nucleotide in &mut self.sequence {
            if rng.random_bool(effective) {
                *nucleotide = nucleotide.mutate(rng);
                count += 1;
            }
        }
        if self.sequence.iter().any(|base| base.code() > 3) { self.bits_per_base = 3; }
        count
    }

    pub fn apply_radiation(&mut self, from_idx: usize) {
        if from_idx < self.sequence.len() {
            self.sequence.truncate(from_idx);
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct RnaStrand {
    pub sequence: Vec<RnaNucleotide>,
    pub ejc_positions: Vec<usize>,
}

pub struct RnaPolymerase;

impl RnaPolymerase {
    pub fn transcribe(dna: &DnaStrand) -> RnaStrand {
        let rna_seq = dna
            .sequence
            .iter()
            .map(|n| RnaNucleotide::from(n.complement()))
            .collect();
        RnaStrand {
            sequence: rna_seq,
            ejc_positions: Vec::new(),
        }
    }
}

#[derive(Clone, Debug)]
pub enum Mutagen {
    ReplicationError(usize, DnaNucleotide),
    OxidativeStress(usize, DnaNucleotide),
    Ultraviolet,
    IonizingRadiation(usize),
    Chemical(usize, DnaNucleotide),
}
