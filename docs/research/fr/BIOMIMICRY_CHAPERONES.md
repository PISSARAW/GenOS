> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Chaperonnes Moléculaires : Réparation Assistée des Configurations

> Domaine : biologie moléculaire (Hsp70/Hsp60, repliage) — Statut : proposition de recherche

## 1. Fondement biologique
Les protéines mal repliées sont souvent réparables : les chaperonnes (Hsp70, GroEL) fournissent un environnement protégé où le polypeptide se replie correctement, consommant de l'ATP. Seules les protéines irrécupérables sont ubiquitinées puis dégradées (protéostase). La règle biologique : **réparer avant de jeter**, mais savoir renoncer (les agrégats non réparés sont toxiques).

## 2. Formalisation GenOS
```
Chaperonne(C, composant k corrompu) :
  1. Diagnostic : classification {repliable | irrécupérable} selon distance au schéma valide
  2. Environnement protégé : réparation hors production (monde jetable), coût ATP facturé
  3. Stratégies de repliage : ré-exécution guidée des événements de k ; réconciliation avec schéma attendu ;
                               fusion des fragments valides
  4. Issue : k réparé (re-scellé Merkle) OU transfert au Cleaner (protéase) si irrécupérable
Garde-fou : budget max de tentatives — pas d'« agrégat » de réparations infinies
```

## 3. Mapping primitives existantes
- `resilience/cleaner.rs` (autophagie/lysosome) — destination des cas irrécupérables.
- Replay causal — moteur des stratégies de re-pliage.
- Budgets AMPK — le coût de chaperonnage est une dépense énergétique explicite.

## 4. Cas d'usage
- État d'une capsule partiellement corrompu par un bug : réparation ciblée au lieu d'un rollback qui perdrait le travail ultérieur.
- Configuration d'opéron incohérente après HGT : re-pliage vers la forme canonique.

## 5. Apports attendus
- Comble le trou entre nettoyage destructif (autophagie) et rollback global (perte de progrès) : la réparation *conservative*.
- Hiérarchie de récupération complète : chaperonne (réparer) → régénération (reconstruire) → spore (sauvegarder) → apoptose (abandonner).

## 6. Points d'intégration
`genos-core/src/resilience/chaperone.rs`, outil MCP `resilience_chaperone_repair`, doc gabarit resilience.
