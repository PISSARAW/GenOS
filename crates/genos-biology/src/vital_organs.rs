use serde::{Deserialize, Serialize};

/// État d'un organe vital.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum OrganStatus {
    Healthy,
    Impaired,
    Failed,
}

/// Un organe vital avec son efficacité et son seuil de défaillance.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VitalOrgan {
    pub id: String,
    pub function: String,
    pub efficiency: f64,
    pub failure_threshold: f64,
}

impl VitalOrgan {
    /// Seuil de défaillance par défaut.
    pub const DEFAULT_FAILURE_THRESHOLD: f64 = 0.2;

    pub fn new(id: &str, function: &str, efficiency: f64) -> Self {
        Self {
            id: id.to_string(),
            function: function.to_string(),
            efficiency,
            failure_threshold: Self::DEFAULT_FAILURE_THRESHOLD,
        }
    }

    /// Crée un organe avec un seuil de défaillance personnalisé.
    pub fn with_threshold(mut self, failure_threshold: f64) -> Self {
        self.failure_threshold = failure_threshold;
        self
    }

    /// Retourne le statut de l'organe selon son efficacité.
    pub fn status(&self) -> OrganStatus {
        if self.efficiency <= 0.0 || self.efficiency <= self.failure_threshold {
            OrganStatus::Failed
        } else if self.efficiency < 0.5 {
            OrganStatus::Impaired
        } else {
            OrganStatus::Healthy
        }
    }
}

/// Ensemble des organes vitaux d'un organisme.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VitalOrgans {
    pub organs: Vec<VitalOrgan>,
}

impl Default for VitalOrgans {
    fn default() -> Self {
        Self { organs: Vec::new() }
    }
}

impl VitalOrgans {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_organ(&mut self, organ: VitalOrgan) {
        self.organs.push(organ);
    }

    /// Retourne le statut le plus grave parmi tous les organes.
    pub fn worst_status(&self) -> OrganStatus {
        let mut worst = OrganStatus::Healthy;
        for organ in &self.organs {
            let status = organ.status();
            worst = more_severe(worst, status);
        }
        worst
    }

    /// Efficacité moyenne de l'ensemble des organes.
    pub fn mean_efficiency(&self) -> f64 {
        if self.organs.is_empty() {
            return 1.0;
        }
        let total: f64 = self.organs.iter().map(|o| o.efficiency).sum();
        total / self.organs.len() as f64
    }

    /// Nombre d'organes en défaillance.
    pub fn failed_count(&self) -> u32 {
        self.organs
            .iter()
            .filter(|o| matches!(o.status(), OrganStatus::Failed))
            .count() as u32
    }
}

/// Compare deux statuts et retourne le plus grave.
fn more_severe(a: OrganStatus, b: OrganStatus) -> OrganStatus {
    use OrganStatus::*;
    match (a, b) {
        (Failed, _) | (_, Failed) => Failed,
        (Impaired, _) | (_, Impaired) => Impaired,
        (Healthy, Healthy) => Healthy,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn healthy_organ_above_threshold() {
        let organ = VitalOrgan::new("heart", "circulation", 0.9);
        assert_eq!(organ.status(), OrganStatus::Healthy);
    }

    #[test]
    fn impaired_organ_below_half() {
        let organ = VitalOrgan::new("lung", "respiration", 0.4);
        assert_eq!(organ.status(), OrganStatus::Impaired);
    }

    #[test]
    fn failed_organ_at_or_below_threshold() {
        let organ = VitalOrgan::new("liver", "detox", 0.1).with_threshold(0.2);
        assert_eq!(organ.status(), OrganStatus::Failed);
    }

    #[test]
    fn worst_status_propagates_failure() {
        let mut organs = VitalOrgans::new();
        organs.add_organ(VitalOrgan::new("heart", "circulation", 0.9));
        organs.add_organ(VitalOrgan::new("lung", "respiration", 0.1).with_threshold(0.2));
        assert_eq!(organs.worst_status(), OrganStatus::Failed);
        assert_eq!(organs.failed_count(), 1);
    }

    #[test]
    fn mean_efficiency_of_empty_is_one() {
        let organs = VitalOrgans::new();
        assert_eq!(organs.mean_efficiency(), 1.0);
    }
}
