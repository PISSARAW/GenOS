use crc32fast::Hasher;

pub const MAGIC: [u8; 4] = *b"GDNA";
pub const FORMAT_VERSION: u16 = 1;
pub const HEADER_LEN: usize = 32;
pub const SECTION_ENTRY_LEN: usize = 16;

pub const FLAG_SIGNED: u16 = 1 << 0;
pub const FLAG_COMPRESSED: u16 = 1 << 1;
pub const FLAG_PHENOTYPE_CACHED: u16 = 1 << 2;
pub const FLAG_HAS_PLASMIDS: u16 = 1 << 3;
pub const FLAG_HAS_RETROVIRUSES: u16 = 1 << 4;
pub const FLAG_HAS_EXTRA_CHROMOSOMES: u16 = 1 << 5;
pub const FLAG_SCALARS_LE: u16 = 1 << 6;
pub const FLAG_DECOY: u16 = 1 << 7;

pub fn crc32(bytes: &[u8]) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(bytes);
    hasher.finalize()
}

#[derive(Clone, Debug)]
pub struct Header {
    pub flags: u16,
    pub section_count: u16,
    pub total_length: u32,
    pub payload_crc32: u32,
}

impl Header {
    pub fn encode(&self) -> [u8; HEADER_LEN] {
        let mut buffer = [0u8; HEADER_LEN];
        buffer[0..4].copy_from_slice(&MAGIC);
        buffer[4..6].copy_from_slice(&FORMAT_VERSION.to_le_bytes());
        buffer[6..8].copy_from_slice(&self.flags.to_le_bytes());
        buffer[8..10].copy_from_slice(&self.section_count.to_le_bytes());
        buffer[12..16].copy_from_slice(&self.total_length.to_le_bytes());
        buffer[16..20].copy_from_slice(&self.payload_crc32.to_le_bytes());
        let header_crc = crc32(&buffer[0..20]);
        buffer[20..24].copy_from_slice(&header_crc.to_le_bytes());
        buffer
    }

    pub fn decode(bytes: &[u8]) -> Result<Header, String> {
        if bytes.len() < HEADER_LEN {
            return Err("AgentDNA file is shorter than the 32-byte header".to_string());
        }
        if bytes[0..4] != MAGIC {
            return Err("Invalid AgentDNA magic (expected GDNA)".to_string());
        }
        let version = u16::from_le_bytes([bytes[4], bytes[5]]);
        if version != FORMAT_VERSION {
            return Err(format!("Unsupported AgentDNA format version {version}"));
        }
        let expected = u32::from_le_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
        if crc32(&bytes[0..20]) != expected {
            return Err("AgentDNA header CRC mismatch".to_string());
        }
        Ok(Header {
            flags: u16::from_le_bytes([bytes[6], bytes[7]]),
            section_count: u16::from_le_bytes([bytes[8], bytes[9]]),
            total_length: u32::from_le_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]),
            payload_crc32: u32::from_le_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]),
        })
    }
}
