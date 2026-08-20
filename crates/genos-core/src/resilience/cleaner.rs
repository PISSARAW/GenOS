use std::time::{Duration, Instant};

/// Torpor: Rate Limiting
/// Permet de ralentir les actions pour éviter la surcharge.
pub struct Torpor {
    last_action: Instant,
    min_interval: Duration,
}

impl Torpor {
    pub fn new(min_interval: Duration) -> Self {
        Self {
            last_action: Instant::now() - min_interval,
            min_interval,
        }
    }

    pub fn can_proceed(&mut self) -> bool {
        let now = Instant::now();
        if now.duration_since(self.last_action) >= self.min_interval {
            self.last_action = now;
            true
        } else {
            false
        }
    }
}

/// Autophagy: Garbage Collection
/// Nettoie les éléments obsolètes ou corrompus du système.
pub struct Autophagy {
    items: Vec<String>,
}

impl Autophagy {
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    pub fn add_item(&mut self, item: String) {
        self.items.push(item);
    }

    pub fn cleanup(&mut self, is_stale: fn(&String) -> bool) {
        self.items.retain(|item| !is_stale(item));
    }
    
    pub fn count(&self) -> usize {
        self.items.len()
    }
}

/// Hypermutation: Fuzzing
/// Introduit de légères variations pour tester la résilience.
pub struct Hypermutation;

impl Hypermutation {
    pub fn mutate_string(input: &str, mutation_char: char) -> String {
        if input.is_empty() {
            return String::from(mutation_char);
        }
        
        let mut result = String::from(input);
        result.replace_range(0..1, &mutation_char.to_string());
        result
    }
}

/// High Availability (Haute Disponibilité Active)
/// Assure la continuité en basculant sur un nœud de secours en cas de panne.
pub struct HighAvailability {
    active_is_healthy: bool,
}

impl HighAvailability {
    pub fn new() -> Self {
        Self {
            active_is_healthy: true,
        }
    }

    pub fn report_failure(&mut self) {
        self.active_is_healthy = false;
    }

    pub fn recover(&mut self) {
        self.active_is_healthy = true;
    }

    pub fn execute_action(&self, action: fn() -> String) -> String {
        if self.active_is_healthy {
            action()
        } else {
            String::from("Backup node executed action")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_torpor() {
        let mut torpor = Torpor::new(Duration::from_millis(10));
        assert!(torpor.can_proceed());
        assert!(!torpor.can_proceed());
    }

    #[test]
    fn test_autophagy() {
        let mut auto = Autophagy::new();
        auto.add_item("keep".to_string());
        auto.add_item("stale".to_string());
        auto.cleanup(|s| s == "stale");
        assert_eq!(auto.count(), 1);
    }

    #[test]
    fn test_hypermutation() {
        let mutated = Hypermutation::mutate_string("hello", 'y');
        assert_eq!(mutated, "yello");
    }

    #[test]
    fn test_high_availability() {
        let mut ha = HighAvailability::new();
        let action = || "Active node".to_string();
        assert_eq!(ha.execute_action(action), "Active node");
        
        ha.report_failure();
        assert_eq!(ha.execute_action(action), "Backup node executed action");
    }
}
