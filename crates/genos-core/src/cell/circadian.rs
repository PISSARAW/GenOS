use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CircadianClock {
    pub current_hour: u8, // 0 to 23
    pub circadian_misalignment: f32, // Dommages liés au travail de nuit
}

impl Default for CircadianClock {
    fn default() -> Self {
        Self::new()
    }
}

impl CircadianClock {
    pub fn new() -> Self {
        Self {
            current_hour: 8, // Démarre au matin (8h)
            circadian_misalignment: 0.0,
        }
    }

    /// Fait avancer l'horloge biologique d'un certain nombre d'heures
    pub fn tick(&mut self, hours: u8) {
        self.current_hour = (self.current_hour + hours) % 24;
    }

    /// Période nocturne (22h à 5h)
    pub fn is_night(&self) -> bool {
        self.current_hour >= 22 || self.current_hour < 6
    }

    /// La dangereuse fenêtre du "Morning Surge" (6h à 8h)
    pub fn is_morning_surge(&self) -> bool {
        self.current_hour >= 6 && self.current_hour <= 8
    }

    /// Inflige des dommages endothéliaux si forcé à travailler la nuit
    pub fn force_night_shift(&mut self) {
        self.circadian_misalignment += 0.1;
    }
}
