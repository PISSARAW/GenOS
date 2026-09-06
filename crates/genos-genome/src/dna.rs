use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DnaNucleotide {
    A,
    C,
    G,
    T,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RnaNucleotide {
    A,
    C,
    G,
    U,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DnaStrand {
    pub sequence: Vec<DnaNucleotide>,
}

impl DnaStrand {
    pub fn new(sequence: Vec<DnaNucleotide>) -> Self {
        Self { sequence }
    }

    pub fn synthesize(prompt: &str) -> Self {
        let mut sequence = Vec::new();
        for byte in prompt.as_bytes() {
            for shift in [6, 4, 2, 0] {
                let pair = (byte >> shift) & 0b11;
                sequence.push(match pair {
                    0b00 => DnaNucleotide::A,
                    0b01 => DnaNucleotide::C,
                    0b10 => DnaNucleotide::G,
                    _ => DnaNucleotide::T,
                });
            }
        }
        Self { sequence }
    }

    pub fn mutate_point(&mut self, position: usize, nucleotide: DnaNucleotide) {
        if position < self.sequence.len() {
            self.sequence[position] = nucleotide;
        }
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
            .map(|n| match n {
                DnaNucleotide::A => RnaNucleotide::U,
                DnaNucleotide::C => RnaNucleotide::G,
                DnaNucleotide::G => RnaNucleotide::C,
                DnaNucleotide::T => RnaNucleotide::A,
            })
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
