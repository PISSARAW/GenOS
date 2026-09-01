use crate::cell::AgentCell;

/// Structure retournant les résultats de nos deux évaluations mathématiques
#[derive(Debug, Clone, PartialEq)]
pub struct ConvergenceResult {
    /// Distance exacte entre les deux historiques d'actions (0 = identiques)
    pub trace_distance: usize,
    /// Score de similarité entre 0.0 et 1.0 (1.0 = sémantique identique)
    pub semantic_similarity: f32,
}

/// Calcule la distance de Levenshtein entre deux séquences d'actions.
/// Cela permet de vérifier si l'agent a pris le même chemin, indépendamment du temps.
pub fn trace_levenshtein(a: &[String], b: &[String]) -> usize {
    let len_a = a.len();
    let len_b = b.len();

    if len_a == 0 {
        return len_b;
    }
    if len_b == 0 {
        return len_a;
    }

    let mut matrix = vec![vec![0; len_b + 1]; len_a + 1];

    for i in 0..=len_a {
        matrix[i][0] = i;
    }
    for j in 0..=len_b {
        matrix[0][j] = j;
    }

    for i in 1..=len_a {
        for j in 1..=len_b {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            matrix[i][j] = (matrix[i - 1][j] + 1)
                .min(matrix[i][j - 1] + 1)
                .min(matrix[i - 1][j - 1] + cost);
        }
    }

    matrix[len_a][len_b]
}

/// Calcule la Similarité Cosinus entre deux vecteurs d'embeddings.
/// C'est le standard de l'industrie pour vérifier si deux états cognitifs sont similaires.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0; // Vecteurs invalides ou de tailles différentes
    }

    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;

    for (val_a, val_b) in a.iter().zip(b.iter()) {
        dot_product += val_a * val_b;
        norm_a += val_a * val_a;
        norm_b += val_b * val_b;
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}

/// Évalue formellement la convergence de deux cellules IA.
/// Respecte la règle d'or: maximum 3 paramètres !
/// Les embeddings sont calculés en amont par le LLM, le Core ne fait que les mathématiques.
pub fn evaluate_convergence(
    agent_a: &AgentCell,
    agent_b: &AgentCell,
    embeddings: (&[f32], &[f32]),
) -> ConvergenceResult {
    let trace_distance = trace_levenshtein(&agent_a.trace.sequence, &agent_b.trace.sequence);
    let semantic_similarity = cosine_similarity(embeddings.0, embeddings.1);

    ConvergenceResult {
        trace_distance,
        semantic_similarity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trace_levenshtein() {
        let trace1 = vec!["read".to_string(), "think".to_string(), "write".to_string()];
        let trace2 = vec!["read".to_string(), "write".to_string()]; // "think" a sauté

        // Distance devrait être 1 (une suppression)
        assert_eq!(trace_levenshtein(&trace1, &trace2), 1);
    }

    #[test]
    fn test_cosine_similarity() {
        // Deux vecteurs pointant exactement dans la même direction (colinéaires)
        let vec1 = vec![1.0, 2.0, 3.0];
        let vec2 = vec![2.0, 4.0, 6.0];

        let similarity = cosine_similarity(&vec1, &vec2);
        // Doit être extrêmement proche de 1.0 (99.9999%)
        assert!((similarity - 1.0).abs() < f32::EPSILON * 10.0);
    }
}
