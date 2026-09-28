use super::EffectOrigin;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum StateKind {
    Durable,
    Session,
    Computed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EffectKind {
    Executed,
    Simulated,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Provenance {
    pub state_kind: StateKind,
    pub effect_kind: EffectKind,
    pub origin: EffectOrigin,
    pub reason: String,
}

pub fn provenance_of(origin: &EffectOrigin) -> EffectKind {
    kind_from_origin(origin)
}

pub fn kind_from_origin(origin: &EffectOrigin) -> EffectKind {
    match origin {
        EffectOrigin::Simulated => EffectKind::Simulated,
        EffectOrigin::Local => EffectKind::Executed,
        EffectOrigin::External => EffectKind::Executed,
    }
}

pub fn can_promote(provenance: &Provenance) -> Result<(), String> {
    if provenance.effect_kind == EffectKind::Simulated {
        return Err("simule non promouvable".to_string());
    }
    if provenance.reason.is_empty() {
        return Err("raison manquante".to_string());
    }
    Ok(())
}

pub fn describe_state(kind: &StateKind) -> &'static str {
    match kind {
        StateKind::Durable => "durable",
        StateKind::Session => "session",
        StateKind::Computed => "calcule",
    }
}

#[cfg(test)]
mod state_tests {
    use super::*;

    #[test]
    fn simulated_ne_promotionne_pas() {
        let prov = Provenance {
            state_kind: StateKind::Computed,
            effect_kind: EffectKind::Simulated,
            origin: EffectOrigin::Simulated,
            reason: "test".to_string(),
        };
        assert!(can_promote(&prov).is_err());
    }

    #[test]
    fn local_promouvable() {
        let prov = Provenance {
            state_kind: StateKind::Durable,
            effect_kind: EffectKind::Executed,
            origin: EffectOrigin::Local,
            reason: "preuve jointe".to_string(),
        };
        assert!(can_promote(&prov).is_ok());
    }
}
