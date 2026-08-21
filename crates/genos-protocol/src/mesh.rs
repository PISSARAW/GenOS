use std::sync::{Arc, RwLock};
use std::collections::HashMap;

/// Identifiant typé représentant la catégorie de phéromone (ex: "Recrutement", "Alarme").
pub type PheromoneType = String;

/// La structure `SpatialMesh` représente la topologie de l'environnement spatial de l'essaim.
/// Elle permet de mémoriser les arêtes entre les nœuds et de distribuer les gradients
/// de diffusion phéromonale en mémoire partagée, pour un accès thread-safe.
#[derive(Clone, Default)]
pub struct SpatialMesh {
    /// Carte des concentrations de phéromones par nœud (ex: ID d'AST ou de fichier)
    gradients: Arc<RwLock<HashMap<String, HashMap<PheromoneType, f64>>>>,
    /// Dictionnaire d'adjacence pour modéliser la topologie de graphe (arêtes).
    edges: Arc<RwLock<HashMap<String, Vec<String>>>>,
}

impl SpatialMesh {
    pub fn new() -> Self {
        Self {
            gradients: Arc::new(RwLock::new(HashMap::new())),
            edges: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Ajoute une arête bidirectionnelle
    pub fn add_edge(&self, node_a: &str, node_b: &str) {
        let mut map = self.edges.write().unwrap();
        map.entry(node_a.to_string()).or_default().push(node_b.to_string());
        map.entry(node_b.to_string()).or_default().push(node_a.to_string());
    }

    /// Dépose une phéromone sur un nœud donné (max 3 paramètres).
    /// Si le nœud ou la phéromone n'existent pas encore, ils sont instanciés avec 0.0.
    pub fn deposit(&self, node_id: &str, p_type: PheromoneType, amount: f64) {
        let mut map = self.gradients.write().unwrap();
        let node = map.entry(node_id.to_string()).or_insert_with(HashMap::new);
        *node.entry(p_type).or_insert(0.0) += amount;
    }

    /// Lit la concentration d'une phéromone sur un nœud (max 3 paramètres).
    /// Retourne `0.0` si aucune trace n'est présente.
    pub fn sense(&self, node_id: &str, p_type: &PheromoneType) -> f64 {
        let map = self.gradients.read().unwrap();
        map.get(node_id)
            .and_then(|node| node.get(p_type))
            .copied()
            .unwrap_or(0.0)
    }

    /// Évaporation : mathématiques de décroissance exponentielle (Stigmergie).
    ///
    /// Cette fonction applique la loi de désintégration exponentielle naturelle pour modéliser 
    /// la dissipation temporelle des phéromones sur l'ensemble de la grille spatiale.
    /// 
    /// Formule mathématique :
    /// `C(t+1) = C(t) * e^(-rate)`
    /// 
    /// Le `rate` représente le taux d'évaporation de la phéromone, garantissant une décroissance
    /// stable et continue. Si la concentration d'un nœud chute sous 1e-6, elle est ramenée à 0 
    /// pour optimiser les performances mémoires et éviter les dénormalisés (underflows).
    pub fn evaporate(&self, p_type: &PheromoneType, rate: f64) {
        let mut map = self.gradients.write().unwrap();
        let decay = (-rate).exp();
        for node in map.values_mut() {
            if let Some(val) = node.get_mut(p_type) {
                *val *= decay;
                if *val < 1e-6 {
                    *val = 0.0;
                }
            }
        }
    }

    /// Diffusion : mathématiques du Laplacien discret sur graphe (Loi de Fick).
    ///
    /// Implémente la première loi de Fick appliquée à un graphe topologique pour simuler la 
    /// diffusion stigmérgique. La quantité de phéromone transférée entre deux nœuds adjacents 
    /// est proportionnelle à la différence de leurs concentrations (gradient).
    /// 
    /// Formule du Laplacien discret pour un nœud i :
    /// `ΔC_i = diff_rate * ( Σ C_j - deg(i) * C_i )`
    /// où `j` sont les voisins du nœud `i` et `deg(i)` le degré du nœud `i`.
    /// 
    /// Les deltas (transferts de flux) sont accumulés virtuellement et appliqués de manière
    /// synchrone à la fin du cycle pour garantir la conservation globale de la masse.
    pub fn diffuse(&self, p_type: &PheromoneType, diff_rate: f64) {
        let mut deltas: HashMap<String, f64> = HashMap::new();
        {
            let map = self.gradients.read().unwrap();
            let edges = self.edges.read().unwrap();
            
            for (node, neighbors) in edges.iter() {
                let c_i = map.get(node).and_then(|n| n.get(p_type)).copied().unwrap_or(0.0);
                
                let sum_c_j: f64 = neighbors
                    .iter()
                    .map(|neighbor| map.get(neighbor).and_then(|n| n.get(p_type)).copied().unwrap_or(0.0))
                    .sum();
                
                let laplacian = sum_c_j - (neighbors.len() as f64) * c_i;
                let delta = diff_rate * laplacian;
                
                if delta.abs() > 1e-9 {
                    deltas.insert(node.clone(), delta);
                }
            }
        }
        
        let mut map = self.gradients.write().unwrap();
        for (node_id, delta) in deltas {
            let node = map.entry(node_id).or_default();
            let val = node.entry(p_type.clone()).or_insert(0.0);
            *val = (*val + delta).max(0.0);
        }
    }

    /// Routage osmotique (Loi de Hagen-Poiseuille modifiée) (max 3 paramètres)
    pub fn osmotic_flow(&self, src: &str, dst: &str, p_type: &PheromoneType) -> f64 {
        let grad_src = self.sense(src, p_type);
        let grad_dst = self.sense(dst, p_type);
        let delta_p = grad_src - grad_dst;
        
        let resistance = 1.0; 
        delta_p / resistance
    }

    pub fn get_neighbors(&self, node_id: &str) -> Vec<String> {
        let map = self.edges.read().unwrap();
        map.get(node_id).cloned().unwrap_or_default()
    }
}
