> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Inflammation / Fièvre : Mode Dégradé Global Transitoire

> Domaine : immunologie (réponse innée) — Statut : proposition de recherche

## 1. Fondement biologique
L'inflammation est une réponse globale, coûteuse mais transitoire : vasodilatation, afflux immunitaire, fièvre (élévation délibérée du point de consigne thermique pour gêner les pathogènes). Elle sacrifie de la performance pour gagner du temps de diagnostic et contenir la propagation. Elle doit être **auto-résolutive** : l'inflammation chronique est elle-même une maladie.

## 2. Formalisation GenOS
```
Inflammation(système) :
  Déclencheur : suspicion de contamination (anomalie non localisée) ou intégrité Merkle douteuse
  Effets : mode conservateur global (budgets réduits, merges gelés, journalisation renforcée),
           température virtuelle +ΔT (seuils de sensibilité des détecteurs abaissés)
  Résolution : auto après T_max si cause écartée ; sinon escalade vers quarantaine/apoptose ciblée
Garde-fou anti-inflammation chronique : coût cumulé surveillé, alerte au-delà de X % du temps passé en inflammation
```

## 3. Mapping primitives existantes
- Budgets de capsule — levier principal du mode conservateur.
- `genos-store` (intégrité Merkle) — source des suspicions.
- Détecteurs `cyber_immune.rs` — leur sensibilité est modulée par ΔT.

## 4. Cas d'usage
- Un fork inconnu a été mergé par erreur : inflammation pendant que l'enquête causale (replay) identifie le périmètre contaminé ; puis résolution chirurgicale.
- Fièvre douce avant une opération sensible : seuils abaissés temporairement pour maximiser la vigilance.

## 5. Apports attendus
- Trade-off explicite performance/sécurité, décidé une fois au niveau système au lieu de bricolages locaux.
- Auto-résolution garantie : pas d'état dégradé permanent oublié.
- Complète la cascade existante : nociception (perception) → inflammation (containment global) → apoptose/quarantaine (élimination).

## 6. Points d'intégration
`genos-core/src/resilience/inflammation.rs` (nouveau), outil MCP `resilience_inflammation_set`, doc gabarit `docs/3-features-and-domain/resilience/inflammation.md`.
