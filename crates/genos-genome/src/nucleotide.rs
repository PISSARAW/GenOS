use serde::{Deserialize, Serialize};

pub const HACHIMOJI: &str = "ACGTPZBS";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DnaNucleotide {
    A, C, G, T, P, Z, B, S,
}

impl DnaNucleotide {
    pub const ALL: [Self; 8] = [Self::A, Self::C, Self::G, Self::T, Self::P, Self::Z, Self::B, Self::S];

    pub fn code(self) -> u8 { self as u8 }

    pub fn as_char(self) -> char { HACHIMOJI.as_bytes()[self.code() as usize] as char }

    pub fn complement(self) -> Self {
        [Self::T, Self::G, Self::C, Self::A, Self::Z, Self::P, Self::S, Self::B][self.code() as usize]
    }

    pub fn mutate<R: rand::RngExt + ?Sized>(&self, rng: &mut R) -> Self {
        Self::ALL[(self.code() as usize + rng.random_range(1..8)) % 8]
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RnaNucleotide {
    A, C, G, U, P, Z, B, S,
}

impl From<DnaNucleotide> for RnaNucleotide {
    fn from(base: DnaNucleotide) -> Self {
        [Self::A, Self::C, Self::G, Self::U, Self::P, Self::Z, Self::B, Self::S][base.code() as usize]
    }
}
