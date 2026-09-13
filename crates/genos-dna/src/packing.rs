use genos_genome::{DnaNucleotide, DnaStrand};

fn nucleotide_bits(nucleotide: DnaNucleotide) -> u8 {
    match nucleotide {
        DnaNucleotide::A => 0b00,
        DnaNucleotide::C => 0b01,
        DnaNucleotide::G => 0b10,
        DnaNucleotide::T => 0b11,
    }
}

fn bits_nucleotide(bits: u8) -> DnaNucleotide {
    match bits & 0b11 {
        0b00 => DnaNucleotide::A,
        0b01 => DnaNucleotide::C,
        0b10 => DnaNucleotide::G,
        _ => DnaNucleotide::T,
    }
}

pub fn pack_strand(strand: &DnaStrand) -> (u32, Vec<u8>) {
    let sequence = strand.as_slice();
    let mut packed = vec![0u8; sequence.len().div_ceil(4)];
    for (index, nucleotide) in sequence.iter().enumerate() {
        let shift = (3 - (index % 4)) * 2;
        packed[index / 4] |= nucleotide_bits(*nucleotide) << shift;
    }
    (sequence.len() as u32, packed)
}

pub fn unpack_strand(base_count: u32, packed: &[u8]) -> Result<DnaStrand, String> {
    let count = base_count as usize;
    if packed.len() < count.div_ceil(4) {
        return Err(format!(
            "packed strand too short: {} bytes for {} bases",
            packed.len(),
            count
        ));
    }
    let mut sequence = Vec::with_capacity(count);
    for index in 0..count {
        let shift = (3 - (index % 4)) * 2;
        sequence.push(bits_nucleotide(packed[index / 4] >> shift));
    }
    Ok(DnaStrand::new(sequence))
}

pub fn encode_strand(strand: &DnaStrand) -> Vec<u8> {
    let (base_count, packed) = pack_strand(strand);
    let mut out = Vec::with_capacity(4 + packed.len());
    out.extend_from_slice(&base_count.to_le_bytes());
    out.extend_from_slice(&packed);
    out
}

pub fn decode_strand(bytes: &[u8]) -> Result<DnaStrand, String> {
    if bytes.len() < 4 {
        return Err("strand section is missing its base count".to_string());
    }
    let base_count = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    unpack_strand(base_count, &bytes[4..])
}
