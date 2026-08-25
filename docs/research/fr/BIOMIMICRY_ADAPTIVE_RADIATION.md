# Biomimétisme & Radiation Adaptative : Exploitation Systématique des Innovations

> Domaine : biologie évolutive (radiations adaptatives) — Statut : proposition de recherche

## 1. Fondement biologique
Après l'acquisition d'une innovation clé (vol chez les insectes, mâchoire chez les vertébrés), une lignée **rayonne** : colonisation rapide de toutes les niches dérivables, explosion de formes (Darwin's finches, mammifères post-KTg). La radiation suit toujours : innovation clé + niches vacantes + opportunité.

## 2. Formalisation GenOS
```
Radiation(innovation I validée par merge) :
  1. Analyse de niche : dériver du trait nouveau I la liste des niches désormais atteignables N(I) = {n_1..n_k}
     (niches = EcologicalNiche avec ressources/capacités requises)
  2. Émission de forks spécialisés : un fork par niche, chacun optimisé pour sa cible (bet-hedging sur les plus incertaines)
  3. Concurrence intra-radiation pendant T générations ; consolidation des survivants
Garde-fou : budget global plafonné, priorisation des niches à valeur attendue maximale
```

## 3. Mapping primitives existantes
- `genome.rs::EcologicalNiche` — formalisation des niches déjà présente.
- `genos-runtime/src/branch_evolution/` — mécanique de forks parallèles.
- `ecosystem.rs::evaluate_niche_competition` — arbitrage concurrentiel post-radiation.
- Merge gating existant — l'innovation déclencheuse est nécessairement validée.

## 4. Cas d'usage
- Un agent découvre un pattern de réutilisation de code qui marche partout : radiation automatique vers tous les contextes applicables (tests, docs, review…).
- Nouveau modèle LLM moins cher disponible : radiation d'agents adaptés à chaque tâche où il suffit.

## 5. Apports attendus
- Exploitation systématique et rapide des percées (au lieu de la diffusion organique lente).
- Couverture mesurable de l'espace des niches dérivées.
- Discipline budgétaire : la radiation est cadrée, priorisée, terminable.

## 6. Points d'intégration
Extension `genos-runtime/src/branch_evolution/` (orchestrateur `radiation.rs`), outil MCP `evolution_radiate`.
