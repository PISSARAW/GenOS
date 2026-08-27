> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Régénération : Reconstruction par Blastème

> Domaine : biologie du développement / régénération — Statut : proposition de recherche

## 1. Fondement biologique
Le planaire et le triton régénèrent des organes complets après amputation. Le mécanisme clé est le **blastème** : une masse de cellules dédifférenciées qui mémorise la position (gradients positionnels) et reconstruit *ce qui manque*, sans reconstruire ce qui existe déjà. La régénération est guidée par la mémoire de forme (morphallaxie) plutôt que par une copie intégrale.

## 2. Formalisation GenOS
Après perte d'un module (crash partiel, corruption d'un sous-arbre du DAG) :

```
Regeneration(C, ModulePerdu m) :
  1. Blasteme = {snapshots partiels contenant des traces de m} ∪ {contexte positionnel dans le DAG}
  2. Dédifférenciation : ré-interprétation des événements de m comme programme de reconstruction
  3. Croissance différentielle : ne rejouer que les événements manquants (pas de replay intégral)
  4. Contrôle de forme : comparaison au gabarit structurel attendu (body plan)
```

## 3. Mapping primitives existantes
- `genos-store` (CAS Merkle, event sourcing) — les fragments de m sont adressables par contenu.
- `genos-core/src/resilience/cleaner.rs` — l'autophagie marque les pertes ; la régénération prend le relais.
- Gradients morphogènes (`genos-eval/src/morphogenesis.rs`) — fournissent la mémoire de position.

## 4. Cas d'usage
- Un crash a corrompu la mémoire associative d'un agent : reconstruction depuis les traces éparses dans les snapshots, sans rollback global.
- Restauration partielle d'une branche dont seuls certains sous-modules ont survécu à une purge.

## 5. Apports attendus
- Auto-réparation **structurelle** (reconstruit le module) là où le rollback restaure un point antérieur (perd le travail ultérieur).
- Coût proportionnel au manque, pas à la taille totale.
- Complète le spectre existant : autophagie (nettoyage) → chaperonnes (réparation fine) → régénération (reconstruction d'organe) → spore (sauvegarde totale).

## 6. Points d'intégration
`genos-core/src/resilience/regeneration.rs` (nouveau), outil MCP `resilience_regenerate`, doc gabarit `docs/3-features-and-domain/resilience/regeneration.md`.
