use serde::{Deserialize, Serialize};
use std::io::{self, Write};

/// La Barrière Hémato-Encéphalique (Blood-Brain Barrier)
/// Implémente le "Human-in-the-Loop" (HITL).
/// Protège le système nerveux central (l'OS de l'utilisateur) des actions
/// potentiellement destructrices générées par l'organisme (les agents autonomes).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BloodBrainBarrier {
    pub is_active: bool,
    pub strict_mode: bool, // Si true, demande pour TOUTE action. Sinon, juste pour les modifications.
}

impl Default for BloodBrainBarrier {
    fn default() -> Self {
        Self {
            is_active: true,
            strict_mode: false,
        }
    }
}

impl BloodBrainBarrier {
    pub fn new(strict: bool) -> Self {
        Self {
            is_active: true,
            strict_mode: strict,
        }
    }

    /// En environnement de test, la barrière est perméable pour ne pas bloquer 'cargo test'
    #[cfg(test)]
    pub fn request_permission(&self, _action_type: &str, _details: &str) -> Result<(), String> {
        Ok(())
    }

    /// Demande l'autorisation à la Conscience Supérieure (L'Utilisateur)
    #[cfg(not(test))]
    pub fn request_permission(&self, action_type: &str, details: &str) -> Result<(), String> {
        if !self.is_active {
            return Ok(()); // La barrière est ouverte (Mode Autonome complet)
        }

        // Si on n'est pas en strict mode, on laisse passer les actions mineures (ex: READ)
        if !self.strict_mode && action_type == "READ" {
            return Ok(());
        }

        println!("\n🧠 [BARRIÈRE HÉMATO-ENCÉPHALIQUE] L'agent demande l'accès au système hôte.");
        println!("Type d'action : {}", action_type);
        println!("Détails       : {}", details);
        print!("Autoriser cette mutation ? [Y/n] : ");
        io::stdout().flush().unwrap_or(());

        let mut input = String::new();
        match io::stdin().read_line(&mut input) {
            Ok(_) => {
                let answer = input.trim().to_lowercase();
                if answer == "y" || answer == "yes" || answer == "" {
                    println!("✅ Accès accordé par la Conscience Supérieure.");
                    Ok(())
                } else {
                    Err("🚫 Rejet : Action bloquée par la Barrière Hémato-Encéphalique (Refus de l'utilisateur).".to_string())
                }
            }
            Err(_) => Err("🚫 Erreur de communication avec la Conscience Supérieure. Action annulée par défaut.".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bbb_permeable_in_tests() {
        let bbb = BloodBrainBarrier::new(true);
        // Ne devrait pas bloquer ni attendre un input stdin dans les tests
        let result = bbb.request_permission("WRITE", "rm -rf /");
        assert!(result.is_ok()); 
    }
}