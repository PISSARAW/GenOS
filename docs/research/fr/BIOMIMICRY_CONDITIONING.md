# Biomimétisme & Conditionnement : Associations Stimulus-Résultat au Niveau État

> Domaine : éthologie (Pavlov, Skinner) — Statut : proposition de recherche

## 1. Fondement biologique
Le conditionnement classique associe un stimulus neutre à un stimulus signifiant (cloche → nourriture) ; le conditionnement opérant façonne le comportement par renforcement/punition. C'est un apprentissage **rapide, local, réversible** (extinction), distinct du déterminisme génétique. La biologie impose des contraintes fines : contingence (pas simple contiguïté), périodicité optimale, biais de préparation (certains couplages s'apprennent mieux).

## 2. Formalisation GenOS
```
Association(S, R, poids w) stockée dans l'État de la capsule (jamais dans G)
Conditionnement classique : S_contexte → prédiction de résultat ; ajustement par erreur de prédiction (δ, cf. neuromodulation)
Conditionnement opérant : action → conséquence ; renforcement positif/négatif sur heuristiques de routage
Extinction : exposition répétée de S sans R ⇒ décroissance exponentielle de w ; rémanence mesurable (spontanée recovery → garde-fou anti-surapprentissage inversé)
```

Contrainte d'invariant : tout passe par l'état/épigénétique — le conditionnement ne mute jamais le génome (`GENOME_SPEC.md`).

## 3. Mapping primitives existantes
- `genos-core/src/epigenetics.rs` (déclencheurs conditionnels sur l'état) — mécanisme hôte naturel.
- `genos-eval/src/rpe.rs` (doc sœur neuromodulation) — moteur d'ajustement.
- `genos-synaptic/graph.rs` — support associatif.

## 4. Cas d'usage
- Un agent apprend que « vendredi 17h » prédit une charge élevée et adapte son routage — sans reprogrammation ni mutation.
- Extinction propre des associations devenues fausses après changement d'environnement.

## 5. Apports attendus
- Adaptation fine, rapide et réversible aux régularités de l'environnement.
- Respect strict de la séparation génotype/état (l'apprentissage simple ne touche pas à l'hérédité).
- Vocabulaire expérimental riche (contingence, extinction) pour diagnostiquer les comportements appris indésirables.

## 6. Points d'intégration
Extension `epigenetics.rs` (table d'associations), outil MCP `memory_condition`.
