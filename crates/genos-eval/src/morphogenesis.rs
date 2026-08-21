pub enum AgentRole {
    Explorer,
    Exploiter,
    Idle,
}

/// Trait définissant le modèle de réaction-diffusion de Turing (via les équations de Gierer-Meinhardt).
/// Ce mécanisme permet l'émergence de structures spatiales complexes et auto-organisées
/// au sein de l'arbre de recherche MCTS. Les nœuds agissent comme des cellules interagissant
/// via la diffusion de morphogènes (activateurs et inhibiteurs).
/// 
/// Le modèle s'appuie sur deux équations différentielles couplées, régissant la dynamique temporelle 
/// de l'activateur (qui favorise sa propre création et celle de l'inhibiteur) et de l'inhibiteur 
/// (qui réprime l'activateur et diffuse plus rapidement).
pub trait TuringGradient {
    /// Calcule le laplacien discret pour simuler la diffusion locale du morphogène
    /// à travers le réseau cellulaire (les nœuds voisins).
    /// 
    /// - `val`: La concentration actuelle du morphogène dans la cellule.
    /// - `neighbors_sum`: La somme pondérée des concentrations dans les cellules voisines.
    fn compute_laplacian(val: f64, neighbors_sum: f64) -> f64;
    
    /// Met à jour la concentration de l'activateur `u` selon l'équation de Gierer-Meinhardt.
    /// L'activateur stimule l'exploration locale du MCTS.
    /// 
    /// - `u`: Concentration actuelle de l'activateur.
    /// - `v`: Concentration actuelle de l'inhibiteur.
    /// - `diff_u`: Terme de diffusion (calculé via le laplacien).
    fn update_activator(u: f64, v: f64, diff_u: f64) -> f64;
    
    /// Met à jour la concentration de l'inhibiteur `v` selon l'équation de Gierer-Meinhardt.
    /// L'inhibiteur empêche l'emballement exploratoire et favorise l'exploitation.
    /// 
    /// - `u`: Concentration actuelle de l'activateur.
    /// - `v`: Concentration actuelle de l'inhibiteur.
    /// - `diff_v`: Terme de diffusion (calculé via le laplacien).
    fn update_inhibitor(u: f64, v: f64, diff_v: f64) -> f64;
}

/// Trait implémentant le modèle du "Drapeau Français" de Lewis Wolpert.
/// Il décrit comment les cellules (ou agents) interprètent leur position relative 
/// en mesurant la concentration locale d'un morphogène diffusant depuis une source.
/// 
/// En fonction de cette concentration, la cellule enclenche un programme génétique spécifique
/// (ici modélisé par l'`AgentRole`), menant à une différenciation spatiale ordonnée.
pub trait PositionalInformation {
    /// Évalue la concentration locale du morphogène en fonction de la distance à la source.
    /// Utilise généralement un modèle de décroissance exponentielle.
    /// 
    /// - `dist`: La distance séparant l'agent de la source du morphogène.
    /// - `decay`: Le taux de décroissance spatiale du morphogène.
    fn get_concentration(dist: f64, decay: f64) -> f64;
    
    /// Détermine le rôle de l'agent (différenciation) en comparant la concentration locale
    /// à des seuils génétiquement préprogrammés.
    /// 
    /// - `conc`: La concentration locale calculée.
    /// - `thresh_high`: Le seuil haut de concentration (déclenche un rôle actif/exploratoire).
    /// - `thresh_low`: Le seuil bas de concentration (déclenche un rôle moyen/exploitateur).
    fn differentiate(conc: f64, thresh_high: f64, thresh_low: f64) -> AgentRole;
}

pub struct MorphogenesisModel;

impl TuringGradient for MorphogenesisModel {
    fn compute_laplacian(val: f64, neighbors_sum: f64) -> f64 {
        // Laplacien discret simplifié (ex: moyenne des voisins moins valeur actuelle)
        neighbors_sum - val
    }

    fn update_activator(u: f64, v: f64, diff_u: f64) -> f64 {
        // Equation de Gierer-Meinhardt : du/dt = rho * u^2 / v - mu * u + Du * Laplace(u)
        let rho = 0.01;
        let mu = 0.02;
        let du_dt = rho * (u * u) / (v + 0.001) - mu * u + diff_u;
        (u + du_dt).max(0.0)
    }

    fn update_inhibitor(u: f64, v: f64, diff_v: f64) -> f64 {
        // Equation de Gierer-Meinhardt : dv/dt = rho * u^2 - nu * v + Dv * Laplace(v)
        let rho = 0.015;
        let nu = 0.025;
        let dv_dt = rho * (u * u) - nu * v + diff_v;
        (v + dv_dt).max(0.0)
    }
}

impl PositionalInformation for MorphogenesisModel {
    fn get_concentration(dist: f64, decay: f64) -> f64 {
        // Modèle de décroissance exponentielle depuis la source
        (-decay * dist).exp()
    }

    fn differentiate(conc: f64, thresh_high: f64, thresh_low: f64) -> AgentRole {
        if conc > thresh_high {
            AgentRole::Explorer // Forte concentration : comportement exploratoire actif
        } else if conc > thresh_low {
            AgentRole::Exploiter // Concentration moyenne : comportement d'exploitation
        } else {
            AgentRole::Idle // Faible concentration : inactif
        }
    }
}

/// Trait définissant le mécanisme de plasticité synaptique inspiré du concept STDP 
/// (Spike-Timing-Dependent Plasticity). Dans le contexte de GenOS, ce trait régule 
/// la "force" ou le "poids" des connexions entre les nœuds parents et enfants de l'arbre MCTS.
/// 
/// Ce poids (le `synaptic_weight`) est mis à jour dynamiquement lors de la phase de rétropropagation
/// en fonction du succès de la branche évaluée et du temps d'exécution (`delta_t`).
pub trait SynapticPlasticity {
    /// Applique une potentialisation à long terme (LTP).
    /// Renforce le poids synaptique du nœud si la branche évaluée aboutit à un succès,
    /// favorisant ainsi sa future sélection lors de l'expansion MCTS.
    /// 
    /// - `delta_t`: Le différentiel de temps ou de score représentant la qualité/rapidité de l'exécution.
    fn apply_potentiation(&mut self, delta_t: f32);
    
    /// Applique une dépression à long terme (LTD).
    /// Diminue le poids synaptique du nœud en cas d'échec ou de sous-performance,
    /// décourageant ainsi l'exploration répétée de cette branche par le MCTS.
    /// 
    /// - `delta_t`: Le différentiel de temps ou de score représentant l'ampleur de l'échec.
    fn apply_depression(&mut self, delta_t: f32);
}
