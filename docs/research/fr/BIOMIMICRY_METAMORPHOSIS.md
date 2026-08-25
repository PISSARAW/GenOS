# Biomimétisme & Métamorphose : Reconfiguration Majeure de Phase

> Domaine : biologie du développement — Statut : proposition de recherche

## 1. Fondement biologique
La métamorphose (chenille → papillon, têtard → grenouille) est une transition radicale contrôlée par des hormones (ecdysone, thyroxine) : une grande partie des structures est histolysée puis reconstruite, tandis que le disque imaginal conserve l'identité de l'adulte. La phase intermédiaire (chrysalide) est un état protégé à métabolisme réduit où la reconfiguration s'opère sans exposition au monde.

## 2. Formalisation GenOS
```
Metamorphose(C, G_v1 → G_v2) :
  1. Diapause   : gel de C, budget figé (cf. cryptobiose existante mais réversible et courte)
  2. Histolyse  : invalidation contrôlée des modules incompatibles avec G_v2 (liste déclarée)
  3. Disques imaginiaux : conservation des artefacts critiques (mémoire validée, credentials) hors zone de reconstruction
  4. Reconstruction : boot selon le programme embryonnaire de G_v2
  5. Éclosion    : snapshot σ_adulte + tests de fumée avant exposition
```

## 3. Mapping primitives existantes
- `genos-store/src/cryptobiosis.rs` — la diapause réutilise la vitrification d'état.
- `genos-core/src/genome.rs` — versionnement G_v1 → G_v2 enregistré comme mutation majeure explicite.
- Snapshots Merkle — σ_avant, σ_chrysalide, σ_adulte forment une chaîne auditable.

## 4. Cas d'usage
- Migration prototype → production : changement radical d'outillage et de politiques sans corruption.
- Mise à niveau majeure d'un modèle de base (provider swap) pour toute une flotte.
- Conversion de rôle d'un agent (chercheur → exécutant) avec préservation de la mémoire validée.

## 5. Apports attendus
- Migrations de version radicales **auditable et rejouable**, là où un simple patch d'état serait opaque.
- Garantie qu'aucun agent « à moitié transformé » n'est jamais exposé au monde.
- Réutilisation maximale du patrimoine validé (disques imaginiaux) pendant les refontes.

## 6. Points d'intégration
`genos-runtime/src/genome_os/` (orchestrateur de métamorphose), outil MCP `biomimicry_metamorphose`, doc gabarit `docs/3-features-and-domain/biomimicry/metamorphosis.md`.
