use super::{check_compatible, EffectOrigin};

pub fn organism_id(mission: &str, seq: u64) -> String {
    stable_id("org", mission, seq)
}

pub fn cell_id(lineage: &str, seq: u64) -> String {
    stable_id("cell", lineage, seq)
}

pub fn lineage_id(organism: &str, seq: u64) -> String {
    stable_id("lin", organism, seq)
}

pub fn mission_id(slug: &str, seq: u64) -> String {
    stable_id("mission", slug, seq)
}

pub fn event_id(episode: &str, seq: u64) -> String {
    stable_id("evt", episode, seq)
}

pub fn stable_id(prefix: &str, scope: &str, seq: u64) -> String {
    let clean = cleaned(scope);
    format!("{}_{}_{:06}", prefix, clean, seq)
}

pub fn cleaned(scope: &str) -> String {
    let lower = scope.to_lowercase();
    let mut out = String::new();
    for ch in lower.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if out.rfind('_') != Some(out.len().saturating_sub(1)) {
            out.push('_');
        }
    }
    trim_underscores(&out)
}

pub fn trim_underscores(text: &str) -> String {
    text.trim_matches('_').to_string()
}

pub fn parse_stable_id(id: &str) -> Result<StableId, String> {
    let parts: Vec<&str> = id.rsplitn(2, '_').collect();
    if parts.len() != 2 {
        return Err("identifiant instable".to_string());
    }
    Ok(StableId {
        prefix: prefix_of(id),
        scope: parts[1].to_string(),
        seq: seq_of(parts[0])?,
    })
}

pub fn prefix_of(id: &str) -> String {
    id.split('_').next().unwrap_or("").to_string()
}

pub fn seq_of(tail: &str) -> Result<u64, String> {
    tail.parse::<u64>().map_err(|_| "sequence invalide".to_string())
}

#[derive(Debug, Clone, PartialEq)]
pub struct StableId {
    pub prefix: String,
    pub scope: String,
    pub seq: u64,
}

pub fn check_ref_version(version: &str) -> Result<(), String> {
    check_compatible(version)
}

pub fn origin_tag(origin: &EffectOrigin) -> &'static str {
    match origin {
        EffectOrigin::Simulated => "simulated",
        EffectOrigin::Local => "local",
        EffectOrigin::External => "external",
    }
}

#[cfg(test)]
mod id_tests {
    use super::*;

    #[test]
    fn stable_roundtrip() {
        let id = organism_id("Mission Alpha", 7);
        assert_eq!(id, "org_mission_alpha_000007");
        let parsed = parse_stable_id(&id).expect("parse");
        assert_eq!(parsed.seq, 7);
    }

    #[test]
    fn rejects_unstable() {
        assert!(parse_stable_id("no-seq").is_err());
    }
}
