use serde::{Deserialize, Serialize};


#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Neurotransmitter {
    #[serde(alias = "Glutamate", alias = "glutamate")]
    Glutamate, // Excitateur (Déclenche le potentiel d'action)
    #[serde(alias = "GABA", alias = "gaba", alias = "Gaba")]
    GABA,      // Inhibiteur (Bloque le signal électrique)
    #[serde(alias = "Dopamine", alias = "dopamine")]
    Dopamine,  // Renforcement (Motivation et apprentissage positif)
    #[serde(alias = "Serotonin", alias = "serotonin")]
    Serotonin, // Modulation (Stabilisation du réseau)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NeuroSignal {
    pub transmitter: Neurotransmitter,
    pub amount: f64,
}


#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum NervousSystemLocation {
    Central,
    Peripheral,
}

/// Substances psychoactives et nootropiques (xanthines, acides aminés neuroactifs)
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PsychoactiveSubstance {
    #[serde(alias = "Theanine", alias = "theanine", alias = "l-theanine", alias = "L-Theanine", alias = "l_theanine")]
    Theanine,
    #[serde(alias = "Caffeine", alias = "caffeine", alias = "cafeine", alias = "Cafeine")]
    Caffeine,
    #[serde(alias = "Theine", alias = "theine", alias = "théine", alias = "Théine")]
    Theine,
    #[serde(alias = "Theobromine", alias = "theobromine", alias = "théobromine", alias = "Théobromine")]
    Theobromine,
    #[serde(alias = "Paraxanthine", alias = "paraxanthine")]
    Paraxanthine,
}

impl std::fmt::Display for PsychoactiveSubstance {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Theanine => write!(f, "L-Théanine"),
            Self::Caffeine => write!(f, "Caféine"),
            Self::Theine => write!(f, "Théine"),
            Self::Theobromine => write!(f, "Théobromine"),
            Self::Paraxanthine => write!(f, "Paraxanthine"),
        }
    }
}

/// État cognitif résultant de la neuromodulation
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CognitiveFocusState {
    Resting,
    CalmAlertness,
    HyperarousalJitter,
    SustainedFocus,
    FlowState,
}

/// Profil pharmacocinétique et pharmacodynamique d'une substance
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SubstancePharmacokinetics {
    pub substance: PsychoactiveSubstance,
    pub half_life_ticks: u32,
    pub glutamate_multiplier: f64,
    pub gaba_multiplier: f64,
    pub dopamine_multiplier: f64,
    pub jitter_risk: f64,
    pub sustained_release: bool,
}

impl SubstancePharmacokinetics {
    pub fn profile_for(substance: PsychoactiveSubstance) -> Self {
        match substance {
            PsychoactiveSubstance::Theanine => Self {
                substance,
                half_life_ticks: 14,
                glutamate_multiplier: 0.90, // Tampon anti-excitotoxique
                gaba_multiplier: 1.25,      // Stimule le tonus GABAergique (+25%)
                dopamine_multiplier: 1.05,
                jitter_risk: 0.0,
                sustained_release: false,
            },
            PsychoactiveSubstance::Caffeine => Self {
                substance,
                half_life_ticks: 8,
                glutamate_multiplier: 1.30, // Excitation rapide (+30%)
                gaba_multiplier: 0.95,
                dopamine_multiplier: 1.15,
                jitter_risk: 0.45,          // Risque d'emballement / jitter sans tampon
                sustained_release: false,
            },
            PsychoactiveSubstance::Theine => Self {
                substance,
                half_life_ticks: 18,        // Cinétique prolongée (liée aux tanins)
                glutamate_multiplier: 1.18, // Excitation douce
                gaba_multiplier: 1.12,      // Synergie naturelle de feuille de thé
                dopamine_multiplier: 1.10,
                jitter_risk: 0.05,          // Diffusion lissée
                sustained_release: true,
            },
            PsychoactiveSubstance::Theobromine => Self {
                substance,
                half_life_ticks: 22,
                glutamate_multiplier: 1.08,
                gaba_multiplier: 1.06,
                dopamine_multiplier: 1.18, // Plaisir et motivation soutenue
                jitter_risk: 0.02,
                sustained_release: true,
            },
            PsychoactiveSubstance::Paraxanthine => Self {
                substance,
                half_life_ticks: 10,
                glutamate_multiplier: 1.22,
                gaba_multiplier: 1.02,
                dopamine_multiplier: 1.12,
                jitter_risk: 0.10,
                sustained_release: false,
            },
        }
    }
}

/// Substance active présente dans le compartiment extracellulaire / synaptique
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ActiveSubstance {
    pub substance: PsychoactiveSubstance,
    pub current_dose_mg: f64,
    pub initial_dose_mg: f64,
    pub ticks_remaining: u32,
    pub bioavailability: f64,
}

impl ActiveSubstance {
    pub fn new(substance: PsychoactiveSubstance, dose_mg: f64) -> Self {
        let profile = SubstancePharmacokinetics::profile_for(substance);
        Self {
            substance,
            current_dose_mg: dose_mg,
            initial_dose_mg: dose_mg,
            ticks_remaining: profile.half_life_ticks * 2,
            bioavailability: 1.0,
        }
    }

    pub fn metabolize_tick(&mut self) -> bool {
        if self.ticks_remaining == 0 || self.current_dose_mg <= 0.01 {
            self.current_dose_mg = 0.0;
            return false;
        }
        self.ticks_remaining -= 1;
        let profile = SubstancePharmacokinetics::profile_for(self.substance);
        let decay_factor = if profile.sustained_release { 0.96 } else { 0.92 };
        self.current_dose_mg *= decay_factor;
        self.bioavailability = (self.current_dose_mg / self.initial_dose_mg).clamp(0.0, 1.0);
        self.current_dose_mg > 0.01
    }
}
