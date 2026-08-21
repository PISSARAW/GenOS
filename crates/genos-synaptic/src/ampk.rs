/// Représente les trois états énergétiques du gouverneur AMPK.
/// - Anabolic : Abondance d'énergie (création/renforcement des synapses).
/// - Catabolic : Baisse d'énergie (nettoyage modéré).
/// - Conservation : Pénurie critique (élagage synaptique fort et mise en veille imminente).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum AmpkMode {
    Anabolic,
    Catabolic,
    Conservation,
}

/// La charge énergétique cellulaire d'Atkinson.
/// Elle calcule le ratio normalisé `(ATP + 0.5 * ADP) / (ATP + ADP + AMP)`.
pub struct AtkinsonCharge {
    pub atp: f32,
    pub adp: f32,
    pub amp: f32,
}

impl AtkinsonCharge {
    pub fn new(atp: f32, adp: f32, amp: f32) -> Self {
        Self { atp, adp, amp }
    }

    pub fn energy_charge(&self) -> f32 {
        let total = self.atp + self.adp + self.amp;
        if total == 0.0 {
            0.0
        } else {
            ((self.atp + 0.5 * self.adp) / total).clamp(0.0, 1.0)
        }
    }
}

/// Configuration du gouverneur AMPK pour déterminer les seuils de bascule
/// entre les états Anabolic, Catabolic et Conservation, incluant une `hysteresis`
/// pour éviter des oscillations rapides.
pub struct AmpkConfig {
    pub catabolic_threshold: f32,
    pub conservation_threshold: f32,
    pub hysteresis: f32,
}

/// L'automate AMPK régule le mode énergétique de l'agent.
/// Il analyse périodiquement la `AtkinsonCharge` et ajuste le `AmpkMode`
/// selon les seuils définis, en appliquant un mécanisme d'hystérésis.
pub struct AmpkAutomaton {
    pub mode: AmpkMode,
    pub config: AmpkConfig,
}

impl AmpkAutomaton {
    pub fn new(config: AmpkConfig) -> Self {
        Self {
            mode: AmpkMode::Anabolic,
            config,
        }
    }

    pub fn update_mode(&mut self, charge: &AtkinsonCharge) -> AmpkMode {
        let ec = charge.energy_charge();
        let h = self.config.hysteresis;

        match self.mode {
            AmpkMode::Anabolic => {
                if ec < self.config.catabolic_threshold - h {
                    self.mode = AmpkMode::Catabolic;
                }
            }
            AmpkMode::Catabolic => {
                if ec > self.config.catabolic_threshold + h {
                    self.mode = AmpkMode::Anabolic;
                } else if ec < self.config.conservation_threshold - h {
                    self.mode = AmpkMode::Conservation;
                }
            }
            AmpkMode::Conservation => {
                if ec > self.config.conservation_threshold + h {
                    self.mode = AmpkMode::Catabolic;
                }
            }
        }
        self.mode
    }
}
