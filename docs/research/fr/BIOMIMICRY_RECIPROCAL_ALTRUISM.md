> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Altruisme Réciproque : Jeux Évolutionnaires et Sanction des Resquilleurs

> Domaine : biologie évolutive / théorie des jeux (Trivers, Axelrod) — Statut : proposition de recherche

## 1. Fondement biologique
Le vampire qui partage son sang reçoit en retour des partenaires qu'il reconnaît individuellement — et qu'il **punît** s'ils trichent. L'altruisme réciproque est stable si : reconnaissance individuelle, mémoire des interactions, répétition du jeu, et sanction des défecteurs (punition altruiste). Le tournoi d'Axelrod montre que « Tit-for-Tat » (coopérer d'abord, rendre coup pour coup) domine les stratégies égoïstes.

## 2. Formalisation GenOS
```
Jeu répété entre agents : matrice de gains définie par tâche (coopération = partage artefacts/budget)
Stratégie par défaut : Tit-for-Tat avec pardon stochastique (bruit toléré)
Mémoire de réputation : score réciproque par paire + global, persistant, héritable partiellement (réputation de lignée)
Punition : refus de coopération futur + pénalité mesurable ; coût de la punition supporté par le système (punition altruiste institutionnalisée)
Équilibre recherché : stratégie évolutionnairement stable (ESS) de coopération conditionnelle
```

## 3. Mapping primitives existantes
- `genos-eval/src/ecosystem.rs` — cadre multi-agents existant.
- Réputation de lignée via phylogénie/fossiles (`phylogeny.rs`, `fossil.rs`).
- `biomimicry_swarm_consensus` — infrastructure de vote complémentaire.

## 4. Cas d'usage
- Partage de caches et d'artefacts inter-agents : ceux qui ne contribuent jamais se voient couper l'accès.
- Marchés internes de tâches : réputation réciproque comme monnaie.

## 5. Apports attendus
- Stabilité des écosystèmes multi-agents : anti-free-riding formellement fondé.
- Coopération émergente sans autorité centrale (complète le quorum sensing).
- Métrique de santé sociale de la flotte (indice de coopération).

## 6. Points d'intégration
`genos-eval/src/reciprocity.rs` (nouveau), extension contrats `ecosystem.rs`, doc gabarit `docs/research/fr/BIOMIMICRY_MUTUALISM.md` sœur.
