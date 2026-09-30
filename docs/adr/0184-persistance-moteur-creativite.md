# ADR 0184 — Persistance du moteur de créativité

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Créativité, runtime Rust, persistance
- **Décideurs** : GenOS
- **Lié à** : [ADR 0175](0175-checkpoints-interprocessus-persistes.md)

## Contexte

`genos-creativity` contient le moteur visé par la fiche imagination et
`genos-orchestrator` conserve son moteur historique. Le runtime historique doit
pouvoir activer une mémoire durable à la frontière de tick sans confondre les
candidats simulés avec des actions validées.

## Décision

Activer `genos-creativity` comme membre du workspace. Le moteur historique est
également compilé et peut être activé avec
`GenosEcosystem::enable_creativity_checkpoint(path)`. Les deux moteurs utilisent
le contrat versionné générique de `genos-store`, sans couplage des types de
stockage. Le runtime sauvegarde à chaque `pre_tick`, journalise les candidats
dans `CREATIVE_SIMULATION` et laisse le plan d'exécution sous le contrôle du
directeur. Le choix du chemin reste explicite pour l'appelant.

## Conséquences

### Positives

- Les moteurs de créativité sont compilés et le runtime historique dispose
  d'un point d'activation durable.
- Le checkpoint peut évoluer sans couplage entre stockage et moteur.
- Les métriques nécessaires à la continuité sont incluses dans l'état durable.

### Négatives

- L'appelant doit activer le checkpoint et fournir un chemin stable.
- Le générateur aléatoire n'est pas restauré; après reprise, les résultats
  restent bornés mais ne sont pas reproductibles à l'identique.

## Alternatives

- Lier directement `genos-store` aux types de `genos-creativity` : rejeté pour
  éviter le couplage des couches.
