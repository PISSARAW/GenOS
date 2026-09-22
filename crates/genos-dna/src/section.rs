#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
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
        }
    }

    pub fn from_bytes(bytes: [u8; 4]) -> Option<SectionTag> {
        match &bytes {
            b"META" => Some(SectionTag::Meta),
            b"CHRM" => Some(SectionTag::Chrm),
            b"CHRP" => Some(SectionTag::Chrp),
            b"GENE" => Some(SectionTag::Gene),
            b"PLAS" => Some(SectionTag::Plas),
            b"ENHA" => Some(SectionTag::Enha),
            b"XCHR" => Some(SectionTag::Xchr),
            b"SCAR" => Some(SectionTag::Scar),
            b"PHEN" => Some(SectionTag::Phen),
            b"PROV" => Some(SectionTag::Prov),
            b"SIGN" => Some(SectionTag::Sign),
            b"EPIE" => Some(SectionTag::Epigenome),
            b"GRN_" => Some(SectionTag::Grn),
            b"DEVO" => Some(SectionTag::Development),
            _ => None,
        }
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
