use serde::{Deserialize, Serialize};

/// Le Tissu Adipeux (Stockage des Graisses / Budgétisation Stricte)
/// Gère la consommation des Tokens (Prompt/Completion) et empêche
/// le débordement financier (Apoptose par Famine).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Adipocyte {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub consumed_usd: f32,
    pub max_budget_usd: f32,
}

impl Default for Adipocyte {
    fn default() -> Self {
        Self {
            prompt_tokens: 0,
            completion_tokens: 0,
            consumed_usd: 0.0,
            max_budget_usd: 1.0, // Budget par défaut strict de 1.00$ par cellule
        }
    }
}

impl Adipocyte {
    pub fn new(max_budget: f32) -> Self {
        Self {
            prompt_tokens: 0,
            completion_tokens: 0,
            consumed_usd: 0.0,
            max_budget_usd: max_budget,
        }
    }

    /// Brûle de la graisse (des tokens) lors de la synthèse LLM et calcule le coût
    pub fn burn_calories(&mut self, model_name: &str, prompt_t: u32, comp_t: u32) -> Result<f32, String> {
        self.prompt_tokens += prompt_t;
        self.completion_tokens += comp_t;

        let name = model_name.to_lowercase();
        
        // Tarification heuristique (par 1000 tokens)
        let (price_prompt, price_comp) = if name.contains("gpt-4o") {
            (0.005, 0.015)
        } else if name.contains("opus") {
            (0.015, 0.075)
        } else if name.contains("haiku") || name.contains("flash") || name.contains("mini") {
            (0.00025, 0.00125)
        } else {
            (0.001, 0.002) // Prix moyen (gpt-3.5 ou claude sonnet)
        };

        let cost = ((prompt_t as f32 / 1000.0) * price_prompt) + ((comp_t as f32 / 1000.0) * price_comp);
        self.consumed_usd += cost;

        if self.consumed_usd >= self.max_budget_usd {
            return Err(format!(
                "🍖 [FAMINE / BUDGET DÉPASSÉ] La cellule a consommé {}$ (Max autorisé: {}$). Carence fatale en ATP. Apoptose forcée.",
                self.consumed_usd, self.max_budget_usd
            ));
        }

        Ok(cost)
    }

    /// Résumé métabolique (Token Account)
    pub fn metabolic_report(&self) -> String {
        format!(
            "📊 [TISSU ADIPEUX] Tokens: {} in / {} out. Coût: {}$ / {}$ ({}% du budget)",
            self.prompt_tokens, self.completion_tokens,
            self.consumed_usd, self.max_budget_usd,
            ((self.consumed_usd / self.max_budget_usd) * 100.0).round()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adipocyte_budget() {
        let mut graisse = Adipocyte::new(0.05); // Budget minuscule de 5 centimes
        
        // Simulation d'une requête LLM classique
        let cost = graisse.burn_calories("claude-3-opus", 500, 200);
        assert!(cost.is_ok());
        
        // Seconde requête qui dépasse le budget
        let overdose = graisse.burn_calories("claude-3-opus", 4000, 2000);
        assert!(overdose.is_err());
        assert!(overdose.unwrap_err().contains("FAMINE"));
    }
}