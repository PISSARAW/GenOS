# Biomimétisme & Apprentissage Social : Transmission Culturelle entre Agents

> Domaine : éthologie (apprentissage social, culture animale) — Statut : proposition de recherche

## 1. Fondement biologique
Les macaques japonais laveurs de patates, les chansons des oiseaux, les routes migratoires des baleines : la **culture animale** transmet des compétences par observation et tutorat, sans mutation génétique. Mécanismes gradués : facilitation sociale → émulation → imitation fidèle → enseignement actif (rare mais documenté chez les suricates). Avantage clé : transmission rapide et directionnelle, réversible.

## 2. Formalisation GenOS
```
Tutorat(expert E → novice N, compétence t) :
  Mode passif : N rejoue les trajectoires validées de E (replay pédagogique — zéro coût pour E)
  Mode actif : E commente ses décisions pendant une exécution dédiée ; N pose des questions bornées
  Évaluation : N exécute t seul ; succès ⇒ trait consolidé + candidat mutation lamarckienne
Contraintes : le tutorat ne modifie jamais G_N directement (passe par epigenetics/lamarck existants)
```

## 3. Mapping primitives existantes
- Replay causal (`genos-store`) — support du mode passif.
- `genos-eval/src/lamarck.rs` — canal d'inscription des acquis.
- Fossiles — tutorat posthume depuis un expert archivé.

## 4. Cas d'usage
- Onboarding d'un agent junior sur les pratiques d'un senior parti en spore.
- Diffusion d'une technique découverte par un agent vers toute la flotte sans attendre les cycles de breeding.

## 5. Apports attendus
- Transmission de compétences rapide, traçable et **réversible** (contrairement aux mutations).
- Coût marginal quasi nul en mode replay.
- Complète la voie génétique (breeding) par la voie culturelle : double héritage darwinien/baldwinien.

## 6. Points d'intégration
`genos-runtime/src/evolution/tutoring.rs`, outil MCP `evolution_tutor`.
