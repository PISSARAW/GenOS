#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SectionTag {
    Meta,
    Chrm,
    Chrp,
    Gene,
    Plas,
    Enha,
    Xchr,
    Scar,
    Phen,
    Prov,
    Sign,
    Epigenome,
    Grn,
    Development,
    Unknown([u8; 4]),
}

fn tag_rank(tag: &SectionTag) -> (u8, [u8; 4]) {
    match tag {
        SectionTag::Meta => (0, *b"META"),
        SectionTag::Chrm => (0, *b"CHRM"),
        SectionTag::Chrp => (0, *b"CHRP"),
        SectionTag::Gene => (0, *b"GENE"),
        SectionTag::Plas => (0, *b"PLAS"),
        SectionTag::Enha => (0, *b"ENHA"),
        SectionTag::Xchr => (0, *b"XCHR"),
        SectionTag::Scar => (0, *b"SCAR"),
        SectionTag::Phen => (0, *b"PHEN"),
        SectionTag::Prov => (0, *b"PROV"),
        SectionTag::Sign => (0, *b"SIGN"),
        SectionTag::Epigenome => (0, *b"EPIE"),
        SectionTag::Grn => (0, *b"GRN_"),
        SectionTag::Development => (0, *b"DEVO"),
        SectionTag::Unknown(bytes) => (1, *bytes),
    }
}

impl PartialOrd for SectionTag {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for SectionTag {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        tag_rank(self).cmp(&tag_rank(other))
    }
}

impl SectionTag {
    pub fn as_bytes(self) -> [u8; 4] {
        match self {
            SectionTag::Meta => *b"META",
            SectionTag::Chrm => *b"CHRM",
            SectionTag::Chrp => *b"CHRP",
            SectionTag::Gene => *b"GENE",
            SectionTag::Plas => *b"PLAS",
            SectionTag::Enha => *b"ENHA",
            SectionTag::Xchr => *b"XCHR",
            SectionTag::Scar => *b"SCAR",
            SectionTag::Phen => *b"PHEN",
            SectionTag::Prov => *b"PROV",
            SectionTag::Sign => *b"SIGN",
            SectionTag::Epigenome => *b"EPIE",
            SectionTag::Grn => *b"GRN_",
            SectionTag::Development => *b"DEVO",
            SectionTag::Unknown(bytes) => bytes,
        }
    }

    pub fn from_bytes(bytes: [u8; 4]) -> Option<SectionTag> {
        Some(Self::from_bytes_lossy(bytes))
    }

    pub fn from_bytes_lossy(bytes: [u8; 4]) -> SectionTag {
        match &bytes {
            b"META" => SectionTag::Meta,
            b"CHRM" => SectionTag::Chrm,
            b"CHRP" => SectionTag::Chrp,
            b"GENE" => SectionTag::Gene,
            b"PLAS" => SectionTag::Plas,
            b"ENHA" => SectionTag::Enha,
            b"XCHR" => SectionTag::Xchr,
            b"SCAR" => SectionTag::Scar,
            b"PHEN" => SectionTag::Phen,
            b"PROV" => SectionTag::Prov,
            b"SIGN" => SectionTag::Sign,
            b"EPIE" => SectionTag::Epigenome,
            b"GRN_" => SectionTag::Grn,
            b"DEVO" => SectionTag::Development,
            _ => SectionTag::Unknown(bytes),
        }
    }

    pub fn is_unknown(self) -> bool {
        matches!(self, SectionTag::Unknown(_))
    }
}

#[derive(Clone, Debug)]
pub struct Section {
    pub tag: SectionTag,
    pub payload: Vec<u8>,
}

impl Section {
    pub fn new(tag: SectionTag, payload: Vec<u8>) -> Self {
        Section { tag, payload }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct SectionEntry {
    pub tag: SectionTag,
    pub offset: u32,
    pub length: u32,
    pub crc32: u32,
}
