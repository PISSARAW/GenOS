use std::hash::Hash;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum EntityRef {
    /// Action portant sur un fichier entier
    File { path: String },
    /// Action très spécifique sur un intervalle de lignes
    LineRange { path: String, start: usize, end: usize },
    /// Action portant sur une variable d'état (ex: API_VERSION)
    StateVar { key: String },
    /// Action de lecture massive (ex: grep src/*.rs)
    DirectoryWildcard { path: String, pattern: String },
}

impl EntityRef {
    /// Calcule la collision sémantique entre deux entités.
    pub fn intersects(&self, other: &EntityRef) -> bool {
        match (self, other) {
            (EntityRef::StateVar { key: k1 }, EntityRef::StateVar { key: k2 }) => k1 == k2,
            
            (EntityRef::File { path: p1 }, EntityRef::File { path: p2 }) => p1 == p2,
            
            // Fichier vs Ligne : Un fichier complet écrase/lit toutes ses lignes
            (EntityRef::File { path: p1 }, EntityRef::LineRange { path: p2, .. }) => p1 == p2,
            (EntityRef::LineRange { path: p1, .. }, EntityRef::File { path: p2 }) => p1 == p2,

            // Ligne vs Ligne : Vérifie le chevauchement (Overlap)
            (EntityRef::LineRange { path: p1, start: s1, end: e1 }, 
             EntityRef::LineRange { path: p2, start: s2, end: e2 }) => {
                if p1 != p2 {
                    return false;
                }
                // Si les intervalles se chevauchent
                s1 <= e2 && s2 <= e1
            }

            // Wildcard vs File/Ligne (Simulation simplifiée)
            (EntityRef::DirectoryWildcard { path: dir_path, pattern }, EntityRef::File { path: p2 }) |
            (EntityRef::DirectoryWildcard { path: dir_path, pattern }, EntityRef::LineRange { path: p2, .. }) => {
                // Approximation: si le fichier est dans le dossier et respecte l'extension.
                let ext = pattern.replace("*", "");
                p2.starts_with(dir_path) && p2.ends_with(&ext)
            }

            // L'inverse (Commutativité)
            (EntityRef::File { path: p1 }, EntityRef::DirectoryWildcard { path: dir_path, pattern }) |
            (EntityRef::LineRange { path: p1, .. }, EntityRef::DirectoryWildcard { path: dir_path, pattern }) => {
                let ext = pattern.replace("*", "");
                p1.starts_with(dir_path) && p1.ends_with(&ext)
            }

            (EntityRef::DirectoryWildcard { path: p1, pattern: pat1 }, 
             EntityRef::DirectoryWildcard { path: p2, pattern: pat2 }) => {
                p1 == p2 && pat1 == pat2
            }

            // Tout autre cas = pas de collision
            _ => false,
        }
    }
}

/// Helper algorithmique pour vérifier si deux listes d'entités entrent en collision.
pub fn check_intersection<'a>(
    list_a: impl Iterator<Item = &'a EntityRef>,
    list_b: impl Clone + Iterator<Item = &'a EntityRef>,
) -> bool {
    for a in list_a {
        for b in list_b.clone() {
            if a.intersects(b) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_range_collision() {
        let block1 = EntityRef::LineRange { path: "main.rs".into(), start: 10, end: 20 };
        let block2 = EntityRef::LineRange { path: "main.rs".into(), start: 15, end: 25 }; // Overlap
        let block3 = EntityRef::LineRange { path: "main.rs".into(), start: 50, end: 60 }; // Indépendant
        let block4 = EntityRef::LineRange { path: "other.rs".into(), start: 15, end: 25 }; // Autre fichier

        assert!(block1.intersects(&block2)); // Il y a conflit
        assert!(!block1.intersects(&block3)); // Pas de conflit
        assert!(!block2.intersects(&block4)); // Pas de conflit
    }

    #[test]
    fn test_wildcard_collision() {
        let grep = EntityRef::DirectoryWildcard { path: "src/".into(), pattern: "*.rs".into() };
        let src_file = EntityRef::File { path: "src/main.rs".into() };
        let css_file = EntityRef::File { path: "src/style.css".into() };

        assert!(grep.intersects(&src_file));
        assert!(!grep.intersects(&css_file));
    }
}
