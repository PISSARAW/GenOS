> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Succession Écologique : Colonisation Graduelle des Domaines

> Domaine : écologie (succession primaire/secondaire, climax) — Statut : proposition de recherche

## 1. Fondement biologique
Un milieu nu se colonise par étapes : espèces pionnières tolérantes (lichens) → herbacées → arbustes → forêt climax. Chaque stade **modifie le milieu** et prépare le suivant (facilitation), tout en rendant possible l'inhibition des suivants. La succession secondaire (après perturbation) suit le même schéma plus vite grâce aux résidus du stade précédent.

## 2. Formalisation GenOS
```
Succession(domaine D vierge ou perturbé) :
  Stade pionnier : agents simples robustes à faible exigence (taxis + réflexes), faible valeur, forte tolérance au bruit
                   → leurs artefacts modifient le biotope (index, caches, cartes)
  Stades intermédiaires : spécialisation croissante, mutualismes, compétition structurée
  Climax : écosystème stable auto-maintenu (quorum, stigmergie mature), turnover lent
  Perturbation (incident majeur) → succession secondaire depuis les fossiles/résidus (plus rapide)
Métrique : indice de maturité écologique de D (diversité d'agents × interdépendances × stabilité)
```

## 3. Mapping primitives existantes
- `genos-eval/src/ecosystem.rs::Biotope` — support des capacités de charge déjà présent.
- Fossiles (`genos-store/src/fossil.rs`) — « banque de graines » pour la succession secondaire.
- Stigmergie/quorum — mécanismes caractéristiques du climax.

## 4. Cas d'usage
- Ouverture d'un nouveau domaine de tâches : déployer d'abord des agents pionniers cheap qui cartographient le terrain avant d'envoyer les spécialistes coûteux.
- Après un incident majeur ayant vidé un domaine : re-colonisation ordonnée plutôt que repeuplement chaotique.

## 5. Apports attendus
- Stratégies de déploiement graduelles éprouvées par la nature (moins d'échecs que l'installation directe du climax).
- Vocabulaire de maturité pour piloter l'investissement dans un domaine.
- Résilience post-perturbation systématique.

## 6. Points d'intégration
Extension `ecosystem.rs` (états de succession du Biotope), orchestrateur de déploiement dans `genos-runtime`.
