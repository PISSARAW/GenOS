use genos_genome::{DnaNucleotide, DnaStrand};

pub const HACHIMOJI_COUNT_FLAG: u32 = 1 << 31;

pub fn pack_strand(strand: &DnaStrand) -> (u32, Vec<u8>) {
    let width = strand.bits_per_base() as usize;
    let bit_count = strand.len() * width;
    let mut packed = vec![0u8; bit_count.div_ceil(8)];
    for bit in 0..bit_count {
        let code = strand.as_slice()[bit / width].code();
        packed[bit / 8] |= ((code >> (width - 1 - bit % width)) & 1) << (7 - bit % 8);
    }
    let flag = if width == 3 { HACHIMOJI_COUNT_FLAG } else { 0 };
    (strand.len() as u32 | flag, packed)
}

pub fn unpack_strand(base_count: u32, packed: &[u8]) -> Result<DnaStrand, String> {
    let count = (base_count & !HACHIMOJI_COUNT_FLAG) as usize;
    let width = if base_count & HACHIMOJI_COUNT_FLAG != 0 { 3 } else { 2 };
    let bit_count = count * width;
    if packed.len() != bit_count.div_ceil(8) {
        return Err(format!(
            "packed strand length invalid: {} bytes for {} bases",
            packed.len(),
            count
        ));
    }
    let padding = (8 - bit_count % 8) % 8;
    if packed.last().is_some_and(|last| last & ((1 << padding) - 1) != 0) {
        return Err("packed strand has nonzero padding".into());
    }
    let mut sequence = Vec::with_capacity(count);
    for start in (0..bit_count).step_by(width) {
        let mut code = 0;
        for bit in start..start + width {
            code = (code << 1) | ((packed[bit / 8] >> (7 - bit % 8)) & 1);
        }
        sequence.push(DnaNucleotide::ALL[code as usize]);
    }
    DnaStrand::with_width(sequence, width as u8)
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
