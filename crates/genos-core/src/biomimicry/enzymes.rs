use serde::{Deserialize, Serialize};

/// Représente la molécule cible (le "Substrat") avec une forme structurelle (hash/type).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Substrate {
    pub shape_signature: String,
    pub data_payload: String,
}

/// Le produit résultant de la réaction enzymatique.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Product {
    pub new_signature: String,
    pub data_payload: String,
}

/// Le Site Actif agit comme la "serrure" qui doit correspondre parfaitement à la "clé" (substrat).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ActiveSite {
    pub required_signature: String,
}

impl ActiveSite {
    pub fn new(signature: &str) -> Self {
        Self {
            required_signature: signature.to_string(),
        }
    }

    /// Vérifie la spécificité de liaison enzymatique.
    pub fn binds_with(&self, substrate: &Substrate) -> bool {
        self.required_signature == substrate.shape_signature
    }
}

/// Comportement dynamique de l'enzyme : la réaction qu'elle catalyse.
pub trait Catalysis {
    fn transform(&self, data: &str) -> String;
}

/// Une Enzyme modélisant le principe de spécificité (Clé-Serrure).
pub struct Enzyme {
    pub name: String,
    pub active_site: ActiveSite,
    pub output_signature: String,
    pub action: Box<dyn Catalysis + Send + Sync>,
}

impl Enzyme {
    pub fn new(
        name: &str,
        input_sig: &str,
        output_sig: &str,
        action: Box<dyn Catalysis + Send + Sync>,
    ) -> Self {
        Self {
            name: name.to_string(),
            active_site: ActiveSite::new(input_sig),
            output_signature: output_sig.to_string(),
            action,
        }
    }

    /// Tente de catalyser le substrat. Échoue si la spécificité n'est pas respectée.
    pub fn process(&self, substrate: &Substrate) -> Result<Product, String> {
        if !self.active_site.binds_with(substrate) {
            return Err(format!(
                "Rejet: Enzyme {} ({}) incompatible avec le substrat {}.",
                self.name, self.active_site.required_signature, substrate.shape_signature
            ));
        }

        let transformed_data = self.action.transform(&substrate.data_payload);

        Ok(Product {
            new_signature: self.output_signature.clone(),
            data_payload: transformed_data,
        })
    }
}

/// Voie Métabolique (Metabolic Pathway) : chaîne d'enzymes agissant en série.
pub struct MetabolicPathway {
    pub steps: Vec<Enzyme>,
}

impl MetabolicPathway {
    pub fn new(steps: Vec<Enzyme>) -> Self {
        Self { steps }
    }

    /// Exécute la chaîne d'enzymes. Chaque produit devient le substrat suivant.
    pub fn execute_pathway(&self, initial: Substrate) -> Result<Product, String> {
        let mut current_sub = initial;

        for enzyme in &self.steps {
            let prod = enzyme.process(&current_sub)?;
            // Le produit de l'enzyme N devient le substrat de l'enzyme N+1
            current_sub = Substrate {
                shape_signature: prod.new_signature,
                data_payload: prod.data_payload,
            };
        }

        Ok(Product {
            new_signature: current_sub.shape_signature,
            data_payload: current_sub.data_payload,
        })
    }
}
