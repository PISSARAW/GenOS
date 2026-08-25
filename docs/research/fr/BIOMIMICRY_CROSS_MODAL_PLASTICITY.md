# Biomimétisme & Plasticité Cross-Modale : Substitution Sensorielle

> Domaine : neurosciences (plasticité inter-modale) — Statut : proposition de recherche

## 1. Fondement biologique
Le cortex est plus plastique qu'on ne le croyait : chez les sourds, l'aire auditive traite du visuel ; avec un tongue display ou une prothèse visuelle, des informations d'une modalité sont remappées sur une autre (Bach-y-Rita). Le principe : la **fonction** peut survivre à la perte de son **canal** si le codage informationnel est préservé et l'entraînement suffisant.

## 2. Formalisation GenOS
```
Substitution(C, canal_perdu p, canal_substitut s) :
  Prérequis : même contenu informationnel exprimable via s (encodage adaptatif)
  Remapping : rerouter les entrées/sorties de p vers s dans la topologie cognitive
  Période d'entraînement : performances réduites pendant k itérations puis récupération partielle mesurée
```

Exemples : modèle frontier indisponible → SLM + décomposition de tâche ; outil web indisponible → cache local stigmergique ; sortie texte bloquée → sortie structurée JSON.

## 3. Mapping primitives existantes
- `genos-model` (neutralité providers) — fournit déjà plusieurs canaux interchangeables.
- Politiques outils/mémoire/modèle du génome — le remapping s'écrit comme ajustement épigénétique conditionnel (`epigenetics.rs`), pas comme mutation.
- `genos-eval/src/prm.rs` — validation que la fonction est préservée après remapping.

## 4. Cas d'usage
- Panne d'un provider LLM : dégradation gracieuse par substitution plutôt qu'échec sec.
- Environnement restreint (sandbox sans réseau) : re-routage vers capacités locales.

## 5. Apports attendus
- Résilience fonctionnelle aux pannes de canaux, complémentaire à la redondance simple (ici on change de voie, pas seulement de fournisseur).
- Mesure objective de « coût de remapping » (temps de récupération) comme critère d'architecture.

## 6. Points d'intégration
`genos-core/src/resilience/substitution.rs` (nouveau), outil MCP `resilience_remap_channel`.
