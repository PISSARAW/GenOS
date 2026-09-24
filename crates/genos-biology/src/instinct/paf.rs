use serde::{Deserialize, Serialize};

/// Pas moteur élémentaire d'un Patron d'Action Fixe.
///
/// Un pas cible un outil autorisé et une action. Les pas `requires_permission`
/// sont refusés si l'outil quitte la politique de l'agent, ce qui interrompt
/// la séquence sans altérer le programme inné.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MotorStep {
    pub action: String,
    pub tool: String,
    pub requires_permission: bool,
}

impl MotorStep {
    pub fn new(action: &str, tool: &str) -> Self {
        Self {
            action: action.to_string(),
            tool: tool.to_string(),
            requires_permission: true,
        }
    }

    /// Marque le pas comme automatique (déjà couvert par la politique interne).
    pub fn auto(mut self) -> Self {
        self.requires_permission = false;
        self
    }
}

/// Catalogue fermé des paires outil/action prises en charge par l'hôte.
/// Cette liste ne confère aucune autorisation à un agent.
pub fn is_supported_action(action: &str, tool: &str) -> bool {
    matches!(
        (tool, action),
        ("genos_biomimicry", "deposit_harvest_marker")
            | ("genos_biomimicry", "reorient_goal_vector")
            | ("genos_biomimicry", "raise_alarm")
            | ("genos_biomimicry", "neutralize_virion")
            | ("genos_snapshot", "return_to_hive")
    )
}

/// Patron d'Action Fixe : séquence ordonnée, stéréotypée et pré-câblée.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FixedActionPattern {
    pub name: String,
    pub steps: Vec<MotorStep>,
}

impl FixedActionPattern {
    pub fn new(name: &str, steps: Vec<MotorStep>) -> Self {
        Self {
            name: name.to_string(),
            steps,
        }
    }

    pub fn len(&self) -> usize {
        self.steps.len()
    }

    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }

    /// Liste ordonnée des outils requis par la séquence.
    pub fn required_tools(&self) -> Vec<String> {
        self.steps.iter().map(|step| step.tool.clone()).collect()
    }

    /// Budget ATP minimal requis pour parcourir toute la séquence.
    pub fn required_atp(&self) -> f64 {
        self.steps.len() as f64
    }
}

/// État permissif de l'agent au moment du déclenchement.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub authorized_tools: Vec<String>,
    pub atp_budget: f64,
    pub apoptotic: bool,
    /// Profondeur de chaîne instinct->instinct (anti-boucle : un pas dont
    /// l'exécution redéclenche un instinct incrémente ce compteur).
    pub chain_depth: u32,
}

/// Profondeur maximale de redéclenchement en chaîne avant blocage.
pub const MAX_CHAIN_DEPTH: u32 = 8;

impl Default for ExecutionContext {
    fn default() -> Self {
        Self {
            authorized_tools: Vec::new(),
            atp_budget: 0.0,
            apoptotic: false,
            chain_depth: 0,
        }
    }
}

impl ExecutionContext {
    pub fn new(authorized_tools: Vec<String>, atp_budget: f64) -> Self {
        Self {
            authorized_tools,
            atp_budget,
            apoptotic: false,
            chain_depth: 0,
        }
    }

    /// Contexte chaîné : propage l'autorisation en incrémentant l'anti-boucle.
    pub fn chained(&self) -> Self {
        Self {
            authorized_tools: self.authorized_tools.clone(),
            atp_budget: self.atp_budget,
            apoptotic: self.apoptotic,
            chain_depth: self.chain_depth.saturating_add(1),
        }
    }

    pub fn is_tool_authorized(&self, tool: &str) -> bool {
        self.authorized_tools.iter().any(|allowed| allowed == tool)
    }

    /// Un état est permissif s'il n'est ni apoptotique ni à court de budget.
    pub fn is_permissive(&self) -> bool {
        !self.apoptotic && self.atp_budget > 0.0
    }
}

/// Verdict terminal d'un instinct déclenché.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum InstinctOutcome {
    NotTriggered { salience: f64, threshold: f64 },
    Blocked { reason: String },
    /// Plan validé mais NON exécuté : l'exécution réelle passe par
    /// l'executor externe qui émet un receipt par pas. Seul l'executor
    /// peut convertir Pending en Complete.
    Pending { steps_ready: usize, gain: f64 },
    Complete { steps_executed: usize, gain: f64 },
    Interrupt { at_step: usize, reason: String },
}
